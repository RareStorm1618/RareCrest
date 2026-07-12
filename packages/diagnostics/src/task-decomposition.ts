/** WO-33: TaskDecompositionMatrix — director-entered agent-readiness scoring */

export const TASK_CATEGORIES = ["judgment", "pattern", "coordination", "creation"] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export type DeploymentAction = "deploy_now" | "pilot" | "keep_human_led";

export interface TaskItem {
  id: string;
  title: string;
  category: TaskCategory;
  agentReadinessScore?: number;
}

export interface RoleItem {
  id: string;
  name: string;
  tasks: TaskItem[];
}

export interface TaskDecompositionMatrix {
  id: string;
  entityId: string;
  functionName: string;
  roles: RoleItem[];
  status: "draft" | "complete";
  completedAt?: string | null;
}

export interface ScoredTask extends TaskItem {
  deploymentAction: DeploymentAction | null;
}

export interface TaskDecompositionExport {
  matrixId: string;
  entityId: string;
  functionName: string;
  status: "draft" | "complete";
  exportedAt: string;
  roles: Array<{
    id: string;
    name: string;
    tasks: ScoredTask[];
  }>;
  summary: {
    totalTasks: number;
    scoredTasks: number;
    deployNow: number;
    pilot: number;
    keepHumanLed: number;
  };
}

/** AC-DIAG-010.3 */
export function validateAgentReadinessScore(score: number): boolean {
  return Number.isInteger(score) && score >= 1 && score <= 5;
}

/** AC-DIAG-010.2 */
export function validateTaskCategory(category: string): category is TaskCategory {
  return (TASK_CATEGORIES as readonly string[]).includes(category);
}

/** AC-DIAG-010.4 — director-entered score maps to deployment action (not ScoringEngine) */
export function mapScoreToDeploymentAction(score: number): DeploymentAction {
  if (!validateAgentReadinessScore(score)) {
    throw new Error(`Agent-readiness score must be 1-5, got ${score}`);
  }
  if (score >= 4) return "deploy_now";
  if (score === 3) return "pilot";
  return "keep_human_led";
}

export function enrichTaskWithAction(task: TaskItem): ScoredTask {
  if (task.agentReadinessScore === undefined) {
    return { ...task, deploymentAction: null };
  }
  return {
    ...task,
    deploymentAction: mapScoreToDeploymentAction(task.agentReadinessScore),
  };
}

export function scoreMatrixRoles(roles: RoleItem[]): Array<RoleItem & { tasks: ScoredTask[] }> {
  return roles.map((role) => ({
    ...role,
    tasks: role.tasks.map(enrichTaskWithAction),
  }));
}

/** AC-DIAG-010.5 */
export function exportTaskDecompositionMatrix(matrix: TaskDecompositionMatrix): TaskDecompositionExport {
  const roles = scoreMatrixRoles(matrix.roles);
  const allTasks = roles.flatMap((r) => r.tasks);
  const scored = allTasks.filter((t) => t.deploymentAction !== null);

  return {
    matrixId: matrix.id,
    entityId: matrix.entityId,
    functionName: matrix.functionName,
    status: matrix.status,
    exportedAt: new Date().toISOString(),
    roles,
    summary: {
      totalTasks: allTasks.length,
      scoredTasks: scored.length,
      deployNow: scored.filter((t) => t.deploymentAction === "deploy_now").length,
      pilot: scored.filter((t) => t.deploymentAction === "pilot").length,
      keepHumanLed: scored.filter((t) => t.deploymentAction === "keep_human_led").length,
    },
  };
}

export function validateMatrixForCompletion(matrix: TaskDecompositionMatrix): string[] {
  const errors: string[] = [];
  if (!matrix.functionName.trim()) errors.push("functionName is required");
  if (matrix.roles.length === 0) errors.push("At least one role is required");
  for (const role of matrix.roles) {
    if (!role.name.trim()) errors.push(`Role ${role.id} requires a name`);
    if (role.tasks.length === 0) errors.push(`Role ${role.name || role.id} requires at least one task`);
    for (const task of role.tasks) {
      if (!task.title.trim()) errors.push(`Task ${task.id} requires a title`);
      if (!validateTaskCategory(task.category)) {
        errors.push(`Task ${task.title || task.id} has invalid category`);
      }
      if (task.agentReadinessScore === undefined || !validateAgentReadinessScore(task.agentReadinessScore)) {
        errors.push(`Task ${task.title || task.id} requires agent-readiness score 1-5`);
      }
    }
  }
  return errors;
}
