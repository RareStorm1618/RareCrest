import { describe, expect, it } from "vitest";
import { evaluateCapabilityCoverage } from "./registry.js";
import { buildAgencyMap } from "./agency-map.js";

describe("Capability registry (WO-48)", () => {
  it("reports full coverage when all capabilities meet threshold", () => {
    const result = evaluateCapabilityCoverage([
      { capabilityId: "identity-resolution", maturity: 3, staffed: true },
      { capabilityId: "workflow-automation", maturity: 3, staffed: true },
      { capabilityId: "regulatory-observability", maturity: 4, staffed: true },
      { capabilityId: "margin-analytics", maturity: 2, staffed: true },
    ]);
    expect(result.coveragePct).toBe(100);
    expect(result.gaps).toHaveLength(0);
  });

  it("returns gaps for missing capability evidence", () => {
    const result = evaluateCapabilityCoverage([
      { capabilityId: "identity-resolution", maturity: 1, staffed: false },
    ]);
    expect(result.coveragePct).toBeLessThan(40);
    expect(result.gaps.length).toBeGreaterThan(0);
  });
});

describe("Capability agency map (WO-49)", () => {
  it("computes agency risk from staffing and maturity", () => {
    const agencyMap = buildAgencyMap([
      { capabilityId: "identity-resolution", maturity: 3, staffed: true },
      { capabilityId: "workflow-automation", maturity: 1, staffed: false },
      { capabilityId: "regulatory-observability", maturity: 4, staffed: true },
      { capabilityId: "margin-analytics", maturity: 2, staffed: true },
    ]);
    expect(agencyMap.find((entry) => entry.agency === "operations")?.riskLevel).toBe("high");
    expect(agencyMap.find((entry) => entry.agency === "legal")?.riskLevel).toBe("low");
  });
});
