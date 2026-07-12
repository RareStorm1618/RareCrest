import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import type { GovernanceClient } from "@rarecrest/governance-client";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import { mergeValidationWithHardRule, validateStructuredDocument } from "@rarecrest/dual-track";
import type { AgentRight } from "@rarecrest/contracts";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";

const specBodySchema = z.object({
  entityId: z.string().uuid(),
  docType: z.string(),
  narrative: z.string(),
  schemaPayload: z.record(z.unknown()),
  requestedRights: z.array(z.enum(["sensitive_data", "code_execution", "external_comms"])).optional(),
  touchesPhi: z.boolean().default(false),
  touchesFinancial: z.boolean().default(false),
  encryptionLayerPresent: z.boolean().default(true),
});

async function validateSpec(
  body: z.infer<typeof specBodySchema>,
  vertical: string,
  governance: GovernanceClient,
) {
  const local = validateStructuredDocument({
    docType: body.docType,
    narrative: body.narrative,
    schemaPayload: body.schemaPayload,
    requestedRights: body.requestedRights as AgentRight[] | undefined,
  });
  const verdict = await governance.checkHardRules({
    agentId: (body.schemaPayload.agentId as string) ?? "draft",
    entityId: body.entityId,
    vertical: vertical as never,
    requestedRights: body.requestedRights ?? [],
    touchesPhi: body.touchesPhi,
    touchesFinancial: body.touchesFinancial,
    encryptionLayerPresent: body.encryptionLayerPresent,
  });
  return mergeValidationWithHardRule(local, verdict.allowed, verdict.reasons);
}

export function registerSpecRoutes(app: FastifyInstance, db: DatabaseClient, governance: GovernanceClient) {
  app.post("/api/v1/specs/validate", async (request, reply) => {
    try {
      const body = specBodySchema.parse(request.body);
      await assertEntityAccess(db, body.entityId, request.auth);
      const result = await validateSpec(body, request.auth.vertical, governance);
      return reply.send(result);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/specs/documents", async (request, reply) => {
    try {
      const body = specBodySchema.parse(request.body);
      await assertEntityAccess(db, body.entityId, request.auth);
      const result = await validateSpec(body, request.auth.vertical, governance);
      if (!result.deployable) {
        return reply.status(400).send({ message: "Specification is not deployable", ...result });
      }
      const payload = {
        ...body.schemaPayload,
        _validation: { deployable: true, validatedAt: new Date().toISOString() },
      };
      const ins = await db.query(
        `INSERT INTO rarecrest.structured_documents (entity_id, vertical, doc_type, narrative, schema_payload)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id, entity_id AS "entityId", doc_type AS "docType", narrative, schema_payload AS "schemaPayload"`,
        [body.entityId, request.auth.vertical, body.docType, body.narrative, JSON.stringify(payload)],
      );
      return reply.status(201).send({ ...ins.rows[0], deployable: true });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/specs/documents", async (request, reply) => {
    const q = request.query as { entityId?: string };
    if (!q.entityId) return reply.status(400).send({ message: "entityId query required" });
    try {
      await assertEntityAccess(db, q.entityId, request.auth);
      const result = await db.query(
        `SELECT id, entity_id AS "entityId", doc_type AS "docType", narrative,
                schema_payload AS "schemaPayload", created_at AS "createdAt"
         FROM rarecrest.structured_documents
         WHERE entity_id = $1 AND vertical = $2 AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [q.entityId, request.auth.vertical],
      );
      return reply.send({ documents: result.rows });
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/specs/documents/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await db.query(
      `SELECT id, entity_id AS "entityId", vertical, doc_type AS "docType", narrative,
              schema_payload AS "schemaPayload", created_at AS "createdAt"
       FROM rarecrest.structured_documents WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (result.rows.length === 0) return reply.status(404).send({ message: "Document not found" });
    const row = result.rows[0];
    if (row.vertical !== request.auth.vertical) {
      return reply.status(403).send({ message: "Cross-vertical access denied" });
    }
    return reply.send(row);
  });
}
