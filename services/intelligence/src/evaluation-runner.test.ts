import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@rarecrest/db";
import { persistEvaluationRun, runEvaluation } from "./evaluation-runner.js";

describe("EvaluationRunner (WO-70)", () => {
  it("AC-RCP-005.2: flags drift and offers rollback path", () => {
    const r = runEvaluation({
      agentId: "a1",
      entityId: "e1",
      accuracy: 0.7,
      overrideRate: 0.3,
      accuracyFloor: 0.85,
      overrideCeiling: 0.15,
    });
    expect(r.driftDetected).toBe(true);
    expect(r.offerRollbackOrRetrain).toBe(true);
  });
});

describe("EvaluationRunner drift -> attention flag (Wave 3)", () => {
  const input = {
    agentId: "a1",
    entityId: "e1",
    accuracy: 0.7,
    overrideRate: 0.3,
    accuracyFloor: 0.85,
    overrideCeiling: 0.15,
  };

  it("raises an attention flag linking to #/entities/{id}/runtime when drift is detected", async () => {
    const inserted: unknown[][] = [];
    const db = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("INSERT INTO rarecrest.evaluation_runs")) return { rows: [{ id: "run-1" }] };
        if (sql.includes("INSERT INTO rarecrest.human_review_queue")) return { rows: [{ id: "hr-1" }] };
        if (sql.includes("SELECT id FROM rarecrest.attention_flags")) return { rows: [] };
        if (sql.includes("INSERT INTO rarecrest.attention_flags")) {
          inserted.push(params ?? []);
          return { rows: [] };
        }
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;

    const result = runEvaluation(input);
    const persisted = await persistEvaluationRun(db, input, result);

    expect(persisted.runId).toBe("run-1");
    expect(persisted.humanReviewId).toBe("hr-1");
    expect(inserted).toHaveLength(1);
    const [entityId, , linkPath, sourceRef] = inserted[0] as string[];
    expect(entityId).toBe("e1");
    expect(linkPath).toBe("#/entities/e1/runtime");
    expect(sourceRef).toBe("evaluation_drift:a1");
  });

  it("does not raise a duplicate attention flag when one is already open for the agent", async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("INSERT INTO rarecrest.evaluation_runs")) return { rows: [{ id: "run-1" }] };
        if (sql.includes("INSERT INTO rarecrest.human_review_queue")) return { rows: [{ id: "hr-1" }] };
        if (sql.includes("SELECT id FROM rarecrest.attention_flags")) return { rows: [{ id: "existing-flag" }] };
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;

    const result = runEvaluation(input);
    await persistEvaluationRun(db, input, result);

    const insertCalls = (db.query as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO rarecrest.attention_flags"),
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("does not raise an attention flag when no drift is detected", async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("INSERT INTO rarecrest.evaluation_runs")) return { rows: [{ id: "run-1" }] };
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;

    const cleanInput = { ...input, accuracy: 0.95, overrideRate: 0.05 };
    const result = runEvaluation(cleanInput);
    expect(result.driftDetected).toBe(false);
    await persistEvaluationRun(db, cleanInput, result);

    const insertCalls = (db.query as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
      String(c[0]).includes("INSERT INTO rarecrest.attention_flags"),
    );
    expect(insertCalls).toHaveLength(0);
  });
});
