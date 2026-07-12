export type CapabilityTier = "foundational" | "operational" | "strategic";

export interface CapabilityDefinition {
  id: string;
  name: string;
  tier: CapabilityTier;
  minimumMaturity: number;
  ownerAgency: "operations" | "legal" | "finance" | "technology";
}

export const CAPABILITY_CATALOG: CapabilityDefinition[] = [
  { id: "identity-resolution", name: "Identity Resolution", tier: "foundational", minimumMaturity: 2, ownerAgency: "technology" },
  { id: "workflow-automation", name: "Workflow Automation", tier: "operational", minimumMaturity: 3, ownerAgency: "operations" },
  { id: "regulatory-observability", name: "Regulatory Observability", tier: "strategic", minimumMaturity: 3, ownerAgency: "legal" },
  { id: "margin-analytics", name: "Margin Analytics", tier: "operational", minimumMaturity: 2, ownerAgency: "finance" },
];

export interface CapabilityStatus {
  capabilityId: string;
  maturity: number;
  staffed: boolean;
}

export interface CapabilityCoverageResult {
  covered: string[];
  gaps: Array<{ capabilityId: string; reason: string }>;
  coveragePct: number;
}

export function evaluateCapabilityCoverage(statuses: CapabilityStatus[]): CapabilityCoverageResult {
  const covered: string[] = [];
  const gaps: Array<{ capabilityId: string; reason: string }> = [];

  for (const capability of CAPABILITY_CATALOG) {
    const state = statuses.find((status) => status.capabilityId === capability.id);
    if (!state) {
      gaps.push({ capabilityId: capability.id, reason: "missing_status" });
      continue;
    }
    if (state.maturity < capability.minimumMaturity) {
      gaps.push({ capabilityId: capability.id, reason: "below_minimum_maturity" });
      continue;
    }
    if (!state.staffed) {
      gaps.push({ capabilityId: capability.id, reason: "unstaffed" });
      continue;
    }
    covered.push(capability.id);
  }

  return {
    covered,
    gaps,
    coveragePct: Number(((covered.length / CAPABILITY_CATALOG.length) * 100).toFixed(2)),
  };
}
