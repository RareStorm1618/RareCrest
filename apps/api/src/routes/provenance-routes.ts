import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import { assembleBoardPack, renderMarkdown } from "@rarecrest/export";
import { createObjectStoreFromEnv } from "@rarecrest/object-store";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";
import { isVerifiedHumanOrDirector } from "../trust.js";
import { readInternalServiceToken } from "../fortress.js";
import { HOLDING_METRIC_KEYS } from "../services/holding-metrics.js";
import {
  anchorProvenanceRoot,
  buildBoardPackInput,
  getLatestProvenanceRoot,
  verifyEntityTraceChain,
  verifyMetricKeyChain,
  verifyProvenanceRoot,
} from "../services/provenance.js";

function assertDirectorOrInternal(request: {
  auth?: { userId: string; role?: string };
  headers: Record<string, unknown>;
}): boolean {
  if (request.auth && isVerifiedHumanOrDirector(request.auth as never, request.headers)) return true;
  const expected = readInternalServiceToken();
  const provided = request.headers["x-internal-service-token"];
  return Boolean(expected && typeof provided === "string" && provided === expected);
}

export function registerProvenanceRoutes(app: FastifyInstance, db: DatabaseClient) {
  app.get("/api/v1/provenance/traces/:entityId/verify", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      const result = await verifyEntityTraceChain(db, entityId);
      if (!result.valid) return reply.status(409).send(result);
      return reply.send(result);
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/provenance/metrics/verify", async (request, reply) => {
    const schema = z.object({
      metricKey: z.enum(HOLDING_METRIC_KEYS),
    });
    try {
      const query = schema.parse(request.query);
      const result = await verifyMetricKeyChain(db, query.metricKey);
      if (!result.valid) return reply.status(409).send(result);
      return reply.send(result);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  app.get("/api/v1/provenance/root/latest", async (request, reply) => {
    if (!isVerifiedHumanOrDirector(request.auth, request.headers as Record<string, unknown>)) {
      return reply.status(403).send({ message: "Provenance roots require a verified director or human" });
    }
    const root = await getLatestProvenanceRoot(db);
    if (!root) return reply.status(404).send({ message: "No provenance root has been anchored yet" });
    return reply.send(root);
  });

  app.get("/api/v1/provenance/root/:id/verify", async (request, reply) => {
    if (!isVerifiedHumanOrDirector(request.auth, request.headers as Record<string, unknown>)) {
      return reply.status(403).send({ message: "Provenance verify requires a verified director or human" });
    }
    const { id } = request.params as { id: string };
    try {
      const result = await verifyProvenanceRoot(db, id);
      if (!result.valid) return reply.status(409).send(result);
      return reply.send(result);
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        return reply.status(404).send({ message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/v1/provenance/root/anchor", async (request, reply) => {
    if (!assertDirectorOrInternal(request as never)) {
      return reply.status(403).send({
        message: "Anchoring a provenance root requires a verified director/human or internal service token",
      });
    }
    const schema = z.object({
      periodHours: z.number().int().min(1).max(168).optional(),
      anchorRef: z.string().max(512).optional(),
    });
    try {
      const body = schema.parse(request.body ?? {});
      const root = await anchorProvenanceRoot(db, {
        periodHours: body.periodHours,
        anchorRef: body.anchorRef ?? null,
      });
      return reply.status(201).send(root);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  app.post("/api/v1/exports/board-pack", async (request, reply) => {
    if (!isVerifiedHumanOrDirector(request.auth, request.headers as Record<string, unknown>)) {
      return reply.status(403).send({ message: "Board packs require a verified director or human" });
    }
    const schema = z.object({
      windowDays: z.number().int().min(1).max(365).default(30),
    });
    try {
      const body = schema.parse(request.body ?? {});
      const input = await buildBoardPackInput(db, body.windowDays);
      const pack = assembleBoardPack(input);
      const markdown = renderMarkdown(pack);
      const objectStore = createObjectStoreFromEnv();
      const key = `exports/board-pack/${pack.contentHash}.md`;
      const stored = await objectStore.putObject(key, Buffer.from(markdown, "utf8"), "text/markdown");
      const ins = await db.query(
        `INSERT INTO rarecrest.export_packs (entity_id, scope, format, object_key, content_hash)
         VALUES (NULL, 'portfolio', 'markdown', $1, $2) RETURNING id`,
        [stored.key, pack.contentHash],
      );
      return reply.status(201).send({
        packId: ins.rows[0].id,
        contentHash: pack.contentHash,
        generatedAt: pack.generatedAt,
        downloadUrl: await objectStore.getObjectUrl(stored.key),
        sections: pack.sections.map((s) => s.title),
      });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  app.get("/api/v1/exports/board-pack/preview", async (request, reply) => {
    if (!isVerifiedHumanOrDirector(request.auth, request.headers as Record<string, unknown>)) {
      return reply.status(403).send({ message: "Board pack preview requires a verified director or human" });
    }
    const schema = z.object({
      windowDays: z.coerce.number().int().min(1).max(365).default(30),
    });
    try {
      const query = schema.parse(request.query);
      const input = await buildBoardPackInput(db, query.windowDays);
      const pack = assembleBoardPack(input);
      return reply.send(pack);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });
}
