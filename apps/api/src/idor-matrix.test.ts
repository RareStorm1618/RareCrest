import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@rarecrest/db";
import type { AuthContext } from "./auth.js";
import { registerVendorShortcutRoutes } from "./routes/vendor-shortcut-routes.js";
import { registerPortfolioRoutes } from "./routes/portfolio-routes.js";
import { registerRegulatoryProfileRoutes } from "./routes/regulatory-profile-routes.js";
import { registerCommandRoutes } from "./routes/command-routes.js";
import { registerAuthRevocationRoutes } from "./routes/auth-revocation-routes.js";
import { assertEntityAccess, EntityAccessError } from "./tenancy.js";
import { isVerifiedDirector } from "./trust.js";
import { mapRouteError } from "./errors.js";
import { PortfolioService } from "./services/portfolio.js";
import { WikiService } from "./services/wiki.js";
import { MockWebSearchProvider } from "./services/web-search.js";
import {
  assertPrivateDeploymentOrDie,
  readInternalServiceToken,
  requireInternalServiceTokenOrDie,
} from "./fortress.js";

/**
 * Wave 0 IDOR matrix — contract tests documenting that every entity-scoped route
 * requires assertEntityAccess (fail-closed on cross-vertical / missing entities),
 * that the director-1 privilege bypass is gone, that the private-deployment fortress
 * fail-closes on internal RPC auth, and that canon wiki pages are immutable without
 * explicit break-glass.
 */

const ENTITY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // vertical: rareangels
const ENTITY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // vertical: rareedge

function buildAppWithAuth(auth: AuthContext) {
  const app = Fastify();
  app.addHook("preHandler", async (request) => {
    request.auth = auth;
  });
  // Mirror index.ts's top-level error handler so TenancyViolationError/EntityAccessError
  // thrown (and not locally caught) still map to the correct status code in tests.
  app.setErrorHandler((error, _request, reply) => {
    const mapped = mapRouteError(error);
    if (mapped) return reply.status(mapped.status).send(mapped.body);
    reply.status(500).send({ message: "Internal server error" });
  });
  return app;
}

function mockEntityDb(entities: Record<string, { vertical: string }>): DatabaseClient {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("FROM rarecrest.entities")) {
        const id = params?.[0] as string;
        const entity = entities[id];
        if (!entity) return { rows: [] };
        // Mirror real queries that append "AND vertical = $2" when a scope is supplied.
        const scopeVertical = sql.includes("vertical = $2") ? (params?.[1] as string | undefined) : undefined;
        if (scopeVertical && scopeVertical !== entity.vertical) return { rows: [] };
        return {
          rows: [
            {
              id,
              name: "Entity",
              vertical: entity.vertical,
              entity_type: "nonprofit",
              is_holding_entity: false,
              regulatory_regimes: [],
            },
          ],
        };
      }
      return { rows: [] };
    }),
  } as unknown as DatabaseClient;
}

describe("assertEntityAccess — director-1 bypass removed", () => {
  it("isVerifiedDirector rejects userId=director-1 without role=director", () => {
    process.env.AUTH_TRUST_MODE = "dev";
    expect(
      isVerifiedDirector(
        { userId: "director-1", vertical: "rareangels", authMethod: "header" },
        {},
      ),
    ).toBe(false);
  });

  it("isVerifiedDirector still grants director scope for explicit role=director", () => {
    process.env.AUTH_TRUST_MODE = "dev";
    expect(
      isVerifiedDirector(
        { userId: "director-1", vertical: "rareangels", authMethod: "header", role: "director" },
        {},
      ),
    ).toBe(true);
  });

  it("auth-revocation route denies director-1 without a director/compliance_officer role", async () => {
    const app = buildAppWithAuth({ userId: "director-1", vertical: "holding", authMethod: "header" });
    registerAuthRevocationRoutes(app, mockEntityDb({}));
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/revoke",
      payload: { subject: "someone", reason: "test" },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describe("vendor-shortcut-routes — entity IDOR closed", () => {
  it("GET inventory 404s on unknown entity", async () => {
    const app = buildAppWithAuth({ userId: "u1", vertical: "rareangels", authMethod: "header" });
    registerVendorShortcutRoutes(app, mockEntityDb({}));
    await app.ready();
    const response = await app.inject({ method: "GET", url: `/api/v1/vendor-shortcut/${ENTITY_A}/inventory` });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("GET inventory 403s on cross-vertical entity without director bypass", async () => {
    const app = buildAppWithAuth({ userId: "u1", vertical: "rareangels", authMethod: "header" });
    registerVendorShortcutRoutes(app, mockEntityDb({ [ENTITY_B]: { vertical: "rareedge" } }));
    await app.ready();
    const response = await app.inject({ method: "GET", url: `/api/v1/vendor-shortcut/${ENTITY_B}/inventory` });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("GET inventory allows cross-vertical entity for a verified director", async () => {
    const app = buildAppWithAuth({
      userId: "u1",
      vertical: "holding",
      authMethod: "header",
      role: "director",
    });
    registerVendorShortcutRoutes(app, mockEntityDb({ [ENTITY_B]: { vertical: "rareedge" } }));
    await app.ready();
    const response = await app.inject({ method: "GET", url: `/api/v1/vendor-shortcut/${ENTITY_B}/inventory` });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("POST inventory 403s when entityId belongs to another vertical", async () => {
    const app = buildAppWithAuth({ userId: "u1", vertical: "rareangels", authMethod: "header" });
    registerVendorShortcutRoutes(app, mockEntityDb({ [ENTITY_B]: { vertical: "rareedge" } }));
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/vendor-shortcut/inventory",
      payload: { entityId: ENTITY_B, inventory: [] },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("POST destination-mapping 403s when entityId belongs to another vertical", async () => {
    const app = buildAppWithAuth({ userId: "u1", vertical: "rareangels", authMethod: "header" });
    registerVendorShortcutRoutes(app, mockEntityDb({ [ENTITY_B]: { vertical: "rareedge" } }));
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/vendor-shortcut/destination-mapping",
      payload: { entityId: ENTITY_B, inventory: [], targetCapabilities: [] },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describe("portfolio-routes — attention-flags & relationships IDOR closed", () => {
  it("GET attention-flags 403s on cross-vertical entity", async () => {
    const app = buildAppWithAuth({ userId: "u1", vertical: "rareangels", authMethod: "header" });
    const db = mockEntityDb({ [ENTITY_B]: { vertical: "rareedge" } });
    registerPortfolioRoutes(app, new PortfolioService(db), db);
    await app.ready();
    const response = await app.inject({ method: "GET", url: `/api/v1/portfolio/entities/${ENTITY_B}/attention-flags` });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("GET attention-flags allows director cross-vertical scope", async () => {
    const app = buildAppWithAuth({ userId: "u1", vertical: "holding", authMethod: "header", role: "director" });
    const db = mockEntityDb({ [ENTITY_B]: { vertical: "rareedge" } });
    registerPortfolioRoutes(app, new PortfolioService(db), db);
    await app.ready();
    const response = await app.inject({ method: "GET", url: `/api/v1/portfolio/entities/${ENTITY_B}/attention-flags` });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("POST relationships 403s when toEntityId belongs to another vertical", async () => {
    const app = buildAppWithAuth({ userId: "u1", vertical: "rareangels", authMethod: "header" });
    const db = mockEntityDb({
      [ENTITY_A]: { vertical: "rareangels" },
      [ENTITY_B]: { vertical: "rareedge" },
    });
    registerPortfolioRoutes(app, new PortfolioService(db), db);
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/portfolio/relationships",
      payload: { fromEntityId: ENTITY_A, toEntityId: ENTITY_B, relationshipType: "parent" },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describe("regulatory-profile-routes — scoped changes route", () => {
  it("GET regulatory-profile/changes 404s when entity is out of vertical scope", async () => {
    const app = buildAppWithAuth({ userId: "u1", vertical: "rareangels", authMethod: "header" });
    const db = mockEntityDb({ [ENTITY_B]: { vertical: "rareedge" } });
    registerRegulatoryProfileRoutes(app, db);
    await app.ready();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/entities/${ENTITY_B}/regulatory-profile/changes`,
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe("command-routes memory records — vertical scoping", () => {
  function mockMemoryDb(): { db: DatabaseClient; inserted: unknown[] } {
    const inserted: unknown[] = [];
    const db = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("INSERT INTO rarecrest.shared_memory_records")) {
          inserted.push(params);
          return {
            rows: [
              {
                id: "rec-1",
                title: params?.[0],
                content: params?.[1],
                tags: params?.[2],
                vertical: params?.[3],
                actorId: params?.[4],
                createdAt: new Date().toISOString(),
              },
            ],
          };
        }
        if (sql.includes("SELECT id, title, content, tags, vertical")) {
          return {
            rows: [
              { id: "rec-1", title: "a", content: "x", tags: [], vertical: "rareangels", actorId: "u1", createdAt: "now" },
              { id: "rec-2", title: "b", content: "y", tags: [], vertical: "rareedge", actorId: "u2", createdAt: "now" },
            ],
          };
        }
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;
    return { db, inserted };
  }

  it("POST /api/v1/memory/records stores requester vertical + actorId", async () => {
    const { db, inserted } = mockMemoryDb();
    const app = buildAppWithAuth({ userId: "u1", vertical: "rareangels", authMethod: "header" });
    registerCommandRoutes(app, db);
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/memory/records",
      payload: { title: "t", content: "c" },
    });
    expect(response.statusCode).toBe(201);
    expect(inserted[0]).toEqual(["t", "c", JSON.stringify([]), "rareangels", "u1"]);
    await app.close();
  });

  it("GET /api/v1/memory/records passes non-director scope to the query", async () => {
    const { db } = mockMemoryDb();
    const app = buildAppWithAuth({ userId: "u1", vertical: "rareangels", authMethod: "header" });
    registerCommandRoutes(app, db);
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/v1/memory/records" });
    expect(response.statusCode).toBe(200);
    const call = (db.query as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      String(c[0]).includes("SELECT id, title, content, tags, vertical"),
    );
    expect(call?.[1]).toEqual([false, "rareangels"]);
    await app.close();
  });

  it("GET /api/v1/memory/records passes director=true bypass to the query", async () => {
    const { db } = mockMemoryDb();
    const app = buildAppWithAuth({ userId: "u1", vertical: "holding", authMethod: "header", role: "director" });
    registerCommandRoutes(app, db);
    await app.ready();
    await app.inject({ method: "GET", url: "/api/v1/memory/records" });
    const call = (db.query as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      String(c[0]).includes("SELECT id, title, content, tags, vertical"),
    );
    expect(call?.[1]).toEqual([true, "holding"]);
    await app.close();
  });
});

describe("EntityAccessError mapping (assertEntityAccess helper)", () => {
  it("throws 404 for missing entities and 403 for cross-vertical (via TenancyViolationError)", async () => {
    const db = mockEntityDb({ [ENTITY_A]: { vertical: "rareangels" } });
    await expect(
      assertEntityAccess(db, "unknown-id", { userId: "u1", vertical: "rareangels", authMethod: "header" }),
    ).rejects.toBeInstanceOf(EntityAccessError);
    await expect(
      assertEntityAccess(db, ENTITY_A, { userId: "u1", vertical: "rareedge", authMethod: "header" }),
    ).rejects.toMatchObject({ name: "TenancyViolationError" });
  });

  it("director bypass skips tenancy enforcement", async () => {
    const db = mockEntityDb({ [ENTITY_A]: { vertical: "rareangels" } });
    const row = await assertEntityAccess(
      db,
      ENTITY_A,
      { userId: "director-1", vertical: "rareedge", authMethod: "header", role: "director" },
      true,
    );
    expect(row.vertical).toBe("rareangels");
  });
});

describe("fortress — INTERNAL_SERVICE_TOKEN fail-closed", () => {
  afterEach(() => {
    process.env.AUTH_TRUST_MODE = "dev";
    delete process.env.CORS_ALLOWED_ORIGINS;
    delete process.env.INTERNAL_SERVICE_TOKEN;
    delete process.env.INTERNAL_SERVICE_TOKEN_FILE;
  });

  it("requires INTERNAL_SERVICE_TOKEN when AUTH_TRUST_MODE=strict, even on loopback", () => {
    process.env.AUTH_TRUST_MODE = "strict";
    delete process.env.INTERNAL_SERVICE_TOKEN;
    expect(() => requireInternalServiceTokenOrDie("127.0.0.1")).toThrow(/INTERNAL_SERVICE_TOKEN/);
  });

  it("requires INTERNAL_SERVICE_TOKEN for non-loopback binds regardless of trust mode", () => {
    process.env.AUTH_TRUST_MODE = "dev";
    delete process.env.INTERNAL_SERVICE_TOKEN;
    expect(() => requireInternalServiceTokenOrDie("0.0.0.0")).toThrow(/INTERNAL_SERVICE_TOKEN/);
  });

  it("assertPrivateDeploymentOrDie fails closed on non-loopback without a configured token", () => {
    process.env.AUTH_TRUST_MODE = "strict";
    process.env.CORS_ALLOWED_ORIGINS = "https://example.com";
    delete process.env.INTERNAL_SERVICE_TOKEN;
    expect(() => assertPrivateDeploymentOrDie("0.0.0.0")).toThrow(/INTERNAL_SERVICE_TOKEN/);
    delete process.env.CORS_ALLOWED_ORIGINS;
  });

  it("readInternalServiceToken returns undefined when nothing is configured", () => {
    delete process.env.INTERNAL_SERVICE_TOKEN;
    delete process.env.INTERNAL_SERVICE_TOKEN_FILE;
    expect(readInternalServiceToken()).toBeUndefined();
  });
});

describe("wiki canon immutability", () => {
  function mockWikiDb(existingStatus: string | null): DatabaseClient {
    return {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT status FROM rarecrest.wiki_pages")) {
          return { rows: existingStatus ? [{ status: existingStatus }] : [] };
        }
        if (sql.includes("INSERT INTO rarecrest.wiki_pages")) {
          return {
            rows: [{ id: "page-1", slug: "index", title: "t", pageType: "index", status: "draft", version: 2 }],
          };
        }
        if (sql.includes("wiki_links")) return { rows: [] };
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;
  }

  it("refuses to overwrite a canon page without allowCanonOverwrite", async () => {
    const wiki = new WikiService(mockWikiDb("canon"), { searchProvider: new MockWebSearchProvider() });
    await expect(
      wiki.upsertPage({
        namespace: "vertical/rareangels/wiki",
        vertical: "rareangels",
        slug: "index",
        title: "Wiki Index",
        pageType: "index",
        body: "body",
        frontmatter: {},
        sensitivity: "internal",
        actorId: "agent-1",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("allows overwriting a canon page when allowCanonOverwrite is set", async () => {
    const wiki = new WikiService(mockWikiDb("canon"), { searchProvider: new MockWebSearchProvider() });
    await expect(
      wiki.upsertPage({
        namespace: "vertical/rareangels/wiki",
        vertical: "rareangels",
        slug: "index",
        title: "Wiki Index",
        pageType: "index",
        body: "body",
        frontmatter: {},
        sensitivity: "internal",
        status: "canon",
        actorId: "system",
        allowCanonOverwrite: true,
      }),
    ).resolves.toBeTruthy();
  });

  it("allows normal draft upserts when no canon page exists yet", async () => {
    const wiki = new WikiService(mockWikiDb(null), { searchProvider: new MockWebSearchProvider() });
    await expect(
      wiki.upsertPage({
        namespace: "vertical/rareangels/wiki",
        vertical: "rareangels",
        slug: "index",
        title: "Wiki Index",
        pageType: "index",
        body: "body",
        frontmatter: {},
        sensitivity: "internal",
        actorId: "agent-1",
      }),
    ).resolves.toBeTruthy();
  });
});
