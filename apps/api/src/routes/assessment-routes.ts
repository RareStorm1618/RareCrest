import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import { sequencerState } from "@rarecrest/diagnostics";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { DiagnosticsService } from "../services/diagnostics.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";

export function registerAssessmentRoutes(app: FastifyInstance, db: DatabaseClient) {
  const diagnostics = new DiagnosticsService(db);

  app.get("/api/v1/assessments/:entityId/sequencer", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
    const assessment = await diagnostics.getOrCreateAssessment(entityId, request.auth.vertical);
    const completed = (assessment.responses.completedSteps as string[] | undefined) ?? [];
    const history = await db.query(
      `SELECT id, status, completed_at AS "completedAt", created_at AS "createdAt"
       FROM rarecrest.readiness_assessments WHERE entity_id = $1 ORDER BY created_at DESC`,
      [entityId],
    );
    return reply.send({
      entityId,
      assessmentId: assessment.id,
      runOrder: sequencerState(completed as never),
      history: history.rows,
    });
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/assessments", async (request, reply) => {
    const schema = z.object({ entityId: z.string().uuid() });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, body.entityId, request.auth);
      const assessment = await diagnostics.getOrCreateAssessment(body.entityId, request.auth.vertical);
      return reply.status(201).send({ assessmentId: assessment.id, entityId: body.entityId, status: assessment.status });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}
