import { describe, expect, it, vi, afterEach } from "vitest";
import Fastify from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import type { AuthContext } from "../auth.js";
import { registerFederationRoutes } from "./federation-routes.js";
import {
  signFederationPayload,
  verifyFederationSignature,
  FederationAuthError,
} from "../services/vertical-federation.js";

const ENTITY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECRET = "test-federation-secret";

const DIRECTOR_AUTH: AuthContext = {
  userId: "director-1",
  vertical: "holding",
  authMethod: "header",
  role: "director",
};

const OPERATOR_AUTH: AuthContext = {
  userId: "op-1",
  vertical: "rareedge",
  authMethod: "header",
  role: "operator",
};

function buildApp(auth: AuthContext | null, db: DatabaseClient) {
  const app = Fastify();
  app.addHook("preHandler", async (request) => {
    if (auth) request.auth = auth;
  });
  registerFederationRoutes(app, db);
  return app;
}

describe("verifyFederationSignature", () => {
  it("accepts a valid signature inside the replay window", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const deliveryId = "del-1";
    const rawBody = '{"eventType":"heartbeat"}';
    const signature = signFederationPayload(SECRET, timestamp, deliveryId, rawBody);
    expect(() =>
      verifyFederationSignature({
        secret: SECRET,
        signatureHeader: signature,
        timestamp,
        deliveryId,
        rawBody,
      }),
    ).not.toThrow();
  });

  it("rejects a tampered body", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const deliveryId = "del-2";
    const signature = signFederationPayload(SECRET, timestamp, deliveryId, '{"eventType":"heartbeat"}');
    expect(() =>
      verifyFederationSignature({
        secret: SECRET,
        signatureHeader: signature,
        timestamp,
        deliveryId,
        rawBody: '{"eventType":"heartbeat","x":1}',
      }),
    ).toThrow(FederationAuthError);
  });

  it("rejects a timestamp outside the replay window", () => {
    const timestamp = String(Math.floor(Date.now() / 1000) - 600);
    const deliveryId = "del-3";
    const rawBody = "{}";
    const signature = signFederationPayload(SECRET, timestamp, deliveryId, rawBody);
    expect(() =>
      verifyFederationSignature({
        secret: SECRET,
        signatureHeader: signature,
        timestamp,
        deliveryId,
        rawBody,
      }),
    ).toThrow(/replay window/);
  });
});

describe("POST /api/v1/federation/ingress/:vertical", () => {
  const ORIGINAL_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  function mockDbForIngress() {
    const store = new Map<string, Record<string, unknown>>();
    const metricRows: Record<string, unknown>[] = [];
    const attentionRows: Record<string, unknown>[] = [];

    const db = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("FROM rarecrest.entities WHERE id")) {
          if (params?.[0] === ENTITY_ID && params?.[1] === "rareedge") {
            return { rows: [{ id: ENTITY_ID }] };
          }
          return { rows: [] };
        }
        if (sql.includes("FROM rarecrest.vertical_ingress_events") && sql.includes("WHERE vertical")) {
          const key = `${params?.[0]}:${params?.[1]}`;
          const row = store.get(key);
          return { rows: row ? [row] : [] };
        }
        if (sql.includes("SELECT content_hash FROM rarecrest.holding_metric_events")) {
          return { rows: [] };
        }
        if (sql.includes("INSERT INTO rarecrest.holding_metric_events")) {
          const row = {
            id: `metric-${metricRows.length + 1}`,
            vertical: params?.[0],
            entity_id: params?.[1],
            metric_key: params?.[2],
            value_numeric: params?.[3],
            unit: params?.[4],
            source_ref: params?.[5],
            recorded_at: new Date().toISOString(),
            actor_id: params?.[6],
            prev_hash: params?.[7] ?? null,
            content_hash: params?.[8] ?? null,
          };
          metricRows.push(row);
          return { rows: [row] };
        }
        if (sql.includes("INSERT INTO rarecrest.attention_flags")) {
          const row = {
            id: `flag-${attentionRows.length + 1}`,
            entity_id: params?.[0],
            signal_type: params?.[1],
            severity: params?.[2],
            message: params?.[3],
            link_path: params?.[4],
            source_ref: params?.[5],
            created_at: new Date(),
          };
          attentionRows.push(row);
          return { rows: [row], rowCount: 1 };
        }
        if (sql.includes("UPDATE rarecrest.attention_flags")) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO rarecrest.vertical_ingress_events")) {
          const vertical = params?.[0] as string;
          const deliveryId = params?.[3] as string;
          const key = `${vertical}:${deliveryId}`;
          if (store.has(key)) return { rows: [] };
          const row: Record<string, unknown> = {
            id: `evt-${store.size + 1}`,
            vertical,
            source_system: params?.[1],
            event_type: params?.[2],
            delivery_id: deliveryId,
            entity_id: params?.[4] ?? null,
            external_ref: params?.[5] ?? null,
            payload: typeof params?.[6] === "string" ? JSON.parse(params[6] as string) : {},
            effects:
              typeof params?.[7] === "string"
                ? JSON.parse(params[7] as string)
                : sql.includes("'rejected'")
                  ? []
                  : [],
            status: sql.includes("'rejected'") ? "rejected" : "accepted",
            reject_reason: sql.includes("'rejected'") ? params?.[5] : null,
            received_at: new Date().toISOString(),
          };
          // rejected insert has different param layout
          if (sql.includes("'rejected'")) {
            row.payload = typeof params?.[4] === "string" ? JSON.parse(params[4] as string) : {};
            row.entity_id = null;
            row.external_ref = null;
            row.effects = [];
            row.reject_reason = params?.[5] as string;
          }
          store.set(key, row);
          return { rows: [row] };
        }
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;

    return { db, store, metricRows, attentionRows };
  }

  async function postIngress(
    app: ReturnType<typeof buildApp> extends Promise<infer _T> ? never : Awaited<ReturnType<typeof Fastify>>,
    opts: { vertical: string; body: object; deliveryId: string; secret?: string; badSig?: boolean },
  ) {
    const rawBody = JSON.stringify(opts.body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const secret = opts.secret ?? SECRET;
    const signature = opts.badSig
      ? "sha256=deadbeef"
      : signFederationPayload(secret, timestamp, opts.deliveryId, rawBody);
    return app.inject({
      method: "POST",
      url: `/api/v1/federation/ingress/${opts.vertical}`,
      headers: {
        "content-type": "application/json",
        "x-rarecrest-signature": signature,
        "x-rarecrest-timestamp": timestamp,
        "x-rarecrest-delivery-id": opts.deliveryId,
      },
      payload: rawBody,
    });
  }

  it("401s when federation secret is not configured", async () => {
    delete process.env.FEDERATION_WEBHOOK_SECRET;
    delete process.env.FEDERATION_WEBHOOK_SECRET_RAREEDGE;
    const { db } = mockDbForIngress();
    const app = buildApp(null, db);
    await app.ready();
    const response = await postIngress(app, {
      vertical: "rareedge",
      body: { eventType: "heartbeat", sourceSystem: "rareedge-api", payload: {} },
      deliveryId: "d-no-secret",
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("401s on bad signature", async () => {
    process.env.FEDERATION_WEBHOOK_SECRET = SECRET;
    const { db } = mockDbForIngress();
    const app = buildApp(null, db);
    await app.ready();
    const response = await postIngress(app, {
      vertical: "rareedge",
      body: { eventType: "heartbeat", sourceSystem: "rareedge-api", payload: {} },
      deliveryId: "d-bad-sig",
      badSig: true,
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("accepts a heartbeat and is idempotent on delivery id", async () => {
    process.env.FEDERATION_WEBHOOK_SECRET = SECRET;
    const { db, store } = mockDbForIngress();
    const app = buildApp(null, db);
    await app.ready();
    const body = { eventType: "heartbeat", sourceSystem: "rareedge-api", payload: { ok: true } };
    const first = await postIngress(app, { vertical: "rareedge", body, deliveryId: "d-hb-1" });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      eventType: "heartbeat",
      status: "accepted",
      vertical: "rareedge",
    });
    const second = await postIngress(app, { vertical: "rareedge", body, deliveryId: "d-hb-1" });
    expect(second.statusCode).toBe(200);
    expect(store.size).toBe(1);
    await app.close();
  });

  it("records a holding metric from metric.record", async () => {
    process.env.FEDERATION_WEBHOOK_SECRET_RAREEDGE = SECRET;
    const { db, metricRows } = mockDbForIngress();
    const app = buildApp(null, db);
    await app.ready();
    const response = await postIngress(app, {
      vertical: "rareedge",
      deliveryId: "d-metric-1",
      body: {
        eventType: "metric.record",
        sourceSystem: "rareedge-trading",
        payload: {
          metricKey: "capital_routed_usd",
          value: 25000,
          entityId: ENTITY_ID,
          sourceRef: "trade:abc",
        },
      },
    });
    expect(response.statusCode).toBe(201);
    expect(metricRows).toHaveLength(1);
    expect(response.json()).toMatchObject({
      status: "accepted",
      effects: [{ kind: "metric", detail: "capital_routed_usd=25000" }],
    });
    await app.close();
  });

  it("raises attention from alert.escalate", async () => {
    process.env.FEDERATION_WEBHOOK_SECRET = SECRET;
    const { db, attentionRows } = mockDbForIngress();
    const app = buildApp(null, db);
    await app.ready();
    const response = await postIngress(app, {
      vertical: "rareedge",
      deliveryId: "d-alert-1",
      body: {
        eventType: "alert.escalate",
        sourceSystem: "rareedge-risk",
        payload: {
          entityId: ENTITY_ID,
          message: "Margin breach requires director seal",
          severity: "critical",
        },
      },
    });
    expect(response.statusCode).toBe(201);
    expect(attentionRows).toHaveLength(1);
    expect(response.json()).toMatchObject({
      status: "accepted",
      effects: [{ kind: "attention" }],
    });
    await app.close();
  });

  it("422s and records rejected when entity is outside the vertical", async () => {
    process.env.FEDERATION_WEBHOOK_SECRET = SECRET;
    const { db } = mockDbForIngress();
    const app = buildApp(null, db);
    await app.ready();
    const response = await postIngress(app, {
      vertical: "rareedge",
      deliveryId: "d-bad-entity",
      body: {
        eventType: "alert.escalate",
        sourceSystem: "rareedge-risk",
        payload: {
          entityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          message: "cross-vertical attempt",
        },
      },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ status: "rejected" });
    await app.close();
  });
});

describe("GET /api/v1/federation/events", () => {
  it("403s for non-directors", async () => {
    const db = { query: vi.fn(async () => ({ rows: [] })) } as unknown as DatabaseClient;
    const app = buildApp(OPERATOR_AUTH, db);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/v1/federation/events" });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("lists recent events for a director", async () => {
    const db = {
      query: vi.fn(async () => ({
        rows: [
          {
            id: "evt-1",
            vertical: "rareangels",
            source_system: "rareangels-api",
            event_type: "heartbeat",
            delivery_id: "d1",
            entity_id: null,
            external_ref: null,
            payload: {},
            effects: [{ kind: "none", detail: "heartbeat recorded" }],
            status: "accepted",
            reject_reason: null,
            received_at: new Date("2026-07-12T12:00:00Z").toISOString(),
          },
        ],
      })),
    } as unknown as DatabaseClient;
    const app = buildApp(DIRECTOR_AUTH, db);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/v1/federation/events?limit=10" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { events: Array<{ id: string; vertical: string }> };
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({ id: "evt-1", vertical: "rareangels" });
    await app.close();
  });
});
