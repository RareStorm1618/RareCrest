import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@rarecrest/db";
import { AsyncJobError, AsyncJobService } from "./async-jobs.js";

function mockDb(rows: Record<string, unknown>[] = []): { db: DatabaseClient; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const db = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      return { rows };
    }),
  } as unknown as DatabaseClient;
  return { db, calls };
}

describe("AsyncJobService (Wave 3)", () => {
  it("enqueue inserts a pending job and returns the row", async () => {
    const { db } = mockDb([
      {
        id: "job-1",
        jobType: "export_oversight",
        entityId: "e1",
        actorId: "u1",
        status: "pending",
        payload: { format: "markdown" },
        result: null,
        error: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    const jobs = new AsyncJobService(db);
    const job = await jobs.enqueue({ jobType: "export_oversight", entityId: "e1", actorId: "u1", payload: { format: "markdown" } });
    expect(job.id).toBe("job-1");
    expect(job.status).toBe("pending");
    expect(db.query).toHaveBeenCalled();
  });

  it("get returns the job when the actor matches", async () => {
    const { db } = mockDb([
      {
        id: "job-1",
        jobType: "decision_trace_sync",
        entityId: "e1",
        actorId: "u1",
        status: "ready",
        payload: {},
        result: { ingested: 3 },
        error: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    const jobs = new AsyncJobService(db);
    const job = await jobs.get("job-1", "u1");
    expect(job.status).toBe("ready");
    expect(job.result).toEqual({ ingested: 3 });
  });

  it("get throws 404 when the job does not exist", async () => {
    const { db } = mockDb([]);
    const jobs = new AsyncJobService(db);
    await expect(jobs.get("missing", "u1")).rejects.toMatchObject({ statusCode: 404 });
    await expect(jobs.get("missing", "u1")).rejects.toBeInstanceOf(AsyncJobError);
  });

  it("get throws 403 when the actor does not own the job", async () => {
    const { db } = mockDb([
      {
        id: "job-1",
        jobType: "export_oversight",
        entityId: "e1",
        actorId: "owner",
        status: "ready",
        payload: {},
        result: {},
        error: null,
        createdAt: "now",
        updatedAt: "now",
      },
    ]);
    const jobs = new AsyncJobService(db);
    await expect(jobs.get("job-1", "someone-else")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("run transitions pending -> running -> ready on success", async () => {
    const { db, calls } = mockDb([]);
    const jobs = new AsyncJobService(db);
    const result = await jobs.run("job-1", async () => ({ ok: true }));
    expect(result).toEqual({ ok: true });
    const sqlCalls = calls.map((c) => String(c[0]));
    expect(sqlCalls.some((s) => s.includes("status = 'running'"))).toBe(true);
    expect(sqlCalls.some((s) => s.includes("status = 'ready'"))).toBe(true);
  });

  it("run transitions pending -> running -> failed and rethrows on error", async () => {
    const { db, calls } = mockDb([]);
    const jobs = new AsyncJobService(db);
    await expect(
      jobs.run("job-1", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const sqlCalls = calls.map((c) => String(c[0]));
    expect(sqlCalls.some((s) => s.includes("status = 'running'"))).toBe(true);
    expect(sqlCalls.some((s) => s.includes("status = 'failed'"))).toBe(true);
  });
});
