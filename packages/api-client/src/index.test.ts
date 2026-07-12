import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ApiClientError, RareCrestApiClient } from "./index.js";

describe("RareCrestApiClient (WO-20)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends auth headers from config", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    const client = new RareCrestApiClient({
      baseUrl: "http://api:3000",
      getHeaders: () => ({ "x-vertical": "rareangels", "x-entity-id": "e1" }),
    });
    await client.health();
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init?.headers as Record<string, string>)["x-vertical"]).toBe("rareangels");
  });

  it("throws ApiClientError with field errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: "Validation failed",
          errors: [{ field: "name", code: "too_small", message: "Required" }],
        }),
        { status: 400 },
      ),
    );
    const client = new RareCrestApiClient({
      baseUrl: "http://api:3000",
      getHeaders: () => ({}),
    });
    await expect(client.createEntity({ name: "", vertical: "rareangels", tenancyKey: "t" })).rejects.toBeInstanceOf(
      ApiClientError,
    );
  });
});
