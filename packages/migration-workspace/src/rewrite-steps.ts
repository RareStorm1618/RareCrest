/** WO-51: RewriteStepTracker */

export const REWRITE_STEPS = [
  { id: "backcast_define", title: "Backcast and define", criteria: ["written_mandate", "director_sign_off", "target_architecture"] },
  { id: "assess_prepare", title: "Assess and prepare", criteria: ["readiness_complete", "data_inventory"] },
  { id: "extract", title: "Extract", criteria: ["workflows_documented", "data_manifest"] },
  { id: "diagnose_strip", title: "Diagnose and strip", criteria: ["drag_removed", "theater_stripped"] },
  { id: "build_prove", title: "Build and prove", criteria: ["mvis_live", "kill_switch_tested"] },
  { id: "rewire_evolve", title: "Rewire and evolve", criteria: ["cutover_complete", "compounding_loop"] },
] as const;

export type RewriteStepId = (typeof REWRITE_STEPS)[number]["id"];

export interface StepProgress {
  stepId: RewriteStepId;
  criteriaMet: Record<string, boolean>;
  complete: boolean;
}

export function validateStepSequence(progress: StepProgress[], targetStepId: RewriteStepId): string | null {
  const targetIdx = REWRITE_STEPS.findIndex((s) => s.id === targetStepId);
  for (let i = 0; i < targetIdx; i++) {
    const prior = progress.find((p) => p.stepId === REWRITE_STEPS[i].id);
    if (!prior?.complete) {
      return `Cannot complete ${targetStepId} — prior step ${REWRITE_STEPS[i].id} is incomplete`;
    }
  }
  return null;
}

export function isStepComplete(stepId: RewriteStepId, criteriaMet: Record<string, boolean>): boolean {
  const def = REWRITE_STEPS.find((s) => s.id === stepId);
  if (!def) return false;
  return def.criteria.every((c) => criteriaMet[c] === true);
}

export function requiresMandateSignOff(stepId: RewriteStepId): boolean {
  return stepId === "backcast_define";
}
