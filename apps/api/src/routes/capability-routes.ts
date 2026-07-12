import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import {
  evaluateCapabilityCoverage,
  buildAgencyMap,
  type CapabilityStatus,
} from "@rarecrest/capability-registry";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";

export function registerCapabilityRoutes(app: FastifyInstance, db: DatabaseClient) {
  app.post("/api/v1/capabilities/evaluate", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      statuses: z.array(
        z.object({
          capabilityId: z.string().min(1),
          maturity: z.number().int().min(0).max(5),
          staffed: z.boolean(),
        }),
      ),
    });
    try {
      const body = schema.parse(request.body);
      const coverage = evaluateCapabilityCoverage(body.statuses as CapabilityStatus[]);
      await db.query(
        `INSERT INTO rarecrest.capability_registry_snapshots (entity_id, coverage_pct, covered, gaps)
         VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
        [body.entityId, coverage.coveragePct, JSON.stringify(coverage.covered), JSON.stringify(coverage.gaps)],
      );
      return reply.send({ entityId: body.entityId, ...coverage });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  app.post("/api/v1/capabilities/agency-map", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      statuses: z.array(
        z.object({
          capabilityId: z.string().min(1),
          maturity: z.number().int().min(0).max(5),
          staffed: z.boolean(),
        }),
      ),
    });
    try {
      const body = schema.parse(request.body);
      const agencyMap = buildAgencyMap(body.statuses as CapabilityStatus[]);
      await db.query(
        `INSERT INTO rarecrest.capability_agency_maps (entity_id, map)
         VALUES ($1, $2::jsonb)`,
        [body.entityId, JSON.stringify(agencyMap)],
      );
      return reply.send({ entityId: body.entityId, agencyMap });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  app.get("/api/v1/capabilities/:entityId/latest", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const coverage = await db.query(
      `SELECT coverage_pct AS "coveragePct", covered, gaps, created_at AS "createdAt"
       FROM rarecrest.capability_registry_snapshots
       WHERE entity_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [entityId],
    );
    const agencyMap = await db.query(
      `SELECT map, created_at AS "createdAt"
       FROM rarecrest.capability_agency_maps
       WHERE entity_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [entityId],
    );
    return reply.send({
      entityId,
      coverage: coverage.rows[0] ?? null,
      agencyMap: agencyMap.rows[0]?.map ?? [],
    });
  });
}
