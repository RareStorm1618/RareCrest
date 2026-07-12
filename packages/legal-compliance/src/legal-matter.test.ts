import { describe, expect, it } from "vitest";
import { STANDARD_DISCLAIMER, createLegalMatterPayload } from "./legal-matter.js";

describe("LegalMatterService (WO-57)", () => {
  it("includes not-legal-advice disclaimer", () => {
    expect(STANDARD_DISCLAIMER).toContain("Not legal advice");
  });

  it("flags awaiting counsel matters", () => {
    const payload = createLegalMatterPayload("IP review", "e1", "awaiting_counsel");
    expect(payload.requiresCounselReview).toBe(true);
    expect(payload.disclaimer).toBe(STANDARD_DISCLAIMER);
  });
});
