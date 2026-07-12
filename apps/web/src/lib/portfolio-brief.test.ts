import { describe, expect, it } from "vitest";
import { buildPortfolioBrief, suggestedPrompts } from "./portfolio-brief.js";
import type { PortfolioRollup } from "@rarecrest/contracts";

const rollup: PortfolioRollup = {
  entities: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      name: "RareAngels Ops",
      vertical: "rareangels",
      entityType: "nonprofit",
      isHoldingEntity: false,
      mode: "assessment",
      band: "red",
      regulatoryRegimes: ["HIPAA"],
      regulatoryProfileIncomplete: false,
      governanceStatus: "hard_rule_exception",
      deploymentLocked: true,
      maturityLevel: 1,
      attentionFlagCount: 3,
      clearForAgentDeployment: false,
      stateSummary: "Locked — hard_rule_exception",
    },
  ],
  summary: {
    byBand: { red: 1 },
    byGovernanceStatus: { hard_rule_exception: 1 },
    totalEntities: 1,
    attentionFlagCount: 3,
    portfolioClear: false,
  },
  generatedAt: "2026-07-12T00:00:00.000Z",
};

describe("portfolio brief intelligence", () => {
  it("surfaces critical director signals from roll-up", () => {
    const brief = buildPortfolioBrief(rollup);
    expect(brief.headline).toMatch(/critical/i);
    expect(brief.signals.some((s) => s.severity === "critical")).toBe(true);
    expect(brief.schema.authority).toBe("none");
  });

  it("suggests deployment-aware companion prompts", () => {
    const prompts = suggestedPrompts({
      entityName: "RareAngels Ops",
      clearForAgentDeployment: false,
      attentionFlagCount: 3,
      band: "red",
    });
    expect(prompts[0]).toMatch(/blocked|hard-rule|attention/i);
  });
});
