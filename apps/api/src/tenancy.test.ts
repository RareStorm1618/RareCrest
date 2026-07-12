import { describe, expect, it } from "vitest";
import { assertEntityAccess, EntityAccessError } from "./tenancy.js";
import { TenancyViolationError } from "./auth.js";

describe("assertEntityAccess", () => {
  it("returns entity when vertical matches", async () => {
    const db = {
      query: async () => ({
        rows: [{ id: "e1", name: "Entity", vertical: "rareangels" }],
      }),
    };
    const row = await assertEntityAccess(db as never, "e1", {
      userId: "u1",
      vertical: "rareangels",
      authMethod: "header",
    });
    expect(row.name).toBe("Entity");
  });

  it("throws 404 when entity missing", async () => {
    const db = { query: async () => ({ rows: [] }) };
    await expect(
      assertEntityAccess(db as never, "e1", {
        userId: "u1",
        vertical: "rareangels",
        authMethod: "header",
      }),
    ).rejects.toBeInstanceOf(EntityAccessError);
  });

  it("throws tenancy violation for cross-vertical access", async () => {
    const db = {
      query: async () => ({
        rows: [{ id: "e1", name: "Entity", vertical: "rareedge" }],
      }),
    };
    await expect(
      assertEntityAccess(db as never, "e1", {
        userId: "u1",
        vertical: "rareangels",
        authMethod: "header",
      }),
    ).rejects.toBeInstanceOf(TenancyViolationError);
  });
});
