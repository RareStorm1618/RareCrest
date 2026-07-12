import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@rarecrest/db";
import type { GovernanceClient } from "@rarecrest/governance-client";
import type { AuthContext } from "./auth.js";
import { deriveActivationControls, isVerifiedDirector } from "./trust.js";
import { mapRouteError } from "./errors.js";
import {
  assertLivePassport,
  requireHumanInstruction,
  attachCorrelationId,
  PolicyGatewayError,
} from "./policy/index.js";
import { registerKillSwitchRoutes } from "./routes/kill-switch-routes.js";
import { KillSwitchError, KillSwitchService } from "./services/kill-switch.js";
import { WikiService } from "./services/wiki.js";
import { MockWebSearchProvider } from "./services/web-search.js";
import { classifyWikiPrincipal, assertWikiVerbAllowed } from "@rarecrest/wiki";

/**
 * Wave 1 — Continuous agent governance adversarial matrix.
 *
 * Covers: durable human-instruction ledger (requireHumanInstruction), agent
 * passport liveness (assertLivePassport), director-only kill-switch RBAC,
 * activation blocking on open human reviews, canon wiki immutability, and
 * the agent promote-verb bound. Every case here documents a fail-closed
 * boundary — the assertion is that missing/expired/wrong-actor evidence is
 * denied, never silently allowed.
 */

const ENTITY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_ENTITY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function buildAppWithAuth(auth: AuthContext) {
  const app = Fastify();
  app.addHook("preHandler", async (request) => {
    request.auth = auth;
  });
  app.setErrorHandler((error, _request, reply) => {
    const mapped = mapRouteError(error);
    if (mapped) return reply.status(mapped.status).send(mapped.body);
    reply.status(500).send({ message: "Internal server error" });
  });
  return app;
}

describe("requireHumanInstruction — fail-closed on missing/expired/revoked", () => {
  function mockInstructionDb(row: Record<string, unknown> | null): DatabaseClient {
    return {
      query: vi.fn(async () => ({ rows: row ? [row] : [] })),
    } as unknown as DatabaseClient;
  }

  it("rejects a missing humanInstructionId", async () => {
    await expect(
      requireHumanInstruction(mockInstructionDb(null), "", ENTITY_ID),
    ).rejects.toMatchObject({ statusCode: 403, code: "HUMAN_INSTRUCTION_MISSING" });
  });

  it("rejects when the instruction row does not exist", async () => {
    await expect(
      requireHumanInstruction(mockInstructionDb(null), "instr-1", ENTITY_ID),
    ).rejects.toMatchObject({ statusCode: 403, code: "HUMAN_INSTRUCTION_NOT_FOUND" });
  });

  it("rejects an expired instruction", async () => {
    const db = mockInstructionDb({
      id: "instr-1",
      entity_id: ENTITY_ID,
      vertical: "rareangels",
      actor_id: "director-a",
      action_scope: "financial_release",
      instruction: "release funds",
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      revoked_at: null,
    });
    await expect(requireHumanInstruction(db, "instr-1", ENTITY_ID)).rejects.toMatchObject({
      statusCode: 403,
      code: "HUMAN_INSTRUCTION_EXPIRED",
    });
  });

  it("rejects a revoked instruction even if not yet expired", async () => {
    const db = mockInstructionDb({
      id: "instr-1",
      entity_id: ENTITY_ID,
      vertical: "rareangels",
      actor_id: "director-a",
      action_scope: "financial_release",
      instruction: "release funds",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      revoked_at: new Date().toISOString(),
    });
    await expect(requireHumanInstruction(db, "instr-1", ENTITY_ID)).rejects.toMatchObject({
      statusCode: 403,
      code: "HUMAN_INSTRUCTION_REVOKED",
    });
  });

  it("rejects an instruction that belongs to a different entity (IDOR)", async () => {
    const db = mockInstructionDb({
      id: "instr-1",
      entity_id: OTHER_ENTITY_ID,
      vertical: "rareangels",
      actor_id: "director-a",
      action_scope: "financial_release",
      instruction: "release funds",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      revoked_at: null,
    });
    await expect(requireHumanInstruction(db, "instr-1", ENTITY_ID)).rejects.toMatchObject({
      statusCode: 403,
      code: "HUMAN_INSTRUCTION_ENTITY_MISMATCH",
    });
  });

  it("accepts a live, unexpired, unrevoked instruction for the correct entity", async () => {
    const db = mockInstructionDb({
      id: "instr-1",
      entity_id: ENTITY_ID,
      vertical: "rareangels",
      actor_id: "director-a",
      action_scope: "financial_release",
      instruction: "release funds",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      revoked_at: null,
    });
    const result = await requireHumanInstruction(db, "instr-1", ENTITY_ID);
    expect(result.id).toBe("instr-1");
    expect(result.entityId).toBe(ENTITY_ID);
  });
});

describe("assertLivePassport — fail-closed on missing/expired/not-clear", () => {
  function mockPassportDb(row: Record<string, unknown> | null): DatabaseClient {
    return {
      query: vi.fn(async () => ({ rows: row ? [row] : [] })),
    } as unknown as DatabaseClient;
  }

  it("rejects when no passport has been issued", async () => {
    await expect(
      assertLivePassport(mockPassportDb(null), { entityId: ENTITY_ID, agentId: "agent-1" }),
    ).rejects.toMatchObject({ statusCode: 403, code: "PASSPORT_MISSING" });
  });

  it("rejects a passport that was not hard-rule-clear at issuance", async () => {
    const db = mockPassportDb({
      id: "p1",
      agent_id: "agent-1",
      entity_id: ENTITY_ID,
      rights: [],
      risk_tier: "low",
      valid_until: new Date(Date.now() + 60_000).toISOString(),
      hard_rule_clear: false,
    });
    await expect(
      assertLivePassport(db, { entityId: ENTITY_ID, agentId: "agent-1" }),
    ).rejects.toMatchObject({ statusCode: 403, code: "PASSPORT_NOT_CLEAR" });
  });

  it("rejects an expired passport even if it was hard-rule-clear at issuance", async () => {
    const db = mockPassportDb({
      id: "p1",
      agent_id: "agent-1",
      entity_id: ENTITY_ID,
      rights: ["sensitive_data"],
      risk_tier: "low",
      valid_until: new Date(Date.now() - 60_000).toISOString(),
      hard_rule_clear: true,
    });
    await expect(
      assertLivePassport(db, { entityId: ENTITY_ID, agentId: "agent-1" }),
    ).rejects.toMatchObject({ statusCode: 403, code: "PASSPORT_EXPIRED" });
  });

  it("accepts a hard-rule-clear, unexpired passport and returns its rights", async () => {
    const db = mockPassportDb({
      id: "p1",
      agent_id: "agent-1",
      entity_id: ENTITY_ID,
      rights: ["sensitive_data"],
      risk_tier: "low",
      valid_until: new Date(Date.now() + 60_000).toISOString(),
      hard_rule_clear: true,
    });
    const result = await assertLivePassport(db, { entityId: ENTITY_ID, agentId: "agent-1" });
    expect(result.rights).toEqual(["sensitive_data"]);
    expect(result.hardRuleClear).toBe(true);
  });
});

describe("attachCorrelationId", () => {
  it("mints a fresh id when none is supplied", () => {
    const id = attachCorrelationId(undefined);
    expect(id.length).toBeGreaterThan(0);
  });

  it("reuses a supplied non-empty id", () => {
    expect(attachCorrelationId("req-123")).toBe("req-123");
  });

  it("mints fresh ids that are not equal to each other", () => {
    expect(attachCorrelationId(undefined)).not.toBe(attachCorrelationId(undefined));
  });
});

describe("isVerifiedDirector required for kill-switch escalation (route RBAC)", () => {
  function mockEntityDb(): DatabaseClient {
    return {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM rarecrest.entities")) {
          return { rows: [{ id: ENTITY_ID, name: "Entity", vertical: "rareangels" }] };
        }
        if (sql.includes("FROM rarecrest.kill_switches")) {
          return { rows: [] };
        }
        return { rows: [], rowCount: 0 };
      }),
    } as unknown as DatabaseClient;
  }

  function mockGovernance(): GovernanceClient {
    return {
      armKillSwitch: vi.fn(async () => ({})),
      triggerKillSwitch: vi.fn(async () => ({})),
      disarmKillSwitch: vi.fn(async () => ({})),
    } as unknown as GovernanceClient;
  }

  it("403s arm for a non-director actor", async () => {
    const app = buildAppWithAuth({ userId: "u1", vertical: "rareangels", authMethod: "header" });
    registerKillSwitchRoutes(app, mockEntityDb(), mockGovernance());
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/runtime/kill-switch/${ENTITY_ID}/arm`,
      payload: { reason: "suspicious drift" },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("403s trigger for a non-director actor", async () => {
    const app = buildAppWithAuth({ userId: "u1", vertical: "rareangels", authMethod: "header" });
    registerKillSwitchRoutes(app, mockEntityDb(), mockGovernance());
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/runtime/kill-switch/${ENTITY_ID}/trigger`,
      payload: { reason: "halt now" },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("403s disarm for a non-director actor", async () => {
    const app = buildAppWithAuth({ userId: "u1", vertical: "rareangels", authMethod: "header" });
    registerKillSwitchRoutes(app, mockEntityDb(), mockGovernance());
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/runtime/kill-switch/${ENTITY_ID}/disarm`,
      payload: { reason: "resolved" },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("allows arm for a verified director", async () => {
    const app = buildAppWithAuth({
      userId: "u1",
      vertical: "rareangels",
      authMethod: "header",
      role: "director",
    });
    registerKillSwitchRoutes(app, mockEntityDb(), mockGovernance());
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/runtime/kill-switch/${ENTITY_ID}/arm`,
      payload: { reason: "suspicious drift" },
    });
    expect(response.statusCode).toBe(201);
    await app.close();
  });

  it("GET status does not require a director", async () => {
    const app = buildAppWithAuth({ userId: "u1", vertical: "rareangels", authMethod: "header" });
    registerKillSwitchRoutes(app, mockEntityDb(), mockGovernance());
    await app.ready();
    const response = await app.inject({ method: "GET", url: `/api/v1/runtime/kill-switch/${ENTITY_ID}` });
    expect(response.statusCode).toBe(200);
    await app.close();
  });
});

describe("KillSwitchService.disarm — dual-control in strict mode", () => {
  afterEach(() => {
    delete process.env.AUTH_TRUST_MODE;
  });

  it("rejects same-actor disarm when that actor armed the switch", async () => {
    process.env.AUTH_TRUST_MODE = "strict";
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM rarecrest.kill_switches")) {
          return {
            rows: [
              {
                entityId: ENTITY_ID,
                state: "armed",
                armedBy: "director-a",
                armedAt: "now",
                armedReason: "watch",
                triggeredBy: null,
                triggeredAt: null,
                triggeredReason: null,
              },
            ],
          };
        }
        return { rows: [], rowCount: 0 };
      }),
    } as unknown as DatabaseClient;
    const service = new KillSwitchService(db);
    await expect(
      service.disarm({ entityId: ENTITY_ID, actorId: "director-a", reason: "resolved" }),
    ).rejects.toBeInstanceOf(KillSwitchError);
  });
});

describe("deriveActivationControls blocks activation on open human reviews", () => {
  function mockDb(handlers: Record<string, unknown[]>): DatabaseClient {
    return {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("permission_envelope_audits")) return { rows: handlers.envelope ?? [] };
        if (sql.includes("evaluation_runs")) return { rows: handlers.evaluation ?? [] };
        if (sql.includes("human_review_queue")) return { rows: handlers.reviews ?? [{ count: "0" }] };
        if (sql.includes("agent_roster")) return { rows: handlers.roster ?? [] };
        if (sql.includes("kill_switches")) return { rows: handlers.kill ?? [] };
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;
  }

  it("sets hardRuleClear=false and activationBlockedByOpenReviews=true when reviews are pending", async () => {
    const controls = await deriveActivationControls(
      mockDb({
        envelope: [{ id: "aud-1", hard_rule_clear: true, deployable: true }],
        evaluation: [{ id: "eval-1", created_at: new Date().toISOString(), drift_detected: false }],
        reviews: [{ count: "3" }],
      }),
      ENTITY_ID,
      "agent-1",
    );
    expect(controls.hardRuleClear).toBe(false);
    expect(controls.source.openHumanReviews).toBe(3);
    expect(controls.source.activationBlockedByOpenReviews).toBe(true);
  });

  it("permits activation when there are zero open reviews and everything else is clear", async () => {
    const controls = await deriveActivationControls(
      mockDb({
        envelope: [{ id: "aud-1", hard_rule_clear: true, deployable: true }],
        evaluation: [{ id: "eval-1", created_at: new Date().toISOString(), drift_detected: false }],
        reviews: [{ count: "0" }],
      }),
      ENTITY_ID,
      "agent-1",
    );
    expect(controls.hardRuleClear).toBe(true);
    expect(controls.source.activationBlockedByOpenReviews).toBe(false);
  });
});

describe("WikiService — canon overwrite still 403 without break-glass", () => {
  function mockWikiDb(existingStatus: string | null): DatabaseClient {
    return {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT status FROM rarecrest.wiki_pages")) {
          return { rows: existingStatus ? [{ status: existingStatus }] : [] };
        }
        if (sql.includes("INSERT INTO rarecrest.wiki_pages")) {
          return {
            rows: [{ id: "page-1", slug: "index", title: "t", pageType: "index", status: "draft", version: 2 }],
          };
        }
        if (sql.includes("wiki_links")) return { rows: [] };
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;
  }

  it("rejects an agent's attempt to silently overwrite a canon page", async () => {
    const wiki = new WikiService(mockWikiDb("canon"), { searchProvider: new MockWebSearchProvider() });
    await expect(
      wiki.upsertPage({
        namespace: "vertical/rareangels/wiki",
        vertical: "rareangels",
        slug: "index",
        title: "Wiki Index",
        pageType: "index",
        body: "agent-authored rewrite",
        frontmatter: {},
        sensitivity: "internal",
        actorId: "agent-1",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("classifyWikiPrincipal — agent promote is always denied", () => {
  it("denies promote for an agent principal even without explicit bounds override", () => {
    const principal = classifyWikiPrincipal({ role: "agent", userId: "agent-42" });
    expect(principal).toBe("agent");
    // Agents fail the blanket allow-list check before ever reaching the
    // human/director-specific promote check — both are fail-closed for agents.
    expect(() => assertWikiVerbAllowed("promote", principal)).toThrow(/denied for agents/);
  });

  it("denies promote for an unrecognized/unknown principal (fail closed)", () => {
    const principal = classifyWikiPrincipal({ role: undefined, userId: "svc-worker-1" });
    // svc- prefixed userId classifies as agent even without an explicit role.
    expect(principal).toBe("agent");
    expect(() => assertWikiVerbAllowed("promote", principal)).toThrow();
  });

  it("allows promote for a human principal", () => {
    const principal = classifyWikiPrincipal({ role: "human", userId: "u1" });
    expect(() => assertWikiVerbAllowed("promote", principal)).not.toThrow();
  });
});
