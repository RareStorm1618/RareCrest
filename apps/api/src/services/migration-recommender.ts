import type { DatabaseClient } from "@rarecrest/db";
import {
  buildMigrationRecommendation,
  type ImmuneSystemStrength,
  type ReadinessBand,
  evaluateDabblingTest,
  evaluateTokenMaxxing,
  type TokenAnswer,
} from "@rarecrest/diagnostics";
import type { AssessmentRecord } from "./diagnostics.js";

export interface MigrationRecommendRequest {
  immuneSystem: ImmuneSystemStrength;
  headcount: number;
  maturityLevel: number;
}

export class MigrationRecommenderService {
  constructor(private db: DatabaseClient) {}

  async recommend(entityId: string, request: MigrationRecommendRequest) {
    const assessment = await this.loadLatestAssessment(entityId);

    const readinessBand = (assessment?.readinessBand ?? "incomplete") as ReadinessBand;
    const responses = assessment?.responses ?? {};

    const dabbling = responses.dabbling as { leadershipShift: boolean; cadenceChanged: boolean } | undefined;
    const dabblingPass = dabbling
      ? evaluateDabblingTest(dabbling.leadershipShift, dabbling.cadenceChanged).pass
      : null;

    const tokenAnswers = responses.tokenMaxxing as [TokenAnswer, TokenAnswer, TokenAnswer] | undefined;
    const tokenMaxxingPass = tokenAnswers
      ? evaluateTokenMaxxing(tokenAnswers).pass
      : null;

    const deploymentLocked = assessment?.deploymentLocked ?? false;
    const migrationHalted = assessment?.migrationHalted ?? false;

    const recommendation = buildMigrationRecommendation({
      headcount: request.headcount,
      immuneSystem: request.immuneSystem,
      readinessBand,
      maturityLevel: request.maturityLevel,
      dabblingPass,
      tokenMaxxingPass,
      deploymentLocked,
      migrationHalted,
    });

    await this.persistRecommendation(entityId, assessment?.id ?? null, request, recommendation);

    return {
      entityId,
      assessmentId: assessment?.id ?? null,
      readinessBand,
      ...recommendation,
    };
  }

  private async loadLatestAssessment(entityId: string): Promise<AssessmentRecord | null> {
    const result = await this.db.query(
      `SELECT * FROM rarecrest.readiness_assessments
       WHERE entity_id = $1
       ORDER BY CASE WHEN status = 'in_progress' THEN 0 ELSE 1 END, updated_at DESC
       LIMIT 1`,
      [entityId],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id as string,
      entityId: row.entity_id as string,
      vertical: row.vertical,
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

  private async persistRecommendation(
    entityId: string,
    assessmentId: string | null,
    request: MigrationRecommendRequest,
    recommendation: ReturnType<typeof buildMigrationRecommendation>,
  ): Promise<void> {
    if (!assessmentId) return;
    await this.db.query(
      `UPDATE rarecrest.readiness_assessments
       SET responses = responses || $1::jsonb,
           maturity_level = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [
        JSON.stringify({
          migrationRecommend: { request, recommendation, generatedAt: new Date().toISOString() },
        }),
        request.maturityLevel,
        assessmentId,
      ],
    );
    await this.db.query(
      `UPDATE rarecrest.entities SET mode = $1, band = $2, updated_at = NOW() WHERE id = $3`,
      [
        recommendation.mode ?? "blocked",
        recommendation.blocked ? "locked" : "recommended",
        entityId,
      ],
    );
  }
}
