import { CAPABILITY_CATALOG, type CapabilityStatus } from "./registry.js";

export interface AgencyCoverage {
  agency: "operations" | "legal" | "finance" | "technology";
  totalCapabilities: number;
  staffedCapabilities: number;
  averageMaturity: number;
  riskLevel: "low" | "medium" | "high";
}

export function buildAgencyMap(statuses: CapabilityStatus[]): AgencyCoverage[] {
  const agencies: AgencyCoverage["agency"][] = ["operations", "legal", "finance", "technology"];
  return agencies.map((agency) => {
    const capabilities = CAPABILITY_CATALOG.filter((capability) => capability.ownerAgency === agency);
    const statusForAgency = statuses.filter((status) =>
      capabilities.some((capability) => capability.id === status.capabilityId),
    );
    const staffedCapabilities = statusForAgency.filter((status) => status.staffed).length;
    const averageMaturity = statusForAgency.length === 0
      ? 0
      : Number((statusForAgency.reduce((sum, status) => sum + status.maturity, 0) / statusForAgency.length).toFixed(2));
    const riskLevel: AgencyCoverage["riskLevel"] =
      staffedCapabilities === 0 || averageMaturity < 2 ? "high" : averageMaturity < 3 ? "medium" : "low";

    return {
      agency,
      totalCapabilities: capabilities.length,
      staffedCapabilities,
      averageMaturity,
      riskLevel,
    };
  });
}
