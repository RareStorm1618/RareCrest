import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export interface PhiSealInput {
  plaintext: string;
  entityId: string;
  purpose: string;
  masterKey: Buffer;
  keyId?: string;
}

export interface PhiSealedEnvelope {
  ciphertext: string;
  nonce: string;
  keyId: string;
  aadHash: string;
  algorithm: "aes-256-gcm";
}

export interface PhiOpenInput {
  ciphertext: string;
  nonce: string;
  entityId: string;
  purpose: string;
  masterKey: Buffer;
  aadHash: string;
}

const ALG = "aes-256-gcm" as const;

/** Derive a 32-byte key from env material (hex, base64, or utf8 passphrase). */
export function parseMasterKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("PHI_MASTER_KEY is empty");
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, "hex");
  try {
    const b64 = Buffer.from(trimmed, "base64");
    if (b64.length === 32) return b64;
  } catch {
    // fall through
  }
  return createHash("sha256").update(trimmed, "utf8").digest();
}

function aadBytes(entityId: string, purpose: string): Buffer {
  return Buffer.from(`rarecrest:phi:${entityId}:${purpose}`, "utf8");
}

function aadHash(entityId: string, purpose: string): string {
  return createHash("sha256").update(aadBytes(entityId, purpose)).digest("hex");
}

/**
 * Seal plaintext PHI. Returns ciphertext only — never persist plaintext.
 * AAD binds ciphertext to entityId + purpose so envelopes cannot be moved across entities.
 */
export function sealPhi(input: PhiSealInput): PhiSealedEnvelope {
  const nonce = randomBytes(12);
  const keyId = input.keyId ?? "phi-v1";
  const aad = aadBytes(input.entityId, input.purpose);
  const cipher = createCipheriv(ALG, input.masterKey, nonce);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(input.plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([encrypted, tag]);
  return {
    ciphertext: packed.toString("base64"),
    nonce: nonce.toString("base64"),
    keyId,
    aadHash: aadHash(input.entityId, input.purpose),
    algorithm: ALG,
  };
}

/**
 * Open a sealed envelope. Callers must enforce human-only policy before invoking this.
 */
export function openPhi(input: PhiOpenInput): string {
  const expected = aadHash(input.entityId, input.purpose);
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(input.aadHash, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error("PHI envelope AAD mismatch — possible entity/purpose tampering");
  }
  const nonce = Buffer.from(input.nonce, "base64");
  const packed = Buffer.from(input.ciphertext, "base64");
  if (packed.length < 17) throw new Error("PHI ciphertext too short");
  const tag = packed.subarray(packed.length - 16);
  const data = packed.subarray(0, packed.length - 16);
  const decipher = createDecipheriv(ALG, input.masterKey, nonce);
  decipher.setAAD(aadBytes(input.entityId, input.purpose));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Agent-visible metadata only — never includes plaintext or key material. */
export function agentBlindRef(envelopeId: string, purpose: string, keyId: string) {
  return {
    envelopeId,
    purpose,
    keyId,
    access: "ciphertext_ref_only" as const,
    decryptPath: "human_only",
  };
}
