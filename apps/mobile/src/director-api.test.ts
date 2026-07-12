import { describe, expect, it, vi } from "vitest";
import { createDirectorApi, defaultSealMode, DirectorApiError } from "./director-api.js";

describe("defaultSealMode", () => {
  it("time-locks financial releases and seals other stake classes immediately", () => {
    expect(defaultSealMode("financial_release")).toBe("time_lock");
    expect(defaultSealMode("activation")).toBe("immediate");
    expect(defaultSealMode("wiki_promote")).toBe("immediate");
    expect(defaultSealMode("doctrine")).toBe("immediate");
  });
});

describe("createDirectorApi", () => {
  it("loads the command dashboard shape", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        queue: [{ id: "f1", entityId: "e1", signalType: "pending_high_stakes_decision", severity: "high", message: "Review", createdAt: "2026-01-01", kind: "decision" }],
        portfolioClear: false,
        governanceQueue: {
          openSessions: [],
          readyForSeal: [{ id: "s1", entityId: "e1", entityName: "E", topic: "Activate", stakeClass: "activation", status: "ready_for_seal", createdAt: "2026-01-01" }],
          sealsDue: [],
        },
      }),
    })) as unknown as typeof fetch;

    const api = createDirectorApi({
      baseUrl: "http://localhost:3000",
      headers: { "x-user-id": "director-1" },
      fetchImpl,
    });
    const dash = await api.loadDashboard();
    expect(dash.queue).toHaveLength(1);
    expect(dash.governanceQueue.readyForSeal[0].id).toBe("s1");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/command/dashboard",
      expect.objectContaining({ headers: expect.objectContaining({ "x-user-id": "director-1" }) }),
    );
  });

  it("resolves an attention flag", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ resolved: true, flagId: "f1" }),
    })) as unknown as typeof fetch;
    const api = createDirectorApi({ baseUrl: "http://x", headers: {}, fetchImpl });
    await api.resolveAttention("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "f1");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://x/api/v1/entities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/attention-flags/f1/resolve",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("seals parliament with the stake-class default mode", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.mode).toBe("time_lock");
      return { ok: true, json: async () => ({ id: "seal-1", mode: "time_lock" }) };
    }) as unknown as typeof fetch;
    const api = createDirectorApi({ baseUrl: "http://x", headers: {}, fetchImpl });
    await api.sealParliament("session-1", "financial_release");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://x/api/v1/parliament/session-1/seal",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("arms / triggers / disarms kill switch with a reason", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(String(url));
      return { ok: true, json: async () => ({ entityId: "e1", state: "armed" }) };
    }) as unknown as typeof fetch;
    const api = createDirectorApi({ baseUrl: "http://x", headers: {}, fetchImpl });
    await api.armKillSwitch("e1", "margin breach");
    await api.triggerKillSwitch("e1", "margin breach");
    await api.disarmKillSwitch("e1", "cleared");
    expect(calls[0]).toContain("/arm");
    expect(calls[1]).toContain("/trigger");
    expect(calls[2]).toContain("/disarm");
  });

  it("throws DirectorApiError on non-OK responses", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ message: "verified director required" }),
    })) as unknown as typeof fetch;
    const api = createDirectorApi({ baseUrl: "http://x", headers: {}, fetchImpl });
    await expect(api.sealParliament("s1", "activation")).rejects.toBeInstanceOf(DirectorApiError);
    await expect(api.sealParliament("s1", "activation")).rejects.toMatchObject({
      status: 403,
      message: "verified director required",
    });
  });
});
