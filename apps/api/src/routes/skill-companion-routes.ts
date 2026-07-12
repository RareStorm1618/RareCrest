import type { FastifyInstance } from "fastify";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import type { DatabaseClient } from "@rarecrest/db";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";

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
      const entity = await db.query(
        `SELECT id, entity_type, vertical, regulatory_regimes FROM rarecrest.entities WHERE id = $1`,
        [body.entityId],
      );
      const assessment = await db.query(
        `SELECT readiness_band, maturity_level, status FROM rarecrest.readiness_assessments
         WHERE entity_id = $1 ORDER BY updated_at DESC LIMIT 1`,
        [body.entityId],
      );
      const e = entity.rows[0];
      const a = assessment.rows[0];
      const result = await intelligence.skillCompanionComplete({
        entityId: body.entityId,
        vertical: request.auth.vertical,
        question: body.question,
        context: body.context,
        requestKind: body.requestKind,
        entityContext: e
          ? {
              entityId: body.entityId,
              entityType: e.entity_type as string | null,
              vertical: e.vertical as string,
              regulatoryRegimes: (e.regulatory_regimes as string[]) ?? [],
              readinessBand: (a?.readiness_band as string) ?? null,
              maturityLevel: (a?.maturity_level as number) ?? null,
              migrationMode: null,
              diagnosticsComplete: a?.status === "complete",
            }
          : null,
      });
      return reply.send(result);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });
}
