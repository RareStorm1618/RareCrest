import { describe, expect, it } from "vitest";
import { scoreVendorShortcut } from "./vendor-shortcut.js";

describe("vendor-shortcut scoring (WO-26)", () => {
  it("recommends vendor shortcut when systems are exportable and fresh", () => {
    const result = scoreVendorShortcut([
      { systemType: "ehr", exportable: true, freshnessHours: 2, integrationCoverage: 90 },
      { systemType: "billing", exportable: true, freshnessHours: 4, integrationCoverage: 85 },
    ]);
    expect(result.recommendedPath).toBe("vendor_shortcut");
    expect(result.readinessScore).toBeGreaterThanOrEqual(75);
  });

  it("recommends hybrid bridge for mixed-quality inventory", () => {
    const result = scoreVendorShortcut([
      { systemType: "crm", exportable: true, freshnessHours: 18, integrationCoverage: 60 },
      { systemType: "support", exportable: false, freshnessHours: 6, integrationCoverage: 55 },
    ]);
    expect(result.recommendedPath).toBe("hybrid_bridge");
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it("recommends greenfield when readiness is low", () => {
    const result = scoreVendorShortcut([
      { systemType: "identity", exportable: false, freshnessHours: 48, integrationCoverage: 20 },
    ]);
    expect(result.recommendedPath).toBe("greenfield_build");
    expect(result.readinessScore).toBeLessThan(45);
  });
});
