import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@rarecrest/db";
import type { AuthContext } from "../auth.js";
import { registerProvenanceRoutes } from "./provenance-routes.js";
import { computeTraceContentHash } from "@rarecrest/export";

const ENTITY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const DIRECTOR_AUTH: AuthContext = {
  userId: "director-1",
  vertical: "holding",
  authMethod: "header",
  role: "director",
};

const AGENT_AUTH: AuthContext = {
  userId: "agent-1",
  vertical: "holding",
  authMethod: "header",
  role: "agent",
};

function buildApp(auth: AuthContext, db: DatabaseClient) {
  const app = Fastify();
  app.addHook("preHandler", async (request) => {
    request.auth = auth;
  });
  registerProvenanceRoutes(app, db);
  return app;
}

describe("GET /api/v1/provenance/traces/:entityId/verify", () => {
  it("returns valid for a good chain", async () => {
    const payload = { ok: true };
    const hash = computeTraceContentHash(ENTITY_ID, "act", payload);
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM rarecrest.entities")) {
          return { rows: [{ id: ENTITY_ID, vertical: "holding" }] };
        }
        if (sql.includes("FROM rarecrest.decision_traces")) {
          return {
            rows: [
              {
                id: "t1",
                entity_id: ENTITY_ID,
                action: "act",
                payload,
                prev_hash: null,
                content_hash: hash,
                created_at: new Date("2026-01-01T00:00:00Z"),
              },
            ],
          };
        }
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;

    const app = buildApp(DIRECTOR_AUTH, db);
    await app.ready();
    const res = await app.inject({ method: "GET", url: `/api/v1/provenance/traces/${ENTITY_ID}/verify` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ valid: true, checked: 1 });
    await app.close();
  });

  it("409s when the chain is broken", async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM rarecrest.entities")) {
          return { rows: [{ id: ENTITY_ID, vertical: "holding" }] };
        }
        if (sql.includes("FROM rarecrest.decision_traces")) {
          return {
            rows: [
              {
                id: "t1",
                entity_id: ENTITY_ID,
                action: "act",
                payload: {},
                prev_hash: null,
                content_hash: "not-a-real-hash",
                created_at: new Date("2026-01-01T00:00:00Z"),
              },
            ],
          };
        }
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;

    const app = buildApp(DIRECTOR_AUTH, db);
    await app.ready();
    const res = await app.inject({ method: "GET", url: `/api/v1/provenance/traces/${ENTITY_ID}/verify` });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ valid: false });
    await app.close();
  });
});

describe("POST /api/v1/provenance/root/anchor", () => {
  it("403s for agents without internal token", async () => {
    const db = { query: vi.fn(async () => ({ rows: [] })) } as unknown as DatabaseClient;
    const app = buildApp(AGENT_AUTH, db);
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/api/v1/provenance/root/anchor", payload: {} });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("anchors a root for a director", async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("INSERT INTO rarecrest.provenance_roots")) {
          return {
            rows: [
              {
                id: "root-1",
                period_start: new Date().toISOString(),
                period_end: new Date().toISOString(),
                leaf_count: 0,
                merkle_root: "abc",
                entity_roots: {},
                metric_roots: {},
                extras: {},
                anchor_ref: null,
                created_at: new Date().toISOString(),
              },
            ],
          };
        }
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;
    const app = buildApp(DIRECTOR_AUTH, db);
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/api/v1/provenance/root/anchor", payload: {} });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: "root-1", merkleRoot: "abc" });
    await app.close();
  });
});

describe("GET /api/v1/exports/board-pack/preview", () => {
  it("returns a board pack for a director", async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SUM(value_numeric)")) return { rows: [] };
        if (sql.includes("COUNT(*)")) return { rows: [{ c: "0" }] };
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;
    const app = buildApp(DIRECTOR_AUTH, db);
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/v1/exports/board-pack/preview?windowDays=7" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { kind: string; sections: unknown[] };
    expect(body.kind).toBe("board_pack");
    expect(body.sections.length).toBeGreaterThan(5);
    await app.close();
  });
});
