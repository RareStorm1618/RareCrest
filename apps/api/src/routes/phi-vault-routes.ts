import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import {
  agentBlindRef,
  createKmsProviderFromEnv,
  openWithKmsAsync,
  sealWithKmsAsync,
  type KmsProvider,
} from "@rarecrest/phi-vault";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";
import { trustMode } from "../auth.js";
import { loadSecret } from "../secrets.js";

export class PhiVaultError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "PhiVaultError";
  }
}

function isHumanDecryptRole(role: string | undefined): boolean {
  return role === "director" || role === "clinician" || role === "compliance_officer";
}

function kmsOrThrow(): KmsProvider {
  // Prefer KEK / remote KMS; allow PHI_MASTER_KEY only as legacy KEK material via createKmsProviderFromEnv.
  if (trustMode() === "strict" && !loadSecret("PHI_KMS_KEK") && !loadSecret("PHI_KMS_ENDPOINT")) {
    throw new PhiVaultError(
      "Strict mode requires PHI_KMS_KEK or PHI_KMS_ENDPOINT (raw PHI_MASTER_KEY alone is not enough)",
      503,
    );
  }
  try {
    // Ensure env vars from *_FILE are visible to createKmsProviderFromEnv
    const kek = loadSecret("PHI_KMS_KEK");
    if (kek && !process.env.PHI_KMS_KEK) process.env.PHI_KMS_KEK = kek;
    const master = loadSecret("PHI_MASTER_KEY");
    if (master && !process.env.PHI_MASTER_KEY) process.env.PHI_MASTER_KEY = master;
    return createKmsProviderFromEnv();
  } catch (err) {
    throw new PhiVaultError((err as Error).message, 503);
  }
}

export async function entityEncryptionLayerPresent(
  db: DatabaseClient,
  entityId: string,
): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM rarecrest.entity_encryption_layers
     WHERE entity_id = $1 AND active = TRUE LIMIT 1`,
    [entityId],
  );
  return result.rows.length > 0;
}

export function registerPhiVaultRoutes(app: FastifyInstance, db: DatabaseClient) {
  app.post("/api/v1/phi/encryption-layer/:entityId", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const schema = z.object({ keyId: z.string().min(1).default("phi-v1") });
    try {
      const body = schema.parse(request.body ?? {});
      await assertEntityAccess(db, entityId, request.auth);
      if (!isHumanDecryptRole(request.auth.role) && trustMode() === "strict") {
        return reply.status(403).send({ message: "Only human custody roles may register encryption layers" });
      }
      await db.query(
        `INSERT INTO rarecrest.entity_encryption_layers (entity_id, key_id, registered_by, active)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (entity_id) DO UPDATE SET
           key_id = EXCLUDED.key_id,
           registered_by = EXCLUDED.registered_by,
           registered_at = NOW(),
           active = TRUE`,
        [entityId, body.keyId, request.auth.userId],
      );
      return reply.status(201).send({
        entityId,
        keyId: body.keyId,
        encryptionLayerPresent: true,
        registeredBy: request.auth.userId,
        kmsWrapped: true,
      });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/phi/encryption-layer/:entityId", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      const present = await entityEncryptionLayerPresent(db, entityId);
      return reply.send({ entityId, encryptionLayerPresent: present });
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/phi/envelopes", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      purpose: z.string().min(1).max(64),
      plaintext: z.string().min(1),
    });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, body.entityId, request.auth);
      if (!(await entityEncryptionLayerPresent(db, body.entityId))) {
        return reply.status(400).send({
          message: "Entity encryption layer not registered — refuse to accept PHI",
        });
      }
      const kms = kmsOrThrow();
      const sealed = await sealWithKmsAsync({
        plaintext: body.plaintext,
        entityId: body.entityId,
        purpose: body.purpose,
        kms,
      });
      const inserted = await db.query(
        `INSERT INTO rarecrest.phi_envelopes
           (entity_id, purpose, ciphertext, nonce, key_id, aad_hash, created_by,
            wrapped_dek, wrap_nonce, wrap_key_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          body.entityId,
          body.purpose,
          sealed.ciphertext,
          sealed.nonce,
          sealed.keyId,
          sealed.aadHash,
          request.auth.userId,
          sealed.wrappedDek ?? null,
          sealed.wrapNonce ?? null,
          sealed.wrapKeyId ?? null,
        ],
      );
      const envelopeId = inserted.rows[0].id as string;
      return reply.status(201).send({
        ...agentBlindRef(envelopeId, body.purpose, sealed.keyId),
        wrapKeyId: sealed.wrapKeyId,
      });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      if (err instanceof PhiVaultError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  /** Agent-safe: metadata + ciphertext ref only. */
  app.get("/api/v1/phi/envelopes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await db.query(
        `SELECT id, entity_id AS "entityId", purpose, key_id AS "keyId", created_at AS "createdAt"
         FROM rarecrest.phi_envelopes WHERE id = $1`,
        [id],
      );
      if (!result.rows[0]) return reply.status(404).send({ message: "Envelope not found" });
      const row = result.rows[0];
      await assertEntityAccess(db, row.entityId as string, request.auth);
      return reply.send(agentBlindRef(row.id as string, row.purpose as string, row.keyId as string));
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  /** Human-only decrypt. Agents are denied. Opens via KMS-unwrapped DEK. */
  app.post("/api/v1/phi/envelopes/:id/decrypt", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await db.query(
        `SELECT id, entity_id AS "entityId", purpose, ciphertext, nonce, key_id AS "keyId",
                aad_hash AS "aadHash", wrapped_dek AS "wrappedDek", wrap_nonce AS "wrapNonce"
         FROM rarecrest.phi_envelopes WHERE id = $1`,
        [id],
      );
      if (!result.rows[0]) return reply.status(404).send({ message: "Envelope not found" });
      const row = result.rows[0];
      await assertEntityAccess(db, row.entityId as string, request.auth);

      const human = isHumanDecryptRole(request.auth.role);
      if (!human) {
        await db.query(
          `INSERT INTO rarecrest.phi_decrypt_audit (envelope_id, actor_id, actor_role, denied, deny_reason)
           VALUES ($1, $2, $3, TRUE, $4)`,
          [id, request.auth.userId, request.auth.role ?? null, "agent_or_non_custody_role"],
        );
        return reply.status(403).send({
          message: "PHI decrypt is human-custody only — agents are blind to plaintext",
        });
      }

      const kms = kmsOrThrow();
      const plaintext = await openWithKmsAsync({
        ciphertext: row.ciphertext as string,
        nonce: row.nonce as string,
        entityId: row.entityId as string,
        purpose: row.purpose as string,
        aadHash: row.aadHash as string,
        wrappedDek: (row.wrappedDek as string | null) ?? undefined,
        wrapNonce: (row.wrapNonce as string | null) ?? undefined,
        kms,
      });
      await db.query(
        `INSERT INTO rarecrest.phi_decrypt_audit (envelope_id, actor_id, actor_role, denied)
         VALUES ($1, $2, $3, FALSE)`,
        [id, request.auth.userId, request.auth.role ?? null],
      );
      return reply.send({
        envelopeId: id,
        purpose: row.purpose,
        plaintext,
        warning: "Plaintext must not be forwarded to agents or logged",
      });
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      if (err instanceof PhiVaultError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}
