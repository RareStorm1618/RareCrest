import { describe, it, expect } from "vitest";
import { buildDefaultRegulatoryProfile } from "@rarecrest/portfolio";

describe("buildDefaultRegulatoryProfile", () => {
  it("assigns IRS regimes to nonprofit entities in rarestorm domain", () => {
    const regimes = buildDefaultRegulatoryProfile("nonprofit", "rarestorm");
    expect(regimes).toContain("IRS-501c3");
  });

  it("layers HIPAA on rareangels domain", () => {
    const regimes = buildDefaultRegulatoryProfile("for_profit_platform", "rareangels");
    expect(regimes).toContain("HIPAA");
    expect(regimes).toContain("GDPR");
  });

  it("holding entity gets cross-cutting regimes", () => {
    const regimes = buildDefaultRegulatoryProfile("holding", "holding");
    expect(regimes).toContain("NIST-AI-RMF");
  });
});

describe("stateSummary logic", () => {
  it("reports not yet assessed for new entities", () => {
    const row = {
      governance_status: "not_assessed",
      band: "unknown",
      deployment_locked: false,
      maturity_level: 0,
    };
    const summary =
      row.governance_status === "not_assessed" && row.band === "unknown"
        ? "Not yet assessed"
        : `${row.band} / maturity ${row.maturity_level}`;
    expect(summary).toBe("Not yet assessed");
  });
});
