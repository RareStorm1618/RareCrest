import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import { classifyWikiPrincipal } from "@rarecrest/wiki";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";

class HumanInstructionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "HumanInstructionError";
  }
}

/** Only humans/directors may create or revoke a human instruction — an agent
 * principal is never trusted to author its own authorization record. */
function assertHumanPrincipal(request: FastifyRequest) {
  const principal = classifyWikiPrincipal(request.auth);
  if (principal === "agent") {
    throw new HumanInstructionError("Human instructions require a human or director principal", 403);
  }
}

function mapErr(err: unknown, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) {
  if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
  if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
  if (err instanceof HumanInstructionError) return reply.status(err.statusCode).send({ message: err.message });
  throw err;
}

/**
 * Human-instruction ledger CRUD. Creation/revocation are the human-custody
 * counterpart to `requireHumanInstruction` (apps/api/src/policy/policy-gateway.ts):
 * a financial/held-action release can only point at a row created here — never a
 * client-supplied opaque string. Entity-scoped like other tenancy-gated routes.
 */
export function registerHumanInstructionRoutes(app: FastifyInstance, db: DatabaseClient) {
  app.post("/api/v1/human-instructions", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      actionScope: z.string().min(1).max(100),
      instruction: z.string().min(1),
      expiresInHours: z.number().positive().max(168).default(24),
    });
    try {
      const body = schema.parse(request.body);
      assertHumanPrincipal(request);
      // Vertical is derived from the entity row (server-owned), never a client-supplied value.
      const entity = await assertEntityAccess(db, body.entityId, request.auth);
      const expiresAt = new Date(Date.now() + body.expiresInHours * 3600_000).toISOString();
      const result = await db.query(
        `INSERT INTO rarecrest.human_instructions
           (entity_id, vertical, actor_id, action_scope, instruction, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, entity_id AS "entityId", vertical, actor_id AS "actorId",
                   action_scope AS "actionScope", instruction, expires_at AS "expiresAt",
                   revoked_at AS "revokedAt", created_at AS "createdAt"`,
        [body.entityId, entity.vertical, request.auth.userId, body.actionScope, body.instruction, expiresAt],
      );
      return reply.status(201).send(result.rows[0]);
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.get("/api/v1/human-instructions", async (request, reply) => {
    const q = request.query as { entityId?: string; includeRevoked?: string };
    if (!q.entityId) return reply.status(400).send({ message: "entityId is required" });
    try {
      await assertEntityAccess(db, q.entityId, request.auth);
      const includeRevoked = q.includeRevoked === "true";
      const result = await db.query(
        `SELECT id, entity_id AS "entityId", vertical, actor_id AS "actorId",
                action_scope AS "actionScope", instruction, expires_at AS "expiresAt",
                revoked_at AS "revokedAt", created_at AS "createdAt"
         FROM rarecrest.human_instructions
         WHERE entity_id = $1 AND ($2 = true OR revoked_at IS NULL)
         ORDER BY created_at DESC
         LIMIT 200`,
        [q.entityId, includeRevoked],
      );
      return reply.send({ instructions: result.rows });
    } catch (err) {
      return mapErr(err, reply);
    }
  });

  app.post("/api/v1/human-instructions/:id/revoke", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      assertHumanPrincipal(request);
      const existing = await db.query(
        `SELECT entity_id AS "entityId" FROM rarecrest.human_instructions WHERE id = $1`,
        [id],
      );
      if (existing.rows.length === 0) return reply.status(404).send({ message: "Human instruction not found" });
      await assertEntityAccess(db, existing.rows[0].entityId as string, request.auth);
      const result = await db.query(
        `UPDATE rarecrest.human_instructions
         SET revoked_at = NOW()
         WHERE id = $1 AND revoked_at IS NULL
         RETURNING id, entity_id AS "entityId", vertical, actor_id AS "actorId",
                   action_scope AS "actionScope", instruction, expires_at AS "expiresAt",
                   revoked_at AS "revokedAt", created_at AS "createdAt"`,
        [id],
      );
      if (result.rows.length === 0) return reply.status(409).send({ message: "Human instruction already revoked" });
      return reply.send(result.rows[0]);
    } catch (err) {
      return mapErr(err, reply);
    }
  });
}
