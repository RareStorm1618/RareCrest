import { describe, expect, it, vi } from "vitest";
import { computeTraceContentHash, DecisionTraceService } from "./decision-trace.js";
import type { DatabaseClient } from "@rarecrest/db";

function mockDb(rows: unknown[] = []): DatabaseClient {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as DatabaseClient;
}

describe("DecisionTraceService (WO-4/WO-17)", () => {
  it("appends trace with vertical retention default", async () => {
    const db = mockDb();
    const service = new DecisionTraceService(db);
    const entry = await service.append({
      entityId: "e1",
      vertical: "rareangels",
      action: "hard_rule_check",
      verdict: "allow",
      payload: { allowed: true },
    });
    expect(entry.vertical).toBe("rareangels");
    expect(entry.retentionRegime).toBe("hipaa-7yr");
    expect(db.query).toHaveBeenCalled();
  });

  it("lists traces for entity newest first", async () => {
    const db = mockDb([
      {
        id: "t1",
        entity_id: "e1",
        vertical: "rareangels",
        action: "deploy",
        verdict: "deny",
        payload: { reason: "blocked" },
        retention_regime: "hipaa-7yr",
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);
    const service = new DecisionTraceService(db);
    const traces = await service.listByEntity("e1");
    expect(traces).toHaveLength(1);
    expect(traces[0].verdict).toBe("deny");
  });
});

describe("DecisionTraceService hash chain (Wave 3)", () => {
  it("computeTraceContentHash is deterministic for identical inputs and sensitive to payload changes", () => {
    const a = computeTraceContentHash("e1", "deploy", { ok: true });
    const b = computeTraceContentHash("e1", "deploy", { ok: true });
    const c = computeTraceContentHash("e1", "deploy", { ok: false });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("append links prev_hash to the entity's most recent content_hash", async () => {
    const priorHash = computeTraceContentHash("e1", "prior_action", { step: 1 });
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT content_hash")) {
          return { rows: [{ content_hash: priorHash }] };
        }
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;
    const service = new DecisionTraceService(db);
    const entry = await service.append({
      entityId: "e1",
      vertical: "rareangels",
      action: "next_action",
      verdict: "allow",
      payload: { step: 2 },
    });
    expect(entry.prevHash).toBe(priorHash);
    expect(entry.contentHash).toBe(computeTraceContentHash("e1", "next_action", { step: 2 }));
  });

  it("append uses a null prev_hash for the entity's first trace", async () => {
    const db = mockDb([]);
    const service = new DecisionTraceService(db);
    const entry = await service.append({
      entityId: "e-new",
      vertical: "holding",
      action: "first_action",
      verdict: "allow",
      payload: {},
    });
    expect(entry.prevHash).toBeNull();
    expect(entry.contentHash).toBeTruthy();
  });

  it("append tolerates a missing decision_traces hash-chain query (migration not yet applied)", async () => {
    const db = {
      query: vi
        .fn()
        .mockRejectedValueOnce(new Error("column content_hash does not exist"))
        .mockResolvedValue({ rows: [] }),
    } as unknown as DatabaseClient;
    const service = new DecisionTraceService(db);
    const entry = await service.append({
      entityId: "e1",
      vertical: "holding",
      action: "action",
      verdict: "allow",
      payload: {},
    });
    expect(entry.prevHash).toBeNull();
  });
});
