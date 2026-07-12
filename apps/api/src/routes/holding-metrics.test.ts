import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@rarecrest/db";
import type { AuthContext } from "../auth.js";
import { registerHoldingMetricsRoutes } from "./holding-metrics-routes.js";
import { computeDualMissionScore, NORTH_STAR_TARGETS } from "../services/holding-metrics.js";

/** EXO Wave B — Holding metrics: POST /api/v1/holding/metrics + GET /api/v1/holding/north-star. */

const ENTITY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const DIRECTOR_AUTH: AuthContext = {
  userId: "director-1",
  vertical: "holding",
  authMethod: "header",
  role: "director",
};

const HUMAN_AUTH: AuthContext = {
  userId: "human-1",
  vertical: "holding",
  authMethod: "header",
  role: "human",
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
  registerHoldingMetricsRoutes(app, db);
  return app;
}

function mockDb() {
  const inserted: Array<Record<string, unknown>> = [];
  const aggregateRows = [
    { metric_key: "capital_routed_usd", total: "500000", avg: "250000" },
    { metric_key: "healing_hours", total: "2500", avg: "1250" },
    { metric_key: "families_supported", total: "300", avg: "150" },
    { metric_key: "donation_pct_bps", total: "1500", avg: "750" },
  ];
  const db = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("INSERT INTO rarecrest.holding_metric_events")) {
        const [vertical, entityId, metricKey, value, unit, sourceRef, actorId, prevHash, contentHash] = params as [
          string,
          string | null,
          string,
          number,
          string,
          string | null,
          string,
          string | null,
          string,
        ];
        const row = {
          id: "metric-1",
          vertical,
          entity_id: entityId,
          metric_key: metricKey,
          value_numeric: value,
          unit,
          source_ref: sourceRef,
          recorded_at: new Date("2026-07-12T00:00:00Z"),
          actor_id: actorId,
          prev_hash: prevHash,
          content_hash: contentHash,
        };
        inserted.push(row);
        return { rows: [row] };
      }
      if (sql.includes("SELECT content_hash FROM rarecrest.holding_metric_events")) {
        return { rows: [] };
      }
      if (sql.includes("FROM rarecrest.holding_metric_events")) {
        return { rows: aggregateRows };
      }
      return { rows: [] };
    }),
  } as unknown as DatabaseClient;
  return { db, inserted };
}

describe("computeDualMissionScore — pure heuristic", () => {
  it("returns 0 when every total is zero", () => {
    expect(
      computeDualMissionScore({
        capitalRoutedUsd: 0,
        healingHours: 0,
        familiesSupported: 0,
        donationPctBpsAvg: 0,
      }),
    ).toBe(0);
  });

  it("returns 100 when every total meets or exceeds its target", () => {
    expect(
      computeDualMissionScore({
        capitalRoutedUsd: NORTH_STAR_TARGETS.capitalRoutedUsd,
        healingHours: NORTH_STAR_TARGETS.healingHours,
        familiesSupported: NORTH_STAR_TARGETS.familiesSupported,
        donationPctBpsAvg: NORTH_STAR_TARGETS.donationPctBpsMax,
      }),
    ).toBe(100);
  });

  it("caps each normalized component at 1.0 — overshooting a target never exceeds 100", () => {
    expect(
      computeDualMissionScore({
        capitalRoutedUsd: NORTH_STAR_TARGETS.capitalRoutedUsd * 10,
        healingHours: NORTH_STAR_TARGETS.healingHours * 10,
        familiesSupported: NORTH_STAR_TARGETS.familiesSupported * 10,
        donationPctBpsAvg: NORTH_STAR_TARGETS.donationPctBpsMax * 10,
      }),
    ).toBe(100);
  });

  it("averages partial progress across the four components", () => {
    // capital at 50% of target, everything else at 0 -> average of [0.5,0,0,0] = 0.125 -> 12.5
    expect(
      computeDualMissionScore({
        capitalRoutedUsd: NORTH_STAR_TARGETS.capitalRoutedUsd / 2,
        healingHours: 0,
        familiesSupported: 0,
        donationPctBpsAvg: 0,
      }),
    ).toBe(12.5);
  });
});

describe("POST /api/v1/holding/metrics", () => {
  it("403s for an agent actor (not director, not verified human)", async () => {
    const { db } = mockDb();
    const app = buildApp(AGENT_AUTH, db);
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/holding/metrics",
      payload: { metricKey: "capital_routed_usd", value: 1000, vertical: "holding" },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("accepts a director-recorded metric", async () => {
    const { db, inserted } = mockDb();
    const app = buildApp(DIRECTOR_AUTH, db);
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/holding/metrics",
      payload: {
        metricKey: "healing_hours",
        value: 42,
        vertical: "healkids",
        entityId: ENTITY_ID,
        sourceRef: "wo-exo-b",
      },
    });
    expect(response.statusCode).toBe(201);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ metric_key: "healing_hours", value_numeric: 42, actor_id: "director-1" });
    const body = response.json() as { metricKey: string; unit: string };
    expect(body.metricKey).toBe("healing_hours");
    expect(body.unit).toBe("hours");
    await app.close();
  });

  it("accepts a verified-human-recorded metric", async () => {
    const { db, inserted } = mockDb();
    const app = buildApp(HUMAN_AUTH, db);
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/holding/metrics",
      payload: { metricKey: "families_supported", value: 3, vertical: "healkids" },
    });
    expect(response.statusCode).toBe(201);
    expect(inserted[0]).toMatchObject({ actor_id: "human-1" });
    await app.close();
  });

  it("400s on an unknown metricKey", async () => {
    const { db } = mockDb();
    const app = buildApp(DIRECTOR_AUTH, db);
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/holding/metrics",
      payload: { metricKey: "not_a_real_key", value: 1, vertical: "holding" },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

describe("GET /api/v1/holding/north-star", () => {
  it("aggregates trailing metrics into totals + dualMissionScore", async () => {
    const { db } = mockDb();
    const app = buildApp(DIRECTOR_AUTH, db);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/v1/holding/north-star" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      windowDays: number;
      capitalRoutedUsd: number;
      healingHours: number;
      familiesSupported: number;
      donationPctBpsAvg: number;
      dualMissionScore: number;
    };
    expect(body.windowDays).toBe(30);
    expect(body.capitalRoutedUsd).toBe(500000);
    expect(body.healingHours).toBe(2500);
    expect(body.familiesSupported).toBe(300);
    expect(body.donationPctBpsAvg).toBe(750);
    expect(typeof body.dualMissionScore).toBe("number");
    expect(body.dualMissionScore).toBeGreaterThan(0);
    await app.close();
  });

  it("honors a custom ?days= window", async () => {
    const { db } = mockDb();
    const app = buildApp(DIRECTOR_AUTH, db);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/v1/holding/north-star?days=7" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { windowDays: number };
    expect(body.windowDays).toBe(7);
    await app.close();
  });

  it("is readable without director/human gating (portfolio-wide read, no PHI/financial detail)", async () => {
    const { db } = mockDb();
    const app = buildApp(AGENT_AUTH, db);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/v1/holding/north-star" });
    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
