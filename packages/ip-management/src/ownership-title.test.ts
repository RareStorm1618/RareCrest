import { describe, expect, it } from "vitest";
import { verifyOwnershipTitle } from "./ownership-title.js";

describe("ownership-title (WO-63)", () => {
  it("detects contiguous chain and current owner", () => {
    const result = verifyOwnershipTitle([
      { fromOwnerId: "founder", toOwnerId: "holdco", transferDate: "2021-03-01", instrumentRef: "A1" },
      { fromOwnerId: "holdco", toOwnerId: "opco", transferDate: "2023-06-15", instrumentRef: "A2" },
    ]);
    expect(result.valid).toBe(true);
    expect(result.currentOwnerId).toBe("opco");
  });

  it("flags broken links in chain-of-title", () => {
    const result = verifyOwnershipTitle([
      { fromOwnerId: "founder", toOwnerId: "holdco", transferDate: "2021-03-01", instrumentRef: "A1" },
      { fromOwnerId: "other", toOwnerId: "opco", transferDate: "2023-06-15", instrumentRef: "A2" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.gaps[0]).toContain("broken_link");
  });
});
