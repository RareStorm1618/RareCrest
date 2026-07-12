import { describe, expect, it, vi } from "vitest";
import { TokenRevocationService } from "./token-revocation.js";
import type { DatabaseClient } from "@rarecrest/db";

describe("TokenRevocationService", () => {
  it("revokes by jti", async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("INSERT")) return { rows: [{ id: "rev-1" }] };
        if (sql.includes("jti = $1")) return { rows: [{ reason: "logout" }] };
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;
    const service = new TokenRevocationService(db);
    await service.revoke({
      subject: "user-1",
      jti: "jti-1",
      revokedBy: "director-1",
      reason: "logout",
    });
    const check = await service.isRevoked({ subject: "user-1", jti: "jti-1" });
    expect(check.revoked).toBe(true);
  });

  it("blanket subject revocation blocks older tokens", async () => {
    const revokedAt = new Date("2026-01-02T00:00:00Z");
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("jti = $1")) return { rows: [] };
        if (sql.includes("jti IS NULL")) {
          return { rows: [{ reason: "offboarded", createdAt: revokedAt.toISOString() }] };
        }
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;
    const service = new TokenRevocationService(db);
    const oldToken = await service.isRevoked({
      subject: "user-1",
      tokenIat: Math.floor(new Date("2026-01-01T00:00:00Z").getTime() / 1000),
    });
    expect(oldToken.revoked).toBe(true);
    const newToken = await service.isRevoked({
      subject: "user-1",
      tokenIat: Math.floor(new Date("2026-01-03T00:00:00Z").getTime() / 1000),
    });
    expect(newToken.revoked).toBe(false);
  });
});
