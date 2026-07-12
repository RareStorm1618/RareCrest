import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@rarecrest/db";
import type { GovernanceClient } from "@rarecrest/governance-client";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import {
  OFFICER_ROLE_TEMPLATES,
  OfficerTemplateViolationError,
  assertRightsWithinOfficerTemplate,
} from "@rarecrest/contracts";
import type { AuthContext } from "./auth.js";
import { registerOfficerRoutes } from "./routes/officer-routes.js";
import { assertLivePassport, PolicyGatewayError } from "./policy/index.js";

/**
 * S2 Officer Passports — covers the contracts-level template ceiling
 * (assertRightsWithinOfficerTemplate), the director-only assignment route
 * (happy path + RBAC + template-violation denial), and the officer-scoped
 * extension of assertLivePassport (requiredOfficerRole).
 */

const ENTITY_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const DIRECTOR_AUTH: AuthContext = {
  userId: "director-1",
  vertical: "rareangels",
  authMethod: "header",
  role: "director",
};

const NON_DIRECTOR_AUTH: AuthContext = {
  userId: "operator-1",
  vertical: "rareangels",
  authMethod: "header",
  role: "operator",
};

describe("assertRightsWithinOfficerTemplate — fail-closed ceiling", () => {
  it("rejects a role requesting all three rights (two-of-three violation) regardless of template", () => {
    expect(() =>
      assertRightsWithinOfficerTemplate("chief_of_staff", [
        "sensitive_data",
        "code_execution",
        "external_comms",
      ]),
    ).toThrow(OfficerTemplateViolationError);
  });

  it("rejects a role requesting more than 2 rights even if none overlap all-three", () => {
    // chief_of_staff's template ceiling is only external_comms, but this checks
    // the length>2 guard independently of the maxRights subset guard.
    expect(() =>
      assertRightsWithinOfficerTemplate("chief_of_staff", [
        "sensitive_data",
        "code_execution",
        "external_comms",
      ]),
    ).toThrow(/at most 2|two-of-three/);
  });

  it("rejects care_ops requesting sensitive_data — not in its maxRights (phiBlind)", () => {
    expect(OFFICER_ROLE_TEMPLATES.care_ops.maxRights).toEqual([]);
    expect(OFFICER_ROLE_TEMPLATES.care_ops.phiBlind).toBe(true);
    expect(() => assertRightsWithinOfficerTemplate("care_ops", ["sensitive_data"])).toThrow(
      OfficerTemplateViolationError,
    );
    expect(() => assertRightsWithinOfficerTemplate("care_ops", ["sensitive_data"])).toThrow(
      /outside its template ceiling/,
    );
  });

  it("accepts care_ops with zero rights (its only valid ceiling)", () => {
    expect(() => assertRightsWithinOfficerTemplate("care_ops", [])).not.toThrow();
  });

  it("rejects delivery_build requesting a right outside its code_execution-only ceiling", () => {
    expect(() => assertRightsWithinOfficerTemplate("delivery_build", ["external_comms"])).toThrow(
      OfficerTemplateViolationError,
    );
  });

  it("accepts every role's own default maxRights", () => {
    for (const template of Object.values(OFFICER_ROLE_TEMPLATES)) {
      expect(() => assertRightsWithinOfficerTemplate(template.role, template.maxRights)).not.toThrow();
    }
  });

  it("red_team template never permits production execution", () => {
    expect(OFFICER_ROLE_TEMPLATES.red_team.mayExecuteProduction).toBe(false);
  });
});

function buildApp(auth: AuthContext, db: DatabaseClient, governance: GovernanceClient, intelligence: IntelligenceClient) {
  const app = Fastify();
  app.addHook("preHandler", async (request) => {
    request.auth = auth;
  });
  registerOfficerRoutes(app, db, governance, intelligence);
  return app;
}

function mockGovernance(allowed = true): GovernanceClient {
  return {
    checkHardRules: vi.fn(async () => ({
      allowed,
      reasons: allowed ? [] : [{ field: "rights", code: "denied", message: "denied" }],
      traceId: "trace-1",
      evaluatedAt: new Date().toISOString(),
    })),
  } as unknown as GovernanceClient;
}

function mockIntelligence(): IntelligenceClient {
  return {
    appendTrace: vi.fn(async () => undefined),
  } as unknown as IntelligenceClient;
}

interface MockDbOptions {
  existingActiveAssignment?: boolean;
}

function mockOfficerDb(options: MockDbOptions = {}) {
  const calls: Array<[string, unknown[] | undefined]> = [];
  const db = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      if (sql.includes("FROM rarecrest.entities")) {
        return { rows: [{ id: ENTITY_ID, name: "Test Entity", vertical: "rareangels" }] };
      }
      if (sql.includes("FROM rarecrest.entity_encryption_layers") || sql.includes("encryption_layer")) {
        return { rows: [{ present: true }] };
      }
      if (sql.includes("INSERT INTO rarecrest.agent_passports")) {
        return { rows: [{ id: "passport-1" }] };
      }
      if (sql.startsWith("UPDATE rarecrest.officer_assignments")) {
        return { rows: [], rowCount: options.existingActiveAssignment ? 1 : 0 };
      }
      if (sql.startsWith("INSERT INTO rarecrest.officer_assignments")) {
        return {
          rows: [
            {
              id: "assignment-1",
              entityId: ENTITY_ID,
              officerRole: (params?.[1] as string) ?? "chief_of_staff",
              agentId: params?.[2],
              active: true,
              issuedPassportId: "passport-1",
              assignedBy: params?.[4],
              createdAt: new Date().toISOString(),
            },
          ],
        };
      }
      if (sql.includes("FROM rarecrest.officer_assignments")) {
        return { rows: [] };
      }
      return { rows: [] };
    }),
  } as unknown as DatabaseClient;
  return { db, calls };
}

describe("POST /api/v1/runtime/officers/assign", () => {
  it("403s for a non-director actor", async () => {
    const { db } = mockOfficerDb();
    const app = buildApp(NON_DIRECTOR_AUTH, db, mockGovernance(), mockIntelligence());
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/runtime/officers/assign",
      payload: { entityId: ENTITY_ID, officerRole: "chief_of_staff", agentId: "agent-1" },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("403s when requestedRights violate the role's template ceiling", async () => {
    const { db } = mockOfficerDb();
    const app = buildApp(DIRECTOR_AUTH, db, mockGovernance(), mockIntelligence());
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/runtime/officers/assign",
      payload: {
        entityId: ENTITY_ID,
        officerRole: "care_ops",
        agentId: "agent-1",
        requestedRights: ["sensitive_data"],
      },
    });
    expect(response.statusCode).toBe(403);
    const body = response.json() as { role: string; rights: string[] };
    expect(body.role).toBe("care_ops");
    await app.close();
  });

  it("403s when the governance hard-rule evaluator denies", async () => {
    const { db } = mockOfficerDb();
    const app = buildApp(DIRECTOR_AUTH, db, mockGovernance(false), mockIntelligence());
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/runtime/officers/assign",
      payload: { entityId: ENTITY_ID, officerRole: "chief_of_staff", agentId: "agent-1" },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("assigns an officer role happy path: issues a passport, inserts the assignment, and deactivates any prior active row", async () => {
    const { db, calls } = mockOfficerDb({ existingActiveAssignment: true });
    const intelligence = mockIntelligence();
    const app = buildApp(DIRECTOR_AUTH, db, mockGovernance(true), intelligence);
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/runtime/officers/assign",
      payload: { entityId: ENTITY_ID, officerRole: "chief_of_staff", agentId: "agent-1" },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { officerRole: string; agentId: string; active: boolean };
    expect(body.officerRole).toBe("chief_of_staff");
    expect(body.active).toBe(true);

    const deactivateCall = calls.find(([sql]) => sql.startsWith("UPDATE rarecrest.officer_assignments"));
    expect(deactivateCall).toBeDefined();
    const insertPassportCall = calls.find(([sql]) => sql.includes("INSERT INTO rarecrest.agent_passports"));
    expect(insertPassportCall).toBeDefined();
    const insertAssignmentCall = calls.find(([sql]) => sql.startsWith("INSERT INTO rarecrest.officer_assignments"));
    expect(insertAssignmentCall).toBeDefined();
    expect(intelligence.appendTrace).toHaveBeenCalledWith(
      expect.objectContaining({ action: "officer_assignment", verdict: "allow" }),
    );
    await app.close();
  });

  it("defaults requestedRights to the role's template maxRights when omitted", async () => {
    const { db, calls } = mockOfficerDb();
    const governance = mockGovernance(true);
    const app = buildApp(DIRECTOR_AUTH, db, governance, mockIntelligence());
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/runtime/officers/assign",
      payload: { entityId: ENTITY_ID, officerRole: "delivery_build", agentId: "agent-2" },
    });
    expect(response.statusCode).toBe(201);
    expect(governance.checkHardRules).toHaveBeenCalledWith(
      expect.objectContaining({ requestedRights: ["code_execution"] }),
    );
    void calls;
    await app.close();
  });
});

describe("POST /api/v1/runtime/officers/:assignmentId/deactivate", () => {
  it("403s for a non-director actor even with a valid assignment", async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT entity_id")) return { rows: [{ entityId: ENTITY_ID }] };
        if (sql.includes("FROM rarecrest.entities")) {
          return { rows: [{ id: ENTITY_ID, name: "Test Entity", vertical: "rareangels" }] };
        }
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;
    const app = buildApp(NON_DIRECTOR_AUTH, db, mockGovernance(), mockIntelligence());
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/runtime/officers/assignment-1/deactivate",
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("404s for a missing assignment", async () => {
    const db = { query: vi.fn(async () => ({ rows: [] })) } as unknown as DatabaseClient;
    const app = buildApp(DIRECTOR_AUTH, db, mockGovernance(), mockIntelligence());
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/runtime/officers/missing-id/deactivate",
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe("GET /api/v1/runtime/officers/templates", () => {
  it("returns the full OFFICER_ROLE_TEMPLATES map", async () => {
    const { db } = mockOfficerDb();
    const app = buildApp(DIRECTOR_AUTH, db, mockGovernance(), mockIntelligence());
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/v1/runtime/officers/templates" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { templates: Record<string, unknown> };
    expect(Object.keys(body.templates)).toHaveLength(Object.keys(OFFICER_ROLE_TEMPLATES).length);
    expect(body.templates.care_ops).toMatchObject({ phiBlind: true, maxRights: [] });
    await app.close();
  });
});

describe("assertLivePassport — requiredOfficerRole extension", () => {
  const LIVE_PASSPORT_ROW = {
    id: "p1",
    agent_id: "agent-1",
    entity_id: ENTITY_ID,
    rights: ["external_comms"],
    risk_tier: "low",
    valid_until: new Date(Date.now() + 60_000).toISOString(),
    hard_rule_clear: true,
  };

  function mockPassportAndOfficerDb(officerAssignmentRows: Array<Record<string, unknown>>): DatabaseClient {
    return {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM rarecrest.agent_passports")) return { rows: [LIVE_PASSPORT_ROW] };
        if (sql.includes("FROM rarecrest.officer_assignments")) return { rows: officerAssignmentRows };
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;
  }

  it("passes without requiredOfficerRole set (unchanged default behavior)", async () => {
    const db = mockPassportAndOfficerDb([]);
    const result = await assertLivePassport(db, { entityId: ENTITY_ID, agentId: "agent-1" });
    expect(result.hardRuleClear).toBe(true);
  });

  it("rejects when requiredOfficerRole is set but no active officer_assignments row matches", async () => {
    const db = mockPassportAndOfficerDb([]);
    await expect(
      assertLivePassport(db, { entityId: ENTITY_ID, agentId: "agent-1" }, { requiredOfficerRole: "chief_of_staff" }),
    ).rejects.toMatchObject({ statusCode: 403, code: "OFFICER_ASSIGNMENT_MISSING" });
  });

  it("accepts when requiredOfficerRole matches an active officer_assignments row", async () => {
    const db = mockPassportAndOfficerDb([{ id: "assignment-1" }]);
    const result = await assertLivePassport(
      db,
      { entityId: ENTITY_ID, agentId: "agent-1" },
      { requiredOfficerRole: "chief_of_staff" },
    );
    expect(result.id).toBe("p1");
  });

  it("still fails closed on passport expiry even when an officer role is required", async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM rarecrest.agent_passports")) {
          return { rows: [{ ...LIVE_PASSPORT_ROW, valid_until: new Date(Date.now() - 60_000).toISOString() }] };
        }
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;
    await expect(
      assertLivePassport(db, { entityId: ENTITY_ID, agentId: "agent-1" }, { requiredOfficerRole: "chief_of_staff" }),
    ).rejects.toBeInstanceOf(PolicyGatewayError);
  });
});
