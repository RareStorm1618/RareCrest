import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@rarecrest/db";
import type { AuthContext } from "../auth.js";
import { registerCommandRoutes, upsertDirectorSession } from "./command-routes.js";

/**
 * WO perf pass: /api/v1/command/dashboard consolidates the morning-brief +
 * priorities + attention-queue queries into a single parallelized builder.
 */

const ENTITY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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
  registerCommandRoutes(app, db);
  return app;
}

interface MockDbOverrides {
  attentionQueueRows?: Array<Record<string, unknown>>;
  governanceOpenSessions?: Array<Record<string, unknown>>;
  governanceReadySessions?: Array<Record<string, unknown>>;
  governanceSealsDue?: Array<Record<string, unknown>>;
}

function mockDb(overrides: MockDbOverrides = {}): { db: DatabaseClient; calls: Array<[string, unknown[] | undefined]> } {
  const calls: Array<[string, unknown[] | undefined]> = [];
  const queueRows =
    overrides.attentionQueueRows ??
    [
      {
        id: "flag-1",
        entity_id: ENTITY_ID,
        signal_type: "pending_high_stakes_decision",
        severity: "high",
        message: "Needs director review",
        link_path: null,
        source_ref: null,
        created_at: new Date("2026-01-01T00:00:00Z"),
        entity_name: "Test Entity",
      },
    ];

  const db = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      if (sql.includes("FROM rarecrest.director_sessions WHERE director_id")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO rarecrest.director_sessions")) {
        return { rows: [] };
      }
      if (sql.includes("FROM rarecrest.attention_flags af")) {
        return { rows: queueRows };
      }
      if (sql.includes("FROM rarecrest.attention_flags WHERE resolved_at IS NOT NULL")) {
        return { rows: [] };
      }
      if (sql.includes("FROM rarecrest.agent_roster")) {
        return { rows: [] };
      }
      if (sql.includes("FROM rarecrest.wiki_lint_reports")) {
        return { rows: [] };
      }
      if (sql.includes("FROM rarecrest.wiki_promotions wp")) {
        return { rows: [] };
      }
      if (sql.includes("FROM rarecrest.wiki_contradictions WHERE status")) {
        return { rows: [{ count: 0 }] };
      }
      if (sql.includes("FROM rarecrest.entities WHERE vertical = 'holding'")) {
        return { rows: [] };
      }
      if (sql.includes("FROM rarecrest.parliament_sessions ps") && sql.includes("status = 'open'")) {
        return { rows: overrides.governanceOpenSessions ?? [] };
      }
      if (sql.includes("FROM rarecrest.parliament_sessions ps") && sql.includes("status = 'ready_for_seal'")) {
        return { rows: overrides.governanceReadySessions ?? [] };
      }
      if (sql.includes("FROM rarecrest.seals s") && sql.includes("mode = 'time_lock'")) {
        return { rows: overrides.governanceSealsDue ?? [] };
      }
      return { rows: [] };
    }),
  } as unknown as DatabaseClient;
  return { db, calls };
}

describe("upsertDirectorSession", () => {
  it("issues an ON CONFLICT (director_id) upsert against director_sessions", async () => {
    const { db, calls } = mockDb();
    await upsertDirectorSession(db, "director-1");
    expect(calls).toHaveLength(1);
    const [sql, params] = calls[0];
    expect(sql).toContain("INSERT INTO rarecrest.director_sessions");
    expect(sql).toContain("ON CONFLICT (director_id)");
    expect(sql).toContain("DO UPDATE SET last_engaged_at = NOW()");
    expect(params).toEqual(["director-1"]);
  });
});

describe("GET /api/v1/command/dashboard", () => {
  it("returns brief + ranked + queue + portfolioClear with a private cache header", async () => {
    const { db, calls } = mockDb();
    const app = buildApp(DIRECTOR_AUTH, db);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/v1/command/dashboard" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, max-age=10");
    const body = response.json() as {
      brief: { sections: unknown[] };
      ranked: Array<{ itemId: string; rank: number }>;
      queue: Array<{ id: string; entityId: string }>;
      portfolioClear: boolean;
    };
    expect(body.brief).toBeDefined();
    expect(Array.isArray(body.brief.sections)).toBe(true);
    expect(body.queue).toHaveLength(1);
    expect(body.queue[0]).toMatchObject({ id: "flag-1", entityId: ENTITY_ID });
    expect(body.ranked).toHaveLength(1);
    expect(body.ranked[0]).toMatchObject({ itemId: "flag-1", rank: 1 });
    expect(body.portfolioClear).toBe(false);

    // Single consolidated query pass touches the director session exactly once.
    const upsertCalls = calls.filter(([sql]) => sql.includes("INSERT INTO rarecrest.director_sessions"));
    expect(upsertCalls).toHaveLength(1);
    await app.close();
  });

  it("reports portfolioClear=true and an empty queue when nothing is open", async () => {
    const { db } = mockDb({ attentionQueueRows: [] });
    const app = buildApp(DIRECTOR_AUTH, db);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/v1/command/dashboard" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { portfolioClear: boolean; queue: unknown[] };
    expect(body.portfolioClear).toBe(true);
    expect(body.queue).toEqual([]);
    await app.close();
  });
});

describe("GET /api/v1/command/morning-brief", () => {
  it("returns the brief merged with portfolioClear and touches the director session", async () => {
    const { db, calls } = mockDb();
    const app = buildApp(DIRECTOR_AUTH, db);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/v1/command/morning-brief" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { portfolioClear: boolean; sections: unknown[] };
    expect(body.portfolioClear).toBe(false);
    expect(Array.isArray(body.sections)).toBe(true);
    const upsertCalls = calls.filter(([sql]) => sql.includes("INSERT INTO rarecrest.director_sessions"));
    expect(upsertCalls).toHaveLength(1);
    await app.close();
  });
});

describe("GET /api/v1/command/dashboard — governanceQueue (EXO Wave A)", () => {
  it("returns an empty governanceQueue shape when no Parliament sessions/seals are open", async () => {
    const { db } = mockDb();
    const app = buildApp(DIRECTOR_AUTH, db);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/v1/command/dashboard" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      governanceQueue: { openSessions: unknown[]; readyForSeal: unknown[]; sealsDue: unknown[] };
    };
    expect(body.governanceQueue).toEqual({ openSessions: [], readyForSeal: [], sealsDue: [] });
    await app.close();
  });

  it("maps open sessions, ready-for-seal sessions, and seals due within 24h", async () => {
    const { db } = mockDb({
      governanceOpenSessions: [
        {
          id: "session-open-1",
          entityId: ENTITY_ID,
          entityName: "Test Entity",
          topic: "Promote canon page",
          stakeClass: "wiki_promote",
          status: "open",
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      governanceReadySessions: [
        {
          id: "session-ready-1",
          entityId: ENTITY_ID,
          entityName: "Test Entity",
          topic: "Activate agent",
          stakeClass: "activation",
          status: "ready_for_seal",
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      governanceSealsDue: [
        {
          id: "seal-due-1",
          sessionId: "session-sealed-1",
          entityId: ENTITY_ID,
          entityName: "Test Entity",
          executeAfter: new Date("2026-01-02T00:00:00Z"),
        },
      ],
    });
    const app = buildApp(DIRECTOR_AUTH, db);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/v1/command/dashboard" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      governanceQueue: {
        openSessions: Array<{ id: string; stakeClass: string; entityName: string }>;
        readyForSeal: Array<{ id: string; stakeClass: string }>;
        sealsDue: Array<{ id: string; sessionId: string; executeAfter: string }>;
      };
    };
    expect(body.governanceQueue.openSessions).toHaveLength(1);
    expect(body.governanceQueue.openSessions[0]).toMatchObject({
      id: "session-open-1",
      stakeClass: "wiki_promote",
      entityName: "Test Entity",
    });
    expect(body.governanceQueue.readyForSeal).toHaveLength(1);
    expect(body.governanceQueue.readyForSeal[0]).toMatchObject({ id: "session-ready-1", stakeClass: "activation" });
    expect(body.governanceQueue.sealsDue).toHaveLength(1);
    expect(body.governanceQueue.sealsDue[0]).toMatchObject({ id: "seal-due-1", sessionId: "session-sealed-1" });
    await app.close();
  });

  it("fails soft (empty governanceQueue) if the Parliament tables are unqueryable", async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM rarecrest.parliament_sessions") || sql.includes("FROM rarecrest.seals")) {
          throw new Error("relation does not exist");
        }
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;
    const app = buildApp(DIRECTOR_AUTH, db);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/v1/command/dashboard" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { governanceQueue: { openSessions: unknown[] } };
    expect(body.governanceQueue).toEqual({ openSessions: [], readyForSeal: [], sealsDue: [] });
    await app.close();
  });
});

describe("GET /api/v1/command/attention-queue and /priorities", () => {
  it("does not touch the director session on the lighter read endpoints", async () => {
    const { db, calls } = mockDb();
    const app = buildApp(DIRECTOR_AUTH, db);
    await app.ready();
    const queueResponse = await app.inject({ method: "GET", url: "/api/v1/command/attention-queue" });
    expect(queueResponse.statusCode).toBe(200);
    const prioritiesResponse = await app.inject({ method: "GET", url: "/api/v1/command/priorities" });
    expect(prioritiesResponse.statusCode).toBe(200);
    const upsertCalls = calls.filter(([sql]) => sql.includes("INSERT INTO rarecrest.director_sessions"));
    expect(upsertCalls).toHaveLength(0);
    await app.close();
  });

  it("priorities?decisionsOnly=true re-ranks using only decision-kind items", async () => {
    const { db } = mockDb({
      attentionQueueRows: [
        {
          id: "flag-decision",
          entity_id: ENTITY_ID,
          signal_type: "pending_high_stakes_decision",
          severity: "high",
          message: "Decision needed",
          link_path: null,
          source_ref: null,
          created_at: new Date("2026-01-01T00:00:00Z"),
          entity_name: "Test Entity",
        },
        {
          id: "flag-awareness",
          entity_id: ENTITY_ID,
          signal_type: "informational",
          severity: "low",
          message: "FYI",
          link_path: null,
          source_ref: null,
          created_at: new Date("2026-01-01T00:00:00Z"),
          entity_name: "Test Entity",
        },
      ],
    });
    const app = buildApp(DIRECTOR_AUTH, db);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/v1/command/priorities?decisionsOnly=true" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { ranked: Array<{ itemId: string }> };
    expect(body.ranked).toHaveLength(1);
    expect(body.ranked[0].itemId).toBe("flag-decision");
    await app.close();
  });
});
