import { describe, expect, it } from "vitest";
import { assembleOversightPack, renderMarkdown } from "./index.js";

describe("ExportController (WO-27)", () => {
  it("assembles oversight pack from recorded traces only", () => {
    const pack = assembleOversightPack({
      entityId: "e1",
      entityName: "RareAngels",
      governancePillars: { trusted_evaluations: 4 },
      killSwitchLastTest: "2026-01-01",
      openRedGates: ["q5"],
      hardRuleExceptions: [],
      attentionFlags: [],
    }, "markdown");
    expect(pack.sections.length).toBeGreaterThan(0);
    expect(pack.contentHash).toHaveLength(64);
    expect(renderMarkdown(pack)).toContain("Oversight Pack");
  });
});
