import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import type { GovernanceClient } from "@rarecrest/governance-client";
import { mergeValidationWithHardRule, validateStructuredDocument } from "@rarecrest/dual-track";
import type { AgentRight } from "@rarecrest/contracts";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";

export function registerSpecRoutes(app: FastifyInstance, db: DatabaseClient, governance: GovernanceClient) {
  app.post("/api/v1/specs/validate", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      docType: z.string(),
      narrative: z.string(),
      schemaPayload: z.record(z.unknown()),
      requestedRights: z.array(z.enum(["sensitive_data", "code_execution", "external_comms"])).optional(),
      touchesPhi: z.boolean().default(false),
      touchesFinancial: z.boolean().default(false),
      encryptionLayerPresent: z.boolean().default(true),
    });
    try {
      const body = schema.parse(request.body);
      const local = validateStructuredDocument({
        docType: body.docType,
        narrative: body.narrative,
        schemaPayload: body.schemaPayload,
        requestedRights: body.requestedRights as AgentRight[] | undefined,
      });
      const verdict = await governance.checkHardRules({
        agentId: (body.schemaPayload.agentId as string) ?? "draft",
        entityId: body.entityId,
        vertical: request.auth.vertical,
        requestedRights: body.requestedRights ?? [],
        touchesPhi: body.touchesPhi,
        touchesFinancial: body.touchesFinancial,
        encryptionLayerPresent: body.encryptionLayerPresent,
      });
      const result = mergeValidationWithHardRule(local, verdict.allowed, verdict.reasons);
      return reply.send(result);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  app.post("/api/v1/specs/documents", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      docType: z.string(),
      narrative: z.string(),
      schemaPayload: z.record(z.unknown()),
    });
    try {
      const body = schema.parse(request.body);
      const result = await db.query(
        `INSERT INTO rarecrest.structured_documents (entity_id, vertical, doc_type, narrative, schema_payload)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id, entity_id AS "entityId", doc_type AS "docType", narrative, schema_payload AS "schemaPayload"`,
        [body.entityId, request.auth.vertical, body.docType, body.narrative, JSON.stringify(body.schemaPayload)],
      );
      return reply.status(201).send(result.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });
}
