import { describe, expect, it } from "vitest";
import {
  TASK_CATEGORIES,
  exportTaskDecompositionMatrix,
  mapScoreToDeploymentAction,
  validateAgentReadinessScore,
  validateMatrixForCompletion,
  validateTaskCategory,
} from "./task-decomposition.js";

describe("TaskDecompositionMatrix (WO-33)", () => {
  it("AC-DIAG-010.2: offers judgment, pattern, coordination, creation categories", () => {
    expect(TASK_CATEGORIES).toEqual(["judgment", "pattern", "coordination", "creation"]);
    for (const cat of TASK_CATEGORIES) {
      expect(validateTaskCategory(cat)).toBe(true);
    }
    expect(validateTaskCategory("automation")).toBe(false);
  });

  it("AC-DIAG-010.3: accepts director-entered scores 1-5 only", () => {
    expect(validateAgentReadinessScore(1)).toBe(true);
    expect(validateAgentReadinessScore(5)).toBe(true);
    expect(validateAgentReadinessScore(0)).toBe(false);
    expect(validateAgentReadinessScore(6)).toBe(false);
    expect(validateAgentReadinessScore(2.5)).toBe(false);
  });

  it("AC-DIAG-010.4: maps scores to deploy now / pilot / keep human-led", () => {
    expect(mapScoreToDeploymentAction(5)).toBe("deploy_now");
    expect(mapScoreToDeploymentAction(4)).toBe("deploy_now");
    expect(mapScoreToDeploymentAction(3)).toBe("pilot");
    expect(mapScoreToDeploymentAction(2)).toBe("keep_human_led");
    expect(mapScoreToDeploymentAction(1)).toBe("keep_human_led");
  });

  it("AC-DIAG-010.5: exports completed matrix with deployment actions and summary", () => {
    const matrix = {
      id: "m1",
      entityId: "e1",
      functionName: "Accounts Payable",
      status: "complete" as const,
      roles: [
        {
          id: "r1",
          name: "AP Clerk",
          tasks: [
            { id: "t1", title: "Match invoices", category: "pattern" as const, agentReadinessScore: 5 },
            { id: "t2", title: "Approve exceptions", category: "judgment" as const, agentReadinessScore: 2 },
            { id: "t3", title: "Vendor outreach", category: "coordination" as const, agentReadinessScore: 3 },
          ],
        },
      ],
    };
    const exported = exportTaskDecompositionMatrix(matrix);
    expect(exported.functionName).toBe("Accounts Payable");
    expect(exported.roles[0].tasks[0].deploymentAction).toBe("deploy_now");
    expect(exported.roles[0].tasks[1].deploymentAction).toBe("keep_human_led");
    expect(exported.roles[0].tasks[2].deploymentAction).toBe("pilot");
    expect(exported.summary).toEqual({
      totalTasks: 3,
      scoredTasks: 3,
      deployNow: 1,
      pilot: 1,
      keepHumanLed: 1,
    });
  });

  it("validateMatrixForCompletion requires all tasks scored before complete", () => {
    const incomplete = {
      id: "m1",
      entityId: "e1",
      functionName: "CX",
      status: "draft" as const,
      roles: [{ id: "r1", name: "Agent", tasks: [{ id: "t1", title: "Triage", category: "pattern" as const }] }],
    };
    const errors = validateMatrixForCompletion(incomplete);
    expect(errors.some((e) => e.includes("agent-readiness"))).toBe(true);
  });
});
