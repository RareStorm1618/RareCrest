import { afterEach, describe, it, expect, vi } from "vitest";
import {
  ModelRouter,
  applyProviderEndpoints,
  callLlmHttpEndpoint,
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

describe("LLM_HTTP_ENDPOINT extension point", () => {
  const provider = { id: "primary", name: "Primary", endpoint: "http://localhost", priority: 1, enabled: true };

  afterEach(() => {
    delete process.env.LLM_HTTP_ENDPOINT;
    vi.unstubAllGlobals();
  });

  it("callLlmHttpEndpoint POSTs {prompt, provider} and returns JSON {text} as content", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("http://llm.internal/generate");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(init?.body as string)).toMatchObject({ prompt: "hello", provider: "primary" });
      return new Response(JSON.stringify({ text: "hi there" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callLlmHttpEndpoint("http://llm.internal/generate", provider, { prompt: "hello" });
    expect(result).toMatchObject({ providerId: "primary", content: "hi there" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("callLlmHttpEndpoint falls back to a plain-text body when content-type is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("plain text reply", { status: 200 })),
    );
    const result = await callLlmHttpEndpoint("http://llm.internal/generate", provider, { prompt: "hello" });
    expect(result.content).toBe("plain text reply");
  });

  it("callLlmHttpEndpoint throws ModelRouterError on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500, statusText: "Internal Server Error" })),
    );
    await expect(
      callLlmHttpEndpoint("http://llm.internal/generate", provider, { prompt: "hello" }),
    ).rejects.toThrow(/LLM_HTTP_ENDPOINT request failed/);
  });

  it("ModelRouter.route uses LLM_HTTP_ENDPOINT when set and no explicit caller is wired", async () => {
    process.env.LLM_HTTP_ENDPOINT = "http://llm.internal/generate";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ text: "routed reply" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })),
    );
    const router = new ModelRouter({ providers: [provider], failoverEnabled: true });
    const result = await router.route({ prompt: "hello" });
    expect(result.content).toBe("routed reply");
    expect(result.providerId).toBe("primary");
  });

  it("ModelRouter.route ignores LLM_HTTP_ENDPOINT when an explicit caller is provided", async () => {
    process.env.LLM_HTTP_ENDPOINT = "http://llm.internal/generate";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const router = new ModelRouter({ providers: [provider], failoverEnabled: true }, async (p, request) => ({
      providerId: p.id,
      content: `explicit:${request.prompt}`,
      tokensUsed: 1,
    }));
    const result = await router.route({ prompt: "hello" });
    expect(result.content).toBe("explicit:hello");
    expect(fetchMock).not.toHaveBeenCalled();
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
