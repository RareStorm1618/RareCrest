import { describe, expect, it } from "vitest";
import { buildImmutableLog, validateImmutableChain } from "./immutable-log.js";

describe("immutable-log (WO-73)", () => {
  it("creates tamper-evident chained entries", () => {
    const entries = buildImmutableLog([
      { id: "1", action: "deploy", verdict: "allow", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "2", action: "rollback", verdict: "deny", createdAt: "2026-01-02T00:00:00.000Z" },
    ]);
    expect(entries[1]?.previousHash).toBe(entries[0]?.hash);
    expect(validateImmutableChain(entries)).toBe(true);
  });
});
