import { describe, expect, it } from "vitest";
import { scoreDriveShape } from "./drive-shape.js";

describe("design-studio drive-shape (WO-40)", () => {
  it("returns stabilize profile for low score", () => {
    const scorecard = scoreDriveShape({
      clarity: 3,
      speed: 4,
      resilience: 3,
      leverage: 4,
    });
    expect(scorecard.profile).toBe("stabilize");
  });

  it("returns accelerate profile for high score", () => {
    const scorecard = scoreDriveShape({
      clarity: 9,
      speed: 8,
      resilience: 9,
      leverage: 8,
    });
    expect(scorecard.profile).toBe("accelerate");
    expect(scorecard.score).toBeGreaterThanOrEqual(8);
  });
});
