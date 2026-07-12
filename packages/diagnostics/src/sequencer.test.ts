import { describe, expect, it } from "vitest";
import { ASSESSMENT_RUN_ORDER, sequencerState } from "./sequencer.js";

describe("AssessmentSequencer (WO-25)", () => {
  it("enforces mandatory run order", () => {
    const state = sequencerState([]);
    expect(state[0].unlocked).toBe(true);
    expect(state[1].unlocked).toBe(false);
    expect(ASSESSMENT_RUN_ORDER).toHaveLength(8);
  });
});
