import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import {
  REWRITE_STEPS,
  buildEdgeTwinPlan,
  evaluateDeprecationGate,
  isStepComplete,
  validateStepSequence,
  type RewriteStepId,
} from "@rarecrest/migration-workspace";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";

export function registerMigrationWorkspaceRoutes(app: FastifyInstance, db: DatabaseClient) {
  app.get("/api/v1/migration/:entityId/rewrite-steps", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const result = await db.query(
      `SELECT steps FROM rarecrest.rewrite_step_progress WHERE entity_id = $1`,
      [entityId],
    );
    const steps = result.rows[0]?.steps ?? [];
    return reply.send({ entityId, stepDefinitions: REWRITE_STEPS, progress: steps });
  });

  app.post("/api/v1/migration/rewrite-steps", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      stepId: z.string(),
      criteriaMet: z.record(z.boolean()),
    });
    try {
      const body = schema.parse(request.body);
      const stepId = body.stepId as RewriteStepId;
      const existing = await db.query(`SELECT steps FROM rarecrest.rewrite_step_progress WHERE entity_id = $1`, [body.entityId]);
      const progress = (existing.rows[0]?.steps as Array<{ stepId: string; criteriaMet: Record<string, boolean>; complete: boolean }>) ?? [];
      const seqError = validateStepSequence(progress, stepId);
      if (seqError) return reply.status(400).send({ message: seqError });
      const complete = isStepComplete(stepId, body.criteriaMet);
      const updated = [...progress.filter((p) => p.stepId !== stepId), { stepId, criteriaMet: body.criteriaMet, complete }];
      await db.query(
        `INSERT INTO rarecrest.rewrite_step_progress (entity_id, steps) VALUES ($1, $2::jsonb)
         ON CONFLICT (entity_id) DO UPDATE SET steps = $2::jsonb, updated_at = NOW()`,
        [body.entityId, JSON.stringify(updated)],
      );
      return reply.send({ entityId: body.entityId, stepId, complete, warning: seqError, trackedAt: new Date().toISOString() });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  app.post("/api/v1/migration/edge-twin", async (request, reply) => {
    const schema = z.object({ entityId: z.string().uuid(), parallelRunWeeks: z.number().min(1) });
    const body = schema.parse(request.body);
    const plan = buildEdgeTwinPlan(body.entityId, body.parallelRunWeeks);
    await db.query(`INSERT INTO rarecrest.edge_twin_plans (entity_id, plan) VALUES ($1, $2::jsonb)`, [body.entityId, JSON.stringify(plan)]);
    return reply.send({ entityId: body.entityId, plan });
  });

  app.get("/api/v1/migration/override-trends/:entityId", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const result = await db.query(
      `SELECT id, entity_id AS "entityId", agent_id AS "agentId", reason, created_at AS "createdAt"
       FROM rarecrest.override_events WHERE entity_id = $1 ORDER BY created_at DESC`,
      [entityId],
    );
    const evaluation = evaluateDeprecationGate(result.rows as never);
    return reply.send({ entityId, overrides: result.rows, ...evaluation });
  });

  app.post("/api/v1/migration/override-trends/:entityId", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const schema = z.object({ agentId: z.string(), reason: z.string().min(1) });
    const body = schema.parse(request.body);
    await db.query(
      `INSERT INTO rarecrest.override_events (entity_id, agent_id, reason) VALUES ($1, $2, $3)`,
      [entityId, body.agentId, body.reason],
    );
    return reply.status(201).send({ recorded: true });
  });
}
