import type { FastifyInstance } from "fastify";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import type { DatabaseClient } from "@rarecrest/db";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";

export function registerSkillCompanionRoutes(
  app: FastifyInstance,
  db: DatabaseClient,
  intelligence: IntelligenceClient,
) {
  app.post("/api/v1/skill-companion", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      question: z.string().min(1),
      context: z.array(z.string()).optional(),
      requestKind: z.enum(["substantive", "architecture", "drive_only", "generic_summary", "migration"]).optional(),
    });
    try {
      const body = schema.parse(request.body);
      const entity = await assertEntityAccess(db, body.entityId, request.auth);
      const assessment = await db.query(
        `SELECT readiness_band, maturity_level, status FROM rarecrest.readiness_assessments
         WHERE entity_id = $1 ORDER BY updated_at DESC LIMIT 1`,
        [body.entityId],
      );
      const a = assessment.rows[0];
      const result = await intelligence.skillCompanionComplete({
        entityId: body.entityId,
        vertical: request.auth.vertical,
        question: body.question,
        context: body.context,
        requestKind: body.requestKind,
        entityContext: {
          entityId: body.entityId,
          entityType: null,
          vertical: entity.vertical,
          regulatoryRegimes: [],
          readinessBand: (a?.readiness_band as string) ?? null,
          maturityLevel: (a?.maturity_level as number) ?? null,
          migrationMode: null,
          diagnosticsComplete: a?.status === "complete",
        },
      });
      const guard = result.guard as { allowed?: boolean; redirectTo?: string; reason?: string } | undefined;
      if (guard && guard.allowed === false) {
        return reply.status(403).send({
          message: guard.reason ?? "Request blocked by framing guard",
          redirectTo: guard.redirectTo,
          guard,
        });
      }
      return reply.send(result);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}
