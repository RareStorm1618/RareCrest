import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@rarecrest/db";
import type { ParliamentService, SealRow } from "../services/parliament.js";
import type { AsyncJobService } from "../services/async-jobs.js";
import { runNightShift } from "./night-shift.js";

/**
 * EXO Wave A night-shift worker: dry-run coverage with fully mocked
 * ParliamentService/AsyncJobService dependencies — no real DB required.
 */

function fakeSeal(overrides: Partial<SealRow> = {}): SealRow {
  return {
    id: "seal-1",
    sessionId: "session-1",
    sealedBy: "director-1",
    sealedAt: new Date().toISOString(),
    mode: "time_lock",
    executeAfter: new Date().toISOString(),
    cancelledAt: null,
    executedAt: null,
    humanInstructionId: null,
    overrideNote: null,
    correlationId: null,
    payload: {},
    effectDigest: null,
    ...overrides,
  };
}

function mockDb(): DatabaseClient {
  return { query: vi.fn(async () => ({ rows: [] })) } as unknown as DatabaseClient;
}

describe("runNightShift", () => {
  it("executes every due seal and marks stale async jobs, tallying results", async () => {
    const dueSeals = [fakeSeal({ id: "seal-1" }), fakeSeal({ id: "seal-2" })];
    const executeSeal = vi.fn(async (id: string) => fakeSeal({ id, executedAt: new Date().toISOString() }));
    const parliament = {
      listDueSeals: vi.fn(async () => dueSeals),
      executeSeal,
    } as unknown as ParliamentService;
    const markStale = vi.fn(async () => 3);
    const asyncJobs = { markStale } as unknown as AsyncJobService;

    const result = await runNightShift(mockDb(), { parliament, asyncJobs });

    expect(executeSeal).toHaveBeenCalledTimes(2);
    expect(executeSeal).toHaveBeenCalledWith("seal-1");
    expect(executeSeal).toHaveBeenCalledWith("seal-2");
    expect(result.sealsExecuted).toBe(2);
    expect(result.sealsFailed).toBe(0);
    expect(result.staleJobsMarked).toBe(3);
    expect(result.sealResults).toHaveLength(2);
    expect(result.sealResults.every((r) => r.status === "executed")).toBe(true);
    expect(typeof result.ranAt).toBe("string");
    expect(result).toHaveProperty("provenanceRootId");
    expect(markStale).toHaveBeenCalledWith(60);
  });

  it("tallies a failed seal execution separately without throwing (best-effort per-seal)", async () => {
    const dueSeals = [fakeSeal({ id: "seal-ok" }), fakeSeal({ id: "seal-bad" })];
    const executeSeal = vi.fn(async (id: string) => {
      if (id === "seal-bad") throw new Error("Time-lock has not elapsed yet");
      return fakeSeal({ id, executedAt: new Date().toISOString() });
    });
    const parliament = {
      listDueSeals: vi.fn(async () => dueSeals),
      executeSeal,
    } as unknown as ParliamentService;
    const asyncJobs = { markStale: vi.fn(async () => 0) } as unknown as AsyncJobService;

    const result = await runNightShift(mockDb(), { parliament, asyncJobs });

    expect(result.sealsExecuted).toBe(1);
    expect(result.sealsFailed).toBe(1);
    const failed = result.sealResults.find((r) => r.sealId === "seal-bad");
    expect(failed).toMatchObject({ status: "failed", detail: "Time-lock has not elapsed yet" });
  });

  it("is a no-op pass when there are no due seals and no stale jobs", async () => {
    const parliament = {
      listDueSeals: vi.fn(async () => []),
      executeSeal: vi.fn(),
    } as unknown as ParliamentService;
    const asyncJobs = { markStale: vi.fn(async () => 0) } as unknown as AsyncJobService;

    const result = await runNightShift(mockDb(), { parliament, asyncJobs });

    expect(result.sealsExecuted).toBe(0);
    expect(result.sealsFailed).toBe(0);
    expect(result.sealResults).toEqual([]);
    expect(result.staleJobsMarked).toBe(0);
  });

  it("passes a custom staleAfterMinutes through to markStale", async () => {
    const parliament = {
      listDueSeals: vi.fn(async () => []),
      executeSeal: vi.fn(),
    } as unknown as ParliamentService;
    const markStale = vi.fn(async () => 1);
    const asyncJobs = { markStale } as unknown as AsyncJobService;

    await runNightShift(mockDb(), { parliament, asyncJobs, staleAfterMinutes: 15 });

    expect(markStale).toHaveBeenCalledWith(15);
  });

  it("constructs default ParliamentService/AsyncJobService from db when deps are omitted", async () => {
    const db = mockDb();
    const result = await runNightShift(db);
    // No due seals/stale jobs against an empty mock db — still returns a well-formed result.
    expect(result.sealsExecuted).toBe(0);
    expect(result.staleJobsMarked).toBe(0);
    expect(db.query).toHaveBeenCalled();
  });
});
