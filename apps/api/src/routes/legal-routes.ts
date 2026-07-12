import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import {
  buildRegulatoryCalendar,
  createLegalMatterPayload,
  evaluateCounselEscalation,
  validateLegalMatterStatus,
} from "@rarecrest/legal-compliance";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";

export function registerLegalRoutes(app: FastifyInstance, db: DatabaseClient) {
  app.post("/api/v1/legal/matters", async (request, reply) => {
    const schema = z.object({
      title: z.string().min(1),
      entityId: z.string().uuid(),
      status: z.string().default("open"),
    });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, body.entityId, request.auth);
      if (!validateLegalMatterStatus(body.status)) {
        return reply.status(400).send({ message: "Invalid legal matter status" });
      }
      const payload = createLegalMatterPayload(body.title, body.entityId, body.status);
      const result = await db.query(
        `INSERT INTO rarecrest.legal_matters (entity_id, title, status, disclaimer)
         VALUES ($1, $2, $3, $4)
         RETURNING id, entity_id AS "entityId", title, status, disclaimer, created_at AS "createdAt"`,
        [body.entityId, payload.title, payload.status, payload.disclaimer],
      );
      return reply.status(201).send(result.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/legal/matters/:entityId", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      const result = await db.query(
        `SELECT id, entity_id AS "entityId", title, status, disclaimer, created_at AS "createdAt"
         FROM rarecrest.legal_matters WHERE entity_id = $1 ORDER BY created_at DESC`,
        [entityId],
      );
      return reply.send({ entityId, matters: result.rows });
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/legal/regulatory-calendar", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      regimes: z.array(z.string().min(1)).min(1),
      periodStart: z.string().datetime().optional(),
    });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, body.entityId, request.auth);
      const periodStart = body.periodStart ?? new Date().toISOString();
      const events = buildRegulatoryCalendar(body.entityId, body.regimes, periodStart);

      for (const event of events) {
        await db.query(
          `INSERT INTO rarecrest.regulatory_calendar_events
             (entity_id, regime, event_type, due_at, cadence, priority, source_period_start)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [event.entityId, event.regime, event.eventType, event.dueAt, event.cadence, event.priority, periodStart],
        );
      }

      return reply.status(201).send({ entityId: body.entityId, periodStart, events });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/legal/regulatory-calendar/:entityId", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      const result = await db.query(
        `SELECT id, entity_id AS "entityId", regime, event_type AS "eventType", due_at AS "dueAt",
                cadence, priority, source_period_start AS "sourcePeriodStart", created_at AS "createdAt"
         FROM rarecrest.regulatory_calendar_events
         WHERE entity_id = $1
         ORDER BY due_at ASC`,
        [entityId],
      );
      return reply.send({ entityId, events: result.rows });
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/legal/counsel-escalations", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      matterId: z.string().uuid().optional(),
      issueType: z.enum(["regulatory", "litigation", "privacy", "contract"]),
      crossBorderImpact: z.boolean(),
      customerHarmRisk: z.boolean(),
      financialExposureUsd: z.number().min(0),
    });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, body.entityId, request.auth);
      const decision = evaluateCounselEscalation({
        matterId: body.matterId,
        issueType: body.issueType,
        crossBorderImpact: body.crossBorderImpact,
        customerHarmRisk: body.customerHarmRisk,
        financialExposureUsd: body.financialExposureUsd,
      });
      const inserted = await db.query(
        `INSERT INTO rarecrest.counsel_escalations
          (entity_id, matter_id, trigger_code, rationale, urgency, required_within_hours, escalated)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, entity_id AS "entityId", matter_id AS "matterId", trigger_code AS "triggerCode",
                   rationale, urgency, required_within_hours AS "requiredWithinHours",
                   escalated, created_at AS "createdAt"`,
        [
          body.entityId,
          body.matterId ?? null,
          decision.triggerCode,
          decision.rationale,
          decision.urgency,
          decision.requiredWithinHours,
          decision.escalated,
        ],
      );
      return reply.status(201).send(inserted.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/legal/counsel-escalations/:entityId", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      const result = await db.query(
        `SELECT id, entity_id AS "entityId", matter_id AS "matterId", trigger_code AS "triggerCode",
                rationale, urgency, required_within_hours AS "requiredWithinHours",
                escalated, created_at AS "createdAt"
         FROM rarecrest.counsel_escalations
         WHERE entity_id = $1
         ORDER BY created_at DESC`,
        [entityId],
      );
      return reply.send({ entityId, escalations: result.rows });
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}
