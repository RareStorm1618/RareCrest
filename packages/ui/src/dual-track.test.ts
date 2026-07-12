import { describe, expect, it } from "vitest";
import { validateDualTrackContent } from "./dual-track.js";

describe("dual-track shell (WO-21)", () => {
  it("requires narrative and schema payload", () => {
    expect(validateDualTrackContent("", {})).toEqual({
      valid: false,
      errors: ["narrative_required", "schema_payload_required"],
    });
  });

  it("accepts populated dual-track content", () => {
    expect(
      validateDualTrackContent("Director summary", { band: "green", maturity: 4 }),
    ).toEqual({ valid: true, errors: [] });
  });
});
