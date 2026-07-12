import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import type { VerticalKey } from "@rarecrest/contracts";
import {
  assembleAssessmentSummary,
  assembleOversightPack,
  assemblePortfolioOversightPack,
  renderExportBody,
  renderMarkdown,
} from "@rarecrest/export";
import { createObjectStoreFromEnv } from "@rarecrest/object-store";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";
import { isDirectorScope } from "./portfolio-routes.js";

async function storePack(
  db: DatabaseClient,
  objectStore: ReturnType<typeof createObjectStoreFromEnv>,
  entityId: string | null,
  scope: "entity" | "portfolio",
  pack: import("@rarecrest/export").ExportPack,
  markdown: string,
) {
  const rendered = renderExportBody(pack, markdown);
  const prefix = entityId ?? `portfolio/${scope}`;
  const key = `exports/${prefix}/${pack.contentHash}.${rendered.extension}`;
  const stored = await objectStore.putObject(key, rendered.body, rendered.mime);
  const ins = await db.query(
    `INSERT INTO rarecrest.export_packs (entity_id, scope, format, object_key, content_hash)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [entityId, scope, pack.format, stored.key, pack.contentHash],
  );
  return { packId: ins.rows[0].id as string, storedKey: stored.key, rendered };
}

/**
 * Core oversight-pack build+store+trace, shared by the synchronous export route and the
 * async jobs runner (POST /api/v1/jobs, jobType=export_oversight).
 */
export async function buildOversightPackForEntity(
  db: DatabaseClient,
  intelligence: IntelligenceClient,
  entityId: string,
  entityName: string,
  vertical: VerticalKey,
  format: "pdf" | "markdown",
  objectStore: ReturnType<typeof createObjectStoreFromEnv> = createObjectStoreFromEnv(),
): Promise<{ packId: string; format: "pdf" | "markdown"; downloadUrl: string; generatedAt: string; contentHash: string }> {
  const flags = await db.query(
    `SELECT flag_type, message FROM rarecrest.attention_flags WHERE entity_id = $1 AND resolved_at IS NULL`,
    [entityId],
  );
  const assessment = await db.query(
    `SELECT responses, migration_halted FROM rarecrest.readiness_assessments
     WHERE entity_id = $1 AND status = 'complete' ORDER BY completed_at DESC LIMIT 1`,
    [entityId],
  );
  const row = assessment.rows[0];
  const responses = (row?.responses as Record<string, unknown>) ?? {};
  const pack = assembleOversightPack(
    {
      entityId,
      entityName,
      governancePillars: (responses.governancePillars as Record<string, number>) ?? {},
      killSwitchLastTest: (responses.killSwitchTest as string) ?? null,
      openRedGates: row?.migration_halted ? ["migration_halted"] : [],
      hardRuleExceptions: flags.rows.filter((f) => f.flag_type === "hard_rule_exception").map((f) => f.message as string),
      attentionFlags: flags.rows.map((f) => ({ type: f.flag_type as string, message: f.message as string })),
    },
    format,
  );

  const markdown = renderMarkdown(pack);
  const stored = await storePack(db, objectStore, entityId, "entity", pack, markdown);

  await intelligence.appendTrace({
    entityId,
    vertical,
    action: "export_oversight_pack",
    verdict: "allow",
    payload: { format, contentHash: pack.contentHash },
  });

  return {
    packId: stored.packId,
    format,
    downloadUrl: await objectStore.getObjectUrl(stored.storedKey),
    generatedAt: pack.generatedAt,
    contentHash: pack.contentHash,
  };
}

export function registerExportRoutes(app: FastifyInstance, db: DatabaseClient, intelligence: IntelligenceClient) {
  const objectStore = createObjectStoreFromEnv();

  app.post("/api/v1/exports/oversight-pack", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      format: z.enum(["pdf", "markdown"]).default("markdown"),
    });
    try {
      const body = schema.parse(request.body);
      const entity = await assertEntityAccess(db, body.entityId, request.auth);
      const result = await buildOversightPackForEntity(
        db,
        intelligence,
        body.entityId,
        entity.name,
        request.auth.vertical,
        body.format,
        objectStore,
      );
      return reply.send(result);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/exports/portfolio-oversight-pack", async (request, reply) => {
    const schema = z.object({ format: z.enum(["pdf", "markdown"]).default("markdown") });
    try {
      const body = schema.parse(request.body ?? {});
      const vertical = isDirectorScope(request.auth, request) ? undefined : request.auth.vertical;
      const scopeVertical = vertical ?? request.auth.vertical;

      const entities = await db.query(
        `SELECT e.id, e.name, e.band, e.governance_status,
                (SELECT COUNT(*)::int FROM rarecrest.attention_flags af
                 WHERE af.entity_id = e.id AND af.resolved_at IS NULL) AS open_flags
         FROM rarecrest.entities e
         WHERE e.deleted_at IS NULL AND ($1::varchar IS NULL OR e.vertical = $1)
         ORDER BY e.name`,
        [vertical ?? null],
      );
      const flags = await db.query(
        `SELECT af.flag_type, af.message FROM rarecrest.attention_flags af
         JOIN rarecrest.entities e ON e.id = af.entity_id
         WHERE af.resolved_at IS NULL AND ($1::varchar IS NULL OR e.vertical = $1)`,
        [vertical ?? null],
      );

      const pack = assemblePortfolioOversightPack(
        {
          vertical: scopeVertical,
          entities: entities.rows.map((r) => ({
            entityId: r.id as string,
            entityName: r.name as string,
            readinessBand: r.band as string | null,
            governanceStatus: r.governance_status as string,
            openFlagCount: r.open_flags as number,
          })),
          portfolioAttentionFlags: flags.rows.map((f) => ({
            type: f.flag_type as string,
            message: f.message as string,
          })),
        },
        body.format,
      );
      const markdown = renderMarkdown(pack);
      const stored = await storePack(db, objectStore, null, "portfolio", pack, markdown);

      await intelligence.appendTrace({
        vertical: scopeVertical,
        action: "export_portfolio_oversight_pack",
        verdict: "allow",
        payload: { format: body.format, contentHash: pack.contentHash, entityCount: entities.rows.length },
      });

      return reply.send({
        packId: stored.packId,
        scope: "portfolio",
        format: body.format,
        downloadUrl: await objectStore.getObjectUrl(stored.storedKey),
        generatedAt: pack.generatedAt,
        contentHash: pack.contentHash,
      });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  app.post("/api/v1/exports/assessment-summary", async (request, reply) => {
    const schema = z.object({ entityId: z.string().uuid() });
    try {
      const body = schema.parse(request.body);
      const entity = await assertEntityAccess(db, body.entityId, request.auth);
      const assessment = await db.query(
        `SELECT readiness_total, readiness_band, maturity_level, governance_maturity, completed_at
         FROM rarecrest.readiness_assessments
         WHERE entity_id = $1 AND status = 'complete' ORDER BY completed_at DESC LIMIT 1`,
        [body.entityId],
      );
      if (assessment.rows.length === 0) {
        return reply.status(404).send({ message: "No completed assessment found" });
      }
      const row = assessment.rows[0];
      const summary = assembleAssessmentSummary({
        entityId: body.entityId,
        entityName: entity.name,
        readinessTotal: row.readiness_total as number,
        readinessBand: row.readiness_band as string,
        maturityLevel: row.maturity_level as number,
        governanceMaturity: row.governance_maturity as number,
        completedAt: row.completed_at as string,
      });
      const markdown = renderMarkdown(summary);
      const stored = await storePack(db, objectStore, body.entityId, "entity", summary, markdown);
      return reply.send({
        packId: stored.packId,
        downloadUrl: await objectStore.getObjectUrl(stored.storedKey),
        contentHash: summary.contentHash,
        generatedAt: summary.generatedAt,
      });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/exports/:packId", async (request, reply) => {
    const { packId } = request.params as { packId: string };
    const result = await db.query(
      `SELECT ep.id, ep.entity_id AS "entityId", ep.scope, ep.format, ep.object_key AS "objectKey",
              ep.content_hash AS "contentHash", ep.generated_at AS "generatedAt"
       FROM rarecrest.export_packs ep
       LEFT JOIN rarecrest.entities e ON e.id = ep.entity_id
       WHERE ep.id = $1 AND (ep.scope = 'portfolio' OR e.vertical = $2)`,
      [packId, request.auth.vertical],
    );
    if (result.rows.length === 0) return reply.status(404).send({ message: "Export not found" });
    const row = result.rows[0];
    return reply.send({ ...row, downloadUrl: await objectStore.getObjectUrl(row.objectKey as string) });
  });
}
