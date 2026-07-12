import { describe, expect, it } from "vitest";
import { draftLegalSupportResponse } from "./legal-support-teammate.js";

describe("Legal support teammate (WO-58)", () => {
  it("escalates high-risk legal issues", () => {
    const result = draftLegalSupportResponse({
      issue: "Potential litigation hold conflict",
      urgency: "high",
      containsRegulatedData: true,
      jurisdiction: "US-CA",
    });
    expect(result.escalateToCounsel).toBe(true);
    expect(result.disclaimer).toContain("Not legal advice");
    expect(result.actions.join("|")).toContain("encryption");
  });
});
