import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "@rarecrest/db";
import type {
  AgentRight,
  AutopilotAction,
  AutopilotLevel,
  OfficerAssignmentMode,
  OfficerRole,
  ShadowForbiddenAction,
} from "@rarecrest/contracts";
import {
  autopilotAllows,
  isShadowPassport,
  shadowAllowsAction,
} from "@rarecrest/contracts";

/**
 * Fail-closed gateway errors. Every check in this module throws on the
 * missing/invalid/expired case rather than returning a permissive default —
 * callers must treat "unknown" as "denied".
 */
export class PolicyGatewayError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "PolicyGatewayError";
  }
}

export interface LivePassport {
  id: string;
  agentId: string;
  entityId: string;
  rights: AgentRight[];
  riskTier: string;
  validUntil: string;
  hardRuleClear: boolean;
  constraints: string[];
  assignmentMode: OfficerAssignmentMode | null;
}

interface AgentPassportRow {
  id: string;
  agent_id: string;
  entity_id: string;
  rights: AgentRight[] | null;
  risk_tier: string;
  valid_until: string;
  hard_rule_clear: boolean;
  constraints: string[] | null;
}

export interface AssertLivePassportOptions {
  /**
   * When set, the caller is asserting that the agent must currently hold this
   * officer role for the entity — checked against a live (active) row in
   * rarecrest.officer_assignments, not merely a passport with matching rights.
   */
  requiredOfficerRole?: OfficerRole;
}

interface OfficerAssignmentCheckRow {
  id: string;
  assignment_mode: string;
}

/**
 * Loads the latest agent_passport for (entityId, agentId) and asserts it is
 * currently live: issued hard-rule-clear AND valid_until still in the future.
 * When `requiredOfficerRole` is set, also asserts an active officer_assignments
 * row exists for (entityId, agentId, officerRole) — fail-closed.
 */
export async function assertLivePassport(
  db: DatabaseClient,
  input: { entityId: string; agentId: string },
  options: AssertLivePassportOptions = {},
): Promise<LivePassport> {
  const result = await db.query<AgentPassportRow>(
    `SELECT id, agent_id, entity_id, rights, risk_tier, valid_until, hard_rule_clear, constraints
     FROM rarecrest.agent_passports
     WHERE entity_id = $1 AND agent_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [input.entityId, input.agentId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new PolicyGatewayError(
      `No agent passport issued for agent=${input.agentId} entity=${input.entityId}`,
      403,
      "PASSPORT_MISSING",
    );
  }
  if (!row.hard_rule_clear) {
    throw new PolicyGatewayError(
      "Agent passport was not hard-rule-clear at issuance — reissue required",
      403,
      "PASSPORT_NOT_CLEAR",
    );
  }
  const validUntil = new Date(row.valid_until);
  if (Number.isNaN(validUntil.getTime()) || validUntil.getTime() <= Date.now()) {
    throw new PolicyGatewayError(
      "Agent passport has expired — reissue required before activation",
      403,
      "PASSPORT_EXPIRED",
    );
  }

  let assignmentMode: OfficerAssignmentMode | null = null;
  if (options.requiredOfficerRole) {
    const officerResult = await db.query<OfficerAssignmentCheckRow>(
      `SELECT id, COALESCE(assignment_mode, 'live') AS assignment_mode FROM rarecrest.officer_assignments
       WHERE entity_id = $1 AND agent_id = $2 AND officer_role = $3 AND active = TRUE
       LIMIT 1`,
      [input.entityId, input.agentId, options.requiredOfficerRole],
    );
    if (officerResult.rows.length === 0) {
      throw new PolicyGatewayError(
        `No active officer assignment role=${options.requiredOfficerRole} for agent=${input.agentId} entity=${input.entityId}`,
        403,
        "OFFICER_ASSIGNMENT_MISSING",
      );
    }
    const mode = officerResult.rows[0].assignment_mode;
    assignmentMode = mode === "shadow" ? "shadow" : "live";
  }

  const constraints = Array.isArray(row.constraints) ? row.constraints : [];

  return {
    id: row.id,
    agentId: row.agent_id,
    entityId: row.entity_id,
    rights: Array.isArray(row.rights) ? row.rights : [],
    riskTier: row.risk_tier,
    validUntil: row.valid_until,
    hardRuleClear: row.hard_rule_clear,
    constraints,
    assignmentMode,
  };
}

/** Fail-closed: shadow passports cannot seal, kill-switch, activate, or execute finance. */
export function assertShadowAllows(
  passport: Pick<LivePassport, "constraints" | "assignmentMode">,
  action: ShadowForbiddenAction | "parliament_vote" | "draft",
): void {
  const constraints =
    passport.assignmentMode === "shadow" && !isShadowPassport(passport.constraints)
      ? [...passport.constraints, "shadow_officer_passport"]
      : passport.constraints;
  if (!shadowAllowsAction(constraints, action)) {
    throw new PolicyGatewayError(
      `Shadow officer passport cannot perform action=${action}`,
      403,
      "SHADOW_ACTION_DENIED",
    );
  }
}

export async function loadEntityAutopilotLevel(
  db: DatabaseClient,
  entityId: string,
): Promise<AutopilotLevel> {
  try {
    const result = await db.query<{ autopilot_level: string }>(
      `SELECT autopilot_level FROM rarecrest.entities WHERE id = $1 AND deleted_at IS NULL`,
      [entityId],
    );
    const level = result.rows[0]?.autopilot_level;
    if (level === "observe" || level === "draft" || level === "propose" || level === "off") {
      return level;
    }
    return "off";
  } catch {
    return "off";
  }
}

/** Fail-closed autopilot ceiling for agent action classes (never money/PHI/seal). */
export async function assertAutopilotAllows(
  db: DatabaseClient,
  entityId: string,
  action: AutopilotAction,
): Promise<AutopilotLevel> {
  const level = await loadEntityAutopilotLevel(db, entityId);
  if (!autopilotAllows(level, action)) {
    throw new PolicyGatewayError(
      `Autopilot level=${level} does not allow action=${action} (raise ceiling via director PATCH)`,
      403,
      "AUTOPILOT_CEILING",
    );
  }
  return level;
}

export interface LiveHumanInstruction {
  id: string;
  entityId: string;
  vertical: string;
  actorId: string;
  actionScope: string;
  instruction: string;
  expiresAt: string;
}

interface HumanInstructionRow {
  id: string;
  entity_id: string;
  vertical: string;
  actor_id: string;
  action_scope: string;
  instruction: string;
  expires_at: string;
  revoked_at: string | null;
}

/**
 * Verifies a human_instructions row exists, is not revoked, is not expired,
 * and belongs to the entity the caller claims to be acting on.
 */
export async function requireHumanInstruction(
  db: DatabaseClient,
  instructionId: string,
  entityId: string,
): Promise<LiveHumanInstruction> {
  if (!instructionId || instructionId.trim().length === 0) {
    throw new PolicyGatewayError("humanInstructionId is required", 403, "HUMAN_INSTRUCTION_MISSING");
  }
  const result = await db.query<HumanInstructionRow>(
    `SELECT id, entity_id, vertical, actor_id, action_scope, instruction, expires_at, revoked_at
     FROM rarecrest.human_instructions
     WHERE id = $1`,
    [instructionId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new PolicyGatewayError("Human instruction not found", 403, "HUMAN_INSTRUCTION_NOT_FOUND");
  }
  if (row.entity_id !== entityId) {
    throw new PolicyGatewayError(
      "Human instruction does not belong to this entity",
      403,
      "HUMAN_INSTRUCTION_ENTITY_MISMATCH",
    );
  }
  if (row.revoked_at) {
    throw new PolicyGatewayError("Human instruction has been revoked", 403, "HUMAN_INSTRUCTION_REVOKED");
  }
  const expiresAt = new Date(row.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw new PolicyGatewayError("Human instruction has expired", 403, "HUMAN_INSTRUCTION_EXPIRED");
  }
  return {
    id: row.id,
    entityId: row.entity_id,
    vertical: row.vertical,
    actorId: row.actor_id,
    actionScope: row.action_scope,
    instruction: row.instruction,
    expiresAt: row.expires_at,
  };
}

/**
 * Returns a stable correlation id for cross-service tracing: reuses an
 * inbound id (e.g. `x-correlation-id` header) when present and non-empty,
 * otherwise mints a fresh one. Never returns empty/undefined.
 */
export function attachCorrelationId(existing?: string | null): string {
  const trimmed = existing?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : randomUUID();
}
