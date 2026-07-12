import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@rarecrest/db";
import type { AuthContext } from "../auth.js";
import { registerDoctrineRoutes } from "./doctrine-routes.js";

/**
 * EXO Wave A doctrine stub: `POST /api/v1/doctrine/seal-gate` proves a `doctrine`-stake
 * Parliament session is `sealed` (or auto-seals a `ready_for_seal` one inline) for the given
 * entity — no doctrine table writes yet, just the gate a future doctrine UI can key off of.
 */

const ENTITY_ID = "abababab-abab-4bab-8bab-abababababab";
const SESSION_ID = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd";

const DIRECTOR_AUTH: AuthContext = {
  userId: "director-1",
  vertical: "holding",
  authMethod: "header",
  role: "director",
};

function buildApp(auth: AuthContext, db: DatabaseClient) {
  const app = Fastify();
  app.addHook("preHandler", async (request) => {
    request.auth = auth;
  });
  registerDoctrineRoutes(app, db);
  return app;
}

interface FakeSession {
  id: string;
  entityId: string;
  stakeClass: string;
  status: string;
}

function mockDb(session: FakeSession | null): DatabaseClient {
  return {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes("FROM rarecrest.entities WHERE id")) {
        return { rows: [{ id: ENTITY_ID, name: "Test Entity", vertical: "holding" }] };
      }
      if (sql.includes("FROM rarecrest.parliament_sessions WHERE id")) {
        if (!session || session.id !== params[0]) return { rows: [] };
        return { rows: [{ ...session, createdBy: "director-a", redTeamNay: false, createdAt: "now", updatedAt: "now" }] };
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
      if (sql.includes("UPDATE rarecrest.parliament_sessions") && sql.includes("status = 'sealed'")) {
        if (session) session.status = "sealed";
        return { rows: [] };
      }
      if (sql.includes("FROM rarecrest.seals WHERE session_id")) {
        if (!session || session.status !== "sealed") return { rows: [] };
        return {
          rows: [
            {
              id: "seal-existing",
              sessionId: session.id,
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
      return { rows: [] };
    }),
  } as unknown as DatabaseClient;
}

describe("POST /api/v1/doctrine/seal-gate", () => {
  it("returns 400 for a malformed body", async () => {
    const app = buildApp(DIRECTOR_AUTH, mockDb(null));
    await app.ready();
    const response = await app.inject({ method: "POST", url: "/api/v1/doctrine/seal-gate", payload: {} });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("resolves an already-sealed doctrine session", async () => {
    const app = buildApp(
      DIRECTOR_AUTH,
      mockDb({ id: SESSION_ID, entityId: ENTITY_ID, stakeClass: "doctrine", status: "sealed" }),
    );
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/doctrine/seal-gate",
      payload: { entityId: ENTITY_ID, parliamentSessionId: SESSION_ID },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { session: { status: string }; seal: unknown };
    expect(body.session.status).toBe("sealed");
    expect(body.seal).toBeDefined();
    await app.close();
  });

  it("auto-seals a ready_for_seal doctrine session inline", async () => {
    const app = buildApp(
      DIRECTOR_AUTH,
      mockDb({ id: SESSION_ID, entityId: ENTITY_ID, stakeClass: "doctrine", status: "ready_for_seal" }),
    );
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/doctrine/seal-gate",
      payload: { entityId: ENTITY_ID, parliamentSessionId: SESSION_ID },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("refuses a session that is still open (not ready_for_seal/sealed)", async () => {
    const app = buildApp(
      DIRECTOR_AUTH,
      mockDb({ id: SESSION_ID, entityId: ENTITY_ID, stakeClass: "doctrine", status: "open" }),
    );
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/doctrine/seal-gate",
      payload: { entityId: ENTITY_ID, parliamentSessionId: SESSION_ID },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("refuses a session with a non-doctrine stake_class", async () => {
    const app = buildApp(
      DIRECTOR_AUTH,
      mockDb({ id: SESSION_ID, entityId: ENTITY_ID, stakeClass: "wiki_promote", status: "sealed" }),
    );
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/doctrine/seal-gate",
      payload: { entityId: ENTITY_ID, parliamentSessionId: SESSION_ID },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
