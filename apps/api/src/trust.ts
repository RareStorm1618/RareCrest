import type { DatabaseClient } from "@rarecrest/db";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import type { VerticalKey } from "@rarecrest/contracts";
import type { AuthContext } from "./auth.js";
import { trustMode } from "./auth.js";

export interface DerivedActivationControls {
  hardRuleClear: boolean;
  envelopeEnforceable: boolean;
  evaluationSuiteRegistered: boolean;
  killSwitchesLive: boolean;
  humanReviewRoutingLive: boolean;
  source: {
    latestEnvelopeAuditId: string | null;
    latestEvaluationId: string | null;
    openHumanReviews: number;
    killSwitchArmed: boolean;
    killSwitchState: string | null;
    activationBlockedByOpenReviews: boolean;
  };
}

const EVALUATION_FRESHNESS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Best-effort query wrapper: distinguishes "no rows" from "table unqueryable" so a
 * missing/broken durable store fails closed instead of silently reporting "live". */
async function queryHealth<T extends Record<string, unknown>>(
  db: DatabaseClient,
  sql: string,
  params: unknown[],
): Promise<{ healthy: boolean; rows: T[] }> {
  try {
    const result = await db.query<T>(sql, params);
    return { healthy: true, rows: result.rows };
  } catch {
    return { healthy: false, rows: [] };
  }
}

/**
 * Derive activation controls from server-owned tables — never trust client booleans.
 * Fail-closed: missing evidence ⇒ control is false.
 */
export async function deriveActivationControls(
  db: DatabaseClient,
  entityId: string,
  agentId: string,
): Promise<DerivedActivationControls> {
  const [envelope, evaluation, reviews, rosterHalt, durableKill] = await Promise.all([
    queryHealth<{ id: string; hard_rule_clear: boolean; deployable: boolean }>(
      db,
      `SELECT id, hard_rule_clear, deployable
       FROM rarecrest.permission_envelope_audits
       WHERE entity_id = $1 AND agent_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [entityId, agentId],
    ),
    queryHealth<{ id: string; created_at: string; drift_detected: boolean }>(
      db,
      `SELECT id, created_at, drift_detected
       FROM rarecrest.evaluation_runs
       WHERE entity_id = $1 AND agent_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [entityId, agentId],
    ),
    queryHealth<{ count: string }>(
      db,
      `SELECT COUNT(*)::text AS count FROM rarecrest.human_review_queue
       WHERE entity_id = $1 AND status = 'pending'`,
      [entityId],
    ),
    queryHealth<{ armed: boolean }>(
      db,
      `SELECT true AS armed FROM rarecrest.agent_roster
       WHERE entity_id = $1 AND agent_id = $2 AND status = 'halted'
       LIMIT 1`,
      [entityId, agentId],
    ),
    queryHealth<{ state: string }>(
      db,
      `SELECT state FROM rarecrest.kill_switches WHERE entity_id = $1`,
      [entityId],
    ),
  ]);

  const env = envelope.rows[0];
  const hardRuleClear = Boolean(env?.hard_rule_clear && env?.deployable);
  const envelopeEnforceable = Boolean(env?.deployable);

  // evaluation_runs has no outcome/status column today — freshness (created_at within
  // the trailing window) is the closest server-owned proxy for "an evaluation suite
  // is actually registered and current" rather than a stale/abandoned row from long ago.
  const latestEvaluation = evaluation.rows[0];
  const evaluationSuiteRegistered = Boolean(
    latestEvaluation &&
      Date.now() - new Date(latestEvaluation.created_at).getTime() <= EVALUATION_FRESHNESS_WINDOW_MS,
  );

  const openHumanReviews = Number(reviews.rows[0]?.count ?? 0);
  const activationBlockedByOpenReviews = openHumanReviews > 0;

  const killState = durableKill.rows[0]?.state ?? null;
  // Kill switches are "live" only when the durable store is actually queryable —
  // a broken/missing table must fail closed, not silently report "live".
  const killSwitchesLive = durableKill.healthy;
  const humanReviewRoutingLive = reviews.healthy;
  const killSwitchArmed = killState === "armed" || killState === "triggered" || rosterHalt.rows.length > 0;

  // Block activation when entity kill switch is armed or already triggered.
  const activationClearOfKillSwitch = killState !== "armed" && killState !== "triggered";

  return {
    hardRuleClear: hardRuleClear && activationClearOfKillSwitch && !activationBlockedByOpenReviews,
    envelopeEnforceable,
    evaluationSuiteRegistered,
    killSwitchesLive,
    humanReviewRoutingLive,
    source: {
      latestEnvelopeAuditId: env?.id ?? null,
      latestEvaluationId: latestEvaluation?.id ?? null,
      openHumanReviews,
      killSwitchArmed,
      killSwitchState: killState,
      activationBlockedByOpenReviews,
    },
  };
}

export async function appendDenyTrace(
  intelligence: IntelligenceClient,
  input: {
    vertical: VerticalKey;
    entityId?: string;
    action: string;
    reason: string;
    route?: string;
    statusCode?: number;
  },
): Promise<void> {
  try {
    await intelligence.appendTrace({
      vertical: input.vertical,
      entityId: input.entityId,
      action: input.action,
      verdict: "deny",
      payload: {
        reason: input.reason,
        route: input.route,
        statusCode: input.statusCode,
      },
    });
  } catch {
    // Best-effort audit — never block the deny response if intelligence is down.
  }
}

/**
 * Director cross-vertical scope requires explicit trust mode.
 * Prefer JWT/OIDC role claim on AuthContext; fall back to header only in dev.
 */
export function isVerifiedDirector(
  auth: AuthContext,
  headers: Record<string, unknown>,
): boolean {
  const headerRole = headers["x-user-role"];
  const role = auth.role ?? (typeof headerRole === "string" ? headerRole : undefined);
  const claimsDirector = role === "director";
  if (!claimsDirector) return false;
  if (trustMode() === "dev") return true;
  // Strict: director must come from OIDC (or holding vertical with director role).
  if (auth.authMethod === "oidc") {
    return auth.vertical === "holding" && role === "director";
  }
  return false;
}
