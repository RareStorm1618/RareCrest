import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isDirectorScope } from "./portfolio-routes.js";

describe("isDirectorScope", () => {
  const auth = { userId: "director-1", vertical: "rarestorm" as const, authMethod: "header" as const };

  beforeEach(() => {
    process.env.AUTH_TRUST_MODE = "dev";
  });

  afterEach(() => {
    delete process.env.AUTH_TRUST_MODE;
  });

  it("returns true for director-1 user id in dev mode", () => {
    expect(isDirectorScope(auth, { headers: {} })).toBe(true);
  });

  it("returns true when x-user-role is director in dev mode", () => {
    expect(
      isDirectorScope(
        { userId: "other", vertical: "rareangels", authMethod: "header" },
        { headers: { "x-user-role": "director" } },
      ),
    ).toBe(true);
  });

  it("returns false for non-director without role header", () => {
    expect(
      isDirectorScope(
        { userId: "analyst-1", vertical: "rareangels", authMethod: "header" },
        { headers: {} },
      ),
    ).toBe(false);
  });

  it("requires OIDC holding director in strict mode", () => {
    process.env.AUTH_TRUST_MODE = "strict";
    expect(
      isDirectorScope(
        { userId: "other", vertical: "holding", authMethod: "header", role: "director" },
        { headers: { "x-user-role": "director" } },
      ),
    ).toBe(false);
    expect(
      isDirectorScope(
        { userId: "other", vertical: "holding", authMethod: "oidc", role: "director" },
        { headers: {} },
      ),
    ).toBe(true);
  });
});
