import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BudgetExceededError,
  checkAndConsumeBudget,
  dailyBudgetFor,
  estimateTokens,
  peekBudget,
  resetBudgets,
} from "./budgets.js";

describe("intelligence token budgets (Wave 3)", () => {
  beforeEach(() => {
    resetBudgets();
  });
  afterEach(() => {
    delete process.env.INTEL_TOKEN_BUDGET_RAREANGELS;
    resetBudgets();
  });

  it("dailyBudgetFor defaults to 100000 when no env override is set", () => {
    expect(dailyBudgetFor("rareedge")).toBe(100_000);
  });

  it("dailyBudgetFor honors INTEL_TOKEN_BUDGET_<VERTICAL>", () => {
    process.env.INTEL_TOKEN_BUDGET_RAREANGELS = "500";
    expect(dailyBudgetFor("rareangels")).toBe(500);
  });

  it("estimateTokens is a rough ~4 chars/token heuristic and never returns 0", () => {
    expect(estimateTokens("")).toBe(1);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(40))).toBe(10);
  });

  it("checkAndConsumeBudget allows requests under budget and tracks usage", () => {
    process.env.INTEL_TOKEN_BUDGET_RAREANGELS = "100";
    const status = checkAndConsumeBudget("rareangels", 40);
    expect(status.allowed).toBe(true);
    expect(status.used).toBe(40);
    expect(status.remaining).toBe(60);
    expect(status.limit).toBe(100);
  });

  it("checkAndConsumeBudget throws BudgetExceededError (429) once the budget is exceeded", () => {
    process.env.INTEL_TOKEN_BUDGET_RAREANGELS = "100";
    checkAndConsumeBudget("rareangels", 90);
    expect(() => checkAndConsumeBudget("rareangels", 20)).toThrow(BudgetExceededError);
    try {
      checkAndConsumeBudget("rareangels", 20);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BudgetExceededError);
      expect((err as BudgetExceededError).statusCode).toBe(429);
    }
  });

  it("peekBudget reflects usage without consuming further budget", () => {
    process.env.INTEL_TOKEN_BUDGET_RAREANGELS = "100";
    checkAndConsumeBudget("rareangels", 30);
    const before = peekBudget("rareangels");
    const after = peekBudget("rareangels");
    expect(before).toEqual(after);
    expect(before.used).toBe(30);
    expect(before.allowed).toBe(true);
  });

  it("budgets are tracked independently per vertical", () => {
    process.env.INTEL_TOKEN_BUDGET_RAREANGELS = "100";
    checkAndConsumeBudget("rareangels", 90);
    const other = checkAndConsumeBudget("rareedge", 10);
    expect(other.used).toBe(10);
    expect(other.limit).toBe(100_000);
  });
});
