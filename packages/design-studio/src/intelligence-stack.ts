export type IntelligenceLayer = "signals" | "models" | "workflows" | "governance";

export interface IntelligenceStackInput {
  entityId: string;
  selectedLayers: IntelligenceLayer[];
  humanReviewRequired: boolean;
}

export interface IntelligenceStackPlan {
  entityId: string;
  selectedLayers: IntelligenceLayer[];
  missingLayers: IntelligenceLayer[];
  deployable: boolean;
}

const LAYERS: IntelligenceLayer[] = ["signals", "models", "workflows", "governance"];

export function buildIntelligenceStackPlan(input: IntelligenceStackInput): IntelligenceStackPlan {
  const selectedLayers = [...new Set(input.selectedLayers)];
  const missingLayers = LAYERS.filter((layer) => !selectedLayers.includes(layer));
  const deployable = missingLayers.length === 0 && input.humanReviewRequired;

  return {
    entityId: input.entityId,
    selectedLayers,
    missingLayers,
    deployable,
  };
}

export function buildAgentBlueprint(input: IntelligenceStackInput): {
  blueprintStatus: "draft" | "ready";
  stack: IntelligenceStackPlan;
} {
  const stack = buildIntelligenceStackPlan(input);
  return {
    blueprintStatus: stack.deployable ? "ready" : "draft",
    stack,
  };
}
