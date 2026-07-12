/** WO-38: CrossSkillWorkflowRunner */

import { z } from "zod";

export const WORKFLOW_IDS = [
  "mvis_standup",
  "edge_twin_spawn",
  "workforce_transition",
  "quiet_drift_postmortem",
  "token_maxxing_recovery",
  "mission_driven_adaptation",
] as const;

export type WorkflowId = (typeof WORKFLOW_IDS)[number];

export interface WorkflowStep {
  id: string;
  title: string;
  prompt: string;
}

export interface WorkflowDefinition {
  id: WorkflowId;
  title: string;
  steps: WorkflowStep[];
  outputSchema: string;
}

export const WORKFLOW_DEFINITIONS: Record<WorkflowId, WorkflowDefinition> = {
  mvis_standup: {
    id: "mvis_standup",
    title: "Minimal viable intelligence stack stand-up",
    outputSchema: "mvis_plan",
    steps: [
      { id: "s1", title: "Scope entity workload", prompt: "Define bounded workload for MVIS" },
      { id: "s2", title: "Data manifest", prompt: "List required data sources" },
      { id: "s3", title: "Kill switches", prompt: "Define kill switch criteria" },
    ],
  },
  edge_twin_spawn: {
    id: "edge_twin_spawn",
    title: "Edge-twin spawn",
    outputSchema: "edge_twin_spawn",
    steps: [
      { id: "s1", title: "Parallel-run scope", prompt: "Define shadow comparison scope" },
      { id: "s2", title: "Cutover criteria", prompt: "Define cutover gates" },
    ],
  },
  workforce_transition: {
    id: "workforce_transition",
    title: "Workforce transition",
    outputSchema: "workforce_transition",
    steps: [
      { id: "s1", title: "Role mapping", prompt: "Map human roles to agent tasks" },
      { id: "s2", title: "Transition budget", prompt: "Estimate transition capacity" },
    ],
  },
  quiet_drift_postmortem: {
    id: "quiet_drift_postmortem",
    title: "Quiet-drift postmortem",
    outputSchema: "drift_postmortem",
    steps: [
      { id: "s1", title: "Drift signals", prompt: "Catalog drift indicators" },
      { id: "s2", title: "Remediation", prompt: "Define remediation actions" },
    ],
  },
  token_maxxing_recovery: {
    id: "token_maxxing_recovery",
    title: "Token-maxxing recovery",
    outputSchema: "token_recovery",
    steps: [
      { id: "s1", title: "Theater audit", prompt: "Identify transformation theater" },
      { id: "s2", title: "L3 path", prompt: "Define path to L3 infrastructure" },
    ],
  },
  mission_driven_adaptation: {
    id: "mission_driven_adaptation",
    title: "Mission-driven adaptation",
    outputSchema: "mission_adaptation",
    steps: [
      { id: "s1", title: "Mission lock", prompt: "Confirm mission constraints" },
      { id: "s2", title: "Adaptation plan", prompt: "Define adaptation steps" },
    ],
  },
};

export const workflowArtifactSchema = z.object({
  workflowId: z.string(),
  entityId: z.string().uuid(),
  stepId: z.string(),
  output: z.record(z.unknown()),
  complete: z.boolean(),
});

export function getWorkflow(id: WorkflowId): WorkflowDefinition {
  return WORKFLOW_DEFINITIONS[id];
}

export function isStepUnlocked(completedSteps: string[], targetStepId: string, workflow: WorkflowDefinition): boolean {
  const idx = workflow.steps.findIndex((s) => s.id === targetStepId);
  if (idx <= 0) return true;
  for (let i = 0; i < idx; i++) {
    if (!completedSteps.includes(workflow.steps[i].id)) return false;
  }
  return true;
}

export function validateWorkflowArtifact(data: unknown): { valid: boolean; incomplete: boolean; errors: string[] } {
  const parsed = workflowArtifactSchema.safeParse(data);
  if (!parsed.success) {
    return { valid: false, incomplete: true, errors: parsed.error.errors.map((e) => e.message) };
  }
  const hasOutput = Object.keys(parsed.data.output).length > 0;
  return {
    valid: hasOutput && parsed.data.complete,
    incomplete: !parsed.data.complete || !hasOutput,
    errors: [],
  };
}
