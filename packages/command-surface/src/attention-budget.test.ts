import { describe, expect, it } from "vitest";
import {
  applySpend,
  dailyDefaults,
  hasTokenAvailable,
  remainingTokens,
  tokenKindForSeverity,
} from "./attention-budget.js";

describe("S1 Attention Budget Protocol — tokenKindForSeverity", () => {
  it("routes critical severity to the critical token pool", () => {
    expect(tokenKindForSeverity("critical")).toBe("critical");
  });

  it("routes high severity to the critical token pool", () => {
    expect(tokenKindForSeverity("high")).toBe("critical");
  });

  it("routes medium severity to the awareness token pool", () => {
    expect(tokenKindForSeverity("medium")).toBe("awareness");
  });

  it("routes low severity to the awareness token pool", () => {
    expect(tokenKindForSeverity("low")).toBe("awareness");
  });
});

describe("dailyDefaults", () => {
  it("defaults to 3 critical / 10 awareness tokens when env is unset", () => {
    expect(dailyDefaults({})).toEqual({ criticalTokens: 3, awarenessTokens: 10 });
  });

  it("reads ATTENTION_CRITICAL_DAILY and ATTENTION_AWARENESS_DAILY overrides", () => {
    expect(
      dailyDefaults({ ATTENTION_CRITICAL_DAILY: "5", ATTENTION_AWARENESS_DAILY: "20" }),
    ).toEqual({ criticalTokens: 5, awarenessTokens: 20 });
  });

  it("falls back to defaults for invalid/negative env values", () => {
    expect(
      dailyDefaults({ ATTENTION_CRITICAL_DAILY: "-1", ATTENTION_AWARENESS_DAILY: "not-a-number" }),
    ).toEqual({ criticalTokens: 3, awarenessTokens: 10 });
  });
});

describe("remainingTokens", () => {
  it("computes remaining tokens per pool", () => {
    const row = { criticalTokens: 3, awarenessTokens: 10, criticalSpent: 1, awarenessSpent: 4 };
    expect(remainingTokens(row)).toEqual({ criticalRemaining: 2, awarenessRemaining: 6 });
  });

  it("never goes negative when spent exceeds the budget", () => {
    const row = { criticalTokens: 3, awarenessTokens: 10, criticalSpent: 5, awarenessSpent: 15 };
    expect(remainingTokens(row)).toEqual({ criticalRemaining: 0, awarenessRemaining: 0 });
  });
});

describe("hasTokenAvailable / applySpend", () => {
  it("reports a token available when spent is below the budget", () => {
    const row = { criticalTokens: 3, awarenessTokens: 10, criticalSpent: 2, awarenessSpent: 0 };
    expect(hasTokenAvailable(row, "critical")).toBe(true);
  });

  it("reports no token available once the budget is exhausted", () => {
    const row = { criticalTokens: 3, awarenessTokens: 10, criticalSpent: 3, awarenessSpent: 0 };
    expect(hasTokenAvailable(row, "critical")).toBe(false);
  });

  it("applySpend increments the matching pool's spent counter", () => {
    const row = { criticalTokens: 3, awarenessTokens: 10, criticalSpent: 0, awarenessSpent: 0 };
    expect(applySpend(row, "critical")).toEqual({ ...row, criticalSpent: 1 });
    expect(applySpend(row, "awareness")).toEqual({ ...row, awarenessSpent: 1 });
  });

  it("applySpend is a no-op once the pool is exhausted", () => {
    const row = { criticalTokens: 3, awarenessTokens: 10, criticalSpent: 3, awarenessSpent: 0 };
    expect(applySpend(row, "critical")).toEqual(row);
  });
});
