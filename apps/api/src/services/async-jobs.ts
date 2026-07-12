import type { DatabaseClient } from "@rarecrest/db";

export type AsyncJobType = "export_oversight" | "decision_trace_sync";
export type AsyncJobStatus = "pending" | "running" | "ready" | "failed";

export interface AsyncJobRow {
  id: string;
  jobType: AsyncJobType;
  entityId: string | null;
  actorId: string;
  status: AsyncJobStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export class AsyncJobError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "AsyncJobError";
  }
}

const JOB_SELECT = `id, job_type AS "jobType", entity_id AS "entityId", actor_id AS "actorId",
              status, payload, result_json AS "result", error,
              created_at AS "createdAt", updated_at AS "updatedAt"`;

/** WO Apex Wave 3: durable async job envelope for long-running exports and syncs. */
export class AsyncJobService {
  constructor(private db: DatabaseClient) {}

  async enqueue(input: {
    jobType: AsyncJobType;
    entityId?: string | null;
    actorId: string;
    payload?: Record<string, unknown>;
  }): Promise<AsyncJobRow> {
    const result = await this.db.query<AsyncJobRow>(
      `INSERT INTO rarecrest.async_jobs (job_type, entity_id, actor_id, status, payload)
       VALUES ($1, $2, $3, 'pending', $4::jsonb)
       RETURNING ${JOB_SELECT}`,
      [input.jobType, input.entityId ?? null, input.actorId, JSON.stringify(input.payload ?? {})],
    );
    return result.rows[0];
  }

  /** Fetch a job. Caller must own it (actorId match) — no cross-actor job snooping. */
  async get(id: string, actorId: string): Promise<AsyncJobRow> {
    const result = await this.db.query<AsyncJobRow>(
      `SELECT ${JOB_SELECT} FROM rarecrest.async_jobs WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new AsyncJobError("Job not found", 404);
    if (row.actorId !== actorId) throw new AsyncJobError("Job access denied", 403);
    return row;
  }

  async markRunning(id: string): Promise<void> {
    await this.db.query(
      `UPDATE rarecrest.async_jobs SET status = 'running', updated_at = NOW() WHERE id = $1`,
      [id],
    );
  }

  async markReady(id: string, result: Record<string, unknown>): Promise<void> {
    await this.db.query(
      `UPDATE rarecrest.async_jobs SET status = 'ready', result_json = $2::jsonb, updated_at = NOW() WHERE id = $1`,
      [id, JSON.stringify(result)],
    );
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.db.query(
      `UPDATE rarecrest.async_jobs SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [id, error],
    );
  }

  /**
   * Night-shift housekeeping: jobs stuck in `pending`/`running` past `staleAfterMinutes`
   * (a worker that died mid-job, or one that was never picked up) are marked `failed` so
   * they stop looking "in flight" forever. Returns the count of jobs marked stale.
   */
  async markStale(staleAfterMinutes = 60): Promise<number> {
    const result = await this.db.query(
      `UPDATE rarecrest.async_jobs
       SET status = 'failed', error = 'stale — marked failed by night-shift', updated_at = NOW()
       WHERE status IN ('pending', 'running')
         AND updated_at < NOW() - ($1 * INTERVAL '1 minute')
       RETURNING id`,
      [staleAfterMinutes],
    );
    return result.rows.length;
  }

  /** Runs work with pending→running→(ready|failed) transitions. Rethrows on failure. */
  async run<T extends Record<string, unknown>>(id: string, work: () => Promise<T>): Promise<T> {
    await this.markRunning(id);
    try {
      const result = await work();
      await this.markReady(id, result);
      return result;
    } catch (err) {
      await this.markFailed(id, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }
}
