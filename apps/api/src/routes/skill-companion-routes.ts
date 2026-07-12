import type { FastifyInstance } from "fastify";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import type { DatabaseClient } from "@rarecrest/db";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";

const companionBodySchema = z.object({
  entityId: z.string().uuid(),
  question: z.string().min(1),
  context: z.array(z.string()).optional(),
  requestKind: z
    .enum(["substantive", "architecture", "drive_only", "generic_summary", "migration"])
    .optional(),
});

async function buildEntityContext(
  db: DatabaseClient,
  entityId: string,
  vertical: string,
  entityVertical: string,
) {
  const assessment = await db.query(
    `SELECT readiness_band, maturity_level, status FROM rarecrest.readiness_assessments
     WHERE entity_id = $1 ORDER BY updated_at DESC LIMIT 1`,
    [entityId],
  );
  const a = assessment.rows[0];
  return {
    entityId,
    entityType: null,
    vertical: entityVertical || vertical,
    regulatoryRegimes: [] as string[],
    readinessBand: (a?.readiness_band as string) ?? null,
    maturityLevel: (a?.maturity_level as number) ?? null,
    migrationMode: null as string | null,
    diagnosticsComplete: a?.status === "complete",
  };
}

export function registerSkillCompanionRoutes(
  app: FastifyInstance,
  db: DatabaseClient,
  intelligence: IntelligenceClient,
) {
  app.post("/api/v1/skill-companion", async (request, reply) => {
    try {
      const body = companionBodySchema.parse(request.body);
      const entity = await assertEntityAccess(db, body.entityId, request.auth);
      const entityContext = await buildEntityContext(
        db,
        body.entityId,
        request.auth.vertical,
        entity.vertical,
      );
      const result = await intelligence.skillCompanionComplete({
        entityId: body.entityId,
        vertical: request.auth.vertical,
        question: body.question,
        context: body.context,
        requestKind: body.requestKind,
        entityContext,
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

  app.post("/api/v1/skill-companion/stream", async (request, reply) => {
    try {
      const body = companionBodySchema.parse(request.body);
      const entity = await assertEntityAccess(db, body.entityId, request.auth);
      const entityContext = await buildEntityContext(
        db,
        body.entityId,
        request.auth.vertical,
        entity.vertical,
      );

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const writeEvent = (event: string, data: unknown) => {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        for await (const chunk of intelligence.skillCompanionStream({
          entityId: body.entityId,
          vertical: request.auth.vertical,
          question: body.question,
          context: body.context,
          requestKind: body.requestKind,
          entityContext,
        })) {
          writeEvent(chunk.event, chunk.data);
          if (chunk.event === "guard" && chunk.data.allowed === false) {
            writeEvent("done", { ok: false });
            break;
          }
        }
      } catch (err) {
        writeEvent("error", { message: err instanceof Error ? err.message : "stream failed" });
        writeEvent("done", { ok: false });
      }
      reply.raw.end();
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}
