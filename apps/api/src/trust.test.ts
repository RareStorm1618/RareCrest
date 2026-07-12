import { describe, expect, it, vi } from "vitest";
import { deriveActivationControls, isVerifiedDirector } from "./trust.js";
import type { DatabaseClient } from "@rarecrest/db";

function mockDb(handlers: Record<string, unknown[]>): DatabaseClient {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("permission_envelope_audits")) {
        return { rows: handlers.envelope ?? [] };
      }
      if (sql.includes("evaluation_runs")) {
        return { rows: handlers.evaluation ?? [] };
      }
      if (sql.includes("human_review_queue")) {
        return { rows: handlers.reviews ?? [{ count: "0" }] };
      }
      if (sql.includes("agent_roster")) {
        return { rows: handlers.roster ?? [] };
      }
      if (sql.includes("kill_switches")) {
        return { rows: handlers.kill ?? [] };
      }
      return { rows: [] };
    }),
  } as unknown as DatabaseClient;
}

describe("deriveActivationControls (fail-closed)", () => {
  it("denies hardRuleClear without deployable envelope audit", async () => {
    const controls = await deriveActivationControls(mockDb({}), "e1", "a1");
    expect(controls.hardRuleClear).toBe(false);
    expect(controls.envelopeEnforceable).toBe(false);
    expect(controls.evaluationSuiteRegistered).toBe(false);
  });

  it("permits hardRuleClear only when latest audit is deployable and clear", async () => {
    const controls = await deriveActivationControls(
      mockDb({
        envelope: [{ id: "aud-1", hard_rule_clear: true, deployable: true }],
        evaluation: [{ id: "eval-1", created_at: new Date().toISOString(), drift_detected: false }],
      }),
      "e1",
      "a1",
    );
    expect(controls.hardRuleClear).toBe(true);
    expect(controls.envelopeEnforceable).toBe(true);
    expect(controls.evaluationSuiteRegistered).toBe(true);
    expect(controls.source.latestEnvelopeAuditId).toBe("aud-1");
  });

  it("denies evaluationSuiteRegistered when the latest run is stale (>30 days)", async () => {
    const stale = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const controls = await deriveActivationControls(
      mockDb({
        envelope: [{ id: "aud-1", hard_rule_clear: true, deployable: true }],
        evaluation: [{ id: "eval-1", created_at: stale, drift_detected: false }],
      }),
      "e1",
      "a1",
    );
    expect(controls.evaluationSuiteRegistered).toBe(false);
  });

  it("clears hardRuleClear when durable kill switch is armed", async () => {
    const controls = await deriveActivationControls(
      mockDb({
        envelope: [{ id: "aud-1", hard_rule_clear: true, deployable: true }],
        evaluation: [{ id: "eval-1", created_at: new Date().toISOString(), drift_detected: false }],
        kill: [{ state: "armed" }],
      }),
      "e1",
      "a1",
    );
    expect(controls.hardRuleClear).toBe(false);
    expect(controls.source.killSwitchArmed).toBe(true);
    expect(controls.source.killSwitchState).toBe("armed");
  });

  it("blocks activation when open human reviews exist for the entity", async () => {
    const controls = await deriveActivationControls(
      mockDb({
        envelope: [{ id: "aud-1", hard_rule_clear: true, deployable: true }],
        evaluation: [{ id: "eval-1", created_at: new Date().toISOString(), drift_detected: false }],
        reviews: [{ count: "2" }],
      }),
      "e1",
      "a1",
    );
    expect(controls.hardRuleClear).toBe(false);
    expect(controls.source.openHumanReviews).toBe(2);
    expect(controls.source.activationBlockedByOpenReviews).toBe(true);
  });

  it("fails closed on killSwitchesLive/humanReviewRoutingLive when the durable tables are unqueryable", async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("kill_switches") || sql.includes("human_review_queue")) {
          throw new Error("relation does not exist");
        }
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;
    const controls = await deriveActivationControls(db, "e1", "a1");
    expect(controls.killSwitchesLive).toBe(false);
    expect(controls.humanReviewRoutingLive).toBe(false);
  });
});

describe("isVerifiedDirector", () => {
  it("allows header director only in AUTH_TRUST_MODE=dev", () => {
    process.env.AUTH_TRUST_MODE = "dev";
    expect(
      isVerifiedDirector(
        { userId: "u1", vertical: "rareangels", authMethod: "header", role: "director" },
        { "x-user-role": "director" },
      ),
    ).toBe(true);
  });

  it("requires OIDC holding director outside dev", () => {
    process.env.AUTH_TRUST_MODE = "strict";
    expect(
      isVerifiedDirector(
        { userId: "u1", vertical: "holding", authMethod: "header", role: "director" },
        { "x-user-role": "director" },
      ),
    ).toBe(false);
    expect(
      isVerifiedDirector(
        { userId: "u1", vertical: "holding", authMethod: "oidc", role: "director" },
        {},
      ),
    ).toBe(true);
  });
});
