import { describe, expect, it } from "vitest";
import {
  ASSESSMENT_RUN_ORDER,
  canStartRetake,
  isRetakeDue,
  isStepUnlocked,
  sequencerState,
} from "./sequencer.js";

describe("AssessmentSequencer (WO-25)", () => {
  it("enforces mandatory run order", () => {
    const state = sequencerState([]);
    expect(state[0].unlocked).toBe(true);
    expect(state[1].unlocked).toBe(false);
    expect(ASSESSMENT_RUN_ORDER).toHaveLength(8);
  });

  it("unlocks steps only after prior completion", () => {
    expect(isStepUnlocked([], "readiness_score")).toBe(true);
    expect(isStepUnlocked([], "dabbling_test")).toBe(false);
    expect(
      isStepUnlocked(["readiness_score", "score_interpretation", "maturity_ladder"], "dabbling_test"),
    ).toBe(true);
  });

  it("retake helpers respect six-month window", () => {
    const recent = new Date().toISOString();
    const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    expect(isRetakeDue(recent)).toBe(false);
    expect(isRetakeDue(old)).toBe(true);
    expect(canStartRetake(null)).toBe(true);
    expect(canStartRetake(recent)).toBe(false);
    expect(canStartRetake(old)).toBe(true);
  });
});
