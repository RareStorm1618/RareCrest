import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isDirectorObsidianNamespace, isObsidianSyncSafeSensitivity } from "./obsidian-sync.js";

export interface VaultPackageFile {
  path: string;
  body: string;
}

export interface VaultPackagePlain {
  format: "rarecrest-obsidian-vault-v1";
  namespace: string;
  createdAt: string;
  files: VaultPackageFile[];
  canvas?: unknown;
  basesYaml?: string;
}

export interface EncryptedVaultPackage {
  format: "rarecrest-rcvault-v1";
  namespace: string;
  createdAt: string;
  ciphertext: string;
  nonce: string;
  salt: string;
  hmac: string;
  contentSha256: string;
  fileCount: number;
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return createHash("sha256").update(Buffer.concat([Buffer.from(passphrase, "utf8"), salt])).digest();
}

export function buildVaultPackagePlain(input: {
  namespace: string;
  pages: Array<{ slug: string; title: string; pageType: string; body: string; sensitivity: string }>;
  canvas?: unknown;
  basesYaml?: string;
}): VaultPackagePlain {
  if (!isDirectorObsidianNamespace(input.namespace)) {
    throw new Error("Namespace not eligible for Obsidian vault package");
  }
  const files: VaultPackageFile[] = [];
  for (const p of input.pages) {
    if (!isObsidianSyncSafeSensitivity(p.sensitivity)) continue;
    files.push({
      path: `wiki/${p.pageType}/${p.slug}.md`,
      body: p.body.startsWith("---") ? p.body : `---\ntitle: ${JSON.stringify(p.title)}\nslug: ${p.slug}\n---\n\n${p.body}\n`,
    });
  }
  return {
    format: "rarecrest-obsidian-vault-v1",
    namespace: input.namespace,
    createdAt: new Date().toISOString(),
    files,
    canvas: input.canvas,
    basesYaml: input.basesYaml,
  };
}

export function encryptVaultPackage(
  plain: VaultPackagePlain,
  passphrase: string,
  hmacKey: string,
): EncryptedVaultPackage {
  const salt = randomBytes(16);
  const key = deriveKey(passphrase, salt);
  const nonce = randomBytes(12);
  const payload = Buffer.from(JSON.stringify(plain), "utf8");
  const contentSha256 = createHash("sha256").update(payload).digest("hex");
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const enc = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertext = Buffer.concat([enc, tag]).toString("base64");
  const hmac = createHmac("sha256", hmacKey)
    .update(`${plain.namespace}|${contentSha256}|${ciphertext}`)
    .digest("hex");
  return {
    format: "rarecrest-rcvault-v1",
    namespace: plain.namespace,
    createdAt: plain.createdAt,
    ciphertext,
    nonce: nonce.toString("base64"),
    salt: salt.toString("base64"),
    hmac,
    contentSha256,
    fileCount: plain.files.length,
  };
}

export function decryptVaultPackage(
  pkg: EncryptedVaultPackage,
  passphrase: string,
  hmacKey: string,
): VaultPackagePlain {
  const expected = createHmac("sha256", hmacKey)
    .update(`${pkg.namespace}|${pkg.contentSha256}|${pkg.ciphertext}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(pkg.hmac, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Vault package HMAC verification failed");
  }
  const key = deriveKey(passphrase, Buffer.from(pkg.salt, "base64"));
  const raw = Buffer.from(pkg.ciphertext, "base64");
  const tag = raw.subarray(raw.length - 16);
  const data = raw.subarray(0, raw.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(pkg.nonce, "base64"));
  decipher.setAuthTag(tag);
  const plainBuf = Buffer.concat([decipher.update(data), decipher.final()]);
  const hash = createHash("sha256").update(plainBuf).digest("hex");
  if (hash !== pkg.contentSha256) throw new Error("Vault package content hash mismatch");
  return JSON.parse(plainBuf.toString("utf8")) as VaultPackagePlain;
}

/** Expand decrypted package into path→body map for Obsidian vault writing. */
export function vaultPackageToTree(plain: VaultPackagePlain): Record<string, string> {
  const tree: Record<string, string> = {};
  for (const f of plain.files) tree[f.path] = f.body;
  if (plain.basesYaml) tree["wiki/Views.base"] = plain.basesYaml;
  if (plain.canvas) tree["wiki/graph.canvas"] = JSON.stringify(plain.canvas, null, 2);
  tree["wiki/_rarecrest_manifest.json"] = JSON.stringify(
    { namespace: plain.namespace, createdAt: plain.createdAt, format: plain.format, fileCount: plain.files.length },
    null,
    2,
  );
  return tree;
}
