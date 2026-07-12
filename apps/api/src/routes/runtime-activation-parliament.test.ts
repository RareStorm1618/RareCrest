import Fastify from "fastify";
import { describe, expect, it, vi, afterEach } from "vitest";
import type { DatabaseClient } from "@rarecrest/db";
import type { GovernanceClient } from "@rarecrest/governance-client";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import type { AuthContext } from "../auth.js";
import { registerRuntimeRoutes } from "./runtime-routes.js";

/**
 * EXO Wave A — Parliament activation gate: `POST /api/v1/runtime/agents` (status="running")
 * and `POST /api/v1/runtime/rollback` (rollback-to-running) both require a `parliamentSessionId`
 * resolving to a `stake_class=activation` session whenever `parliamentRequired()` is true, the
 * same `resolveOrSealForAction` pattern already covering financial_release/wiki_promote.
 */

const ENTITY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SESSION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const AGENT_ID = "agent-alpha";

const DIRECTOR_AUTH: AuthContext = {
  userId: "director-1",
  vertical: "rareangels",
  authMethod: "header",
  role: "director",
};

function buildApp(auth: AuthContext, db: DatabaseClient, governance: GovernanceClient, intelligence: IntelligenceClient) {
  const app = Fastify();
  app.addHook("preHandler", async (request) => {
    request.auth = auth;
  });
  registerRuntimeRoutes(app, db, intelligence, governance);
  return app;
}

function mockGovernance(): GovernanceClient {
  return {
    evaluateActivation: vi.fn(async () => ({ permitted: true, missingControls: [] })),
  } as unknown as GovernanceClient;
}

function mockIntelligence(): IntelligenceClient {
  return { appendTrace: vi.fn(async () => undefined) } as unknown as IntelligenceClient;
}

interface FakeParliamentSession {
  id: string;
  entityId: string;
  stakeClass: string;
  status: string;
  redTeamNay: boolean;
}

/** Minimal fake DB covering the activation path: entity access, live passport, activation
 * controls (all clear), Parliament session resolve/seal, and the final agent_roster upsert. */
function mockRuntimeDb(options: { session?: FakeParliamentSession } = {}) {
  const calls: Array<[string, unknown[] | undefined]> = [];
  const sessions = new Map<string, FakeParliamentSession>();
  if (options.session) sessions.set(options.session.id, { ...options.session });

  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push([sql, params]);

      if (sql.includes("FROM rarecrest.entities WHERE id")) {
        return { rows: [{ id: ENTITY_ID, name: "Test Entity", vertical: "rareangels" }] };
      }
      if (sql.includes("FROM rarecrest.agent_passports")) {
        return {
          rows: [
            {
              id: "passport-1",
              agent_id: AGENT_ID,
              entity_id: ENTITY_ID,
              rights: [],
              risk_tier: "low",
              valid_until: new Date(Date.now() + 3600_000).toISOString(),
              hard_rule_clear: true,
            },
          ],
        };
      }
      if (sql.includes("FROM rarecrest.permission_envelope_audits")) {
        return { rows: [{ id: "envelope-1", hard_rule_clear: true, deployable: true }] };
      }
      if (sql.includes("FROM rarecrest.evaluation_runs")) {
        return { rows: [{ id: "eval-1", created_at: new Date().toISOString(), drift_detected: false }] };
      }
      if (sql.includes("FROM rarecrest.human_review_queue")) {
        return { rows: [{ count: "0" }] };
      }
      if (sql.includes("FROM rarecrest.agent_roster") && sql.includes("status = 'halted'")) {
        return { rows: [] };
      }
      if (sql.includes("FROM rarecrest.kill_switches")) {
        return { rows: [] };
      }
      if (sql.includes("FROM rarecrest.parliament_sessions WHERE id")) {
        const row = sessions.get(params[0] as string);
        return { rows: row ? [row] : [] };
      }
      if (sql.includes("UPDATE rarecrest.parliament_sessions") && sql.includes("status = 'sealed'")) {
        const row = sessions.get(params[0] as string);
        if (row) row.status = "sealed";
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO rarecrest.seals")) {
        return {
          rows: [
            {
              id: "seal-1",
              sessionId: params[0],
              sealedBy: params[1],
              sealedAt: new Date().toISOString(),
              mode: params[2],
              executeAfter: null,
              cancelledAt: null,
              executedAt: new Date().toISOString(),
              humanInstructionId: null,
              overrideNote: null,
              correlationId: params[7],
              payload: {},
              effectDigest: null,
            },
          ],
        };
      }
      if (sql.includes("FROM rarecrest.seals WHERE session_id")) {
        const row = sessions.get(params[0] as string);
        if (!row || row.status !== "sealed") return { rows: [] };
        return {
          rows: [
            {
              id: "seal-existing",
              sessionId: row.id,
              sealedBy: "director-a",
              sealedAt: new Date().toISOString(),
              mode: "immediate",
              executeAfter: null,
              cancelledAt: null,
              executedAt: new Date().toISOString(),
              humanInstructionId: null,
              overrideNote: null,
              correlationId: null,
              payload: {},
              effectDigest: null,
            },
          ],
        };
      }
      if (sql.includes("SELECT version FROM rarecrest.agent_roster WHERE agent_id")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO rarecrest.agent_roster")) {
        return {
          rows: [
            {
              id: "roster-1",
              agentId: AGENT_ID,
              entityId: ENTITY_ID,
              owner: "owner-1",
              status: "running",
              health: "healthy",
              version: "1.0.0",
            },
          ],
        };
      }
      if (sql.includes("INSERT INTO rarecrest.agent_rollbacks")) {
        return { rows: [{ id: "rollback-1" }] };
      }
      if (sql.includes("UPDATE rarecrest.agent_roster")) {
        return { rows: [] };
      }
      return { rows: [] };
    }),
  } as unknown as DatabaseClient;
  return { db, calls };
}

describe("POST /api/v1/runtime/agents — Parliament activation gate", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("blocks activation with 403 when parliamentRequired() and no parliamentSessionId is supplied", async () => {
    process.env.AUTH_TRUST_MODE = "strict";
    delete process.env.PARLIAMENT_REQUIRED;

    const { db, calls } = mockRuntimeDb();
    const app = buildApp(DIRECTOR_AUTH, db, mockGovernance(), mockIntelligence());
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/runtime/agents",
      payload: { agentId: AGENT_ID, entityId: ENTITY_ID, owner: "owner-1", status: "running" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ message: expect.stringContaining("parliamentSessionId") });
    expect(calls.some(([sql]) => sql.includes("INSERT INTO rarecrest.agent_roster"))).toBe(false);
    await app.close();
  });

  it("blocks activation when parliamentSessionId points at a wrong stake_class session", async () => {
    process.env.PARLIAMENT_REQUIRED = "true";

    const { db } = mockRuntimeDb({
      session: { id: SESSION_ID, entityId: ENTITY_ID, stakeClass: "wiki_promote", status: "sealed", redTeamNay: false },
    });
    const app = buildApp(DIRECTOR_AUTH, db, mockGovernance(), mockIntelligence());
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/runtime/agents",
      payload: {
        agentId: AGENT_ID,
        entityId: ENTITY_ID,
        owner: "owner-1",
        status: "running",
        parliamentSessionId: SESSION_ID,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ message: expect.stringContaining("stake_class mismatch") });
    await app.close();
  });

  it("blocks activation when the activation session is still open (not ready_for_seal/sealed)", async () => {
    process.env.PARLIAMENT_REQUIRED = "true";

    const { db } = mockRuntimeDb({
      session: { id: SESSION_ID, entityId: ENTITY_ID, stakeClass: "activation", status: "open", redTeamNay: false },
    });
    const app = buildApp(DIRECTOR_AUTH, db, mockGovernance(), mockIntelligence());
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/runtime/agents",
      payload: {
        agentId: AGENT_ID,
        entityId: ENTITY_ID,
        owner: "owner-1",
        status: "running",
        parliamentSessionId: SESSION_ID,
      },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("allows activation when parliamentSessionId resolves an already-sealed activation session", async () => {
    process.env.PARLIAMENT_REQUIRED = "true";

    const { db } = mockRuntimeDb({
      session: { id: SESSION_ID, entityId: ENTITY_ID, stakeClass: "activation", status: "sealed", redTeamNay: false },
    });
    const app = buildApp(DIRECTOR_AUTH, db, mockGovernance(), mockIntelligence());
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/runtime/agents",
      payload: {
        agentId: AGENT_ID,
        entityId: ENTITY_ID,
        owner: "owner-1",
        status: "running",
        parliamentSessionId: SESSION_ID,
      },
    });

    expect(response.statusCode).toBe(201);
    await app.close();
  });

  it("auto-seals a ready_for_seal activation session inline and allows activation", async () => {
    process.env.PARLIAMENT_REQUIRED = "true";

    const { db } = mockRuntimeDb({
      session: { id: SESSION_ID, entityId: ENTITY_ID, stakeClass: "activation", status: "ready_for_seal", redTeamNay: false },
    });
    const app = buildApp(DIRECTOR_AUTH, db, mockGovernance(), mockIntelligence());
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/runtime/agents",
      payload: {
        agentId: AGENT_ID,
        entityId: ENTITY_ID,
        owner: "owner-1",
        status: "running",
        parliamentSessionId: SESSION_ID,
      },
    });

    expect(response.statusCode).toBe(201);
    await app.close();
  });

  it("does not require parliamentSessionId when parliamentRequired() is false (dev default)", async () => {
    process.env.AUTH_TRUST_MODE = "dev";
    delete process.env.PARLIAMENT_REQUIRED;

    const { db } = mockRuntimeDb();
    const app = buildApp(DIRECTOR_AUTH, db, mockGovernance(), mockIntelligence());
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/runtime/agents",
      payload: { agentId: AGENT_ID, entityId: ENTITY_ID, owner: "owner-1", status: "running" },
    });

    expect(response.statusCode).toBe(201);
    await app.close();
  });

  it("never gates non-activation status changes on Parliament", async () => {
    process.env.AUTH_TRUST_MODE = "strict";

    const { db } = mockRuntimeDb();
    const app = buildApp(DIRECTOR_AUTH, db, mockGovernance(), mockIntelligence());
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/runtime/agents",
      payload: { agentId: AGENT_ID, entityId: ENTITY_ID, owner: "owner-1", status: "inactive" },
    });

    expect(response.statusCode).toBe(201);
    await app.close();
  });
});
