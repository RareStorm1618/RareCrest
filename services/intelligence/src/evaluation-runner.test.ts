import { describe, expect, it } from "vitest";
import { runEvaluation } from "./evaluation-runner.js";

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
