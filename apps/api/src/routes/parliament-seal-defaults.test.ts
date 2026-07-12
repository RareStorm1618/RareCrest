import Fastify from "fastify";
import { describe, expect, it, vi, afterEach } from "vitest";
import type { DatabaseClient } from "@rarecrest/db";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import type { AuthContext } from "../auth.js";
import { registerParliamentRoutes } from "./parliament-routes.js";

/**
 * EXO Wave A — `POST /api/v1/parliament/:id/seal` defaults: a `financial_release` session
 * omitting `mode` defaults to `time_lock` with `executeAfterHours` from `FINANCIAL_SEAL_HOURS`
 * (default 4); every other stake_class still requires `mode` explicitly.
 */

const ENTITY_ID = "12121212-1212-4212-8212-121212121212";
const SESSION_ID = "34343434-3434-4434-8434-343434343434";

const DIRECTOR_AUTH: AuthContext = {
  userId: "director-1",
  vertical: "holding",
  authMethod: "header",
  role: "director",
};

function mockIntelligence(): IntelligenceClient {
  return { appendTrace: vi.fn(async () => undefined) } as unknown as IntelligenceClient;
}

interface FakeSession {
  id: string;
  entityId: string;
  stakeClass: string;
  status: string;
}

function mockDb(session: FakeSession, capturedSealParams: { value?: unknown[] }): DatabaseClient {
  return {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("FROM rarecrest.entities WHERE id")) {
        return { rows: [{ id: ENTITY_ID, name: "Test Entity", vertical: "holding" }] };
      }
      if (sql.includes("FROM rarecrest.parliament_sessions WHERE id")) {
        return { rows: [{ ...session, createdBy: "director-a", redTeamNay: false, createdAt: "now", updatedAt: "now" }] };
      }
      if (sql.includes("INSERT INTO rarecrest.seals")) {
        capturedSealParams.value = params;
        return {
          rows: [
            {
              id: "seal-1",
              sessionId: params[0],
              sealedBy: params[1],
              sealedAt: new Date().toISOString(),
              mode: params[2],
              executeAfter: params[3],
              cancelledAt: null,
              executedAt: params[4],
              humanInstructionId: params[5],
              overrideNote: params[6],
              correlationId: params[7],
              payload: JSON.parse(params[8] as string),
              effectDigest: (params[9] as string | null) ?? null,
            },
          ],
        };
      }
      if (sql.includes("UPDATE rarecrest.parliament_sessions") && sql.includes("status = 'sealed'")) {
        session.status = "sealed";
        return { rows: [] };
      }
      return { rows: [] };
    }),
  } as unknown as DatabaseClient;
}

function buildApp(auth: AuthContext, db: DatabaseClient, intelligence: IntelligenceClient) {
  const app = Fastify();
  app.addHook("preHandler", async (request) => {
    request.auth = auth;
  });
  registerParliamentRoutes(app, db, intelligence);
  return app;
}

describe("POST /api/v1/parliament/:id/seal — mode defaults", () => {
  const ORIGINAL_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("defaults financial_release to time_lock with FINANCIAL_SEAL_HOURS (default 4) when mode is omitted", async () => {
    delete process.env.FINANCIAL_SEAL_HOURS;
    const session: FakeSession = { id: SESSION_ID, entityId: ENTITY_ID, stakeClass: "financial_release", status: "ready_for_seal" };
    const captured: { value?: unknown[] } = {};
    const app = buildApp(DIRECTOR_AUTH, mockDb(session, captured), mockIntelligence());
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/parliament/${SESSION_ID}/seal`,
      payload: {},
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { mode: string; executeAfter: string | null };
    expect(body.mode).toBe("time_lock");
    expect(body.executeAfter).not.toBeNull();
    const executeAfterMs = new Date(body.executeAfter as string).getTime() - Date.now();
    expect(executeAfterMs).toBeGreaterThan(3.9 * 3600_000);
    expect(executeAfterMs).toBeLessThan(4.1 * 3600_000);
    await app.close();
  });

  it("honors a custom FINANCIAL_SEAL_HOURS override", async () => {
    process.env.FINANCIAL_SEAL_HOURS = "8";
    const session: FakeSession = { id: SESSION_ID, entityId: ENTITY_ID, stakeClass: "financial_release", status: "ready_for_seal" };
    const captured: { value?: unknown[] } = {};
    const app = buildApp(DIRECTOR_AUTH, mockDb(session, captured), mockIntelligence());
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/parliament/${SESSION_ID}/seal`,
      payload: {},
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { executeAfter: string | null };
    const executeAfterMs = new Date(body.executeAfter as string).getTime() - Date.now();
    expect(executeAfterMs).toBeGreaterThan(7.9 * 3600_000);
    expect(executeAfterMs).toBeLessThan(8.1 * 3600_000);
    await app.close();
  });

  it("requires mode explicitly for non-financial_release stake classes", async () => {
    const session: FakeSession = { id: SESSION_ID, entityId: ENTITY_ID, stakeClass: "wiki_promote", status: "ready_for_seal" };
    const captured: { value?: unknown[] } = {};
    const app = buildApp(DIRECTOR_AUTH, mockDb(session, captured), mockIntelligence());
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/parliament/${SESSION_ID}/seal`,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("stores an optional effectDigest on the seal", async () => {
    const session: FakeSession = { id: SESSION_ID, entityId: ENTITY_ID, stakeClass: "wiki_promote", status: "ready_for_seal" };
    const captured: { value?: unknown[] } = {};
    const app = buildApp(DIRECTOR_AUTH, mockDb(session, captured), mockIntelligence());
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/parliament/${SESSION_ID}/seal`,
      payload: { mode: "immediate", effectDigest: "digest-xyz" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { effectDigest: string | null };
    expect(body.effectDigest).toBe("digest-xyz");
    await app.close();
  });
});
