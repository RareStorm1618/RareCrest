import { describe, expect, it } from "vitest";
import { computeLearningVelocity } from "./learning-velocity.js";

describe("learning-velocity (WO-73)", () => {
  it("classifies improving trend from positive recent deltas", () => {
    const velocity = computeLearningVelocity(
      [
        { occurredAt: new Date().toISOString(), delta: 0.4, source: "evaluation" },
        { occurredAt: new Date().toISOString(), delta: 0.3, source: "version_change" },
      ],
      10,
    );
    expect(velocity.trend).toBe("improving");
    expect(velocity.signalCount).toBe(2);
  });
});
