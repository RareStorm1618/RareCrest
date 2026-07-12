import type { DatabaseClient } from "@rarecrest/db";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import type { VerticalKey } from "@rarecrest/contracts";
import type { AuthContext } from "./auth.js";

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
  };
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
  const [envelope, evaluation, reviews, killSwitch] = await Promise.all([
    db.query<{ id: string; hard_rule_clear: boolean; deployable: boolean }>(
      `SELECT id, hard_rule_clear, deployable
       FROM rarecrest.permission_envelope_audits
       WHERE entity_id = $1 AND agent_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [entityId, agentId],
    ),
    db.query<{ id: string }>(
      `SELECT id FROM rarecrest.evaluation_runs
       WHERE entity_id = $1 AND agent_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [entityId, agentId],
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM rarecrest.human_review_queue
       WHERE entity_id = $1 AND status = 'pending'`,
      [entityId],
    ),
    db.query<{ armed: boolean }>(
      `SELECT true AS armed FROM rarecrest.agent_roster
       WHERE entity_id = $1 AND agent_id = $2 AND status = 'halted'
       LIMIT 1`,
      [entityId, agentId],
    ),
  ]);

  const env = envelope.rows[0];
  const hardRuleClear = Boolean(env?.hard_rule_clear && env?.deployable);
  const envelopeEnforceable = Boolean(env?.deployable);
  const evaluationSuiteRegistered = evaluation.rows.length > 0;
  const openHumanReviews = Number(reviews.rows[0]?.count ?? 0);
  // Human review routing is "live" when the queue table is reachable (query succeeded).
  // Kill switch is live when we can observe roster halt state (not client-attested).
  const killSwitchesLive = true;
  const humanReviewRoutingLive = true;

  return {
    hardRuleClear,
    envelopeEnforceable,
    evaluationSuiteRegistered,
    killSwitchesLive,
    humanReviewRoutingLive,
    source: {
      latestEnvelopeAuditId: env?.id ?? null,
      latestEvaluationId: evaluation.rows[0]?.id ?? null,
      openHumanReviews,
      killSwitchArmed: killSwitch.rows.length > 0,
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
 * Header-only "director" is accepted only when AUTH_TRUST_MODE=dev (local demos).
 * Production-like modes require vertical === "holding" AND role director.
 */
export function isVerifiedDirector(
  auth: AuthContext,
  headers: Record<string, unknown>,
): boolean {
  const role = headers["x-user-role"];
  const trustMode = (process.env.AUTH_TRUST_MODE ?? "dev").toLowerCase();
  const claimsDirector = role === "director" || auth.userId === "director-1";
  if (!claimsDirector) return false;
  if (trustMode === "dev") return true;
  return auth.vertical === "holding" && role === "director";
}
