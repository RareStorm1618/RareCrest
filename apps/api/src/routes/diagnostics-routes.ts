import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { DiagnosticsService, StepLockedError } from "../services/diagnostics.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";
import { ASSESSMENT_RUN_ORDER } from "@rarecrest/diagnostics";

const stepSchema = z.enum(ASSESSMENT_RUN_ORDER);

export function registerDiagnosticsRoutes(app: FastifyInstance, db: DatabaseClient) {
  const diagnostics = new DiagnosticsService(db);

  app.get("/api/v1/diagnostics/:entityId", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      const assessment = await diagnostics.getOrCreateAssessment(entityId, request.auth.vertical);
      const latestComplete = await diagnostics.getLatestComplete(entityId);
      return reply.send(diagnostics.buildWorkspaceState(assessment, latestComplete));
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.patch("/api/v1/diagnostics/:entityId/responses", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const schema = z.object({
      assessmentId: z.string().uuid(),
      patch: z.record(z.unknown()),
      currentStep: stepSchema.optional(),
    });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, entityId, request.auth);
      const assessment = await diagnostics.getOrCreateAssessment(entityId, request.auth.vertical);
      if (assessment.id !== body.assessmentId) {
        return reply.status(400).send({ message: "Assessment ID mismatch" });
      }
      const updated = await diagnostics.saveResponses(body.assessmentId, body.patch, body.currentStep);
      const latestComplete = await diagnostics.getLatestComplete(entityId);
      return reply.send(diagnostics.buildWorkspaceState(updated, latestComplete));
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/diagnostics/:entityId/steps/:step/complete", async (request, reply) => {
    const { entityId, step } = request.params as { entityId: string; step: string };
    const schema = z.object({
      assessmentId: z.string().uuid(),
      data: z.record(z.unknown()),
    });
    try {
      const body = schema.parse(request.body);
      const parsedStep = stepSchema.parse(step);
      await assertEntityAccess(db, entityId, request.auth);
      const assessment = await diagnostics.getOrCreateAssessment(entityId, request.auth.vertical);
      if (assessment.id !== body.assessmentId) {
        return reply.status(400).send({ message: "Assessment ID mismatch" });
      }
      const updated = await diagnostics.completeStep(body.assessmentId, parsedStep, {
        ...body.data,
        ...(parsedStep === "readiness_score" ? { readinessScores: body.data.scores } : {}),
      });
      const latestComplete = await diagnostics.getLatestComplete(entityId);
      return reply.send(diagnostics.buildWorkspaceState(updated, latestComplete));
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof StepLockedError) return reply.status(400).send({ message: err.message, field: "step", code: "STEP_LOCKED" });
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/diagnostics/:entityId/history", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      const history = await diagnostics.getHistory(entityId);
      return reply.send({
        history: history.map((h) => ({
          id: h.id,
          completedAt: h.completedAt,
          readinessTotal: h.readinessTotal,
          readinessBand: h.readinessBand,
          retakeDue: isRetakeDue(h.completedAt),
        })),
      });
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}

function isRetakeDue(completedAt: string | null): boolean {
  if (!completedAt) return false;
  return Date.now() - new Date(completedAt).getTime() > 183 * 24 * 60 * 60 * 1000;
}
