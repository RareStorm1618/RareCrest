import { describe, expect, it } from "vitest";
import { buildAgentBlueprint, buildIntelligenceStackPlan } from "./intelligence-stack.js";

describe("intelligence-stack (WO-41/42)", () => {
  it("marks stack non-deployable when governance layer is missing", () => {
    const stack = buildIntelligenceStackPlan({
      entityId: "entity-2",
      selectedLayers: ["signals", "models", "workflows"],
      humanReviewRequired: true,
    });
    expect(stack.deployable).toBe(false);
    expect(stack.missingLayers).toContain("governance");
  });

  it("builds ready blueprint only when fully deployable", () => {
    const blueprint = buildAgentBlueprint({
      entityId: "entity-2",
      selectedLayers: ["signals", "models", "workflows", "governance"],
      humanReviewRequired: true,
    });
    expect(blueprint.blueprintStatus).toBe("ready");
  });
});
