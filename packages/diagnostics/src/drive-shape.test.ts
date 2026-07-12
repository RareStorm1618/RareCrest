import { describe, expect, it } from "vitest";
import { computeDriveShape } from "./drive-shape.js";

describe("drive-shape (WO-26)", () => {
  it("maps low aggregate score to traction-seeking profile", () => {
    const result = computeDriveShape({
      urgency: 5,
      operationalDiscipline: 3,
      learningVelocity: 3,
      missionCriticality: 3,
    });
    expect(result.profile).toBe("traction_seeking");
    expect(result.score).toBeLessThanOrEqual(4);
  });

  it("maps medium aggregate score to mission-locked profile", () => {
    const result = computeDriveShape({
      urgency: 7,
      operationalDiscipline: 6,
      learningVelocity: 6,
      missionCriticality: 6,
    });
    expect(result.profile).toBe("mission_locked");
    expect(result.score).toBeGreaterThanOrEqual(5);
  });

  it("maps high aggregate score to scale-optimized profile", () => {
    const result = computeDriveShape({
      urgency: 9,
      operationalDiscipline: 9,
      learningVelocity: 8,
      missionCriticality: 9,
    });
    expect(result.profile).toBe("scale_optimized");
    expect(result.score).toBeGreaterThanOrEqual(8);
  });

  it("rejects out-of-range values", () => {
    expect(() =>
      computeDriveShape({
        urgency: 11,
        operationalDiscipline: 5,
        learningVelocity: 5,
        missionCriticality: 5,
      }),
    ).toThrow("urgency must be a number between 1 and 10");
  });
});
