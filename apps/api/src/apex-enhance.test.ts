import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@rarecrest/db";
import type { AuthContext } from "./auth.js";
import { mapRouteError } from "./errors.js";
import { registerHumanInstructionRoutes } from "./routes/human-instruction-routes.js";
import { mapAgentActivity } from "./routes/command-routes.js";

/**
 * Apex enhancement pass — human-instruction CRUD (durable ledger for
 * financial/action releases) and the morning-brief agent-activity mapper.
 */

const ENTITY_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

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

interface MockDbOverrides {
  entityVertical?: string;
  entityMissing?: boolean;
  insertRow?: Record<string, unknown>;
  instructionRow?: Record<string, unknown> | null;
  updateRow?: Record<string, unknown> | null;
}

function mockDb(overrides: MockDbOverrides = {}): { db: DatabaseClient; calls: Array<[string, unknown[] | undefined]> } {
  const calls: Array<[string, unknown[] | undefined]> = [];
  const db = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      if (sql.includes("FROM rarecrest.entities")) {
        return {
          rows: overrides.entityMissing
            ? []
            : [{ id: ENTITY_ID, name: "Entity", vertical: overrides.entityVertical ?? "rareangels" }],
        };
      }
      if (sql.includes("INSERT INTO rarecrest.human_instructions")) {
        return { rows: [overrides.insertRow ?? { id: "instr-1" }] };
      }
      if (sql.includes('SELECT entity_id AS "entityId" FROM rarecrest.human_instructions')) {
        return { rows: overrides.instructionRow ? [overrides.instructionRow] : [] };
      }
      if (sql.includes("UPDATE rarecrest.human_instructions")) {
        return { rows: overrides.updateRow ? [overrides.updateRow] : [] };
      }
      return { rows: [] };
    }),
  } as unknown as DatabaseClient;
  return { db, calls };
}

const DIRECTOR_AUTH: AuthContext = {
  userId: "director-1",
  vertical: "rareangels",
  authMethod: "header",
  role: "director",
};

const AGENT_AUTH: AuthContext = {
  userId: "agent-1",
  vertical: "rareangels",
  authMethod: "header",
  role: "agent",
};

describe("POST /api/v1/human-instructions — expiry validation", () => {
  it("defaults expiresInHours to 24 when omitted", async () => {
    const { db, calls } = mockDb({
      insertRow: {
        id: "instr-1",
        entityId: ENTITY_ID,
        vertical: "rareangels",
        actorId: "director-1",
        actionScope: "financial_release",
        instruction: "release funds",
        expiresAt: "later",
        revokedAt: null,
        createdAt: "now",
      },
    });
    const app = buildAppWithAuth(DIRECTOR_AUTH);
    registerHumanInstructionRoutes(app, db);
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/human-instructions",
      payload: { entityId: ENTITY_ID, actionScope: "financial_release", instruction: "release funds" },
    });
    expect(response.statusCode).toBe(201);
    const insertCall = calls.find(([sql]) => sql.includes("INSERT INTO rarecrest.human_instructions"));
    const expiresAtParam = String(insertCall?.[1]?.[5]);
    const hoursFromNow = (new Date(expiresAtParam).getTime() - Date.now()) / 3_600_000;
    expect(hoursFromNow).toBeGreaterThan(23);
    expect(hoursFromNow).toBeLessThan(25);
    await app.close();
  });

  it("rejects expiresInHours above the 168-hour maximum", async () => {
    const { db } = mockDb();
    const app = buildAppWithAuth(DIRECTOR_AUTH);
    registerHumanInstructionRoutes(app, db);
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/human-instructions",
      payload: {
        entityId: ENTITY_ID,
        actionScope: "financial_release",
        instruction: "release funds",
        expiresInHours: 200,
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("rejects expiresInHours below 1", async () => {
    const { db } = mockDb();
    const app = buildAppWithAuth(DIRECTOR_AUTH);
    registerHumanInstructionRoutes(app, db);
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/human-instructions",
      payload: {
        entityId: ENTITY_ID,
        actionScope: "financial_release",
        instruction: "release funds",
        expiresInHours: 0,
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("accepts the maximum 168-hour expiry", async () => {
    const { db, calls } = mockDb({
      insertRow: {
        id: "instr-1",
        entityId: ENTITY_ID,
        vertical: "rareangels",
        actorId: "director-1",
        actionScope: "financial_release",
        instruction: "release funds",
        expiresAt: "later",
        revokedAt: null,
        createdAt: "now",
      },
    });
    const app = buildAppWithAuth(DIRECTOR_AUTH);
    registerHumanInstructionRoutes(app, db);
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/human-instructions",
      payload: {
        entityId: ENTITY_ID,
        actionScope: "financial_release",
        instruction: "release funds",
        expiresInHours: 168,
      },
    });
    expect(response.statusCode).toBe(201);
    const insertCall = calls.find(([sql]) => sql.includes("INSERT INTO rarecrest.human_instructions"));
    const expiresAtParam = String(insertCall?.[1]?.[5]);
    const hoursFromNow = (new Date(expiresAtParam).getTime() - Date.now()) / 3_600_000;
    expect(hoursFromNow).toBeGreaterThan(167);
    expect(hoursFromNow).toBeLessThanOrEqual(168);
    await app.close();
  });

  it("rejects creation by an agent principal (humans/directors only)", async () => {
    const { db } = mockDb();
    const app = buildAppWithAuth(AGENT_AUTH);
    registerHumanInstructionRoutes(app, db);
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/human-instructions",
      payload: { entityId: ENTITY_ID, actionScope: "financial_release", instruction: "release funds" },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("404s when the entity does not exist", async () => {
    const { db } = mockDb({ entityMissing: true });
    const app = buildAppWithAuth(DIRECTOR_AUTH);
    registerHumanInstructionRoutes(app, db);
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/human-instructions",
      payload: { entityId: ENTITY_ID, actionScope: "financial_release", instruction: "release funds" },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe("GET /api/v1/human-instructions", () => {
  it("400s when entityId is missing", async () => {
    const { db } = mockDb();
    const app = buildAppWithAuth(DIRECTOR_AUTH);
    registerHumanInstructionRoutes(app, db);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/v1/human-instructions" });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("lists non-revoked instructions after asserting entity access", async () => {
    const { db, calls } = mockDb();
    const app = buildAppWithAuth(DIRECTOR_AUTH);
    registerHumanInstructionRoutes(app, db);
    await app.ready();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/human-instructions?entityId=${ENTITY_ID}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ instructions: [] });
    const listCall = calls.find(([sql]) => sql.includes("FROM rarecrest.human_instructions") && sql.includes("SELECT id"));
    expect(listCall?.[1]).toEqual([ENTITY_ID, false]);
    await app.close();
  });
});

describe("POST /api/v1/human-instructions/:id/revoke", () => {
  it("revokes a live instruction owned by the resolved entity", async () => {
    const { db } = mockDb({
      instructionRow: { entityId: ENTITY_ID },
      updateRow: { id: "instr-1", entityId: ENTITY_ID, revokedAt: "now" },
    });
    const app = buildAppWithAuth(DIRECTOR_AUTH);
    registerHumanInstructionRoutes(app, db);
    await app.ready();
    const response = await app.inject({ method: "POST", url: "/api/v1/human-instructions/instr-1/revoke" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: "instr-1", revokedAt: "now" });
    await app.close();
  });

  it("404s when the instruction does not exist", async () => {
    const { db } = mockDb({ instructionRow: null });
    const app = buildAppWithAuth(DIRECTOR_AUTH);
    registerHumanInstructionRoutes(app, db);
    await app.ready();
    const response = await app.inject({ method: "POST", url: "/api/v1/human-instructions/missing/revoke" });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("409s when the instruction was already revoked", async () => {
    const { db } = mockDb({ instructionRow: { entityId: ENTITY_ID }, updateRow: null });
    const app = buildAppWithAuth(DIRECTOR_AUTH);
    registerHumanInstructionRoutes(app, db);
    await app.ready();
    const response = await app.inject({ method: "POST", url: "/api/v1/human-instructions/instr-1/revoke" });
    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it("rejects revoke by an agent principal (humans/directors only)", async () => {
    const { db } = mockDb({ instructionRow: { entityId: ENTITY_ID } });
    const app = buildAppWithAuth(AGENT_AUTH);
    registerHumanInstructionRoutes(app, db);
    await app.ready();
    const response = await app.inject({ method: "POST", url: "/api/v1/human-instructions/instr-1/revoke" });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describe("mapAgentActivity — morning-brief agent_activity section", () => {
  it("produces items with linkPath pointing at the entity's /runtime page", () => {
    const items = mapAgentActivity([
      {
        agent_id: "agent-1",
        entity_id: ENTITY_ID,
        status: "running",
        health: "healthy",
        current_activity: "migrating records",
        updated_at: new Date().toISOString(),
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: `agent-1:${ENTITY_ID}`,
      linkPath: `#/entities/${ENTITY_ID}/runtime`,
      sourceFeature: "runtime",
    });
    expect(items[0].linkPath).toContain("/runtime");
    expect(items[0].label).toContain("migrating records");
  });

  it("falls back to status/health when current_activity is null", () => {
    const items = mapAgentActivity([
      {
        agent_id: "agent-2",
        entity_id: ENTITY_ID,
        status: "halted",
        health: "critical",
        current_activity: null,
        updated_at: new Date().toISOString(),
      },
    ]);
    expect(items[0].label).toBe("agent-2 — halted/critical");
    expect(items[0].linkPath).toBe(`#/entities/${ENTITY_ID}/runtime`);
  });

  it("returns an empty array for an empty roster", () => {
    expect(mapAgentActivity([])).toEqual([]);
  });

  it("maps multiple roster rows preserving per-entity /runtime links", () => {
    const otherEntityId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const items = mapAgentActivity([
      { agent_id: "agent-1", entity_id: ENTITY_ID, status: "running", health: "healthy", current_activity: "sync", updated_at: "now" },
      { agent_id: "agent-3", entity_id: otherEntityId, status: "running", health: "degraded", current_activity: null, updated_at: "now" },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].linkPath).toBe(`#/entities/${ENTITY_ID}/runtime`);
    expect(items[1].linkPath).toBe(`#/entities/${otherEntityId}/runtime`);
  });
});
