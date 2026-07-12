import type { ShortcutInventoryItem } from "./inventory.js";

export type DestinationCapability =
  | "identity_graph"
  | "revenue_intelligence"
  | "support_automation"
  | "compliance_observability";

export interface DestinationMappingInput {
  entityId: string;
  inventory: ShortcutInventoryItem[];
  targetCapabilities: DestinationCapability[];
}

export interface DestinationMappingResult {
  entityId: string;
  mappings: Array<{
    sourceSystemId: string;
    targetCapability: DestinationCapability;
    confidence: number;
    riskNote: string | null;
  }>;
  readinessScore: number;
}

const systemCapabilityMap: Record<ShortcutInventoryItem["systemType"], DestinationCapability[]> = {
  identity: ["identity_graph", "compliance_observability"],
  crm: ["identity_graph", "revenue_intelligence"],
  billing: ["revenue_intelligence", "compliance_observability"],
  support: ["support_automation", "compliance_observability"],
  knowledge_base: ["support_automation"],
  ehr: ["compliance_observability"],
};

export function buildDestinationMapping(input: DestinationMappingInput): DestinationMappingResult {
  const mappings: DestinationMappingResult["mappings"] = [];
  let scoreAccumulator = 0;

  for (const item of input.inventory) {
    const supported = systemCapabilityMap[item.systemType].filter((capability) =>
      input.targetCapabilities.includes(capability),
    );
    for (const targetCapability of supported) {
      const confidence = Math.max(
        0.2,
        Math.min(
          0.99,
          Number(
            (
              (item.exportable ? 0.55 : 0.25) +
              (item.dataFreshnessHours <= 24 ? 0.25 : 0.1) +
              Math.max(0, 0.2 - item.dailyChangeRatePct / 100)
            ).toFixed(2),
          ),
        ),
      );
      scoreAccumulator += confidence;
      mappings.push({
        sourceSystemId: item.systemId,
        targetCapability,
        confidence,
        riskNote: item.exportable ? null : "source_not_exportable",
      });
    }
  }

  const maxScore = Math.max(1, input.inventory.length * input.targetCapabilities.length);
  const readinessScore = Number(Math.min(100, (scoreAccumulator / maxScore) * 100).toFixed(1));

  return {
    entityId: input.entityId,
    mappings,
    readinessScore,
  };
}
