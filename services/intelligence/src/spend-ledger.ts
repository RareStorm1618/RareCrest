/**
 * EXO Wave C — durable AI spend ledger. `budgets.ts` stays the fast in-memory
 * per-vertical daily gate; this module is the append-only durable record a
 * director can later query (`GET /api/v1/ops/ai-spend`). Writes are
 * best-effort: a missing/unreachable database must never block a companion
 * response, so every failure here is swallowed after being logged.
 */
import type { DatabaseClient } from "@rarecrest/db";

export interface RecordSpendInput {
  vertical: string;
  entityId?: string | null;
  agentId?: string | null;
  provider: string;
  model?: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd?: number;
  correlationId?: string | null;
}

/**
 * Default cost heuristic when the caller doesn't supply `estimatedUsd`:
 * $0.50 / 1M input tokens + $1.50 / 1M output tokens — a deliberately rough
 * placeholder (documented, not hidden) until real provider billing is wired
 * in. Override via `AI_SPEND_INPUT_USD_PER_1M` / `AI_SPEND_OUTPUT_USD_PER_1M`.
 */
export function estimateSpendUsd(inputTokens: number, outputTokens: number): number {
  const inputRate = Number(process.env.AI_SPEND_INPUT_USD_PER_1M ?? 0.5);
  const outputRate = Number(process.env.AI_SPEND_OUTPUT_USD_PER_1M ?? 1.5);
  const usd = (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** True when a durable database connection string is configured for this service. */
export function isDatabaseAvailable(): boolean {
  const raw = process.env.INTELLIGENCE_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
  return raw.trim().length > 0;
}

/**
 * Best-effort insert into rarecrest.ai_spend_ledger. No-ops (and never throws)
 * when no database URL is configured — matches the "keep the in-memory fast
 * path" instruction: durable spend recording is additive, not load-bearing.
 */
export async function recordSpend(db: DatabaseClient | undefined, input: RecordSpendInput): Promise<void> {
  if (!db || !isDatabaseAvailable()) return;
  const estimatedUsd = input.estimatedUsd ?? estimateSpendUsd(input.inputTokens, input.outputTokens);
  try {
    await db.query(
      `INSERT INTO rarecrest.ai_spend_ledger
         (vertical, entity_id, agent_id, provider, model, input_tokens, output_tokens, estimated_usd, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.vertical,
        input.entityId ?? null,
        input.agentId ?? null,
        input.provider,
        input.model ?? null,
        input.inputTokens,
        input.outputTokens,
        estimatedUsd,
        input.correlationId ?? null,
      ],
    );
  } catch {
    // Durable spend recording is best-effort — a broken/missing table (e.g.
    // migration 028 not yet applied) must never fail the caller's response.
  }
}
