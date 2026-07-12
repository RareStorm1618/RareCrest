import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@rarecrest/db";
import {
  assertDbRateLimit,
  assertMemoryRateLimit,
  RateLimitError,
  resetMemoryRateLimits,
} from "./services/rate-limit.js";
import { isKnownAppRole, roleAllows, type GatedAction } from "./rbac.js";
import {
  getObservabilityCounters,
  recordAuthFailure,
  recordKillSwitchEvent,
  recordPhiDecrypt,
  recordRbacDenial,
  recordRpcUnauthorized,
  renderMetricsText,
  resetObservabilityCounters,
} from "./observability.js";

/**
 * Wave 3 + Wave 4 apex tests: Postgres-backed rate limits (memory fallback path),
 * the multi-director RBAC action matrix, and the /metrics observability counters.
 */

describe("rate-limit helper — memory fallback (Wave 3)", () => {
  beforeEach(() => {
    resetMemoryRateLimits();
  });

  it("assertMemoryRateLimit allows up to max, then throws RateLimitError", () => {
    const key = `test:${Math.random()}`;
    expect(() => assertMemoryRateLimit(key, 2, 60_000)).not.toThrow();
    expect(() => assertMemoryRateLimit(key, 2, 60_000)).not.toThrow();
    expect(() => assertMemoryRateLimit(key, 2, 60_000)).toThrow(RateLimitError);
  });

  it("assertMemoryRateLimit resets the bucket once the window elapses", () => {
    const key = `test:${Math.random()}`;
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(0);
    assertMemoryRateLimit(key, 1, 1_000);
    expect(() => assertMemoryRateLimit(key, 1, 1_000)).toThrow(RateLimitError);
    nowSpy.mockReturnValue(2_000);
    expect(() => assertMemoryRateLimit(key, 1, 1_000)).not.toThrow();
    nowSpy.mockRestore();
  });

  it("assertDbRateLimit falls back to memory when no db is supplied", async () => {
    const key = `test:${Math.random()}`;
    await expect(assertDbRateLimit(undefined, key, 1, 60_000)).resolves.toBeUndefined();
    await expect(assertDbRateLimit(undefined, key, 1, 60_000)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("assertDbRateLimit falls back to memory when the api_rate_limits table is unavailable", async () => {
    const key = `test:${Math.random()}`;
    const db = {
      query: vi.fn().mockRejectedValue(new Error('relation "rarecrest.api_rate_limits" does not exist')),
    } as unknown as DatabaseClient;

    await expect(assertDbRateLimit(db, key, 1, 60_000)).resolves.toBeUndefined();
    // Second call still hits the failing db, still falls back to memory, and the memory
    // bucket (shared key) is now over budget.
    await expect(assertDbRateLimit(db, key, 1, 60_000)).rejects.toBeInstanceOf(RateLimitError);
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it("assertDbRateLimit enforces the limit when the db query succeeds", async () => {
    const key = `test:${Math.random()}`;
    let count = 0;
    const db = {
      query: vi.fn().mockImplementation(async () => {
        count += 1;
        return { rows: [{ count }] };
      }),
    } as unknown as DatabaseClient;

    await expect(assertDbRateLimit(db, key, 2, 60_000)).resolves.toBeUndefined();
    await expect(assertDbRateLimit(db, key, 2, 60_000)).resolves.toBeUndefined();
    await expect(assertDbRateLimit(db, key, 2, 60_000)).rejects.toBeInstanceOf(RateLimitError);
  });
});

describe("RBAC action matrix (Wave 4)", () => {
  const cases: Array<[GatedAction, string, boolean]> = [
    ["kill_switch", "director", true],
    ["kill_switch", "operator", true],
    ["kill_switch", "admin", true],
    ["kill_switch", "clinician", false],
    ["kill_switch", "agent", false],
    ["phi_decrypt", "director", true],
    ["phi_decrypt", "clinician", true],
    ["phi_decrypt", "compliance_officer", true],
    ["phi_decrypt", "operator", false],
    ["phi_decrypt", "agent", false],
    ["vault_package", "director", true],
    ["vault_package", "operator", false],
    ["vault_package", "admin", false],
    ["promote", "director", true],
    ["promote", "admin", true],
    ["promote", "operator", false],
    ["export", "director", true],
    ["export", "operator", true],
    ["export", "compliance_officer", true],
    ["export", "admin", true],
    ["export", "clinician", false],
  ];

  it.each(cases)("roleAllows(%s action, role=%s) -> %s", (action, role, expected) => {
    expect(roleAllows(role, action)).toBe(expected);
  });

  it("denies every action for an undefined role (fail-closed)", () => {
    const actions: GatedAction[] = ["kill_switch", "phi_decrypt", "vault_package", "promote", "export"];
    for (const action of actions) {
      expect(roleAllows(undefined, action)).toBe(false);
    }
  });

  it("denies every action for an unknown role string (fail-closed)", () => {
    const actions: GatedAction[] = ["kill_switch", "phi_decrypt", "vault_package", "promote", "export"];
    for (const action of actions) {
      expect(roleAllows("not-a-real-role", action)).toBe(false);
    }
  });

  it("isKnownAppRole recognizes valid roles and rejects garbage", () => {
    expect(isKnownAppRole("director")).toBe(true);
    expect(isKnownAppRole("admin")).toBe(true);
    expect(isKnownAppRole("not-a-real-role")).toBe(false);
    expect(isKnownAppRole(undefined)).toBe(false);
  });
});

describe("observability counters (Wave 4)", () => {
  beforeEach(() => {
    resetObservabilityCounters();
  });

  it("starts at zero for every counter", () => {
    const counters = getObservabilityCounters();
    expect(counters.rpcUnauthorizedTotal).toBe(0);
    expect(counters.phiDecryptTotal).toEqual({ allowed: 0, denied: 0 });
    expect(counters.killSwitchEventsTotal).toEqual({ arm: 0, trigger: 0, disarm: 0 });
    expect(counters.authFailuresTotal).toBe(0);
    expect(counters.rbacDenialsTotal).toEqual({});
  });

  it("increments each counter independently", () => {
    recordRpcUnauthorized();
    recordRpcUnauthorized();
    recordPhiDecrypt("allowed");
    recordPhiDecrypt("denied");
    recordPhiDecrypt("denied");
    recordKillSwitchEvent("arm");
    recordKillSwitchEvent("trigger");
    recordKillSwitchEvent("disarm");
    recordAuthFailure();
    recordRbacDenial("kill_switch");
    recordRbacDenial("kill_switch");
    recordRbacDenial("phi_decrypt");

    const counters = getObservabilityCounters();
    expect(counters.rpcUnauthorizedTotal).toBe(2);
    expect(counters.phiDecryptTotal).toEqual({ allowed: 1, denied: 2 });
    expect(counters.killSwitchEventsTotal).toEqual({ arm: 1, trigger: 1, disarm: 1 });
    expect(counters.authFailuresTotal).toBe(1);
    expect(counters.rbacDenialsTotal).toEqual({ kill_switch: 2, phi_decrypt: 1 });
  });

  it("renderMetricsText produces Prometheus-ish exposition reflecting current counts", () => {
    recordKillSwitchEvent("trigger");
    recordPhiDecrypt("denied");
    recordAuthFailure();
    recordRbacDenial("vault_package");

    const text = renderMetricsText();
    expect(text).toContain("# TYPE rarecrest_kill_switch_events_total counter");
    expect(text).toContain('rarecrest_kill_switch_events_total{action="trigger"} 1');
    expect(text).toContain('rarecrest_phi_decrypt_total{outcome="denied"} 1');
    expect(text).toContain("rarecrest_auth_failures_total 1");
    expect(text).toContain('rarecrest_rbac_denials_total{action="vault_package"} 1');
  });

  it("resetObservabilityCounters clears all counters back to zero", () => {
    recordRpcUnauthorized();
    recordPhiDecrypt("allowed");
    recordKillSwitchEvent("arm");
    recordAuthFailure();
    recordRbacDenial("export");
    resetObservabilityCounters();
    expect(getObservabilityCounters()).toEqual({
      rpcUnauthorizedTotal: 0,
      phiDecryptTotal: { allowed: 0, denied: 0 },
      killSwitchEventsTotal: { arm: 0, trigger: 0, disarm: 0 },
      authFailuresTotal: 0,
      rbacDenialsTotal: {},
    });
  });
});
