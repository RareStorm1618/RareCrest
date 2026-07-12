import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import type { GovernanceClient } from "@rarecrest/governance-client";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";
import { KillSwitchError, KillSwitchService } from "../services/kill-switch.js";

export function registerKillSwitchRoutes(
  app: FastifyInstance,
  db: DatabaseClient,
  governance: GovernanceClient,
) {
  const service = new KillSwitchService(db, governance);

  app.get("/api/v1/runtime/kill-switch/:entityId", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      return reply.send(await service.get(entityId));
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/runtime/kill-switch/:entityId/arm", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const schema = z.object({ reason: z.string().min(1) });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, entityId, request.auth);
      const row = await service.arm({
        entityId,
        actorId: request.auth.userId,
        reason: body.reason,
      });
      return reply.status(201).send(row);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      if (err instanceof KillSwitchError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/runtime/kill-switch/:entityId/trigger", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const schema = z.object({ reason: z.string().min(1) });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, entityId, request.auth);
      const result = await service.trigger({
        entityId,
        actorId: request.auth.userId,
        reason: body.reason,
      });
      return reply.send(result);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      if (err instanceof KillSwitchError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}
