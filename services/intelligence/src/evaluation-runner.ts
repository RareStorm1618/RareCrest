/** WO-70: EvaluationRunner */

import { evaluateDrift } from "@rarecrest/runtime-control";

export interface EvaluationRunInput {
  agentId: string;
  entityId: string;
  accuracy: number;
  overrideRate: number;
  accuracyFloor: number;
  overrideCeiling: number;
}

export interface EvaluationRunResult {
  driftDetected: boolean;
  alert: string | null;
  offerRollbackOrRetrain: boolean;
}

export function runEvaluation(input: EvaluationRunInput): EvaluationRunResult {
  const driftDetected = evaluateDrift(
    input.accuracy,
    input.overrideRate,
    input.accuracyFloor,
    input.overrideCeiling,
  );
  return {
    driftDetected,
    alert: driftDetected
      ? `Drift detected for ${input.agentId}: accuracy=${input.accuracy}, overrideRate=${input.overrideRate}`
      : null,
    offerRollbackOrRetrain: driftDetected,
  };
}
