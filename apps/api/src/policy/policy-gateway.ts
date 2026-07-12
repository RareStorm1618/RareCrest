import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "@rarecrest/db";
import type { AgentRight, OfficerRole } from "@rarecrest/contracts";

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
}

interface AgentPassportRow {
  id: string;
  agent_id: string;
  entity_id: string;
  rights: AgentRight[] | null;
  risk_tier: string;
  valid_until: string;
  hard_rule_clear: boolean;
}

export interface AssertLivePassportOptions {
  /**
   * When set, the caller is asserting that the agent must currently hold this
   * officer role for the entity — checked against a live (active) row in
   * rarecrest.officer_assignments, not merely a passport with matching rights.
   * A passport can be live while an officer assignment behind it has since
   * been deactivated/replaced; this closes that gap for officer-gated routes.
   */
  requiredOfficerRole?: OfficerRole;
}

interface OfficerAssignmentCheckRow {
  id: string;
}

/**
 * Loads the latest agent_passport for (entityId, agentId) and asserts it is
 * currently live: issued hard-rule-clear AND valid_until still in the future.
 * When `requiredOfficerRole` is set, also asserts an active officer_assignments
 * row exists for (entityId, agentId, officerRole) — fail-closed.
 *
 * Fail-closed: no passport, a non-clear passport, an expired passport, or (when
 * requested) a missing/inactive officer assignment all throw
 * PolicyGatewayError(403) — callers must never treat "no evidence" as "allowed".
 */
export async function assertLivePassport(
  db: DatabaseClient,
  input: { entityId: string; agentId: string },
  options: AssertLivePassportOptions = {},
): Promise<LivePassport> {
  const result = await db.query<AgentPassportRow>(
    `SELECT id, agent_id, entity_id, rights, risk_tier, valid_until, hard_rule_clear
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

  if (options.requiredOfficerRole) {
    const officerResult = await db.query<OfficerAssignmentCheckRow>(
      `SELECT id FROM rarecrest.officer_assignments
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
  }

  return {
    id: row.id,
    agentId: row.agent_id,
    entityId: row.entity_id,
    rights: Array.isArray(row.rights) ? row.rights : [],
    riskTier: row.risk_tier,
    validUntil: row.valid_until,
    hardRuleClear: row.hard_rule_clear,
  };
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
 *
 * Fail-closed: missing id, entity mismatch, revocation, or expiry all throw
 * PolicyGatewayError(403).
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
