import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import type { GovernanceClient } from "@rarecrest/governance-client";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import { enforceTenancy } from "../auth.js";
import { z } from "zod";
import { formatZodErrors, verticalSchema } from "../validation.js";

const entitySchema = z.object({
  name: z.string().min(1),
  vertical: verticalSchema,
  tenancyKey: z.string().min(1),
  mode: z.string().default("assessment"),
  band: z.string().default("unknown"),
});

export function registerPhaseRoutes(
  app: FastifyInstance,
  db: DatabaseClient,
  governance: GovernanceClient,
  intelligence: IntelligenceClient,
) {
  // WO-22: GovernanceGateway
  app.post("/api/v1/governance/gateway", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const verdict = await governance.checkHardRules(body as never);
    await intelligence.appendTrace({
      vertical: request.auth.vertical,
      action: "governance_gateway",
      verdict: verdict.allowed ? "allow" : "deny",
      payload: { traceId: verdict.traceId },
    });
    return reply.send(verdict);
  });

  // WO-23: EntityRegistry
  app.get("/api/v1/entities/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    enforceTenancy(request.auth, request.auth.vertical);
    const result = await db.query(
      `SELECT id, name, vertical, tenancy_key AS "tenancyKey", mode, band,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM rarecrest.entities WHERE id = $1 AND vertical = $2 AND deleted_at IS NULL`,
      [id, request.auth.vertical],
    );
    if (result.rows.length === 0) return reply.status(404).send({ message: "Entity not found" });
    return reply.send(result.rows[0]);
  });

  app.delete("/api/v1/entities/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await db.query(
      `UPDATE rarecrest.entities SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND vertical = $2 AND deleted_at IS NULL`,
      [id, request.auth.vertical],
    );
    return reply.status(204).send();
  });

  // WO-24: PortfolioRollupService — see portfolio-routes.ts (canonical)

  // WO-25: AssessmentSequencer
  app.post("/api/v1/assessments", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      sequence: z.array(z.string()),
      status: z.enum(["pending", "in_progress", "complete"]).default("pending"),
    });
    try {
      const body = schema.parse(request.body);
      const result = await db.query(
        `INSERT INTO rarecrest.structured_documents (entity_id, vertical, doc_type, narrative, schema_payload)
         VALUES ($1, $2, 'readiness_assessment', '', $3)
         RETURNING id, entity_id AS "entityId", schema_payload AS "schemaPayload"`,
        [body.entityId, request.auth.vertical, JSON.stringify(body)],
      );
      return reply.status(201).send(result.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  // WO-27: ExportController
  app.post("/api/v1/exports/oversight-pack", async (request, reply) => {
    const schema = z.object({ entityId: z.string().uuid(), format: z.enum(["pdf", "markdown"]).default("markdown") });
    const body = schema.parse(request.body);
    const traces = await intelligence.appendTrace({
      entityId: body.entityId,
      vertical: request.auth.vertical,
      action: "export_oversight_pack",
      verdict: "allow",
      payload: { format: body.format },
    });
    return reply.send({
      packId: traces.id,
      format: body.format,
      downloadUrl: `/api/v1/exports/${traces.id}/download`,
      generatedAt: new Date().toISOString(),
    });
  });

  // WO-28: SkillCompanion proxy
  app.post("/api/v1/skill-companion", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      question: z.string().min(1),
      context: z.array(z.string()).optional(),
    });
    const body = schema.parse(request.body);
    const result = await intelligence.skillCompanionComplete({
      entityId: body.entityId,
      vertical: request.auth.vertical,
      question: body.question,
      context: body.context,
    });
    return reply.send(result);
  });

  // WO-29: SpecValidationService
  app.post("/api/v1/specs/validate", async (request, reply) => {
    const schema = z.object({
      docType: z.string(),
      schemaPayload: z.record(z.unknown()),
      requestedRights: z.array(z.string()).optional(),
    });
    const body = schema.parse(request.body);
    const errors: Array<{ field: string; code: string; message: string }> = [];
    if (!body.schemaPayload.name) {
      errors.push({ field: "name", code: "REQUIRED", message: "Specification name is required" });
    }
    if (body.requestedRights && body.requestedRights.length > 2) {
      errors.push({ field: "requestedRights", code: "MAX_TWO_RIGHTS", message: "At most 2 rights allowed" });
    }
    return reply.send({ valid: errors.length === 0, errors, deployable: errors.length === 0 });
  });

  // WO-32: MigrationRecommender — see migration-routes.ts (canonical)

  // WO-33: TaskDecompositionMatrix — see task-decomposition-routes.ts (canonical)

  // WO-35: RegulatoryProfileService — see regulatory-profile-routes.ts (canonical)

  // WO-36: AttentionFlagService — see attention-flag-routes.ts (canonical)

  // WO-38: CrossSkillWorkflowRunner — see workflow-routes.ts (canonical)

  // WO-43: PermissionEnvelopeValidator — see agent-studio-routes.ts (canonical)

  // WO-51/52/53: Migration workspace — see migration-workspace-routes.ts (canonical)

  // WO-57: LegalMatterService — see legal-routes.ts (canonical)

  // WO-64/65/66: Command surface — see command-routes.ts (canonical)

  // WO-68: AgentRoster
  app.get("/api/v1/runtime/agents", async (_request, reply) => {
    return reply.send({ agents: [{ id: "kael", role: "chief-of-staff", status: "inactive" }] });
  });

  // WO-72: RollbackService + HumanReviewQueue
  app.post("/api/v1/runtime/rollback", async (request, reply) => {
    const schema = z.object({ deploymentId: z.string(), reason: z.string() });
    const body = schema.parse(request.body);
    return reply.send({ deploymentId: body.deploymentId, status: "queued_for_human_review", reason: body.reason });
  });
}
