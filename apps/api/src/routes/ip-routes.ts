import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import {
  reconcilePortfolio,
  registerAsset,
  verifyIpStatus,
  verifyOwnershipTitle,
} from "@rarecrest/ip-management";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";

export function registerIpRoutes(app: FastifyInstance, db: DatabaseClient) {
  app.post("/api/v1/ip/assets", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      assetType: z.enum(["patent", "trademark", "copyright", "trade_secret", "dataset", "model"]),
      title: z.string().min(1),
      jurisdiction: z.string().min(2),
      filingDate: z.string().datetime(),
      registrationNumber: z.string().optional(),
      ownerId: z.string().min(1),
      beneficialOwnerId: z.string().optional(),
      renewalDueAt: z.string().datetime().optional(),
      evidenceCount: z.number().int().min(0).default(0),
      hasOpenDispute: z.boolean().default(false),
      titleChain: z.array(
        z.object({
          fromOwnerId: z.string().min(1),
          toOwnerId: z.string().min(1),
          transferDate: z.string().datetime(),
          instrumentRef: z.string().min(1),
        }),
      ).default([]),
    });

    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, body.entityId, request.auth);
      const asset = registerAsset({
        entityId: body.entityId,
        assetType: body.assetType,
        title: body.title,
        jurisdiction: body.jurisdiction,
        filingDate: body.filingDate,
        registrationNumber: body.registrationNumber ?? null,
        ownerId: body.ownerId,
        beneficialOwnerId: body.beneficialOwnerId ?? null,
      });
      const title = verifyOwnershipTitle(body.titleChain);
      const status = verifyIpStatus({
        hasCurrentRegistration: !!body.registrationNumber,
        renewalDueAt: body.renewalDueAt ?? null,
        hasOpenDispute: body.hasOpenDispute || !title.valid,
        evidenceCount: body.evidenceCount,
      });

      const result = await db.query(
        `INSERT INTO rarecrest.ip_assets
           (entity_id, asset_type, title, jurisdiction, filing_date, registration_number, owner_id,
            beneficial_owner_id, chain_fingerprint, lifecycle_status, title_valid, title_gaps)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
         RETURNING id, entity_id AS "entityId", asset_type AS "assetType", title, jurisdiction,
                   lifecycle_status AS "status", title_valid AS "titleValid", title_gaps AS "titleGaps"`,
        [
          asset.entityId,
          asset.assetType,
          asset.title,
          asset.jurisdiction,
          asset.filingDate,
          asset.registrationNumber ?? null,
          asset.ownerId,
          asset.beneficialOwnerId ?? null,
          asset.chainFingerprint,
          status,
          title.valid,
          JSON.stringify(title.gaps),
        ],
      );
      return reply.status(201).send(result.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/ip/assets/:entityId", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      const result = await db.query(
        `SELECT id, entity_id AS "entityId", asset_type AS "assetType", title, jurisdiction,
                filing_date AS "filingDate", registration_number AS "registrationNumber",
                owner_id AS "ownerId", beneficial_owner_id AS "beneficialOwnerId",
                lifecycle_status AS "status", title_valid AS "titleValid", title_gaps AS "titleGaps",
                created_at AS "createdAt"
         FROM rarecrest.ip_assets
         WHERE entity_id = $1
         ORDER BY created_at DESC`,
        [entityId],
      );
      return reply.send({ entityId, assets: result.rows });
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/ip/reconciliation/:entityId", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const schema = z.object({
      expectedAssets: z.array(z.object({ id: z.string().uuid(), expectedStatus: z.string().min(1) })),
    });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, entityId, request.auth);
      const result = await db.query(
        `SELECT id, title, lifecycle_status AS status FROM rarecrest.ip_assets WHERE entity_id = $1`,
        [entityId],
      );
      const report = reconcilePortfolio(body.expectedAssets, result.rows as Array<{ id: string; title: string; status: string }>);
      return reply.send({ entityId, report });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}
