import { describe, expect, it } from "vitest";
import { computeTransitionBudget } from "./transition-budget.js";

describe("Transition budget (WO-54)", () => {
  it("computes baseline, reserve, and total", () => {
    const result = computeTransitionBudget({
      annualRunCost: 1_200_000,
      transitionWindowMonths: 6,
      contingencyPct: 15,
    });
    expect(result.baselineBudget).toBe(600000);
    expect(result.contingencyReserve).toBe(90000);
    expect(result.totalBudget).toBeGreaterThan(result.baselineBudget);
  });
});
