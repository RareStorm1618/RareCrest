/** WO-70: EvaluationRunner */

import type { DatabaseClient } from "@rarecrest/db";
import { defaultSlaTargetHours, evaluateDrift } from "@rarecrest/runtime-control";

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
  runId?: string;
  humanReviewId?: string;
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

export async function persistEvaluationRun(
  db: DatabaseClient,
  input: EvaluationRunInput,
  result: EvaluationRunResult,
): Promise<EvaluationRunResult> {
  const ins = await db.query(
    `INSERT INTO rarecrest.evaluation_runs (agent_id, entity_id, accuracy, override_rate, drift_detected)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [input.agentId, input.entityId, input.accuracy, input.overrideRate, result.driftDetected],
  );
  const runId = ins.rows[0].id as string;
  let humanReviewId: string | undefined;
  if (result.driftDetected && result.alert) {
    const hours = defaultSlaTargetHours("hard_rule_adjacent");
    const sla = new Date(Date.now() + hours * 3600000).toISOString();
    const hr = await db.query(
      `INSERT INTO rarecrest.human_review_queue (entity_id, agent_id, category, decision_needed, sla_target_at, held_action)
       VALUES ($1, $2, 'hard_rule_adjacent', $3, $4, '{}'::jsonb) RETURNING id`,
      [input.entityId, input.agentId, result.alert, sla],
    );
    humanReviewId = hr.rows[0].id as string;
  }
  return { ...result, runId, humanReviewId };
}
