import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GovernanceClient, GovernanceRpcError } from "./index.js";

describe("GovernanceClient (WO-8)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts hard-rule checks to governance RPC", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ allowed: true, reasons: [], traceId: "t1", evaluatedAt: "now" }), {
        status: 200,
      }),
    );
    const client = new GovernanceClient({ baseUrl: "http://gov:3001" });
    const verdict = await client.checkHardRules({
      agentId: "a1",
      entityId: "00000000-0000-4000-8000-000000000001",
      vertical: "rareangels",
      requestedRights: ["sensitive_data"],
      touchesPhi: false,
      touchesFinancial: false,
      encryptionLayerPresent: true,
    });
    expect(verdict.allowed).toBe(true);
  });

  it("throws GovernanceRpcError on HTTP failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("nope", { status: 503 }));
    const client = new GovernanceClient({ baseUrl: "http://gov:3001" });
    await expect(
      client.checkHardRules({
        agentId: "a1",
        entityId: "00000000-0000-4000-8000-000000000001",
        vertical: "rareangels",
        requestedRights: [],
        touchesPhi: false,
        touchesFinancial: false,
        encryptionLayerPresent: true,
      }),
    ).rejects.toBeInstanceOf(GovernanceRpcError);
  });
});
