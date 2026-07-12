/** S1 Attention Budget Protocol — pure token math shared by the service and dashboard. */

import type { AttentionSeverity } from "@rarecrest/contracts";

export type AttentionTokenKind = "critical" | "awareness";

/** critical/high severity spends a critical token; medium/low spends an awareness token. */
export function tokenKindForSeverity(severity: AttentionSeverity): AttentionTokenKind {
  return severity === "critical" || severity === "high" ? "critical" : "awareness";
}

export interface AttentionBudgetDefaults {
  criticalTokens: number;
  awarenessTokens: number;
}

const DEFAULT_CRITICAL_DAILY = 3;
const DEFAULT_AWARENESS_DAILY = 10;

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
}

/** Reads ATTENTION_CRITICAL_DAILY / ATTENTION_AWARENESS_DAILY, defaulting to 3/10. */
export function dailyDefaults(env: Record<string, string | undefined> = process.env): AttentionBudgetDefaults {
  return {
    criticalTokens: parseNonNegativeInt(env.ATTENTION_CRITICAL_DAILY, DEFAULT_CRITICAL_DAILY),
    awarenessTokens: parseNonNegativeInt(env.ATTENTION_AWARENESS_DAILY, DEFAULT_AWARENESS_DAILY),
  };
}

export interface AttentionBudgetRow {
  criticalTokens: number;
  awarenessTokens: number;
  criticalSpent: number;
  awarenessSpent: number;
}

export interface AttentionBudgetRemaining {
  criticalRemaining: number;
  awarenessRemaining: number;
}

/** Pure remaining-token math — never goes negative even if spent overshoots tokens. */
export function remainingTokens(row: AttentionBudgetRow): AttentionBudgetRemaining {
  return {
    criticalRemaining: Math.max(0, row.criticalTokens - row.criticalSpent),
    awarenessRemaining: Math.max(0, row.awarenessTokens - row.awarenessSpent),
  };
}

/** Whether one more token of `kind` can be spent without exceeding the daily budget. */
export function hasTokenAvailable(row: AttentionBudgetRow, kind: AttentionTokenKind): boolean {
  const remaining = remainingTokens(row);
  return kind === "critical" ? remaining.criticalRemaining > 0 : remaining.awarenessRemaining > 0;
}

/** Pure spend transition. Returns `row` unchanged when no token of `kind` is available. */
export function applySpend(row: AttentionBudgetRow, kind: AttentionTokenKind): AttentionBudgetRow {
  if (!hasTokenAvailable(row, kind)) return row;
  return kind === "critical"
    ? { ...row, criticalSpent: row.criticalSpent + 1 }
    : { ...row, awarenessSpent: row.awarenessSpent + 1 };
}
