import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { IntelligenceClient } from "./index.js";

describe("IntelligenceClient (WO-8)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("appends decision traces via RPC", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "trace-1",
          entityId: "e1",
          vertical: "rareangels",
          action: "hard_rule_check",
          verdict: "allow",
          payload: {},
          createdAt: "now",
          retentionRegime: "hipaa-7yr",
        }),
        { status: 200 },
      ),
    );
    const client = new IntelligenceClient({ baseUrl: "http://intel:3002" });
    const entry = await client.appendTrace({
      entityId: "e1",
      vertical: "rareangels",
      action: "hard_rule_check",
      verdict: "allow",
      payload: { allowed: true },
    });
    expect(entry.id).toBe("trace-1");
  });

  it("throws when intelligence RPC fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
    const client = new IntelligenceClient({ baseUrl: "http://intel:3002" });
    await expect(
      client.score({
        entityId: "e1",
        vertical: "rareangels",
        dimensions: [{ name: "governance", value: 4, weight: 1 }],
      }),
    ).rejects.toThrow("Intelligence RPC failed");
  });
});
