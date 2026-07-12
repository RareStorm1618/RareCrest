import Fastify from "fastify";
import { describe, expect, it, vi, afterEach } from "vitest";
import type { DatabaseClient } from "@rarecrest/db";
import type { AuthContext } from "../auth.js";
import { registerOpsRoutes } from "./ops-routes.js";

const DIRECTOR_AUTH: AuthContext = {
  userId: "director-1",
  vertical: "holding",
  authMethod: "header",
  role: "director",
};

const OPERATOR_AUTH: AuthContext = {
  userId: "operator-1",
  vertical: "holding",
  authMethod: "header",
  role: "operator",
};

function buildApp(auth: AuthContext, db: DatabaseClient) {
  const app = Fastify();
  app.addHook("preHandler", async (request) => {
    request.auth = auth;
  });
  registerOpsRoutes(app, db);
  return app;
}

function mockDb() {
  const db = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("FROM rarecrest.ai_spend_ledger")) {
        return {
          rows: [
            { vertical: "healkids", input_tokens: "1200", output_tokens: "800", estimated_usd: "0.0018", call_count: "3" },
            { vertical: "rareedge", input_tokens: "400", output_tokens: "300", estimated_usd: "0.0007", call_count: "1" },
          ],
        };
      }
      if (sql.includes("SELECT 1 AS ok")) return { rows: [{ ok: 1 }] };
      return { rows: [] };
    }),
  } as unknown as DatabaseClient;
  return { db };
}

describe("POST /api/v1/ops/night-shift/run (EXO Wave A)", () => {
  const ORIGINAL_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("403s for a non-director without a valid internal service token", async () => {
    delete process.env.INTERNAL_SERVICE_TOKEN;
    const { db } = mockDb();
    const app = buildApp(OPERATOR_AUTH, db);
    await app.ready();
    const response = await app.inject({ method: "POST", url: "/api/v1/ops/night-shift/run" });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("runs for a verified director", async () => {
    const { db } = mockDb();
    const app = buildApp(DIRECTOR_AUTH, db);
    await app.ready();
    const response = await app.inject({ method: "POST", url: "/api/v1/ops/night-shift/run" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { sealsExecuted: number; staleJobsMarked: number; ranAt: string };
    expect(body).toMatchObject({ sealsExecuted: 0, staleJobsMarked: 0 });
    expect(typeof body.ranAt).toBe("string");
    await app.close();
  });

  it("runs for a non-director presenting a matching x-internal-service-token", async () => {
    process.env.INTERNAL_SERVICE_TOKEN = "test-internal-token";
    const { db } = mockDb();
    const app = buildApp(OPERATOR_AUTH, db);
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ops/night-shift/run",
      headers: { "x-internal-service-token": "test-internal-token" },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("403s a non-director presenting a mismatched x-internal-service-token", async () => {
    process.env.INTERNAL_SERVICE_TOKEN = "test-internal-token";
    const { db } = mockDb();
    const app = buildApp(OPERATOR_AUTH, db);
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ops/night-shift/run",
      headers: { "x-internal-service-token": "wrong-token" },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describe("GET /api/v1/ops/ai-spend", () => {
  it("403s for a non-director actor", async () => {
    const { db } = mockDb();
    const app = buildApp(OPERATOR_AUTH, db);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/v1/ops/ai-spend" });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("returns per-vertical sums for a director, defaulting to a 7-day window", async () => {
    const { db } = mockDb();
    const app = buildApp(DIRECTOR_AUTH, db);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/v1/ops/ai-spend" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      days: number;
      byVertical: Array<{ vertical: string; inputTokens: number; outputTokens: number; estimatedUsd: number; callCount: number }>;
      totalUsd: number;
    };
    expect(body.days).toBe(7);
    expect(body.byVertical).toHaveLength(2);
    expect(body.byVertical[0]).toMatchObject({ vertical: "healkids", inputTokens: 1200, outputTokens: 800, callCount: 3 });
    expect(body.totalUsd).toBeCloseTo(0.0025, 6);
    await app.close();
  });

  it("honors a custom ?days= window", async () => {
    const { db } = mockDb();
    const app = buildApp(DIRECTOR_AUTH, db);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/v1/ops/ai-spend?days=30" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { days: number };
    expect(body.days).toBe(30);
    await app.close();
  });
});
