import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import { AUTOPILOT_LEVELS, type AutopilotLevel } from "@rarecrest/contracts";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";
import { isVerifiedDirector } from "../trust.js";
import { loadEntityAutopilotLevel } from "../policy/policy-gateway.js";

function assertDirector(request: FastifyRequest) {
  if (!isVerifiedDirector(request.auth, request.headers as Record<string, unknown>)) {
    throw Object.assign(new Error("Autopilot changes require a verified director"), { statusCode: 403 });
  }
}

export function registerAutopilotRoutes(app: FastifyInstance, db: DatabaseClient) {
  app.get("/api/v1/runtime/entities/:entityId/autopilot", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      const level = await loadEntityAutopilotLevel(db, entityId);
      const meta = await db.query<{ autopilot_set_by: string | null; autopilot_set_at: string | null }>(
        `SELECT autopilot_set_by, autopilot_set_at FROM rarecrest.entities WHERE id = $1`,
        [entityId],
      );
      const row = meta.rows[0];
      return reply.send({
        entityId,
        level,
        setBy: row?.autopilot_set_by ?? null,
        setAt: row?.autopilot_set_at ? new Date(row.autopilot_set_at).toISOString() : null,
        levels: AUTOPILOT_LEVELS,
      });
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.patch("/api/v1/runtime/entities/:entityId/autopilot", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const schema = z.object({
      level: z.enum(["off", "observe", "draft", "propose"] as [AutopilotLevel, ...AutopilotLevel[]]),
    });
    try {
      await assertEntityAccess(db, entityId, request.auth);
      assertDirector(request);
      const body = schema.parse(request.body);
      const result = await db.query<{
        id: string;
        autopilot_level: string;
        autopilot_set_by: string | null;
        autopilot_set_at: string | null;
      }>(
        `UPDATE rarecrest.entities
         SET autopilot_level = $2, autopilot_set_by = $3, autopilot_set_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id, autopilot_level, autopilot_set_by, autopilot_set_at`,
        [entityId, body.level, request.auth.userId],
      );
      if (result.rows.length === 0) return reply.status(404).send({ message: "Entity not found" });
      const row = result.rows[0];
      return reply.send({
        entityId: row.id,
        level: row.autopilot_level as AutopilotLevel,
        setBy: row.autopilot_set_by,
        setAt: row.autopilot_set_at ? new Date(row.autopilot_set_at).toISOString() : null,
      });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      if (err && typeof err === "object" && "statusCode" in err) {
        return reply.status((err as { statusCode: number }).statusCode).send({
          message: err instanceof Error ? err.message : "Forbidden",
        });
      }
      throw err;
    }
  });
}
