import { describe, expect, it } from "vitest";
import { assessShortcutInventory } from "./inventory.js";
import { buildDestinationMapping } from "./destination-mapping.js";

describe("Vendor shortcut inventory (WO-46)", () => {
  it("marks inventory ready with required systems and healthy feeds", () => {
    const result = assessShortcutInventory([
      { systemId: "idp", systemType: "identity", recordCount: 1000, exportable: true, dataFreshnessHours: 12, dailyChangeRatePct: 4 },
      { systemId: "crm", systemType: "crm", recordCount: 4000, exportable: true, dataFreshnessHours: 6, dailyChangeRatePct: 6 },
      { systemId: "billing", systemType: "billing", recordCount: 2000, exportable: true, dataFreshnessHours: 8, dailyChangeRatePct: 7 },
    ]);
    expect(result.shortcutReady).toBe(true);
    expect(result.blockerReasons).toHaveLength(0);
  });

  it("blocks inventory when export coverage and freshness fail", () => {
    const result = assessShortcutInventory([
      { systemId: "crm", systemType: "crm", recordCount: 4000, exportable: false, dataFreshnessHours: 80, dailyChangeRatePct: 15 },
      { systemId: "billing", systemType: "billing", recordCount: 3000, exportable: false, dataFreshnessHours: 55, dailyChangeRatePct: 18 },
    ]);
    expect(result.shortcutReady).toBe(false);
    expect(result.blockerReasons.join("|")).toContain("missing_required_systems");
    expect(result.blockerReasons.join("|")).toContain("low_exportable_coverage");
  });
});

describe("Destination mapping (WO-47)", () => {
  it("maps sources to requested destination capabilities", () => {
    const mapping = buildDestinationMapping({
      entityId: "entity-1",
      targetCapabilities: ["identity_graph", "revenue_intelligence"],
      inventory: [
        { systemId: "idp", systemType: "identity", recordCount: 100, exportable: true, dataFreshnessHours: 2, dailyChangeRatePct: 1 },
        { systemId: "crm", systemType: "crm", recordCount: 1000, exportable: true, dataFreshnessHours: 4, dailyChangeRatePct: 2 },
      ],
    });
    expect(mapping.mappings.length).toBeGreaterThan(0);
    expect(mapping.readinessScore).toBeGreaterThan(30);
  });
});
