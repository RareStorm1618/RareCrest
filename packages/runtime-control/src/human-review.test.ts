import { describe, expect, it } from "vitest";
import { buildHeldActionRelease, shouldReleaseHeldAction } from "./human-review.js";

describe("human-review helpers", () => {
  it("builds release trace for held actions", () => {
    const release = buildHeldActionRelease("r1", { action: "trade", amount: 1 });
    expect(release?.action).toBe("trade");
    expect(release?.payload.reviewId).toBe("r1");
  });

  it("skips empty held actions", () => {
    expect(buildHeldActionRelease("r1", {})).toBeNull();
    expect(shouldReleaseHeldAction(true, {})).toBe(false);
    expect(shouldReleaseHeldAction(false, { action: "x" })).toBe(false);
  });
});
