import { describe, expect, it } from "vitest";
import { registerAsset } from "./asset-register.js";

describe("asset-register (WO-62)", () => {
  it("normalizes registration payload and chain fingerprint", () => {
    const asset = registerAsset({
      entityId: "e1",
      assetType: "patent",
      title: "  Edge Inference Pipeline  ",
      jurisdiction: " us ",
      filingDate: "2025-01-20",
      ownerId: "holding-entity",
      beneficialOwnerId: "subsidiary-a",
      registrationNumber: "US-123",
    });
    expect(asset.title).toBe("Edge Inference Pipeline");
    expect(asset.jurisdiction).toBe("US");
    expect(asset.chainFingerprint).toContain("holding-entity");
  });
});
