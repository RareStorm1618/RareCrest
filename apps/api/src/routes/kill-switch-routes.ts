import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import type { GovernanceClient } from "@rarecrest/governance-client";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";
import { KillSwitchError, KillSwitchService } from "../services/kill-switch.js";
import { isVerifiedDirector } from "../trust.js";
import { roleAllows } from "../rbac.js";
import { recordKillSwitchEvent, recordRbacDenial } from "../observability.js";

/**
 * Kill-switch escalation/de-escalation is gated to the RBAC matrix's kill_switch
 * action (director|operator|admin) OR a verified director. Fail-closed — anything
 * else is a 403, never a silent allow. GET remains entity-access only (read is not
 * privilege-gated).
 */
function assertDirector(request: FastifyRequest) {
  const allowed =
    roleAllows(request.auth.role, "kill_switch") ||
    isVerifiedDirector(request.auth, request.headers as Record<string, unknown>);
  if (!allowed) {
    recordRbacDenial("kill_switch");
    throw new KillSwitchError(
      "Kill-switch actions require role=director|operator|admin or a verified director",
      403,
    );
  }
}

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
      assertDirector(request);
      const row = await service.arm({
        entityId,
        actorId: request.auth.userId,
        reason: body.reason,
      });
      recordKillSwitchEvent("arm");
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
      assertDirector(request);
      const result = await service.trigger({
        entityId,
        actorId: request.auth.userId,
        reason: body.reason,
      });
      recordKillSwitchEvent("trigger");
      return reply.send(result);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      if (err instanceof KillSwitchError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/runtime/kill-switch/:entityId/disarm", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const schema = z.object({ reason: z.string().min(1) });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, entityId, request.auth);
      assertDirector(request);
      const row = await service.disarm({
        entityId,
        actorId: request.auth.userId,
        reason: body.reason,
      });
      recordKillSwitchEvent("disarm");
      return reply.send(row);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      if (err instanceof KillSwitchError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}
