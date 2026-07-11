import { describe, it, expect } from "vitest";
import { extractAuth, enforceTenancy, AuthError, TenancyViolationError } from "./auth.js";
import { createEntitySchema, formatZodErrors } from "./validation.js";

describe("auth", () => {
  it("extracts valid auth context from headers", () => {
    const auth = extractAuth({
      headers: {
        "x-user-id": "director-1",
        "x-vertical": "rareangels",
        "x-entity-id": "ent-1",
      },
    } as never);
    expect(auth.userId).toBe("director-1");
    expect(auth.vertical).toBe("rareangels");
  });

  it("throws AuthError when x-user-id missing", () => {
    expect(() =>
      extractAuth({ headers: { "x-vertical": "rareangels" } } as never),
    ).toThrow(AuthError);
  });

  it("enforces tenancy — rejects cross-vertical access", () => {
    expect(() =>
      enforceTenancy({ userId: "d1", vertical: "rareangels" }, "rareedge"),
    ).toThrow(TenancyViolationError);
  });

  it("allows same-vertical access", () => {
    expect(() =>
      enforceTenancy({ userId: "d1", vertical: "rareangels" }, "rareangels"),
    ).not.toThrow();
  });
});

describe("validation", () => {
  it("validates create entity schema", () => {
    const result = createEntitySchema.safeParse({
      name: "Test Entity",
      vertical: "rarestorm",
      tenancyKey: "rs-test-1",
    });
    expect(result.success).toBe(true);
  });

  it("returns field-level errors for invalid input", () => {
    const result = createEntitySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const formatted = formatZodErrors(result.error);
      expect(formatted.errors.length).toBeGreaterThan(0);
      expect(formatted.errors[0].field).toBeDefined();
    }
  });
});
