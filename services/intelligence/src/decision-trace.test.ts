import { describe, expect, it, vi } from "vitest";
import { DecisionTraceService } from "./decision-trace.js";
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
