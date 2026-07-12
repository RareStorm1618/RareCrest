import { describe, it, expect } from "vitest";
import {
  ModelRouter,
  applyProviderEndpoints,
  parseProviderAllowlist,
  parseProviderEndpoints,
} from "./model-router.js";

describe("ModelRouter", () => {
  it("routes to first available provider", async () => {
    const router = new ModelRouter({
      providers: [
        { id: "a", name: "A", endpoint: "http://a", priority: 1, enabled: true },
        { id: "b", name: "B", endpoint: "http://b", priority: 2, enabled: true },
      ],
      failoverEnabled: true,
    });
    const result = await router.route({ prompt: "test" });
    expect(result.providerId).toBe("a");
  });

  it("fails when no providers enabled", async () => {
    const router = new ModelRouter({
      providers: [{ id: "a", name: "A", endpoint: "http://a", priority: 1, enabled: false }],
      failoverEnabled: true,
    });
    await expect(router.route({ prompt: "test" })).rejects.toThrow("No enabled model providers");
  });

  it("failovers to second provider when first fails", async () => {
    const router = new ModelRouter(
      {
        providers: [
          { id: "a", name: "A", endpoint: "http://a", priority: 1, enabled: true },
          { id: "b", name: "B", endpoint: "http://b", priority: 2, enabled: true },
        ],
        failoverEnabled: true,
      },
      async (provider, request) => {
        if (provider.id === "a") throw new Error("provider down");
        return { providerId: provider.id, content: `ok:${request.prompt}`, tokensUsed: 1 };
      },
    );
    const result = await router.route({ prompt: "hello" });
    expect(result.providerId).toBe("b");
    expect(result.content).toContain("ok:hello");
  });

  it("rejects a non-allowlisted provider even when enabled", async () => {
    const router = new ModelRouter({
      providers: [
        { id: "primary", name: "Primary", endpoint: "http://a", priority: 1, enabled: true },
        { id: "shadow", name: "Shadow", endpoint: "http://b", priority: 2, enabled: true },
      ],
      failoverEnabled: true,
      allowlist: ["primary", "fallback", "mock"],
    });
    const result = await router.route({ prompt: "test" });
    expect(result.providerId).toBe("primary");
    expect(router.getActiveProviders().map((p) => p.id)).toEqual(["primary"]);
  });

  it("fails when every enabled provider is outside the allowlist", async () => {
    const router = new ModelRouter({
      providers: [{ id: "shadow", name: "Shadow", endpoint: "http://a", priority: 1, enabled: true }],
      failoverEnabled: true,
      allowlist: ["primary", "fallback", "mock"],
    });
    await expect(router.route({ prompt: "test" })).rejects.toThrow("No enabled model providers");
  });
});

describe("parseProviderAllowlist", () => {
  it("defaults to primary,fallback,mock when unset", () => {
    expect(parseProviderAllowlist(undefined)).toEqual(["primary", "fallback", "mock"]);
    expect(parseProviderAllowlist("")).toEqual(["primary", "fallback", "mock"]);
    expect(parseProviderAllowlist("   ")).toEqual(["primary", "fallback", "mock"]);
  });

  it("parses a comma-separated allowlist and trims entries", () => {
    expect(parseProviderAllowlist("primary, custom-a ,custom-b")).toEqual([
      "primary",
      "custom-a",
      "custom-b",
    ]);
  });
});

describe("parseProviderEndpoints", () => {
  it("returns an empty map when unset or malformed", () => {
    expect(parseProviderEndpoints(undefined)).toEqual({});
    expect(parseProviderEndpoints("not json")).toEqual({});
    expect(parseProviderEndpoints("[]")).toEqual({});
    expect(parseProviderEndpoints("42")).toEqual({});
  });

  it("parses a valid id -> endpoint JSON map", () => {
    expect(parseProviderEndpoints('{"primary":"http://p","fallback":"http://f"}')).toEqual({
      primary: "http://p",
      fallback: "http://f",
    });
  });

  it("drops non-string values from the endpoint map", () => {
    expect(parseProviderEndpoints('{"primary":"http://p","fallback":42}')).toEqual({
      primary: "http://p",
    });
  });
});

describe("applyProviderEndpoints", () => {
  it("overrides only matching provider ids", () => {
    const providers = [
      { id: "primary", name: "Primary", endpoint: "http://localhost", priority: 1, enabled: true },
      { id: "fallback", name: "Fallback", endpoint: "http://localhost", priority: 2, enabled: true },
    ];
    const result = applyProviderEndpoints(providers, { primary: "http://real-primary" });
    expect(result.find((p) => p.id === "primary")?.endpoint).toBe("http://real-primary");
    expect(result.find((p) => p.id === "fallback")?.endpoint).toBe("http://localhost");
  });
});
