/** S1 Attention Budget Protocol — per-agent daily interrupt token budgets. */

import type { AttentionSeverity } from "@rarecrest/contracts";
import type { DatabaseClient } from "@rarecrest/db";
import { dailyDefaults, remainingTokens, tokenKindForSeverity, type AttentionTokenKind } from "@rarecrest/command-surface";

export interface AgentAttentionBudget {
  id: string;
  agentId: string;
  entityId: string;
  day: string;
  criticalTokens: number;
  awarenessTokens: number;
  criticalSpent: number;
  awarenessSpent: number;
}

export interface SpendInterruptTokenInput {
  agentId: string;
  entityId: string;
  severity: AttentionSeverity;
  flagId?: string | null;
}

export interface SpendInterruptTokenResult {
  paid: boolean;
  deferred: boolean;
  tokenKind: AttentionTokenKind;
  remaining: { criticalRemaining: number; awarenessRemaining: number };
}

export interface RepossessInput {
  agentId: string;
  entityId: string;
  criticalTokens?: number;
  awarenessTokens?: number;
  /** Director ritual default: reset today's spent counters to 0. Pass false to only re-set totals. */
  resetSpent?: boolean;
}

function mapBudgetRow(row: Record<string, unknown>): AgentAttentionBudget {
  const day = row.day as Date | string;
  return {
    id: row.id as string,
    agentId: row.agent_id as string,
    entityId: row.entity_id as string,
    day: day instanceof Date ? day.toISOString().split("T")[0] : String(day),
    criticalTokens: Number(row.critical_tokens),
    awarenessTokens: Number(row.awareness_tokens),
    criticalSpent: Number(row.critical_spent),
    awarenessSpent: Number(row.awareness_spent),
  };
}

/** Upserts today's budget row for (agentId, entityId), seeding env-derived defaults on first touch. */
export async function ensureBudget(
  db: DatabaseClient,
  agentId: string,
  entityId: string,
): Promise<AgentAttentionBudget> {
  const defaults = dailyDefaults();
  const result = await db.query(
    `INSERT INTO rarecrest.agent_attention_budgets
       (agent_id, entity_id, day, critical_tokens, awareness_tokens)
     VALUES ($1, $2, CURRENT_DATE, $3, $4)
     ON CONFLICT (agent_id, entity_id, day) DO UPDATE SET agent_id = EXCLUDED.agent_id
     RETURNING id, agent_id, entity_id, day, critical_tokens, awareness_tokens, critical_spent, awareness_spent`,
    [agentId, entityId, defaults.criticalTokens, defaults.awarenessTokens],
  );
  return mapBudgetRow(result.rows[0]);
}

/**
 * Spends one interrupt token for `severity` (critical/high → critical pool,
 * medium/low → awareness pool). Never throws when tokens are exhausted — the
 * flag defers to the morning brief instead of interrupting the agent's operator now.
 */
export async function spendInterruptToken(
  db: DatabaseClient,
  input: SpendInterruptTokenInput,
): Promise<SpendInterruptTokenResult> {
  const budget = await ensureBudget(db, input.agentId, input.entityId);
  const tokenKind = tokenKindForSeverity(input.severity);
  const column = tokenKind === "critical" ? "critical_spent" : "awareness_spent";
  const limitColumn = tokenKind === "critical" ? "critical_tokens" : "awareness_tokens";
  const remainingBefore = remainingTokens(budget);

  const available =
    tokenKind === "critical" ? remainingBefore.criticalRemaining : remainingBefore.awarenessRemaining;
  if (available <= 0) {
    await recordEscalation(db, input, "deferred");
    return { paid: false, deferred: true, tokenKind, remaining: remainingBefore };
  }

  // Conditional UPDATE (spent < limit) keeps the check-then-spend atomic against
  // concurrent spends racing for the last token of the day.
  const result = await db.query(
    `UPDATE rarecrest.agent_attention_budgets
     SET ${column} = ${column} + 1
     WHERE agent_id = $1 AND entity_id = $2 AND day = CURRENT_DATE AND ${column} < ${limitColumn}
     RETURNING id, agent_id, entity_id, day, critical_tokens, awareness_tokens, critical_spent, awareness_spent`,
    [input.agentId, input.entityId],
  );

  if (result.rows.length === 0) {
    await recordEscalation(db, input, "deferred");
    return { paid: false, deferred: true, tokenKind, remaining: remainingBefore };
  }

  const updated = mapBudgetRow(result.rows[0]);
  await recordEscalation(db, input, tokenKind);
  return { paid: true, deferred: false, tokenKind, remaining: remainingTokens(updated) };
}

async function recordEscalation(
  db: DatabaseClient,
  input: SpendInterruptTokenInput,
  tokenKind: AttentionTokenKind | "deferred",
): Promise<void> {
  await db.query(
    `INSERT INTO rarecrest.attention_escalations (agent_id, entity_id, flag_id, severity, token_kind)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.agentId, input.entityId, input.flagId ?? null, input.severity, tokenKind],
  );
}

/**
 * Director ritual: "repossess" an agent's attention tokens — resets today's spent
 * counters to 0 by default and/or sets new remaining totals for critical/awareness.
 */
export async function repossess(db: DatabaseClient, input: RepossessInput): Promise<AgentAttentionBudget> {
  await ensureBudget(db, input.agentId, input.entityId);

  const sets: string[] = [];
  const params: unknown[] = [input.agentId, input.entityId];
  if (input.resetSpent !== false) {
    sets.push("critical_spent = 0", "awareness_spent = 0");
  }
  if (typeof input.criticalTokens === "number") {
    params.push(input.criticalTokens);
    sets.push(`critical_tokens = $${params.length}`);
  }
  if (typeof input.awarenessTokens === "number") {
    params.push(input.awarenessTokens);
    sets.push(`awareness_tokens = $${params.length}`);
  }
  if (sets.length === 0) {
    return ensureBudget(db, input.agentId, input.entityId);
  }

  const result = await db.query(
    `UPDATE rarecrest.agent_attention_budgets
     SET ${sets.join(", ")}
     WHERE agent_id = $1 AND entity_id = $2 AND day = CURRENT_DATE
     RETURNING id, agent_id, entity_id, day, critical_tokens, awareness_tokens, critical_spent, awareness_spent`,
    params,
  );
  return mapBudgetRow(result.rows[0]);
}

/** Today's budgets for a single entity, one row per agent that has been active there. */
export async function listBudgetsForEntity(db: DatabaseClient, entityId: string): Promise<AgentAttentionBudget[]> {
  const result = await db.query(
    `SELECT id, agent_id, entity_id, day, critical_tokens, awareness_tokens, critical_spent, awareness_spent
     FROM rarecrest.agent_attention_budgets
     WHERE entity_id = $1 AND day = CURRENT_DATE
     ORDER BY agent_id`,
    [entityId],
  );
  return result.rows.map(mapBudgetRow);
}

/** Today's budgets across multiple entities — used by the portfolio-wide Command Center dashboard. */
export async function listBudgetsForEntities(db: DatabaseClient, entityIds: string[]): Promise<AgentAttentionBudget[]> {
  if (entityIds.length === 0) return [];
  const result = await db.query(
    `SELECT id, agent_id, entity_id, day, critical_tokens, awareness_tokens, critical_spent, awareness_spent
     FROM rarecrest.agent_attention_budgets
     WHERE entity_id = ANY($1) AND day = CURRENT_DATE
     ORDER BY agent_id`,
    [entityIds],
  );
  return result.rows.map(mapBudgetRow);
}
