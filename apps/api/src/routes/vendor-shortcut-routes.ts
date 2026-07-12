import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import {
  assessShortcutInventory,
  buildDestinationMapping,
  type ShortcutInventoryItem,
  type DestinationCapability,
} from "@rarecrest/vendor-shortcut";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";
import { isVerifiedDirector } from "../trust.js";

export function registerVendorShortcutRoutes(app: FastifyInstance, db: DatabaseClient) {
  app.get("/api/v1/vendor-shortcut/:entityId/inventory", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    try {
      const directorBypass = isVerifiedDirector(request.auth, request.headers as never);
      await assertEntityAccess(db, entityId, request.auth, directorBypass);
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
    const result = await db.query(
      `SELECT system_id AS "systemId", system_type AS "systemType", record_count AS "recordCount",
              exportable, data_freshness_hours AS "dataFreshnessHours", daily_change_rate_pct AS "dailyChangeRatePct"
       FROM rarecrest.vendor_shortcut_inventory
       WHERE entity_id = $1
       ORDER BY created_at DESC`,
      [entityId],
    );
    const inventory = result.rows as ShortcutInventoryItem[];
    return reply.send({
      entityId,
      inventory,
      assessment: assessShortcutInventory(inventory),
    });
  });

  app.post("/api/v1/vendor-shortcut/inventory", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      inventory: z.array(
        z.object({
          systemId: z.string().min(1),
          systemType: z.enum(["ehr", "billing", "crm", "support", "knowledge_base", "identity"]),
          recordCount: z.number().int().min(0),
          exportable: z.boolean(),
          dataFreshnessHours: z.number().int().min(0),
          dailyChangeRatePct: z.number().min(0),
        }),
      ),
    });
    try {
      const body = schema.parse(request.body);
      const directorBypass = isVerifiedDirector(request.auth, request.headers as never);
      await assertEntityAccess(db, body.entityId, request.auth, directorBypass);
      for (const item of body.inventory) {
        await db.query(
          `INSERT INTO rarecrest.vendor_shortcut_inventory
            (entity_id, system_id, system_type, record_count, exportable, data_freshness_hours, daily_change_rate_pct)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            body.entityId,
            item.systemId,
            item.systemType,
            item.recordCount,
            item.exportable,
            item.dataFreshnessHours,
            item.dailyChangeRatePct,
          ],
        );
      }
      const assessment = assessShortcutInventory(body.inventory);
      return reply.status(201).send({ entityId: body.entityId, assessment });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/vendor-shortcut/destination-mapping", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      inventory: z.array(
        z.object({
          systemId: z.string().min(1),
          systemType: z.enum(["ehr", "billing", "crm", "support", "knowledge_base", "identity"]),
          recordCount: z.number().int().min(0),
          exportable: z.boolean(),
          dataFreshnessHours: z.number().int().min(0),
          dailyChangeRatePct: z.number().min(0),
        }),
      ),
      targetCapabilities: z.array(
        z.enum([
          "identity_graph",
          "revenue_intelligence",
          "support_automation",
          "compliance_observability",
        ]),
      ),
    });
    try {
      const body = schema.parse(request.body);
      const directorBypass = isVerifiedDirector(request.auth, request.headers as never);
      await assertEntityAccess(db, body.entityId, request.auth, directorBypass);
      const mapping = buildDestinationMapping({
        entityId: body.entityId,
        inventory: body.inventory,
        targetCapabilities: body.targetCapabilities as DestinationCapability[],
      });
      await db.query(
        `INSERT INTO rarecrest.vendor_shortcut_destination_maps (entity_id, readiness_score, mapping)
         VALUES ($1, $2, $3::jsonb)`,
        [body.entityId, mapping.readinessScore, JSON.stringify(mapping.mappings)],
      );
      return reply.send(mapping);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}
