import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  extractAuth,
  enforceTenancy,
  AuthError,
  TenancyViolationError,
  resolveAuth,
  verifyOidcToken,
} from "./auth.js";
import { createEntitySchema, formatZodErrors } from "./validation.js";
import { SignJWT } from "jose";

describe("auth", () => {
  beforeEach(() => {
    process.env.AUTH_TRUST_MODE = "dev";
    delete process.env.OIDC_JWKS_URL;
    process.env.JWT_SECRET = "test-jwt-secret-for-unit-tests-only";
  });

  afterEach(() => {
    delete process.env.AUTH_TRUST_MODE;
    delete process.env.JWT_SECRET;
    delete process.env.OIDC_ISSUER;
    delete process.env.OIDC_AUDIENCE;
  });

  it("extracts valid auth context from headers in dev", () => {
    const auth = extractAuth({
      headers: {
        "x-user-id": "director-1",
        "x-vertical": "rareangels",
        "x-entity-id": "ent-1",
        "x-user-role": "director",
      },
    });
    expect(auth.userId).toBe("director-1");
    expect(auth.vertical).toBe("rareangels");
    expect(auth.role).toBe("director");
    expect(auth.authMethod).toBe("header");
  });

  it("throws AuthError when x-user-id missing", () => {
    expect(() =>
      extractAuth({ headers: { "x-vertical": "rareangels" } }),
    ).toThrow(AuthError);
  });

  it("rejects header-only auth in strict mode", async () => {
    process.env.AUTH_TRUST_MODE = "strict";
    await expect(
      resolveAuth({
        headers: { "x-user-id": "director-1", "x-vertical": "holding" },
      } as never),
    ).rejects.toThrow(/Bearer token required/);
  });

  it("verifies HS256 bearer tokens", async () => {
    const token = await new SignJWT({
      vertical: "holding",
      role: "director",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("director-oidc-1")
      .setJti("jti-test-1")
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    const auth = await verifyOidcToken(token);
    expect(auth.userId).toBe("director-oidc-1");
    expect(auth.vertical).toBe("holding");
    expect(auth.role).toBe("director");
    expect(auth.authMethod).toBe("oidc");
    expect(auth.jti).toBe("jti-test-1");
  });

  it("requires jti in strict mode", async () => {
    process.env.AUTH_TRUST_MODE = "strict";
    const token = await new SignJWT({
      vertical: "holding",
      role: "director",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("director-oidc-1")
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    await expect(verifyOidcToken(token)).rejects.toThrow(/jti/);
  });

  it("enforces tenancy — rejects cross-vertical access", () => {
    expect(() =>
      enforceTenancy(
        { userId: "d1", vertical: "rareangels", authMethod: "header" },
        "rareedge",
      ),
    ).toThrow(TenancyViolationError);
  });

  it("allows same-vertical access", () => {
    expect(() =>
      enforceTenancy(
        { userId: "d1", vertical: "rareangels", authMethod: "header" },
        "rareangels",
      ),
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
