import { describe, expect, it } from "vitest";
import { bindDataGovernance } from "./data-governance.js";

describe("data-governance binder (WO-44)", () => {
  it("flags restricted assets without encryption", () => {
    const binder = bindDataGovernance([
      { id: "a1", name: "Entity roster", sensitivity: "internal", encryptedAtRest: false },
      { id: "a2", name: "Patient claims", sensitivity: "phi", encryptedAtRest: false },
    ]);
    expect(binder.compliant).toBe(false);
    expect(binder.policyFlags).toContain("Patient claims requires encrypt-before-access");
  });

  it("reports compliant when restricted and PHI assets are encrypted", () => {
    const binder = bindDataGovernance([
      { id: "a1", name: "Case notes", sensitivity: "phi", encryptedAtRest: true },
      { id: "a2", name: "Ledger", sensitivity: "restricted", encryptedAtRest: true },
    ]);
    expect(binder.compliant).toBe(true);
    expect(binder.policyFlags).toEqual([]);
  });
});
