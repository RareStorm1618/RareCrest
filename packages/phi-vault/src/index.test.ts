import { describe, expect, it } from "vitest";
import { agentBlindRef, openPhi, parseMasterKey, sealPhi } from "./index.js";

describe("phi-vault", () => {
  const masterKey = parseMasterKey("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");

  it("round-trips plaintext with entity-bound AAD", () => {
    const sealed = sealPhi({
      plaintext: "patient-note-secret",
      entityId: "00000000-0000-4000-8000-000000000001",
      purpose: "clinical_note",
      masterKey,
    });
    const opened = openPhi({
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      entityId: "00000000-0000-4000-8000-000000000001",
      purpose: "clinical_note",
      masterKey,
      aadHash: sealed.aadHash,
    });
    expect(opened).toBe("patient-note-secret");
  });

  it("rejects cross-entity open attempts", () => {
    const sealed = sealPhi({
      plaintext: "patient-note-secret",
      entityId: "00000000-0000-4000-8000-000000000001",
      purpose: "clinical_note",
      masterKey,
    });
    expect(() =>
      openPhi({
        ciphertext: sealed.ciphertext,
        nonce: sealed.nonce,
        entityId: "00000000-0000-4000-8000-000000000002",
        purpose: "clinical_note",
        masterKey,
        aadHash: sealed.aadHash,
      }),
    ).toThrow(/AAD mismatch/);
  });

  it("exposes agent-blind refs without plaintext", () => {
    const ref = agentBlindRef("env-1", "clinical_note", "phi-v1");
    expect(ref.decryptPath).toBe("human_only");
    expect(JSON.stringify(ref)).not.toMatch(/patient|plaintext/i);
  });
});
