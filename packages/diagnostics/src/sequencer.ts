/** WO-25: AssessmentSequencer — mandatory run order and unlock rules */

export const ASSESSMENT_RUN_ORDER = [
  "readiness_score",
  "score_interpretation",
  "maturity_ladder",
  "dabbling_test",
  "workforce_capacity",
  "token_maxxing",
  "governance_pillars",
  "migration_gate",
] as const;

export type AssessmentStep = (typeof ASSESSMENT_RUN_ORDER)[number];

export function stepIndex(step: AssessmentStep): number {
  return ASSESSMENT_RUN_ORDER.indexOf(step);
}

export function isStepUnlocked(completedSteps: AssessmentStep[], target: AssessmentStep): boolean {
  const targetIdx = stepIndex(target);
  if (targetIdx <= 0) return true;
  for (let i = 0; i < targetIdx; i++) {
    if (!completedSteps.includes(ASSESSMENT_RUN_ORDER[i])) return false;
  }
  return true;
}

export function isRetakeDue(completedAt: string | null): boolean {
  if (!completedAt) return false;
  const sixMonthsMs = 183 * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(completedAt).getTime() > sixMonthsMs;
}

export function sequencerState(completedSteps: AssessmentStep[]) {
  return ASSESSMENT_RUN_ORDER.map((step: AssessmentStep) => ({
    id: step,
    unlocked: isStepUnlocked(completedSteps, step),
    complete: completedSteps.includes(step),
  }));
}

export function canStartRetake(latestCompleteAt: string | null): boolean {
  if (!latestCompleteAt) return true;
  const sixMonthsMs = 183 * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(latestCompleteAt).getTime() > sixMonthsMs;
}
