import { describe, expect, it } from "vitest";
import {
  WORKFLOW_IDS,
  getWorkflow,
  isStepUnlocked,
  validateWorkflowArtifact,
} from "./workflows.js";

describe("CrossSkillWorkflowRunner (WO-38)", () => {
  it("AC-SKILL-006.1: offers six supported workflows", () => {
    expect(WORKFLOW_IDS).toHaveLength(6);
    expect(WORKFLOW_IDS).toContain("mvis_standup");
    expect(WORKFLOW_IDS).toContain("token_maxxing_recovery");
  });

  it("AC-SKILL-006.2: enforces step order", () => {
    const wf = getWorkflow("mvis_standup");
    expect(isStepUnlocked([], "s1", wf)).toBe(true);
    expect(isStepUnlocked([], "s2", wf)).toBe(false);
    expect(isStepUnlocked(["s1"], "s2", wf)).toBe(true);
  });

  it("AC-SKILL-004.3: marks invalid artifacts incomplete", () => {
    const result = validateWorkflowArtifact({
      workflowId: "mvis_standup",
      entityId: "00000000-0000-4000-8000-000000000001",
      stepId: "s1",
      output: {},
      complete: true,
    });
    expect(result.incomplete).toBe(true);
  });
});
