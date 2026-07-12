import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import {
  autopilotAllows,
  shadowAllowsAction,
  SHADOW_OFFICER_CONSTRAINTS,
} from "@rarecrest/contracts";
import type { AuthContext } from "../auth.js";
import {
  assertAutopilotAllows,
  assertShadowAllows,
  PolicyGatewayError,
} from "../policy/index.js";
import { registerAutopilotRoutes } from "./autopilot-routes.js";

describe("autopilotAllows / shadowAllowsAction (contracts)", () => {
  it("enforces the observe → draft → propose floor", () => {
    expect(autopilotAllows("off", "observe")).toBe(false);
    expect(autopilotAllows("observe", "observe")).toBe(true);
    expect(autopilotAllows("observe", "draft")).toBe(false);
    expect(autopilotAllows("draft", "draft")).toBe(true);
    expect(autopilotAllows("draft", "propose")).toBe(false);
    expect(autopilotAllows("propose", "propose")).toBe(true);
  });

  it("lets shadow passports vote/draft but not seal or kill-switch", () => {
    const constraints = [...SHADOW_OFFICER_CONSTRAINTS];
    expect(shadowAllowsAction(constraints, "parliament_vote")).toBe(true);
    expect(shadowAllowsAction(constraints, "draft")).toBe(true);
    expect(shadowAllowsAction(constraints, "seal")).toBe(false);
    expect(shadowAllowsAction(constraints, "runtime_activation")).toBe(false);
    expect(shadowAllowsAction(constraints, "kill_switch_trigger")).toBe(false);
  });
});

describe("assertShadowAllows / assertAutopilotAllows", () => {
  it("denies seal for shadow assignment mode", () => {
    expect(() =>
      assertShadowAllows({ constraints: [], assignmentMode: "shadow" }, "seal"),
    ).toThrow(PolicyGatewayError);
  });

  it("allows parliament_vote for shadow", () => {
    expect(() =>
      assertShadowAllows(
        { constraints: [...SHADOW_OFFICER_CONSTRAINTS], assignmentMode: "shadow" },
        "parliament_vote",
      ),
    ).not.toThrow();
  });

  it("fails closed when autopilot is off", async () => {
    const db = {
      query: vi.fn(async () => ({ rows: [{ autopilot_level: "off" }] })),
    } as unknown as DatabaseClient;
    await expect(assertAutopilotAllows(db, "e1", "propose")).rejects.toMatchObject({
      code: "AUTOPILOT_CEILING",
    });
  });

  it("allows propose when level is propose", async () => {
    const db = {
      query: vi.fn(async () => ({ rows: [{ autopilot_level: "propose" }] })),
    } as unknown as DatabaseClient;
    await expect(assertAutopilotAllows(db, "e1", "propose")).resolves.toBe("propose");
  });
});

describe("PATCH /api/v1/runtime/entities/:entityId/autopilot", () => {
  const ENTITY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const DIRECTOR: AuthContext = {
    userId: "director-1",
    vertical: "holding",
    authMethod: "header",
    role: "director",
  };
  const AGENT: AuthContext = {
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
    registerAutopilotRoutes(app, db);
    return app;
  }

  it("403s for non-directors", async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM rarecrest.entities WHERE id")) {
          return { rows: [{ id: ENTITY_ID, name: "E", vertical: "holding" }] };
        }
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;
    const app = buildApp(AGENT, db);
    await app.ready();
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/runtime/entities/${ENTITY_ID}/autopilot`,
      payload: { level: "propose" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("updates level for a director", async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM rarecrest.entities WHERE id") && sql.includes("deleted_at")) {
          return { rows: [{ id: ENTITY_ID, name: "E", vertical: "holding" }] };
        }
        if (sql.includes("UPDATE rarecrest.entities")) {
          return {
            rows: [
              {
                id: ENTITY_ID,
                autopilot_level: "propose",
                autopilot_set_by: "director-1",
                autopilot_set_at: new Date().toISOString(),
              },
            ],
          };
        }
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;
    const app = buildApp(DIRECTOR, db);
    await app.ready();
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/runtime/entities/${ENTITY_ID}/autopilot`,
      payload: { level: "propose" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ level: "propose", entityId: ENTITY_ID });
    await app.close();
  });
});
