import { describe, expect, it } from "vitest";
import { lookupLatestKnownGoodVersion, shouldRecordVersion } from "./version-history.js";

describe("version-history helpers", () => {
  it("records when version changes", () => {
    expect(shouldRecordVersion("v1", "v2")).toBe(true);
    expect(shouldRecordVersion("v1", "v1")).toBe(false);
    expect(shouldRecordVersion(null, "v1")).toBe(true);
  });

  it("looks up prior known-good version", async () => {
    const version = await lookupLatestKnownGoodVersion(async () => ({ rows: [{ version: "v0" }] }), "a", "e");
    expect(version).toBe("v0");
  });
});
