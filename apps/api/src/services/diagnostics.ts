import type { DatabaseClient } from "@rarecrest/db";
import {
  ASSESSMENT_RUN_ORDER,
  type AssessmentStep,
  computeGovernanceMaturity,
  computeReadinessBand,
  evaluateDabblingTest,
  evaluateMigrationGate,
  evaluateTokenMaxxing,
  isRetakeDue,
  isStepUnlocked,
  READINESS_DIMENSIONS,
  type TokenAnswer,
} from "@rarecrest/diagnostics";
import type { VerticalKey } from "@rarecrest/contracts";

export interface AssessmentRecord {
  id: string;
  entityId: string;
  vertical: VerticalKey;
  status: string;
  currentStep: string;
  responses: Record<string, unknown>;
  readinessTotal: number | null;
  readinessBand: string | null;
  maturityLevel: number | null;
  governanceMaturity: number | null;
  deploymentLocked: boolean;
  migrationHalted: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: Record<string, unknown>): AssessmentRecord {
  return {
    id: row.id as string,
    entityId: row.entity_id as string,
    vertical: row.vertical as VerticalKey,
    status: row.status as string,
    currentStep: row.current_step as string,
    responses: (row.responses as Record<string, unknown>) ?? {},
    readinessTotal: row.readiness_total as number | null,
    readinessBand: row.readiness_band as string | null,
    maturityLevel: row.maturity_level as number | null,
    governanceMaturity: row.governance_maturity as number | null,
    deploymentLocked: row.deployment_locked as boolean,
    migrationHalted: row.migration_halted as boolean,
    completedAt: row.completed_at as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export class DiagnosticsService {
  constructor(private db: DatabaseClient) {}

  async getOrCreateAssessment(entityId: string, vertical: VerticalKey): Promise<AssessmentRecord> {
    const existing = await this.db.query(
      `SELECT * FROM rarecrest.readiness_assessments
       WHERE entity_id = $1 AND status = 'in_progress'
       ORDER BY created_at DESC LIMIT 1`,
      [entityId],
    );
    if (existing.rows.length > 0) return mapRow(existing.rows[0]);

    const result = await this.db.query(
      `INSERT INTO rarecrest.readiness_assessments (entity_id, vertical, current_step)
       VALUES ($1, $2, 'readiness_score') RETURNING *`,
      [entityId, vertical],
    );
    return mapRow(result.rows[0]);
  }

  async getLatestComplete(entityId: string): Promise<AssessmentRecord | null> {
    const result = await this.db.query(
      `SELECT * FROM rarecrest.readiness_assessments
       WHERE entity_id = $1 AND status = 'complete'
       ORDER BY completed_at DESC LIMIT 1`,
      [entityId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async getHistory(entityId: string): Promise<AssessmentRecord[]> {
    const result = await this.db.query(
      `SELECT * FROM rarecrest.readiness_assessments
       WHERE entity_id = $1 ORDER BY created_at DESC`,
      [entityId],
    );
    return result.rows.map(mapRow);
  }

  async saveResponses(
    assessmentId: string,
    patch: Record<string, unknown>,
    currentStep?: AssessmentStep,
  ): Promise<AssessmentRecord> {
    const current = await this.db.query(`SELECT * FROM rarecrest.readiness_assessments WHERE id = $1`, [assessmentId]);
    if (current.rows.length === 0) throw new Error("Assessment not found");
    const row = current.rows[0];
    const merged = { ...(row.responses as Record<string, unknown>), ...patch };

    const result = await this.db.query(
      `UPDATE rarecrest.readiness_assessments
       SET responses = $1, current_step = COALESCE($2, current_step), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [JSON.stringify(merged), currentStep ?? null, assessmentId],
    );
    return mapRow(result.rows[0]);
  }

  buildWorkspaceState(assessment: AssessmentRecord, latestComplete: AssessmentRecord | null) {
    const responses = assessment.responses;
    const completedSteps = (responses.completedSteps as AssessmentStep[]) ?? [];
    const readinessScores = (responses.readinessScores as Record<string, number>) ?? {};
    const band = computeReadinessBand(readinessScores);

    const steps = ASSESSMENT_RUN_ORDER.map((step) => ({
      id: step,
      unlocked: isStepUnlocked(completedSteps, step),
      complete: completedSteps.includes(step),
    }));

    let deploymentLock = assessment.deploymentLocked;
    let governanceDetail: ReturnType<typeof computeGovernanceMaturity> | null = null;
    if (responses.governancePillars) {
      governanceDetail = computeGovernanceMaturity(responses.governancePillars as Record<string, number>);
      deploymentLock = governanceDetail.deploymentLocked;
    }

    return {
      assessment,
      latestComplete,
      retakeDue: latestComplete ? isRetakeDue(latestComplete.completedAt) : false,
      runOrder: steps,
      dimensions: READINESS_DIMENSIONS,
      readiness: {
        scores: readinessScores,
        band: band.band === "incomplete" ? null : band,
        incomplete: band.band === "incomplete",
      },
      dabbling: responses.dabbling
        ? evaluateDabblingTest(
            (responses.dabbling as { leadershipShift: boolean }).leadershipShift,
            (responses.dabbling as { cadenceChanged: boolean }).cadenceChanged,
          )
        : null,
      tokenMaxxing: responses.tokenMaxxing
        ? evaluateTokenMaxxing(responses.tokenMaxxing as [TokenAnswer, TokenAnswer, TokenAnswer])
        : null,
      governance: governanceDetail,
      deploymentLock,
      migrationHalt: responses.migrationGate
        ? evaluateMigrationGate(responses.migrationGate as Record<string, "green" | "yellow" | "red">)
        : null,
      maturityLevel: assessment.maturityLevel,
    };
  }

  async completeStep(assessmentId: string, step: AssessmentStep, stepData: Record<string, unknown>) {
    const assessment = await this.saveResponses(assessmentId, stepData);
    const responses = { ...assessment.responses, ...stepData };
    const completedSteps = [...((responses.completedSteps as AssessmentStep[]) ?? [])];
    if (!completedSteps.includes(step)) completedSteps.push(step);

    const readinessScores = (responses.readinessScores as Record<string, number>) ?? {};
    const band = computeReadinessBand(readinessScores);
    let governanceMaturity: number | null = null;
    let deploymentLocked = false;
    let migrationHalted = false;

    if (responses.governancePillars) {
      const gov = computeGovernanceMaturity(responses.governancePillars as Record<string, number>);
      governanceMaturity = gov.maturity;
      deploymentLocked = gov.deploymentLocked;
    }
    if (responses.migrationGate) {
      migrationHalted = evaluateMigrationGate(
        responses.migrationGate as Record<string, "green" | "yellow" | "red">,
      ).halted;
    }

    const allDone = ASSESSMENT_RUN_ORDER.every((s) => completedSteps.includes(s));
    const nextStep = ASSESSMENT_RUN_ORDER.find((s) => !completedSteps.includes(s));

    const result = await this.db.query(
      `UPDATE rarecrest.readiness_assessments SET
         responses = $1,
         current_step = $2,
         readiness_total = $3,
         readiness_band = $4,
         governance_maturity = $5,
         deployment_locked = $6,
         migration_halted = $7,
         status = $8,
         completed_at = CASE WHEN $8 = 'complete' THEN NOW() ELSE completed_at END,
         updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [
        JSON.stringify({ ...responses, completedSteps }),
        nextStep ?? step,
        band.total || null,
        band.band === "incomplete" ? null : band.band,
        governanceMaturity,
        deploymentLocked,
        migrationHalted,
        allDone ? "complete" : "in_progress",
        assessmentId,
      ],
    );
    return mapRow(result.rows[0]);
  }
}
