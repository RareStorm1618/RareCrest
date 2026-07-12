import { describe, it, expect } from "vitest";
import {
  computeReadinessBand,
  computeReadinessTotal,
  computeGovernanceMaturity,
  evaluateDabblingTest,
  evaluateTokenMaxxing,
  evaluateMigrationGate,
  validateDimensionScore,
  isStepUnlocked,
} from "./index.js";

const fullScores = {
  organizational_drag: 7,
  ai_elevation: 7,
  work_architecture: 7,
  firm_boundary: 7,
  decision_autonomy: 7,
  firm_boundary_design: 7,
  network_structure: 7,
  reinvention_cadence: 7,
  tacit_knowledge: 7,
};

describe("readiness scoring", () => {
  it("rejects out-of-range dimension scores", () => {
    expect(validateDimensionScore(0)).toBe(false);
    expect(validateDimensionScore(11)).toBe(false);
    expect(validateDimensionScore(5)).toBe(true);
  });

  it("computes total out of 80 when all dimensions scored", () => {
    const scores = {
      organizational_drag: 8,
      ai_elevation: 8,
      work_architecture: 8,
      firm_boundary: 8,
      decision_autonomy: 8,
      network_structure: 8,
      reinvention_cadence: 8,
      tacit_knowledge: 8,
    };
    expect(computeReadinessTotal(scores)).toBe(64);
  });

  it("reports ready_for_rewrite band for 56-80", () => {
    const scores = {
      organizational_drag: 7,
      ai_elevation: 7,
      work_architecture: 7,
      firm_boundary: 7,
      decision_autonomy: 7,
      network_structure: 7,
      reinvention_cadence: 7,
      tacit_knowledge: 7,
    };
    const result = computeReadinessBand(scores);
    expect(result.band).toBe("ready_for_rewrite");
    expect(result.total).toBe(56);
  });

  it("reports survival_risk below 33", () => {
    const scores = {
      organizational_drag: 2,
      ai_elevation: 2,
      work_architecture: 2,
      firm_boundary: 2,
      decision_autonomy: 2,
      network_structure: 2,
      reinvention_cadence: 2,
      tacit_knowledge: 2,
    };
    expect(computeReadinessBand(scores).band).toBe("survival_risk");
  });

  it("returns incomplete when dimensions missing", () => {
    expect(computeReadinessBand({ organizational_drag: 5 }).band).toBe("incomplete");
  });
});

describe("dabbling and token-maxxing", () => {
  it("fails dabbling when either condition fails", () => {
    expect(evaluateDabblingTest(false, true).pass).toBe(false);
    expect(evaluateDabblingTest(true, true).pass).toBe(true);
  });

  it("places below L3 on any yes in token-maxxing", () => {
    expect(evaluateTokenMaxxing(["yes", "no", "no"]).belowL3).toBe(true);
    expect(evaluateTokenMaxxing(["no", "no", "no"]).pass).toBe(true);
  });
});

describe("governance and migration", () => {
  it("uses minimum pillar score and locks below 3", () => {
    const result = computeGovernanceMaturity({
      trusted_evaluations: 4,
      searchable_logs: 2,
      granular_rollback: 5,
      human_review_queue: 4,
    });
    expect(result.maturity).toBe(2);
    expect(result.deploymentLocked).toBe(true);
    expect(result.belowThreshold).toContain("searchable_logs");
  });

  it("halts migration on red gating questions", () => {
    const result = evaluateMigrationGate({ q5: "green", q6: "red", q7: "yellow", q8: "green" });
    expect(result.halted).toBe(true);
    expect(result.haltReasons).toEqual(["q6"]);
  });
});

describe("run order", () => {
  it("blocks later steps until earlier complete", () => {
    expect(isStepUnlocked([], "readiness_score")).toBe(true);
    expect(isStepUnlocked([], "dabbling_test")).toBe(false);
    expect(isStepUnlocked(["readiness_score", "score_interpretation", "maturity_ladder"], "dabbling_test")).toBe(true);
  });
});
