import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import { createLegalMatterPayload, validateLegalMatterStatus } from "@rarecrest/legal-compliance";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";

export function registerLegalRoutes(app: FastifyInstance, db: DatabaseClient) {
  app.post("/api/v1/legal/matters", async (request, reply) => {
    const schema = z.object({
      title: z.string().min(1),
      entityId: z.string().uuid(),
      status: z.string().default("open"),
    });
    try {
      const body = schema.parse(request.body);
      if (!validateLegalMatterStatus(body.status)) {
        return reply.status(400).send({ message: "Invalid legal matter status" });
      }
      const payload = createLegalMatterPayload(body.title, body.entityId, body.status);
      const result = await db.query(
        `INSERT INTO rarecrest.legal_matters (entity_id, title, status, disclaimer)
         VALUES ($1, $2, $3, $4)
         RETURNING id, entity_id AS "entityId", title, status, disclaimer, created_at AS "createdAt"`,
        [body.entityId, payload.title, payload.status, payload.disclaimer],
      );
      return reply.status(201).send(result.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  app.get("/api/v1/legal/matters/:entityId", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const result = await db.query(
      `SELECT id, entity_id AS "entityId", title, status, disclaimer, created_at AS "createdAt"
       FROM rarecrest.legal_matters WHERE entity_id = $1 ORDER BY created_at DESC`,
      [entityId],
    );
    return reply.send({ entityId, matters: result.rows });
  });
}
