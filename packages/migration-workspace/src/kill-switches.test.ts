import { describe, expect, it } from "vitest";
import { evaluateKillSwitches } from "./kill-switches.js";

describe("Kill switch readiness (WO-54)", () => {
  it("flags stale and unowned switches", () => {
    const result = evaluateKillSwitches([
      { id: "orders", armed: true, testedWithinDays: 12, ownerOnCall: true },
      { id: "billing", armed: false, testedWithinDays: 45, ownerOnCall: false },
    ]);
    expect(result.allReady).toBe(false);
    expect(result.missing.join("|")).toContain("billing:not_armed");
    expect(result.missing.join("|")).toContain("billing:stale_test");
  });
});
