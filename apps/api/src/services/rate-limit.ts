import type { DatabaseClient } from "@rarecrest/db";

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 429,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

/** In-memory sliding-window bucket. Used directly (no db) or as a fallback when the db table is absent. */
export function assertMemoryRateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > max) {
    throw new RateLimitError(`Rate limit exceeded for ${key}`);
  }
}

/** Test-only: clear in-memory buckets between test cases. */
export function resetMemoryRateLimits(): void {
  memoryBuckets.clear();
}

/**
 * Postgres-backed rate limit: upserts a per-key bucket in rarecrest.api_rate_limits,
 * resetting the window once it has elapsed. Falls back to the in-memory bucket when
 * no db is supplied, or when the query fails (e.g. migration 023 not yet applied) —
 * fail-open on infra gaps rather than blocking every request.
 */
export async function assertDbRateLimit(
  db: DatabaseClient | undefined,
  key: string,
  max: number,
  windowMs: number,
): Promise<void> {
  if (!db) {
    assertMemoryRateLimit(key, max, windowMs);
    return;
  }

  let count: number | undefined;
  try {
    const resetAt = new Date(Date.now() + windowMs).toISOString();
    const result = await db.query<{ count: number }>(
      `INSERT INTO rarecrest.api_rate_limits (bucket_key, count, reset_at)
       VALUES ($1, 1, $2)
       ON CONFLICT (bucket_key) DO UPDATE SET
         count = CASE
           WHEN rarecrest.api_rate_limits.reset_at <= NOW() THEN 1
           ELSE rarecrest.api_rate_limits.count + 1
         END,
         reset_at = CASE
           WHEN rarecrest.api_rate_limits.reset_at <= NOW() THEN EXCLUDED.reset_at
           ELSE rarecrest.api_rate_limits.reset_at
         END
       RETURNING count`,
      [key, resetAt],
    );
    count = result.rows[0]?.count;
  } catch {
    assertMemoryRateLimit(key, max, windowMs);
    return;
  }

  if (typeof count === "number" && count > max) {
    throw new RateLimitError(`Rate limit exceeded for ${key}`);
  }
}
