import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export interface PhiSealInput {
  plaintext: string;
  entityId: string;
  purpose: string;
  /** @deprecated Prefer sealWithKms — raw masterKey encrypts data directly. */
  masterKey?: Buffer;
  keyId?: string;
}

export interface PhiSealedEnvelope {
  ciphertext: string;
  nonce: string;
  keyId: string;
  aadHash: string;
  algorithm: "aes-256-gcm";
  wrappedDek?: string;
  wrapNonce?: string;
  wrapKeyId?: string;
}

export interface PhiOpenInput {
  ciphertext: string;
  nonce: string;
  entityId: string;
  purpose: string;
  masterKey?: Buffer;
  aadHash: string;
  wrappedDek?: string;
  wrapNonce?: string;
}

const ALG = "aes-256-gcm" as const;

/** Derive a 32-byte key from env material (hex, base64, or utf8 passphrase). */
export function parseMasterKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("PHI key material is empty");
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

export interface KmsProvider {
  readonly keyId: string;
  wrapDek(dek: Buffer): { wrappedDek: string; wrapNonce: string };
  unwrapDek(wrappedDek: string, wrapNonce: string): Buffer;
}

/**
 * Local AES-GCM KEK wrapper — stands in for cloud KMS in tests / self-hosted.
 * Production should inject a provider that calls AWS KMS / GCP KMS / Azure Key Vault.
 */
export class LocalAesKmsProvider implements KmsProvider {
  readonly keyId: string;
  private kek: Buffer;

  constructor(kekMaterial: string, keyId = "local-kek-v1") {
    this.kek = parseMasterKey(kekMaterial);
    this.keyId = keyId;
  }

  wrapDek(dek: Buffer): { wrappedDek: string; wrapNonce: string } {
    if (dek.length !== 32) throw new Error("DEK must be 32 bytes");
    const wrapNonce = randomBytes(12);
    const cipher = createCipheriv(ALG, this.kek, wrapNonce);
    cipher.setAAD(Buffer.from(`rarecrest:kms-wrap:${this.keyId}`, "utf8"));
    const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      wrappedDek: Buffer.concat([encrypted, tag]).toString("base64"),
      wrapNonce: wrapNonce.toString("base64"),
    };
  }

  unwrapDek(wrappedDek: string, wrapNonce: string): Buffer {
    const nonce = Buffer.from(wrapNonce, "base64");
    const packed = Buffer.from(wrappedDek, "base64");
    if (packed.length < 17) throw new Error("Wrapped DEK too short");
    const tag = packed.subarray(packed.length - 16);
    const data = packed.subarray(0, packed.length - 16);
    const decipher = createDecipheriv(ALG, this.kek, nonce);
    decipher.setAAD(Buffer.from(`rarecrest:kms-wrap:${this.keyId}`, "utf8"));
    decipher.setAuthTag(tag);
    const dek = Buffer.concat([decipher.update(data), decipher.final()]);
    if (dek.length !== 32) throw new Error("Unwrapped DEK length invalid");
    return dek;
  }
}

/** HTTP KMS shim — POSTs wrap/unwrap to an external secrets/KMS broker. */
export class HttpKmsProvider implements KmsProvider {
  readonly keyId: string;
  constructor(
    private endpoint: string,
    private token: string,
    keyId = "remote-kms-v1",
  ) {
    this.keyId = keyId;
  }

  wrapDek(dek: Buffer): { wrappedDek: string; wrapNonce: string } {
    throw new Error(
      `HttpKmsProvider.wrapDek is async-only — use wrapDekAsync (endpoint=${this.endpoint})`,
    );
  }

  unwrapDek(_wrappedDek: string, _wrapNonce: string): Buffer {
    throw new Error(
      `HttpKmsProvider.unwrapDek is async-only — use unwrapDekAsync (token configured=${Boolean(this.token)})`,
    );
  }

  async wrapDekAsync(dek: Buffer): Promise<{ wrappedDek: string; wrapNonce: string }> {
    const response = await fetch(`${this.endpoint.replace(/\/$/, "")}/wrap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ dek: dek.toString("base64"), keyId: this.keyId }),
    });
    if (!response.ok) throw new Error(`KMS wrap failed: ${response.status}`);
    return (await response.json()) as { wrappedDek: string; wrapNonce: string };
  }

  async unwrapDekAsync(wrappedDek: string, wrapNonce: string): Promise<Buffer> {
    const response = await fetch(`${this.endpoint.replace(/\/$/, "")}/unwrap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ wrappedDek, wrapNonce, keyId: this.keyId }),
    });
    if (!response.ok) throw new Error(`KMS unwrap failed: ${response.status}`);
    const body = (await response.json()) as { dek: string };
    return Buffer.from(body.dek, "base64");
  }
}

export function createKmsProviderFromEnv(): KmsProvider {
  const remote = process.env.PHI_KMS_ENDPOINT;
  const remoteToken = process.env.PHI_KMS_TOKEN;
  if (remote && remoteToken) {
    return new HttpKmsProvider(remote, remoteToken, process.env.PHI_KMS_KEY_ID ?? "remote-kms-v1");
  }
  const kek = process.env.PHI_KMS_KEK ?? process.env.PHI_MASTER_KEY;
  if (!kek) {
    throw new Error("Configure PHI_KMS_KEK (preferred) or PHI_MASTER_KEY / PHI_KMS_ENDPOINT");
  }
  return new LocalAesKmsProvider(kek, process.env.PHI_KMS_KEY_ID ?? "local-kek-v1");
}

/**
 * Seal with a random DEK, then wrap the DEK under the KMS/KEK.
 * The raw DEK never leaves this function unwrapped; only wrapped_dek is persisted.
 */
export function sealWithKms(
  input: Omit<PhiSealInput, "masterKey"> & { kms: KmsProvider },
): PhiSealedEnvelope {
  const dek = randomBytes(32);
  const sealed = sealPhi({
    plaintext: input.plaintext,
    entityId: input.entityId,
    purpose: input.purpose,
    masterKey: dek,
    keyId: input.keyId ?? "phi-dek-v1",
  });
  if (input.kms instanceof HttpKmsProvider) {
    throw new Error("Use sealWithKmsAsync for HttpKmsProvider");
  }
  const wrapped = input.kms.wrapDek(dek);
  dek.fill(0);
  return {
    ...sealed,
    wrappedDek: wrapped.wrappedDek,
    wrapNonce: wrapped.wrapNonce,
    wrapKeyId: input.kms.keyId,
  };
}

export async function sealWithKmsAsync(
  input: Omit<PhiSealInput, "masterKey"> & { kms: KmsProvider },
): Promise<PhiSealedEnvelope> {
  const dek = randomBytes(32);
  const sealed = sealPhi({
    plaintext: input.plaintext,
    entityId: input.entityId,
    purpose: input.purpose,
    masterKey: dek,
    keyId: input.keyId ?? "phi-dek-v1",
  });
  let wrapped: { wrappedDek: string; wrapNonce: string };
  if (input.kms instanceof HttpKmsProvider) {
    wrapped = await input.kms.wrapDekAsync(dek);
  } else {
    wrapped = input.kms.wrapDek(dek);
  }
  dek.fill(0);
  return {
    ...sealed,
    wrappedDek: wrapped.wrappedDek,
    wrapNonce: wrapped.wrapNonce,
    wrapKeyId: input.kms.keyId,
  };
}

export function openWithKms(
  input: PhiOpenInput & { kms: KmsProvider },
): string {
  if (!input.wrappedDek || !input.wrapNonce) {
    if (!input.masterKey) throw new Error("Missing wrapped DEK and masterKey");
    return openPhi(input as PhiOpenInput & { masterKey: Buffer });
  }
  if (input.kms instanceof HttpKmsProvider) {
    throw new Error("Use openWithKmsAsync for HttpKmsProvider");
  }
  const dek = input.kms.unwrapDek(input.wrappedDek, input.wrapNonce);
  try {
    return openPhi({ ...input, masterKey: dek });
  } finally {
    dek.fill(0);
  }
}

export async function openWithKmsAsync(
  input: PhiOpenInput & { kms: KmsProvider },
): Promise<string> {
  if (!input.wrappedDek || !input.wrapNonce) {
    if (!input.masterKey) throw new Error("Missing wrapped DEK and masterKey");
    return openPhi(input as PhiOpenInput & { masterKey: Buffer });
  }
  const dek =
    input.kms instanceof HttpKmsProvider
      ? await input.kms.unwrapDekAsync(input.wrappedDek, input.wrapNonce)
      : input.kms.unwrapDek(input.wrappedDek, input.wrapNonce);
  try {
    return openPhi({ ...input, masterKey: dek });
  } finally {
    dek.fill(0);
  }
}

/**
 * Seal plaintext PHI. Returns ciphertext only — never persist plaintext.
 * AAD binds ciphertext to entityId + purpose so envelopes cannot be moved across entities.
 */
export function sealPhi(input: PhiSealInput): PhiSealedEnvelope {
  if (!input.masterKey) throw new Error("masterKey required for sealPhi — prefer sealWithKms");
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
  if (!input.masterKey) throw new Error("masterKey required for openPhi — prefer openWithKms");
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

export { aadHash as computeAadHash };
