import { describe, expect, it } from "vitest";
import { isStepUnlocked } from "@rarecrest/diagnostics";
import { StepLockedError } from "./diagnostics.js";

describe("DiagnosticsService step lock (WO-25)", () => {
  it("StepLockedError names the blocked step", () => {
    const err = new StepLockedError("dabbling_test");
    expect(err.step).toBe("dabbling_test");
    expect(err.message).toContain("dabbling_test");
  });

  it("dabbling_test locked without prerequisites", () => {
    expect(isStepUnlocked([], "dabbling_test")).toBe(false);
  });
});
