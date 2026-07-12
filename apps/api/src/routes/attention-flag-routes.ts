import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import { ATTENTION_SIGNAL_TYPES, RELATIONSHIP_TYPES } from "@rarecrest/portfolio";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { AttentionFlagService } from "../services/attention-flag.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";

const signalSchema = z.enum(ATTENTION_SIGNAL_TYPES);
const relationshipTypeSchema = z.enum(RELATIONSHIP_TYPES);

export function registerAttentionFlagRoutes(app: FastifyInstance, db: DatabaseClient) {
  const service = new AttentionFlagService(db);

  app.get("/api/v1/entities/:id/attention-flags", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await assertEntityAccess(db, id, request.auth);
      const state = await service.getEntityAttentionState(id);
      return reply.send(state);
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/entities/:id/attention-flags", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      signalType: signalSchema,
      message: z.string().min(1),
      severity: z.enum(["low", "medium", "high", "critical"]).optional(),
      linkPath: z.string().optional(),
      sourceRef: z.string().optional(),
      agentId: z.string().min(1).optional(),
    });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, id, request.auth);
      const item = await service.raiseFlag(id, body);
      return reply.status(201).send(item);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/entities/:id/attention-flags/:flagId/resolve", async (request, reply) => {
    const { id, flagId } = request.params as { id: string; flagId: string };
    try {
      await assertEntityAccess(db, id, request.auth);
      const resolved = await service.resolveFlag(flagId, id);
      if (!resolved) return reply.status(404).send({ message: "Flag not found" });
      return reply.send({ resolved: true, flagId });
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/entities/:id/open-decisions", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({ title: z.string().min(1), description: z.string().optional() });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, id, request.auth);
      const decision = await service.recordOpenDecision(id, body);
      return reply.status(201).send(decision);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/entities/:id/open-decisions/:decisionId/resolve", async (request, reply) => {
    const { id, decisionId } = request.params as { id: string; decisionId: string };
    const schema = z.object({ resolutionNote: z.string().min(1) });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, id, request.auth);
      const decision = await service.resolveOpenDecision(id, decisionId, body.resolutionNote);
      if (!decision) return reply.status(404).send({ message: "Open decision not found" });
      return reply.send(decision);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/entities/:id/conflicts", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({ summary: z.string().min(1) });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, id, request.auth);
      const conflict = await service.recordConflict(id, body);
      return reply.status(201).send(conflict);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/entities/:id/unverified-claims", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      claimType: z.string().min(1),
      claimText: z.string().min(1),
      detectedBy: z.string().optional(),
    });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, id, request.auth);
      const claim = await service.consumeUnverifiedClaim(id, body);
      return reply.status(201).send(claim);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/entities/relationships", async (request, reply) => {
    const schema = z.object({
      fromEntityId: z.string().uuid(),
      toEntityId: z.string().uuid(),
      relationshipType: relationshipTypeSchema,
      direction: z.enum(["directed", "bidirectional"]).optional(),
      constraintNote: z.string().optional(),
    });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, body.fromEntityId, request.auth);
      await assertEntityAccess(db, body.toEntityId, request.auth);
      const rel = await service.addRelationship(body);
      return reply.status(201).send(rel);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      if (err instanceof Error) return reply.status(400).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/entities/:id/hard-rule-exception", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({ message: z.string().min(1), sourceRef: z.string().min(1) });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, id, request.auth);
      const item = await service.raiseHardRuleException(id, body.message, body.sourceRef);
      return reply.status(201).send(item);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}
