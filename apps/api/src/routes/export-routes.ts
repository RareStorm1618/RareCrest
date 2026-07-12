import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import { assembleOversightPack, renderMarkdown } from "@rarecrest/export";
import { createObjectStoreFromEnv } from "@rarecrest/object-store";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";

export function registerExportRoutes(app: FastifyInstance, db: DatabaseClient, intelligence: IntelligenceClient) {
  const objectStore = createObjectStoreFromEnv();

  app.post("/api/v1/exports/oversight-pack", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      format: z.enum(["pdf", "markdown"]).default("markdown"),
    });
    try {
      const body = schema.parse(request.body);
      const entity = await db.query(`SELECT id, name FROM rarecrest.entities WHERE id = $1`, [body.entityId]);
      if (entity.rows.length === 0) return reply.status(404).send({ message: "Entity not found" });

      const flags = await db.query(
        `SELECT flag_type, message FROM rarecrest.attention_flags WHERE entity_id = $1 AND resolved_at IS NULL`,
        [body.entityId],
      );
      const assessment = await db.query(
        `SELECT responses, governance_maturity, migration_halted FROM rarecrest.readiness_assessments
         WHERE entity_id = $1 AND status = 'complete' ORDER BY completed_at DESC LIMIT 1`,
        [body.entityId],
      );
      const row = assessment.rows[0];
      const responses = (row?.responses as Record<string, unknown>) ?? {};
      const pack = assembleOversightPack({
        entityId: body.entityId,
        entityName: entity.rows[0].name as string,
        governancePillars: (responses.governancePillars as Record<string, number>) ?? {},
        killSwitchLastTest: (responses.killSwitchTest as string) ?? null,
        openRedGates: row?.migration_halted ? ["migration_halted"] : [],
        hardRuleExceptions: flags.rows.filter((f) => f.flag_type === "hard_rule_exception").map((f) => f.message as string),
        attentionFlags: flags.rows.map((f) => ({ type: f.flag_type as string, message: f.message as string })),
      }, body.format);

      const markdown = renderMarkdown(pack);
      const key = `exports/${body.entityId}/${pack.contentHash}.${body.format === "pdf" ? "pdf" : "md"}`;
      const stored = await objectStore.putObject(key, Buffer.from(markdown), body.format === "pdf" ? "application/pdf" : "text/markdown");

      await intelligence.appendTrace({
        entityId: body.entityId,
        vertical: request.auth.vertical,
        action: "export_oversight_pack",
        verdict: "allow",
        payload: { format: body.format, contentHash: pack.contentHash },
      });

      const ins = await db.query(
        `INSERT INTO rarecrest.export_packs (entity_id, scope, format, object_key, content_hash)
         VALUES ($1, 'entity', $2, $3, $4) RETURNING id`,
        [body.entityId, body.format, stored.key, pack.contentHash],
      );

      return reply.send({
        packId: ins.rows[0].id,
        format: body.format,
        downloadUrl: await objectStore.getObjectUrl(stored.key),
        generatedAt: pack.generatedAt,
        contentHash: pack.contentHash,
      });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  app.get("/api/v1/exports/:packId", async (request, reply) => {
    const { packId } = request.params as { packId: string };
    const result = await db.query(
      `SELECT id, entity_id AS "entityId", format, object_key AS "objectKey", content_hash AS "contentHash", generated_at AS "generatedAt"
       FROM rarecrest.export_packs WHERE id = $1`,
      [packId],
    );
    if (result.rows.length === 0) return reply.status(404).send({ message: "Export not found" });
    const row = result.rows[0];
    return reply.send({ ...row, downloadUrl: await objectStore.getObjectUrl(row.objectKey as string) });
  });
}
