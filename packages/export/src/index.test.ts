import { describe, expect, it } from "vitest";
import {
  assembleAssessmentSummary,
  assembleOversightPack,
  assemblePortfolioOversightPack,
  renderExportBody,
  renderMarkdown,
} from "./index.js";

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

  it("assembles one-page assessment summary", () => {
    const summary = assembleAssessmentSummary({
      entityId: "e1",
      entityName: "RareAngels",
      readinessTotal: 48,
      readinessBand: "foundational",
      maturityLevel: 3,
      governanceMaturity: 4,
      completedAt: "2026-07-01T00:00:00.000Z",
    });
    expect(summary.sections).toHaveLength(4);
    expect(renderMarkdown(summary)).toContain("Assessment Summary");
  });

  it("assembles portfolio oversight pack", () => {
    const pack = assemblePortfolioOversightPack(
      {
        vertical: "rareangels",
        entities: [{ entityId: "e1", entityName: "A", readinessBand: "foundational", governanceStatus: "clear", openFlagCount: 0 }],
        portfolioAttentionFlags: [],
      },
      "markdown",
    );
    expect(pack.scope).toBe("portfolio");
    expect(renderMarkdown(pack)).toContain("portfolio");
  });

  it("renders PDF export body", () => {
    const pack = assembleOversightPack({
      entityId: "e1",
      entityName: "Test",
      governancePillars: {},
      killSwitchLastTest: null,
      openRedGates: [],
      hardRuleExceptions: [],
      attentionFlags: [],
    }, "pdf");
    const out = renderExportBody(pack, renderMarkdown(pack));
    expect(out.mime).toBe("application/pdf");
    expect(out.body.subarray(0, 8).toString()).toBe("%PDF-1.4");
  });
});
