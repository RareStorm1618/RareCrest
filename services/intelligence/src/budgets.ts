/** Wave 3: per-vertical token budget for the skill-companion companion path. */

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_BUDGET = 100_000;

export interface BudgetStatus {
  allowed: boolean;
  vertical: string;
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
}

export class BudgetExceededError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 429,
  ) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

interface BudgetBucket {
  used: number;
  resetAt: number;
}

const buckets = new Map<string, BudgetBucket>();

/** INTEL_TOKEN_BUDGET_<VERTICAL> (uppercased) or the 100k/day default. */
export function dailyBudgetFor(vertical: string): number {
  const raw = process.env[`INTEL_TOKEN_BUDGET_${vertical.toUpperCase()}`];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_BUDGET;
}

function currentBucket(vertical: string): BudgetBucket {
  const now = Date.now();
  const existing = buckets.get(vertical);
  if (existing && existing.resetAt > now) return existing;
  const fresh: BudgetBucket = { used: 0, resetAt: now + DAY_MS };
  buckets.set(vertical, fresh);
  return fresh;
}

/** Rough token estimate (~4 chars/token) — good enough for a soft budget gate. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Throws BudgetExceededError (429) when consuming `tokens` would exceed the vertical's daily budget. */
export function checkAndConsumeBudget(vertical: string, tokens: number): BudgetStatus {
  const limit = dailyBudgetFor(vertical);
  const bucket = currentBucket(vertical);
  if (bucket.used + tokens > limit) {
    throw new BudgetExceededError(
      `Intelligence token budget exceeded for vertical=${vertical}: used=${bucket.used}, requested=${tokens}, limit=${limit}`,
    );
  }
  bucket.used += tokens;
  return {
    allowed: true,
    vertical,
    used: bucket.used,
    limit,
    remaining: Math.max(0, limit - bucket.used),
    resetAt: new Date(bucket.resetAt).toISOString(),
  };
}

export function peekBudget(vertical: string): BudgetStatus {
  const limit = dailyBudgetFor(vertical);
  const bucket = currentBucket(vertical);
  return {
    allowed: bucket.used < limit,
    vertical,
    used: bucket.used,
    limit,
    remaining: Math.max(0, limit - bucket.used),
    resetAt: new Date(bucket.resetAt).toISOString(),
  };
}

/** Test-only: clear all in-memory budget counters. */
export function resetBudgets(): void {
  buckets.clear();
}
