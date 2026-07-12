import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@rarecrest/db";
import { WikiService } from "./wiki.js";
import { MockWebSearchProvider } from "./web-search.js";
import { isVerifiedDirector } from "../trust.js";

describe("WikiService ingestDecisionTraces", () => {
  it("ingests new traces and skips duplicates by content hash", async () => {
    const seenHashes = new Set<string>();
    const db = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("FROM rarecrest.decision_traces")) {
          return {
            rows: [
              {
                id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                entityId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                vertical: "holding",
                action: "governance_gateway",
                verdict: "allow",
                payload: { ok: true },
                retentionRegime: "standard",
                createdAt: "2026-07-12T00:00:00.000Z",
              },
            ],
          };
        }
        if (sql.includes("wiki_raw_sources WHERE namespace") && sql.includes("content_hash")) {
          const hash = String(params?.[1] ?? "");
          if (seenHashes.has(hash)) return { rows: [{ id: "raw-existing" }] };
          return { rows: [] };
        }
        if (sql.includes("INSERT INTO rarecrest.wiki_raw_sources")) {
          const hash = String(params?.[7] ?? "");
          seenHashes.add(hash);
          return { rows: [{ id: "raw-1" }] };
        }
        if (sql.includes("INSERT INTO rarecrest.wiki_ingest_jobs")) return { rows: [{ id: "job-1" }] };
        if (sql.includes("INSERT INTO rarecrest.wiki_pages")) {
          return {
            rows: [{ id: "page-1", slug: "x", title: "t", pageType: "decision", status: "draft", version: 1 }],
          };
        }
        if (sql.includes("SELECT id FROM rarecrest.wiki_pages WHERE namespace") && sql.includes("AND slug")) {
          return { rows: [] };
        }
        if (sql.includes("SELECT slug, title, page_type")) return { rows: [] };
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;

    const wiki = new WikiService(db, { searchProvider: new MockWebSearchProvider() });
    const first = await wiki.ingestDecisionTraces({
      namespace: "entity/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/working",
      vertical: "holding",
      entityId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      actorId: "director-1",
    });
    expect(first.ingested).toBe(1);
    expect(first.skipped).toBe(0);

    const second = await wiki.ingestDecisionTraces({
      namespace: "entity/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/working",
      vertical: "holding",
      entityId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      actorId: "director-1",
    });
    expect(second.ingested).toBe(0);
    expect(second.skipped).toBe(1);
  });
});

describe("WikiService autoresearch (live provider)", () => {
  it("searches and ingests web + autoresearch sources via injected provider", async () => {
    process.env.WIKI_AUTORESEARCH_ENABLED = "true";
    const inserts: string[] = [];
    const db = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("wiki_raw_sources WHERE namespace") && sql.includes("content_hash")) {
          return { rows: [] };
        }
        if (sql.includes("INSERT INTO rarecrest.wiki_raw_sources")) {
          inserts.push(String(params?.[5]));
          return { rows: [{ id: `raw-${inserts.length}` }] };
        }
        if (sql.includes("INSERT INTO rarecrest.wiki_ingest_jobs")) return { rows: [{ id: "job-1" }] };
        if (sql.includes("INSERT INTO rarecrest.wiki_pages")) {
          return {
            rows: [{ id: "page-1", slug: "p", title: "t", pageType: "source", status: "draft", version: 1 }],
          };
        }
        if (sql.includes("SELECT id FROM rarecrest.wiki_pages")) return { rows: [] };
        if (sql.includes("SELECT slug, title, page_type")) return { rows: [] };
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;

    const provider = new MockWebSearchProvider([
      { url: "https://example.com/liquidity", title: "Liquidity", snippet: "pools" },
    ]);
    const wiki = new WikiService(db, { searchProvider: provider });
    const result = await wiki.autoresearch({
      namespace: "holding/canon",
      vertical: "holding",
      topic: "liquidity",
      actorId: "director-1",
      rounds: 1,
    });
    expect(result.provider).toBe("mock");
    expect(inserts).toContain("web");
    expect(inserts).toContain("autoresearch");
    expect(result.pagesTouched).toBeGreaterThan(0);
    process.env.WIKI_AUTORESEARCH_ENABLED = "false";
  });

  it("refuses autoresearch when disabled", async () => {
    process.env.WIKI_AUTORESEARCH_ENABLED = "false";
    const wiki = new WikiService(
      { query: vi.fn(async () => ({ rows: [] })) } as unknown as DatabaseClient,
      { searchProvider: new MockWebSearchProvider() },
    );
    await expect(
      wiki.autoresearch({
        namespace: "holding/canon",
        vertical: "holding",
        topic: "liquidity",
        actorId: "director-1",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("WikiService Obsidian sync tightening", () => {
  it("rejects non-director vault namespaces", async () => {
    const wiki = new WikiService(
      { query: vi.fn(async () => ({ rows: [] })) } as unknown as DatabaseClient,
      { searchProvider: new MockWebSearchProvider() },
    );
    await expect(
      wiki.buildObsidianSyncManifest({
        namespace: "entity/x/working",
        vertical: "holding",
        actorId: "director-1",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("excludes phi_ref and financial from director manifest", async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM rarecrest.wiki_pages") && sql.includes("ORDER BY updated_at")) {
          return {
            rows: [
              {
                id: "1",
                slug: "ok",
                title: "OK",
                pageType: "concept",
                status: "canon",
                sensitivity: "internal",
                version: 1,
                updatedAt: "2026-07-12T10:00:00.000Z",
                frontmatter: {},
              },
              {
                id: "2",
                slug: "phi",
                title: "PHI",
                pageType: "source",
                status: "draft",
                sensitivity: "phi_ref",
                version: 1,
                updatedAt: "2026-07-12T11:00:00.000Z",
                frontmatter: {},
              },
              {
                id: "3",
                slug: "fin",
                title: "Fin",
                pageType: "source",
                status: "draft",
                sensitivity: "financial",
                version: 1,
                updatedAt: "2026-07-12T12:00:00.000Z",
                frontmatter: {},
              },
            ],
          };
        }
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;

    const wiki = new WikiService(db, { searchProvider: new MockWebSearchProvider() });
    const manifest = await wiki.buildObsidianSyncManifest({
      namespace: "holding/canon",
      vertical: "holding",
      actorId: "director-1",
    });
    expect(manifest.files.map((f) => f.slug)).toEqual(["ok"]);
    expect(manifest.exclusions).toContain("phi_ref");
    expect(manifest.syncToken).toHaveLength(32);
  });

  it("blocks plaintext includeBodies on sync-manifest", async () => {
    const wiki = new WikiService(
      { query: vi.fn(async () => ({ rows: [] })) } as unknown as DatabaseClient,
      { searchProvider: new MockWebSearchProvider() },
    );
    await expect(
      wiki.buildObsidianSyncManifest({
        namespace: "holding/canon",
        vertical: "holding",
        actorId: "director-1",
        includeBodies: true,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("WikiService query agent redaction", () => {
  it("excludes phi_ref and financial pages when redactSensitive", async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("wiki_hot_cache")) return { rows: [] };
        if (sql.includes("FROM rarecrest.wiki_pages") && sql.includes("page_type NOT IN")) {
          return {
            rows: [
              { id: "1", slug: "ok", title: "OK", body: "safe body", sensitivity: "internal" },
              { id: "2", slug: "phi", title: "PHI", body: "secret phi", sensitivity: "phi_ref" },
            ],
          };
        }
        if (sql.includes("wiki_links")) return { rows: [] };
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;
    const wiki = new WikiService(db, { searchProvider: new MockWebSearchProvider() });
    const result = await wiki.query("entity/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/working", "OK", false, "agent-1", {
      redactSensitive: true,
    });
    expect(result.answer).toContain("safe body");
    expect(result.answer).not.toContain("secret phi");
  });

  it("redacts page bodies for agents via filterPageForCaller", () => {
    const wiki = new WikiService(
      { query: vi.fn(async () => ({ rows: [] })) } as unknown as DatabaseClient,
      { searchProvider: new MockWebSearchProvider() },
    );
    const filtered = wiki.filterPageForCaller(
      { slug: "x", sensitivity: "phi_ref", body: "raw phi" },
      { isDirector: false, isAgent: true },
    );
    expect(String(filtered?.body)).toContain("redacted");
    expect(String(filtered?.body)).not.toContain("raw phi");
  });
});

describe("WikiService vault package", () => {
  it("encrypts eligible pages into a signed package", async () => {
    process.env.WIKI_VAULT_PACKAGE_KEK = "test-kek-fortress-32chars-min!!";
    process.env.WIKI_VAULT_PACKAGE_HMAC = "test-hmac-fortress";
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM rarecrest.wiki_pages") && sql.includes("ORDER BY")) {
          return {
            rows: [
              {
                id: "1",
                slug: "ok",
                title: "OK",
                pageType: "concept",
                status: "canon",
                sensitivity: "internal",
                version: 1,
                updatedAt: "2026-07-12T10:00:00.000Z",
                frontmatter: {},
              },
            ],
          };
        }
        if (sql.includes("FROM rarecrest.wiki_pages WHERE namespace") && sql.includes("AND slug")) {
          return {
            rows: [
              {
                id: "1",
                slug: "ok",
                title: "OK",
                pageType: "concept",
                body: "# OK\n\nbody",
                frontmatter: {},
                status: "canon",
                sensitivity: "internal",
                version: 1,
              },
            ],
          };
        }
        if (sql.includes("wiki_links")) return { rows: [] };
        if (sql.includes("INSERT INTO rarecrest.wiki_vault_packages")) {
          return { rows: [{ id: "pkg-1" }] };
        }
        if (sql.includes("INSERT INTO rarecrest.wiki_vault_package_jobs")) {
          return { rows: [{ id: "job-1" }] };
        }
        return { rows: [] };
      }),
    } as unknown as DatabaseClient;
    const wiki = new WikiService(db, { searchProvider: new MockWebSearchProvider() });
    const result = await wiki.enqueueVaultPackage({
      namespace: "holding/canon",
      vertical: "holding",
      actorId: "director-1",
      passphrase: "director-passphrase-12",
      asyncThreshold: 1000,
    });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("expected ready");
    expect(result.fileCount).toBeGreaterThan(0);
    expect(result.package?.format).toBe("rarecrest-rcvault-v1");
    delete process.env.WIKI_VAULT_PACKAGE_KEK;
    delete process.env.WIKI_VAULT_PACKAGE_HMAC;
  });
});

describe("Obsidian route auth expectation", () => {
  it("verified director required in strict mode", () => {
    process.env.AUTH_TRUST_MODE = "strict";
    expect(
      isVerifiedDirector(
        { userId: "u1", vertical: "holding", authMethod: "header", role: "director" },
        { "x-user-role": "director" },
      ),
    ).toBe(false);
    expect(
      isVerifiedDirector(
        { userId: "u1", vertical: "holding", authMethod: "oidc", role: "director" },
        {},
      ),
    ).toBe(true);
    process.env.AUTH_TRUST_MODE = "dev";
  });
});
