import type { AttentionSeverity } from "@rarecrest/contracts";
import type { DatabaseClient } from "@rarecrest/db";
import {
  buildAttentionItem,
  defaultSeverityForSignal,
  isClearForAgentDeployment,
  messageForUnverifiedClaim,
  type AttentionItem,
  type AttentionSignalType,
  type EntityRelationshipInput,
  validateAttentionSignalType,
  validateRelationshipType,
} from "@rarecrest/portfolio";
import { spendInterruptToken } from "./attention-budget.js";

export interface RaiseAttentionInput {
  signalType: AttentionSignalType;
  message: string;
  severity?: AttentionSeverity;
  linkPath?: string;
  sourceRef?: string;
  /** S1 Attention Budget Protocol — omit for human-raised flags (always interrupt_paid). */
  agentId?: string;
}

/** raiseFlag's return, extended with S1 Attention Budget Protocol outcome. */
export interface RaisedAttentionItem extends AttentionItem {
  agentId: string | null;
  deferredToBrief: boolean;
  interruptPaid: boolean;
}

export interface ConsumeUnverifiedClaimInput {
  claimType: string;
  claimText: string;
  detectedBy?: string;
}

export interface RecordOpenDecisionInput {
  title: string;
  description?: string;
}

export interface RecordConflictInput {
  summary: string;
}

export interface EntityAttentionState {
  entityId: string;
  items: AttentionItem[];
  clearForAgentDeployment: boolean;
  openDecisions: Array<Record<string, unknown>>;
  conflicts: Array<Record<string, unknown>>;
  unverifiedClaims: Array<Record<string, unknown>>;
  relationships: Array<Record<string, unknown>>;
}

export class AttentionFlagService {
  constructor(private db: DatabaseClient) {}

  async getEntityAttentionState(entityId: string): Promise<EntityAttentionState> {
    const items = await this.listOpenItems(entityId);
    const [openDecisions, conflicts, unverifiedClaims, relationships] = await Promise.all([
      this.listOpenDecisions(entityId),
      this.listConflicts(entityId),
      this.listUnverifiedClaims(entityId),
      this.listRelationships(entityId),
    ]);
    return {
      entityId,
      items,
      clearForAgentDeployment: isClearForAgentDeployment(items),
      openDecisions,
      conflicts,
      unverifiedClaims,
      relationships,
    };
  }

  async listOpenItems(entityId: string): Promise<AttentionItem[]> {
    const result = await this.db.query(
      `SELECT id, entity_id, flag_type, signal_type, severity, message, link_path, source_ref, created_at
       FROM rarecrest.attention_flags
       WHERE entity_id = $1 AND resolved_at IS NULL
       ORDER BY
         CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         created_at DESC`,
      [entityId],
    );
    return result.rows.map((row) =>
      buildAttentionItem({
        id: row.id as string,
        entityId: row.entity_id as string,
        signalType: (row.signal_type ?? row.flag_type) as AttentionSignalType,
        message: row.message as string,
        severity: row.severity as AttentionSeverity,
        linkPath: row.link_path as string | null,
        sourceRef: row.source_ref as string | null,
        createdAt: (row.created_at as Date).toISOString(),
      }),
    );
  }

  /**
   * S1 Attention Budget Protocol — an agentId spends an interrupt token (critical/high
   * severity draws from the critical pool, medium/low from awareness). Once an agent's
   * daily tokens are exhausted the flag is deferred to the morning brief instead of
   * interrupting now. Human-raised flags (no agentId) always interrupt immediately —
   * humans don't spend agent attention tokens.
   */
  async raiseFlag(entityId: string, input: RaiseAttentionInput): Promise<RaisedAttentionItem> {
    const severity = input.severity ?? defaultSeverityForSignal(input.signalType);
    const result = await this.db.query(
      `INSERT INTO rarecrest.attention_flags
         (entity_id, flag_type, signal_type, severity, message, link_path, source_ref)
       VALUES ($1, $2, $2, $3, $4, $5, $6)
       RETURNING id, entity_id, signal_type, severity, message, link_path, source_ref, created_at`,
      [entityId, input.signalType, severity, input.message, input.linkPath ?? null, input.sourceRef ?? null],
    );
    const row = result.rows[0];
    const flagId = row.id as string;

    let deferredToBrief = false;
    let interruptPaid = true;
    if (input.agentId) {
      const spend = await spendInterruptToken(this.db, {
        agentId: input.agentId,
        entityId,
        severity,
        flagId,
      });
      deferredToBrief = spend.deferred;
      interruptPaid = spend.paid;
    }

    await this.db.query(
      `UPDATE rarecrest.attention_flags
       SET deferred_to_brief = $2, interrupt_paid = $3, agent_id = $4
       WHERE id = $1`,
      [flagId, deferredToBrief, interruptPaid, input.agentId ?? null],
    );

    return {
      ...buildAttentionItem({
        id: flagId,
        entityId: row.entity_id as string,
        signalType: row.signal_type as AttentionSignalType,
        message: row.message as string,
        severity: row.severity as AttentionSeverity,
        linkPath: row.link_path as string | null,
        sourceRef: row.source_ref as string | null,
        createdAt: (row.created_at as Date).toISOString(),
      }),
      agentId: input.agentId ?? null,
      deferredToBrief,
      interruptPaid,
    };
  }

  async resolveFlag(flagId: string, entityId: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE rarecrest.attention_flags
       SET resolved_at = NOW()
       WHERE id = $1 AND entity_id = $2 AND resolved_at IS NULL`,
      [flagId, entityId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async recordOpenDecision(entityId: string, input: RecordOpenDecisionInput): Promise<Record<string, unknown>> {
    const flag = await this.raiseFlag(entityId, {
      signalType: "pending_high_stakes_decision",
      message: `Open decision: ${input.title}`,
      sourceRef: `decision:${input.title}`,
    });
    const result = await this.db.query(
      `INSERT INTO rarecrest.open_decisions (entity_id, title, description, attention_flag_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, entity_id AS "entityId", title, description, status, attention_flag_id AS "attentionFlagId", created_at AS "createdAt"`,
      [entityId, input.title, input.description ?? null, flag.id],
    );
    return result.rows[0];
  }

  async resolveOpenDecision(
    entityId: string,
    decisionId: string,
    resolutionNote: string,
  ): Promise<Record<string, unknown> | null> {
    const existing = await this.db.query(
      `SELECT id, attention_flag_id FROM rarecrest.open_decisions
       WHERE id = $1 AND entity_id = $2 AND status = 'open'`,
      [decisionId, entityId],
    );
    if (existing.rows.length === 0) return null;

    const flagId = existing.rows[0].attention_flag_id as string | null;
    if (flagId) await this.resolveFlag(flagId, entityId);

    const result = await this.db.query(
      `UPDATE rarecrest.open_decisions
       SET status = 'resolved', resolution_note = $1, resolved_at = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING id, entity_id AS "entityId", title, status, resolution_note AS "resolutionNote", resolved_at AS "resolvedAt"`,
      [resolutionNote, decisionId],
    );
    return result.rows[0];
  }

  async recordConflict(entityId: string, input: RecordConflictInput): Promise<Record<string, unknown>> {
    const flag = await this.raiseFlag(entityId, {
      signalType: "unresolved_conflict",
      message: `Conflict: ${input.summary}`,
      sourceRef: `conflict:${input.summary.slice(0, 40)}`,
    });
    const result = await this.db.query(
      `INSERT INTO rarecrest.documented_conflicts (entity_id, summary, attention_flag_id)
       VALUES ($1, $2, $3)
       RETURNING id, entity_id AS "entityId", summary, status, attention_flag_id AS "attentionFlagId", created_at AS "createdAt"`,
      [entityId, input.summary, flag.id],
    );
    return result.rows[0];
  }

  /** AC-PORT-008.3 — consumes Legal & Compliance detection, does not define check */
  async consumeUnverifiedClaim(
    entityId: string,
    input: ConsumeUnverifiedClaimInput,
  ): Promise<Record<string, unknown>> {
    const flag = await this.raiseFlag(entityId, {
      signalType: "unverified_claim",
      message: messageForUnverifiedClaim(input.claimType, input.claimText),
      sourceRef: `claim:${input.claimType}`,
    });
    const result = await this.db.query(
      `INSERT INTO rarecrest.unverified_claims
         (entity_id, claim_type, claim_text, detected_by, attention_flag_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, entity_id AS "entityId", claim_type AS "claimType", claim_text AS "claimText",
                 detected_by AS "detectedBy", verified, attention_flag_id AS "attentionFlagId", created_at AS "createdAt"`,
      [entityId, input.claimType, input.claimText, input.detectedBy ?? "legal_compliance", flag.id],
    );
    return result.rows[0];
  }

  async addRelationship(input: EntityRelationshipInput): Promise<Record<string, unknown>> {
    if (!validateRelationshipType(input.relationshipType)) {
      throw new Error(`Invalid relationship type: ${input.relationshipType}`);
    }
    const result = await this.db.query(
      `INSERT INTO rarecrest.entity_relationships
         (from_entity_id, to_entity_id, relationship_type, direction, constraint_note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, from_entity_id AS "fromEntityId", to_entity_id AS "toEntityId",
                 relationship_type AS "relationshipType", direction, constraint_note AS "constraintNote"`,
      [
        input.fromEntityId,
        input.toEntityId,
        input.relationshipType,
        input.direction ?? "directed",
        input.constraintNote ?? null,
      ],
    );
    return result.rows[0];
  }

  async raiseHardRuleException(entityId: string, message: string, sourceRef: string): Promise<AttentionItem> {
    await this.db.query(
      `UPDATE rarecrest.entities SET governance_status = 'hard_rule_exception', updated_at = NOW() WHERE id = $1`,
      [entityId],
    );
    return this.raiseFlag(entityId, {
      signalType: "hard_rule_exception",
      message,
      sourceRef,
    });
  }

  private async listOpenDecisions(entityId: string) {
    const result = await this.db.query(
      `SELECT id, title, description, status, created_at AS "createdAt"
       FROM rarecrest.open_decisions WHERE entity_id = $1 AND status = 'open' ORDER BY created_at DESC`,
      [entityId],
    );
    return result.rows;
  }

  private async listConflicts(entityId: string) {
    const result = await this.db.query(
      `SELECT id, summary, status, created_at AS "createdAt"
       FROM rarecrest.documented_conflicts WHERE entity_id = $1 AND status = 'unresolved' ORDER BY created_at DESC`,
      [entityId],
    );
    return result.rows;
  }

  private async listUnverifiedClaims(entityId: string) {
    const result = await this.db.query(
      `SELECT id, claim_type AS "claimType", claim_text AS "claimText", detected_by AS "detectedBy", created_at AS "createdAt"
       FROM rarecrest.unverified_claims WHERE entity_id = $1 AND verified = FALSE ORDER BY created_at DESC`,
      [entityId],
    );
    return result.rows;
  }

  private async listRelationships(entityId: string) {
    const result = await this.db.query(
      `SELECT id, from_entity_id AS "fromEntityId", to_entity_id AS "toEntityId",
              relationship_type AS "relationshipType", direction, constraint_note AS "constraintNote"
       FROM rarecrest.entity_relationships
       WHERE (from_entity_id = $1 OR to_entity_id = $1) AND deleted_at IS NULL`,
      [entityId],
    );
    return result.rows;
  }
}

export { validateAttentionSignalType };
