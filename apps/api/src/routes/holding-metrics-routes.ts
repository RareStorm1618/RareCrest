import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { isVerifiedHumanOrDirector } from "../trust.js";
import { HOLDING_METRIC_KEYS, computeNorthStar, recordMetric } from "../services/holding-metrics.js";

/** EXO Wave B — North Star holding metrics: capital routed, healing hours, families
 * supported, and donation percentage, feeding a single dual-mission score. */
export function registerHoldingMetricsRoutes(app: FastifyInstance, db: DatabaseClient) {
  app.post("/api/v1/holding/metrics", async (request, reply) => {
    if (!isVerifiedHumanOrDirector(request.auth, request.headers as Record<string, unknown>)) {
      return reply.status(403).send({
        message: "Recording a holding metric requires role=director or a verified human",
      });
    }
    const schema = z.object({
      metricKey: z.enum(HOLDING_METRIC_KEYS),
      value: z.number().finite(),
      vertical: z.string().min(1).max(50),
      entityId: z.string().uuid().optional(),
      sourceRef: z.string().max(255).optional(),
    });
    try {
      const body = schema.parse(request.body);
      const event = await recordMetric(db, {
        vertical: body.vertical,
        metricKey: body.metricKey,
        value: body.value,
        entityId: body.entityId ?? null,
        sourceRef: body.sourceRef ?? null,
        actorId: request.auth.userId,
      });
      return reply.status(201).send(event);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  app.get("/api/v1/holding/north-star", async (request, reply) => {
    const schema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });
    try {
      const query = schema.parse(request.query);
      const summary = await computeNorthStar(db, query.days);
      return reply.send(summary);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });
}
