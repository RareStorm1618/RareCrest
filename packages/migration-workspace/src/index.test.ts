import { describe, expect, it } from "vitest";
import { isStepComplete, validateStepSequence } from "./rewrite-steps.js";
import { buildEdgeTwinPlan } from "./edge-twin.js";
import { evaluateDeprecationGate } from "./override-trends.js";

describe("RewriteStepTracker (WO-51)", () => {
  it("AC-MIGR-001.1: six steps in order", () => {
    expect(isStepComplete("backcast_define", { written_mandate: true, director_sign_off: true, target_architecture: true })).toBe(true);
  });

  it("AC-MIGR-001.4: warns on out-of-order completion", () => {
    const msg = validateStepSequence([], "assess_prepare");
    expect(msg).toContain("incomplete");
  });
});

describe("EdgeTwinPlanner (WO-52)", () => {
  it("builds phased parallel-run plan", () => {
    const plan = buildEdgeTwinPlan("e1", 10);
    expect(plan.phases).toEqual(["shadow", "compare", "cutover"]);
    expect(plan.cutoverWeek).toBeGreaterThan(plan.compareStartWeek);
  });
});

describe("OverrideTrendTracker (WO-53)", () => {
  it("blocks deprecation when override threshold exceeded", () => {
    const overrides = Array.from({ length: 6 }, (_, i) => ({
      id: String(i), entityId: "e1", agentId: "a1", reason: "r", createdAt: new Date().toISOString(),
    }));
    expect(evaluateDeprecationGate(overrides).deprecationBlocked).toBe(true);
  });
});
