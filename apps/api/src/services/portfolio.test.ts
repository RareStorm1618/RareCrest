import { describe, it, expect } from "vitest";
import { DEFAULT_REGIMES } from "./portfolio.js";

describe("DEFAULT_REGIMES", () => {
  it("assigns IRS regimes to nonprofit entities", () => {
    expect(DEFAULT_REGIMES.nonprofit).toContain("IRS-501c3");
  });

  it("assigns HIPAA-adjacent regimes are not on fund by default", () => {
    expect(DEFAULT_REGIMES.fund).toContain("SEC");
    expect(DEFAULT_REGIMES.fund).not.toContain("HIPAA");
  });

  it("holding entity gets cross-cutting regimes", () => {
    expect(DEFAULT_REGIMES.holding).toContain("NIST-AI-RMF");
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
