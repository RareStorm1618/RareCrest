import { createHash, randomBytes } from "node:crypto";
import type { DatabaseClient } from "@rarecrest/db";
import type { VerticalKey } from "@rarecrest/contracts";
import {
  VERTICAL_CHARTERS,
  namespaceForVertical,
  namespaceForHoldingCanon,
  namespaceForEntity,
  namespaceForBridge,
  slugify,
  compileIngest,
  extractWikiLinks,
  toSlugFromLink,
  lintWiki,
  rankPages,
  analyseGraph,
  hybridRank,
  bagEmbedding,
  defuddleHtml,
  pagesToCanvas,
  buildBasesView,
  renderThinkingSession,
  injectContradictionCallout,
  formatDecisionTraceForWiki,
  synthesizeAutoresearchBody,
  rankSearchHits,
  isBlockedFetchUrl,
  isDirectorObsidianNamespace,
  isObsidianSyncSafeSensitivity,
  filterObsidianSyncPages,
  buildObsidianSyncToken,
  toObsidianManifestFiles,
  looksLikePhiOrSecret,
  scrubSecretsAndPhi,
  sanitizeAutoresearchTopic,
  isAutoresearchEnabled,
  buildVaultPackagePlain,
  encryptVaultPackage,
  type WikiSensitivity,
  type WikiPageType,
} from "@rarecrest/wiki";
import { VectorStoreClient } from "@rarecrest/vector-store";
import { createWebSearchFromEnv, type WebSearchProvider } from "./web-search.js";
import { loadSecret } from "../secrets.js";
import { createObjectStoreFromEnv } from "@rarecrest/object-store";
import { assertDbRateLimit, RateLimitError } from "./rate-limit.js";

export class WikiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "WikiError";
  }
}

export class WikiService {
  private vectorStore: VectorStoreClient | null = null;
  private searchProvider: WebSearchProvider;
  private rateBuckets = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private db: DatabaseClient,
    opts?: { searchProvider?: WebSearchProvider },
  ) {
    this.vectorStore = new VectorStoreClient({
      url: process.env.VECTOR_STORE_URL ?? "http://localhost:6333",
      collection: process.env.WIKI_VECTOR_COLLECTION ?? "federated-wiki",
    });
    this.searchProvider = opts?.searchProvider ?? createWebSearchFromEnv();
  }

  /** Simple per-actor rate limit (fail-closed). In-memory only — use assertRateLimitDb for Postgres-backed limits. */
  assertRateLimit(key: string, max: number, windowMs: number) {
    const now = Date.now();
    const bucket = this.rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    bucket.count += 1;
    if (bucket.count > max) {
      throw new WikiError(`Rate limit exceeded for ${key}`, 429);
    }
  }

  /** Postgres-backed rate limit (rarecrest.api_rate_limits); falls back to the in-memory bucket. */
  async assertRateLimitDb(key: string, max: number, windowMs: number): Promise<void> {
    try {
      await assertDbRateLimit(this.db, key, max, windowMs);
    } catch (err) {
      if (err instanceof RateLimitError) {
        throw new WikiError(err.message, err.statusCode);
      }
      throw err;
    }
  }

  resolveNamespace(input: {
    vertical: VerticalKey;
    entityId?: string;
    bridgeTo?: VerticalKey;
    holdingCanon?: boolean;
  }): string {
    if (input.holdingCanon) return namespaceForHoldingCanon();
    if (input.bridgeTo) return namespaceForBridge(input.vertical, input.bridgeTo);
    if (input.entityId) return namespaceForEntity(input.entityId);
    return namespaceForVertical(input.vertical);
  }

  charter(vertical: VerticalKey) {
    return VERTICAL_CHARTERS[vertical];
  }

  async appendLog(namespace: string, vertical: VerticalKey, action: string, detail: string, actorId: string) {
    await this.db.query(
      `INSERT INTO rarecrest.wiki_log_entries (namespace, vertical, action, detail, actor_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [namespace, vertical, action, detail, actorId],
    );
  }

  async upsertPage(input: {
    namespace: string;
    vertical: VerticalKey;
    entityId?: string;
    slug: string;
    title: string;
    pageType: WikiPageType;
    body: string;
    frontmatter: Record<string, unknown>;
    sensitivity: WikiSensitivity;
    status?: string;
    actorId: string;
    allowCanonOverwrite?: boolean;
  }) {
    const existing = await this.db.query<{ status: string }>(
      `SELECT status FROM rarecrest.wiki_pages WHERE namespace = $1 AND slug = $2`,
      [input.namespace, input.slug],
    );
    if (existing.rows[0]?.status === "canon" && !input.allowCanonOverwrite) {
      throw new WikiError(
        "Canon pages are immutable without promote break-glass",
        403,
      );
    }
    const result = await this.db.query(
      `INSERT INTO rarecrest.wiki_pages
         (namespace, vertical, entity_id, slug, title, page_type, body, frontmatter, status, sensitivity, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$11)
       ON CONFLICT (namespace, slug) DO UPDATE SET
         title = EXCLUDED.title,
         body = EXCLUDED.body,
         frontmatter = EXCLUDED.frontmatter,
         page_type = EXCLUDED.page_type,
         sensitivity = EXCLUDED.sensitivity,
         version = rarecrest.wiki_pages.version + 1,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING id, slug, title, page_type AS "pageType", status, version`,
      [
        input.namespace,
        input.vertical,
        input.entityId ?? null,
        input.slug,
        input.title,
        input.pageType,
        input.body,
        JSON.stringify(input.frontmatter),
        input.status ?? "draft",
        input.sensitivity,
        input.actorId,
      ],
    );
    const page = result.rows[0];
    await this.syncLinks(input.namespace, page.id as string, input.body);
    await this.indexPageVector(page.id as string, input.namespace, `${input.title}\n${input.body}`);
    return page;
  }

  private async indexPageVector(pageId: string, namespace: string, text: string) {
    if (!this.vectorStore) return;
    try {
      const healthy = await this.vectorStore.healthCheck();
      if (!healthy) return;
      await this.vectorStore.upsert([
        {
          id: pageId,
          vector: bagEmbedding(text),
          payload: { namespace, kind: "wiki_page" },
        },
      ]);
    } catch {
      // Vector index is best-effort — lexical + graph remain primary.
    }
  }

  async syncLinks(namespace: string, fromPageId: string, body: string) {
    await this.db.query(`DELETE FROM rarecrest.wiki_links WHERE from_page_id = $1`, [fromPageId]);
    const links = extractWikiLinks(body);
    for (const link of links) {
      const toSlug = toSlugFromLink(link);
      const target = await this.db.query(
        `SELECT id FROM rarecrest.wiki_pages WHERE namespace = $1 AND slug = $2`,
        [namespace, toSlug],
      );
      await this.db.query(
        `INSERT INTO rarecrest.wiki_links (namespace, from_page_id, to_slug, to_page_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (from_page_id, to_slug) DO NOTHING`,
        [namespace, fromPageId, toSlug, target.rows[0]?.id ?? null],
      );
    }
  }

  async acquireLock(namespace: string, slug: string, holder: string, ttlSeconds = 120): Promise<boolean> {
    const existing = await this.db.query(
      `SELECT id FROM rarecrest.wiki_pages WHERE namespace = $1 AND slug = $2`,
      [namespace, slug],
    );
    // New pages have no lock contention yet — allow first writer.
    if (existing.rows.length === 0) return true;
    const until = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const result = await this.db.query(
      `UPDATE rarecrest.wiki_pages
       SET lock_holder = $3, lock_until = $4
       WHERE namespace = $1 AND slug = $2
         AND (lock_holder IS NULL OR lock_holder = $3 OR lock_until IS NULL OR lock_until < NOW())
       RETURNING id`,
      [namespace, slug, holder, until],
    );
    return result.rows.length > 0;
  }

  async releaseLock(namespace: string, slug: string, holder: string) {
    await this.db.query(
      `UPDATE rarecrest.wiki_pages SET lock_holder = NULL, lock_until = NULL
       WHERE namespace = $1 AND slug = $2 AND lock_holder = $3`,
      [namespace, slug, holder],
    );
  }

  async ingest(input: {
    namespace: string;
    vertical: VerticalKey;
    entityId?: string;
    title: string;
    body: string;
    sourceKind: string;
    sensitivity?: WikiSensitivity;
    actorId: string;
    html?: string;
    contentHashOverride?: string;
    skipIfHashExists?: boolean;
  }) {
    const charter = this.charter(input.vertical);
    let body = input.body;
    if (input.html) body = defuddleHtml(input.html);

    if (charter.phiBlind && looksLikePhiOrSecret(body)) {
      const hasBlindRef = /vault:|phi_envelope:|\[PHI_REF\]|\[REDACTED/i.test(body);
      if (!hasBlindRef) {
        throw new WikiError(
          "Care charter refuses plaintext PHI/secrets — encrypt via PHI vault and ingest blind refs only",
          422,
        );
      }
    }
    body = scrubSecretsAndPhi(body).text;

    const sensitivity = (input.sensitivity ?? (charter.phiBlind ? "phi_ref" : "internal")) as WikiSensitivity;
    const compiled = compileIngest({
      title: input.title,
      body,
      sourceKind: input.sourceKind,
      sensitivity,
      phiBlind: charter.phiBlind,
      contentHashOverride: input.contentHashOverride,
    });

    if (input.skipIfHashExists) {
      const existing = await this.db.query(
        `SELECT id FROM rarecrest.wiki_raw_sources WHERE namespace = $1 AND content_hash = $2`,
        [input.namespace, compiled.contentHash],
      );
      if (existing.rows.length > 0) {
        return {
          skipped: true as const,
          jobId: null,
          rawSourceId: existing.rows[0].id,
          pagesTouched: 0,
          pages: [],
          summary: `Skipped duplicate raw source ${compiled.contentHash.slice(0, 12)}`,
        };
      }
    }

    const raw = await this.db.query(
      `INSERT INTO rarecrest.wiki_raw_sources
         (namespace, vertical, entity_id, title, body, source_kind, sensitivity, content_hash, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (namespace, content_hash) DO UPDATE SET title = EXCLUDED.title
       RETURNING id`,
      [
        input.namespace,
        input.vertical,
        input.entityId ?? null,
        input.title,
        body,
        input.sourceKind,
        compiled.pages[0].sensitivity,
        compiled.contentHash,
        input.actorId,
      ],
    );

    const job = await this.db.query(
      `INSERT INTO rarecrest.wiki_ingest_jobs (namespace, vertical, raw_source_id, status, created_by)
       VALUES ($1,$2,$3,'running',$4) RETURNING id`,
      [input.namespace, input.vertical, raw.rows[0].id, input.actorId],
    );

    const touched: unknown[] = [];
    for (const page of compiled.pages) {
      const locked = await this.acquireLock(input.namespace, page.slug, input.actorId);
      if (!locked) throw new WikiError(`Page locked: ${page.slug}`, 409);
      try {
        touched.push(
          await this.upsertPage({
            namespace: input.namespace,
            vertical: input.vertical,
            entityId: input.entityId,
            slug: page.slug,
            title: page.title,
            pageType: page.pageType,
            body: page.body,
            frontmatter: page.frontmatter,
            sensitivity: page.sensitivity,
            actorId: input.actorId,
          }),
        );
      } finally {
        await this.releaseLock(input.namespace, page.slug, input.actorId);
      }
    }

    await this.rebuildIndex(input.namespace, input.vertical, input.actorId);
    await this.refreshHotCache(input.namespace, input.vertical, input.actorId, compiled.summary);
    await this.appendLog(input.namespace, input.vertical, "ingest", compiled.summary, input.actorId);

    await this.db.query(
      `UPDATE rarecrest.wiki_ingest_jobs
       SET status = 'completed', pages_touched = $2, summary = $3, completed_at = NOW()
       WHERE id = $1`,
      [job.rows[0].id, touched.length, compiled.summary],
    );

    return {
      skipped: false as const,
      jobId: job.rows[0].id,
      rawSourceId: raw.rows[0].id,
      pagesTouched: touched.length,
      pages: touched,
      summary: compiled.summary,
    };
  }

  /**
   * Pull append-only decision_traces into wiki_raw_sources (source_kind=decision_trace).
   * Idempotent via content_hash = sha256(decision-trace:{id}).
   */
  async ingestDecisionTraces(input: {
    namespace: string;
    vertical: VerticalKey;
    entityId: string;
    actorId: string;
    since?: string;
    traceIds?: string[];
    limit?: number;
  }) {
    const limit = Math.min(input.limit ?? 100, 500);
    let rows: Array<Record<string, unknown>>;
    if (input.traceIds && input.traceIds.length > 0) {
      const result = await this.db.query(
        `SELECT id, entity_id AS "entityId", vertical, action, verdict, payload,
                retention_regime AS "retentionRegime", created_at AS "createdAt"
         FROM rarecrest.decision_traces
         WHERE id = ANY($1::uuid[]) AND ($2::uuid IS NULL OR entity_id = $2)
         ORDER BY created_at ASC
         LIMIT $3`,
        [input.traceIds, input.entityId, limit],
      );
      rows = result.rows;
    } else {
      const result = await this.db.query(
        `SELECT id, entity_id AS "entityId", vertical, action, verdict, payload,
                retention_regime AS "retentionRegime", created_at AS "createdAt"
         FROM rarecrest.decision_traces
         WHERE entity_id = $1
           AND ($2::timestamptz IS NULL OR created_at > $2::timestamptz)
         ORDER BY created_at ASC
         LIMIT $3`,
        [input.entityId, input.since ?? null, limit],
      );
      rows = result.rows;
    }

    let ingested = 0;
    let skipped = 0;
    const jobIds: string[] = [];
    const details: Array<{ traceId: string; status: string }> = [];

    for (const row of rows) {
      const formatted = formatDecisionTraceForWiki({
        id: row.id as string,
        entityId: (row.entityId as string | null) ?? null,
        vertical: row.vertical as string,
        action: row.action as string,
        verdict: row.verdict as "allow" | "deny",
        payload: (row.payload as Record<string, unknown>) ?? {},
        retentionRegime: row.retentionRegime as string | undefined,
        createdAt: new Date(row.createdAt as string).toISOString(),
      });
      const result = await this.ingest({
        namespace: input.namespace,
        vertical: input.vertical,
        entityId: input.entityId,
        title: formatted.title,
        body: formatted.body,
        sourceKind: "decision_trace",
        actorId: input.actorId,
        contentHashOverride: formatted.contentHash,
        skipIfHashExists: true,
      });
      if (result.skipped) {
        skipped += 1;
        details.push({ traceId: row.id as string, status: "skipped" });
      } else {
        ingested += 1;
        if (result.jobId) jobIds.push(result.jobId as string);
        details.push({ traceId: row.id as string, status: "ingested" });
      }
    }

    await this.appendLog(
      input.namespace,
      input.vertical,
      "ingest_decision_traces",
      `ingested=${ingested} skipped=${skipped} entity=${input.entityId}`,
      input.actorId,
    );

    return { ingested, skipped, scanned: rows.length, jobIds, details };
  }

  async rebuildIndex(namespace: string, vertical: VerticalKey, actorId: string) {
    const pages = await this.db.query(
      `SELECT slug, title, page_type AS "pageType", status FROM rarecrest.wiki_pages
       WHERE namespace = $1 ORDER BY page_type, title`,
      [namespace],
    );
    const byType = new Map<string, string[]>();
    for (const p of pages.rows) {
      const t = p.pageType as string;
      const list = byType.get(t) ?? [];
      list.push(`- [[${p.title as string}]] (\`${p.slug}\`, ${p.status})`);
      byType.set(t, list);
    }
    let body = `# Wiki Index\n\nNamespace: \`${namespace}\`\n\n`;
    for (const [type, lines] of byType) {
      body += `## ${type}\n\n${lines.join("\n")}\n\n`;
    }
    await this.upsertPage({
      namespace,
      vertical,
      slug: "index",
      title: "Wiki Index",
      pageType: "index",
      body,
      frontmatter: { tags: ["index"] },
      sensitivity: "internal",
      status: "canon",
      actorId,
      allowCanonOverwrite: true,
    });
  }

  async refreshHotCache(namespace: string, vertical: VerticalKey, actorId: string, summary: string) {
    const recent = await this.db.query(
      `SELECT action, detail, created_at FROM rarecrest.wiki_log_entries
       WHERE namespace = $1 ORDER BY created_at DESC LIMIT 8`,
      [namespace],
    );
    const lines = recent.rows.map((r) => `- ${r.action}: ${r.detail}`);
    const body = `# Hot Cache\n\n${summary}\n\n## Recent\n\n${lines.join("\n")}\n`.slice(0, 4000);
    await this.db.query(
      `INSERT INTO rarecrest.wiki_hot_cache (namespace, vertical, body, updated_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (namespace) DO UPDATE SET body = EXCLUDED.body, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [namespace, vertical, body, actorId],
    );
    await this.upsertPage({
      namespace,
      vertical,
      slug: "hot",
      title: "Hot Cache",
      pageType: "hot",
      body,
      frontmatter: { tags: ["hot"] },
      sensitivity: "internal",
      status: "canon",
      actorId,
      allowCanonOverwrite: true,
    });
  }

  async listPages(namespace: string, pageType?: string) {
    const result = await this.db.query(
      `SELECT id, slug, title, page_type AS "pageType", status, sensitivity, version,
              updated_at AS "updatedAt", frontmatter
       FROM rarecrest.wiki_pages
       WHERE namespace = $1 AND ($2::text IS NULL OR page_type = $2)
       ORDER BY updated_at DESC
       LIMIT 200`,
      [namespace, pageType ?? null],
    );
    return result.rows;
  }

  async getPage(namespace: string, slug: string) {
    const result = await this.db.query(
      `SELECT id, slug, title, page_type AS "pageType", body, frontmatter, status, sensitivity,
              version, lock_holder AS "lockHolder", lock_until AS "lockUntil",
              updated_at AS "updatedAt", created_at AS "createdAt"
       FROM rarecrest.wiki_pages WHERE namespace = $1 AND slug = $2`,
      [namespace, slug],
    );
    return result.rows[0] ?? null;
  }

  async query(
    namespace: string,
    question: string,
    fileAnswer = false,
    actorId = "system",
    opts?: { redactSensitive?: boolean; includeDrafts?: boolean },
  ) {
    await this.assertRateLimitDb(`query:${actorId}`, 60, 60_000);
    const redact = opts?.redactSensitive === true;
    // Agents (and any caller opting out of drafts) see canon-only pages by default.
    const includeDrafts = opts?.includeDrafts ?? true;
    const hot = await this.db.query(`SELECT body FROM rarecrest.wiki_hot_cache WHERE namespace = $1`, [namespace]);
    const pages = await this.db.query(
      `SELECT id, slug, title, body, sensitivity
       FROM rarecrest.wiki_pages
       WHERE namespace = $1 AND page_type NOT IN ('log')
         ${includeDrafts ? "" : "AND status = 'canon'"}`,
      [namespace],
    );
    const visiblePages = redact
      ? pages.rows.filter((p) => {
          const s = String(p.sensitivity ?? "internal");
          return s !== "phi_ref" && s !== "financial";
        })
      : pages.rows;
    const links = await this.db.query(
      `SELECT from_page_id AS "fromId", to_slug AS "toSlug", to_page_id AS "toId"
       FROM rarecrest.wiki_links WHERE namespace = $1`,
      [namespace],
    );
    const nodes = visiblePages.map((p) => ({
      id: p.id as string,
      slug: p.slug as string,
      title: p.title as string,
    }));
    const edges = links.rows.map((l) => ({
      fromId: l.fromId as string,
      toSlug: l.toSlug as string,
      toId: (l.toId as string | null) ?? null,
    }));
    const graphRanked = rankPages(nodes, edges, question.toLowerCase().split(/\W+/).filter(Boolean), 20);
    const graphScore = new Map(graphRanked.map((g) => [g.id, g.score]));
    const vectorScore = new Map<string, number>();
    if (this.vectorStore) {
      try {
        const healthy = await Promise.race([
          this.vectorStore.healthCheck(),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 800)),
        ]);
        if (healthy) {
          const hits = await Promise.race([
            this.vectorStore.search(bagEmbedding(question), 12),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("vector timeout")), 1200)),
          ]);
          for (const hit of hits) {
            if (hit.payload?.namespace === namespace) {
              vectorScore.set(hit.id, hit.score);
            }
          }
        }
      } catch {
        // ignore — fall back to BM25 + PageRank
      }
    }
    const hybrid = hybridRank(
      question,
      visiblePages.map((p) => ({
        id: p.id as string,
        slug: p.slug as string,
        title: p.title as string,
        body: p.body as string,
        graphScore: graphScore.get(p.id as string) ?? 0,
        vectorScore: vectorScore.get(p.id as string) ?? 0,
      })),
      8,
    );

    const citations = hybrid.map((h) => `[[${h.title}]]`).join(", ");
    const answer = [
      `# Answer`,
      ``,
      `**Question:** ${question}`,
      ``,
      hot.rows[0]?.body ? `## Session context\n\n${String(hot.rows[0].body).slice(0, 800)}\n` : "",
      `## Synthesis`,
      ``,
      `Based on ${hybrid.length} wiki pages (PageRank + lexical${vectorScore.size ? " + vector" : ""} hybrid).`,
      ``,
      ...hybrid.map((h, i) => {
        const page = visiblePages.find((p) => p.id === h.id);
        const excerpt = String(page?.body ?? "").slice(0, 280).replace(/\n+/g, " ");
        return `${i + 1}. [[${h.title}]] (score ${h.score.toFixed(3)}): ${excerpt}…`;
      }),
      ``,
      `## Citations`,
      ``,
      citations || "_none_",
      ``,
    ].join("\n");

    let filedPage = null;
    if (fileAnswer) {
      const verticalRow = await this.db.query(
        `SELECT vertical FROM rarecrest.wiki_pages WHERE namespace = $1 LIMIT 1`,
        [namespace],
      );
      const vertical = (verticalRow.rows[0]?.vertical as VerticalKey) ?? "holding";
      filedPage = await this.upsertPage({
        namespace,
        vertical,
        slug: slugify(`answer-${question}`).slice(0, 180),
        title: `Answer: ${question.slice(0, 80)}`,
        pageType: "answer",
        body: answer,
        frontmatter: { tags: ["answer"], question },
        sensitivity: "internal",
        actorId,
      });
      await this.appendLog(namespace, vertical, "query", question, actorId);
    }

    return { answer, citations: hybrid, hotCache: hot.rows[0]?.body ?? null, filedPage };
  }

  async lint(namespace: string, vertical: VerticalKey, actorId: string) {
    const pages = await this.db.query(
      `SELECT id, slug, title, body, page_type AS "pageType", status, frontmatter, updated_at AS "updatedAt"
       FROM rarecrest.wiki_pages WHERE namespace = $1`,
      [namespace],
    );
    const report = lintWiki(
      pages.rows.map((p) => ({
        id: p.id as string,
        slug: p.slug as string,
        title: p.title as string,
        body: p.body as string,
        pageType: p.pageType as string,
        status: p.status as string,
        frontmatter: (p.frontmatter as Record<string, unknown>) ?? {},
        updatedAt: (p.updatedAt as Date).toISOString?.() ?? String(p.updatedAt),
      })),
    );
    const inserted = await this.db.query(
      `INSERT INTO rarecrest.wiki_lint_reports (namespace, vertical, findings, score, created_by)
       VALUES ($1,$2,$3::jsonb,$4,$5) RETURNING id, score, created_at AS "createdAt"`,
      [namespace, vertical, JSON.stringify(report.findings), report.score, actorId],
    );
    await this.appendLog(namespace, vertical, "lint", `score=${report.score} findings=${report.findings.length}`, actorId);
    return { ...inserted.rows[0], findings: report.findings };
  }

  async doctor(namespace: string) {
    const pages = await this.db.query(
      `SELECT id, slug, title FROM rarecrest.wiki_pages WHERE namespace = $1`,
      [namespace],
    );
    const links = await this.db.query(
      `SELECT from_page_id AS "fromId", to_slug AS "toSlug", to_page_id AS "toId"
       FROM rarecrest.wiki_links WHERE namespace = $1`,
      [namespace],
    );
    const graph = analyseGraph(
      pages.rows.map((p) => ({ id: p.id as string, slug: p.slug as string, title: p.title as string })),
      links.rows.map((l) => ({
        fromId: l.fromId as string,
        toSlug: l.toSlug as string,
        toId: (l.toId as string | null) ?? null,
      })),
    );
    const hot = await this.db.query(`SELECT updated_at FROM rarecrest.wiki_hot_cache WHERE namespace = $1`, [namespace]);
    return {
      namespace,
      ok: graph.nodeCount > 0,
      graph,
      hasHotCache: hot.rows.length > 0,
      requiredPages: ["index", "hot"],
      missingRequired: ["index", "hot"].filter((s) => !pages.rows.some((p) => p.slug === s)),
    };
  }

  async flagContradictions(namespace: string, pageASlug: string, pageBSlug: string, claimA: string, claimB: string) {
    const a = await this.getPage(namespace, pageASlug);
    const b = await this.getPage(namespace, pageBSlug);
    if (!a || !b) throw new WikiError("Page not found", 404);
    await this.db.query(
      `INSERT INTO rarecrest.wiki_contradictions (namespace, page_a_id, page_b_id, claim_a, claim_b)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT DO NOTHING`,
      [namespace, a.id, b.id, claimA, claimB],
    );
    const bodyA = injectContradictionCallout(a.body as string, b.title as string, claimB);
    const bodyB = injectContradictionCallout(b.body as string, a.title as string, claimA);
    await this.db.query(`UPDATE rarecrest.wiki_pages SET body = $2, updated_at = NOW() WHERE id = $1`, [a.id, bodyA]);
    await this.db.query(`UPDATE rarecrest.wiki_pages SET body = $2, updated_at = NOW() WHERE id = $1`, [b.id, bodyB]);
    return { flagged: true, pageA: pageASlug, pageB: pageBSlug };
  }

  async listContradictions(namespace: string, includeAll = false) {
    const result = await this.db.query(
      `SELECT wc.id, wc.namespace, wc.claim_a AS "claimA", wc.claim_b AS "claimB", wc.status,
              wc.created_at AS "createdAt",
              pa.slug AS "pageASlug", pa.title AS "pageATitle",
              pb.slug AS "pageBSlug", pb.title AS "pageBTitle"
       FROM rarecrest.wiki_contradictions wc
       JOIN rarecrest.wiki_pages pa ON pa.id = wc.page_a_id
       JOIN rarecrest.wiki_pages pb ON pb.id = wc.page_b_id
       WHERE wc.namespace = $1 AND ($2::boolean OR wc.status = 'open')
       ORDER BY wc.created_at DESC
       LIMIT 200`,
      [namespace, includeAll],
    );
    return result.rows;
  }

  async resolveContradiction(input: {
    id: string;
    namespace: string;
    resolution: "resolved" | "accepted_tension";
    actorId: string;
    note?: string;
  }) {
    const existing = await this.db.query(
      `SELECT id, status FROM rarecrest.wiki_contradictions WHERE id = $1 AND namespace = $2`,
      [input.id, input.namespace],
    );
    if (existing.rows.length === 0) throw new WikiError("Contradiction not found", 404);
    const result = await this.db.query(
      `UPDATE rarecrest.wiki_contradictions SET status = $2 WHERE id = $1
       RETURNING id, namespace, claim_a AS "claimA", claim_b AS "claimB", status, created_at AS "createdAt"`,
      [input.id, input.resolution],
    );
    await this.appendLog(
      input.namespace,
      (await this.vertical(input.namespace)) ?? "holding",
      "contradiction_resolve",
      `id=${input.id} resolution=${input.resolution}${input.note ? ` note=${input.note}` : ""}`,
      input.actorId,
    );
    return result.rows[0];
  }

  private async vertical(namespace: string): Promise<VerticalKey | null> {
    const row = await this.db.query(
      `SELECT vertical FROM rarecrest.wiki_pages WHERE namespace = $1 LIMIT 1`,
      [namespace],
    );
    return (row.rows[0]?.vertical as VerticalKey | undefined) ?? null;
  }

  async promote(input: {
    namespace: string;
    slug: string;
    actorId: string;
    reason: string;
    requireDualControl: boolean;
  }) {
    const page = await this.getPage(input.namespace, input.slug);
    if (!page) throw new WikiError("Page not found", 404);
    if (page.status === "canon") return { status: "already_canon", page };

    const pending = await this.db.query(
      `SELECT id, first_approver_id AS "firstApproverId" FROM rarecrest.wiki_promotions
       WHERE page_id = $1 AND status = 'pending_second' ORDER BY created_at DESC LIMIT 1`,
      [page.id],
    );

    if (pending.rows.length === 0) {
      await this.db.query(
        `INSERT INTO rarecrest.wiki_promotions (page_id, from_status, to_status, first_approver_id, status, reason)
         VALUES ($1, $2, 'canon', $3, 'pending_second', $4)`,
        [page.id, page.status, input.actorId, input.reason],
      );
      if (!input.requireDualControl) {
        await this.db.query(
          `UPDATE rarecrest.wiki_pages SET status = 'canon', updated_at = NOW() WHERE id = $1`,
          [page.id],
        );
        await this.db.query(
          `UPDATE rarecrest.wiki_promotions SET status = 'committed', second_approver_id = $2, completed_at = NOW()
           WHERE page_id = $1 AND status = 'pending_second'`,
          [page.id, input.actorId],
        );
        return { status: "committed", page: await this.getPage(input.namespace, input.slug) };
      }
      return {
        status: "pending_second_approver",
        firstApproverId: input.actorId,
        message: "Dual-control: a different approver must promote again",
      };
    }

    const first = pending.rows[0].firstApproverId as string;
    if (first === input.actorId) {
      throw new WikiError("Dual-control requires a different second approver", 403);
    }
    await this.db.query(
      `UPDATE rarecrest.wiki_promotions
       SET second_approver_id = $2, status = 'committed', completed_at = NOW()
       WHERE id = $1`,
      [pending.rows[0].id, input.actorId],
    );
    await this.db.query(`UPDATE rarecrest.wiki_pages SET status = 'canon', updated_at = NOW() WHERE id = $1`, [page.id]);
    return { status: "committed", page: await this.getPage(input.namespace, input.slug) };
  }

  async autoresearch(input: {
    namespace: string;
    vertical: VerticalKey;
    topic: string;
    actorId: string;
    rounds?: number;
  }) {
    if (!isAutoresearchEnabled()) {
      throw new WikiError(
        "Autoresearch disabled (set WIKI_AUTORESEARCH_ENABLED=true to allow director-gated live search)",
        403,
      );
    }
    const topicCheck = sanitizeAutoresearchTopic(input.topic);
    if (!topicCheck.ok) throw new WikiError(`Autoresearch topic rejected: ${topicCheck.reason}`, 400);

    const charter = this.charter(input.vertical);
    if (!charter.allowAutoresearch) throw new WikiError("Autoresearch disabled for this charter", 403);
    await this.assertRateLimitDb(`autoresearch:${input.actorId}`, 5, 60_000);

    const rounds = input.rounds ?? 3;
    const researchRounds: Array<{
      round: number;
      query: string;
      hits: Array<{ url: string; title: string; snippet: string }>;
      fetched: Array<{ url: string; title: string; excerpt: string; blocked?: boolean; error?: string }>;
    }> = [];

    for (let r = 1; r <= rounds; r++) {
      const query =
        r === 1
          ? topicCheck.topic
          : `${topicCheck.topic} ${["overview", "risks", "recent developments"][r - 2] ?? `depth ${r}`}`;
      let hits: Array<{ url: string; title: string; snippet: string }> = [];
      try {
        hits = rankSearchHits(await this.searchProvider.search(query, { limit: 5 }), query, 5);
      } catch (err) {
        researchRounds.push({
          round: r,
          query,
          hits: [],
          fetched: [
            {
              url: "",
              title: "search_error",
              excerpt: "",
              error: err instanceof Error ? err.message : "search failed",
            },
          ],
        });
        continue;
      }

      const fetched: Array<{ url: string; title: string; excerpt: string; blocked?: boolean; error?: string }> = [];
      for (const hit of hits.slice(0, 3)) {
        if (isBlockedFetchUrl(hit.url)) {
          fetched.push({ url: hit.url, title: hit.title, excerpt: "", blocked: true, error: "blocked_host" });
          continue;
        }
        try {
          const page = await this.searchProvider.fetchPage(hit.url, { maxBytes: 120_000 });
          const md = defuddleHtml(page.html);
          fetched.push({
            url: page.finalUrl,
            title: hit.title,
            excerpt: md.slice(0, 800),
          });
          await this.ingest({
            namespace: input.namespace,
            vertical: input.vertical,
            title: `Web: ${hit.title}`.slice(0, 200),
            body: md.slice(0, 12_000),
            sourceKind: "web",
            sensitivity: charter.phiBlind ? "phi_ref" : "internal",
            actorId: input.actorId,
            skipIfHashExists: true,
          });
        } catch (err) {
          fetched.push({
            url: hit.url,
            title: hit.title,
            excerpt: "",
            error: err instanceof Error ? err.message : "fetch failed",
          });
        }
      }
      researchRounds.push({ round: r, query, hits, fetched });
    }

    const body = synthesizeAutoresearchBody(topicCheck.topic, researchRounds);
    const result = await this.ingest({
      namespace: input.namespace,
      vertical: input.vertical,
      title: `Autoresearch: ${topicCheck.topic}`,
      body,
      sourceKind: "autoresearch",
      sensitivity: "internal",
      actorId: input.actorId,
    });
    await this.appendLog(
      input.namespace,
      input.vertical,
      "autoresearch",
      `provider=${this.searchProvider.name} topic=${topicCheck.topic} rounds=${rounds}`,
      input.actorId,
    );
    return {
      ...result,
      provider: this.searchProvider.name,
      rounds: researchRounds.map((r) => ({
        round: r.round,
        query: r.query,
        hitCount: r.hits.length,
        fetchedCount: r.fetched.filter((f) => !f.blocked && !f.error).length,
      })),
    };
  }

  async buildObsidianSyncManifest(input: {
    namespace: string;
    vertical: VerticalKey;
    actorId: string;
    since?: string;
    includeBodies?: boolean;
  }) {
    if (!isDirectorObsidianNamespace(input.namespace)) {
      throw new WikiError(
        "Namespace not eligible for director Obsidian sync (allowed: holding/canon, bridges/*)",
        403,
      );
    }
    if (input.includeBodies) {
      throw new WikiError(
        "Plaintext body sync disabled — use POST /api/v1/wiki/obsidian/vault-package for encrypted packages",
        403,
      );
    }
    const pages = await this.listPages(input.namespace);
    const safe = filterObsidianSyncPages(
      pages.map((p) => ({
        ...p,
        sensitivity: String(p.sensitivity),
        updatedAt: String(p.updatedAt),
        slug: String(p.slug),
        title: String(p.title),
        pageType: String(p.pageType),
        status: String(p.status),
        version: Number(p.version ?? 1),
        id: String(p.id),
      })),
      input.since,
    );

    const files = toObsidianManifestFiles(safe);
    const syncToken = buildObsidianSyncToken(input.namespace, safe);

    await this.appendLog(
      input.namespace,
      input.vertical,
      "obsidian_sync_manifest",
      `files=${files.length} since=${input.since ?? "all"} token=${syncToken} metadata_only=true`,
      input.actorId,
    );

    try {
      await this.db.query(
        `INSERT INTO rarecrest.director_sessions (director_id, last_engaged_at) VALUES ($1, NOW())`,
        [input.actorId],
      );
    } catch {
      // optional
    }

    return {
      namespace: input.namespace,
      format: "obsidian-markdown-manifest" as const,
      syncToken,
      since: input.since ?? null,
      generatedAt: new Date().toISOString(),
      files,
      exclusions: ["phi_ref", "financial", "non-director-namespaces", "plaintext_bodies"],
      note: "Metadata only. Build encrypted vault packages via POST /api/v1/wiki/obsidian/vault-package.",
    };
  }

  async createVaultPackage(input: {
    namespace: string;
    vertical: VerticalKey;
    actorId: string;
    passphrase?: string;
    skipRateLimit?: boolean;
  }) {
    if (!isDirectorObsidianNamespace(input.namespace)) {
      throw new WikiError("Namespace not eligible for vault package", 403);
    }
    if (!input.skipRateLimit) {
      this.assertRateLimit(`vault-package:${input.actorId}`, 10, 60_000);
    }

    const kek = input.passphrase || loadSecret("WIKI_VAULT_PACKAGE_KEK");
    const hmacKey = loadSecret("WIKI_VAULT_PACKAGE_HMAC") || kek;
    if (!kek) {
      throw new WikiError("WIKI_VAULT_PACKAGE_KEK (or passphrase) required to encrypt vault packages", 500);
    }

    const pages = await this.listPages(input.namespace);
    const fullPages = [];
    for (const p of pages) {
      if (!isObsidianSyncSafeSensitivity(String(p.sensitivity))) continue;
      const bodyPage = await this.getPage(input.namespace, String(p.slug));
      if (!bodyPage) continue;
      fullPages.push({
        slug: String(p.slug),
        title: String(p.title),
        pageType: String(p.pageType),
        body: String(bodyPage.body),
        sensitivity: String(p.sensitivity),
      });
    }

    const canvas = await this.exportCanvas(input.namespace);
    const basesYaml = await this.exportBases(input.namespace);
    const plain = buildVaultPackagePlain({
      namespace: input.namespace,
      pages: fullPages,
      canvas,
      basesYaml,
    });
    const encrypted = encryptVaultPackage(plain, kek, hmacKey!);
    const downloadToken = randomBytes(24).toString("hex");
    const tokenHash = createHash("sha256").update(downloadToken).digest("hex");
    const objectKey = `wiki-vault/${input.actorId}/${encrypted.contentSha256.slice(0, 16)}.rcvault`;
    const ciphertextBuf = Buffer.from(JSON.stringify(encrypted), "utf8");

    try {
      const store = createObjectStoreFromEnv();
      await store.putObject(objectKey, ciphertextBuf, "application/vnd.rarecrest.rcvault+json");
    } catch {
      // object store optional
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    let packageId: string | null = null;
    try {
      const row = await this.db.query(
        `INSERT INTO rarecrest.wiki_vault_packages
           (namespace, vertical, actor_id, content_sha256, object_key, file_count, download_token_hash, expires_at, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ready')
         RETURNING id`,
        [
          input.namespace,
          input.vertical,
          input.actorId,
          encrypted.contentSha256,
          objectKey,
          encrypted.fileCount,
          tokenHash,
          expiresAt,
        ],
      );
      packageId = (row.rows[0]?.id as string) ?? null;
    } catch {
      // migration may be pending in tests
    }

    await this.appendLog(
      input.namespace,
      input.vertical,
      "vault_package",
      `sha=${encrypted.contentSha256} files=${encrypted.fileCount}`,
      input.actorId,
    );

    return {
      packageId,
      namespace: input.namespace,
      contentSha256: encrypted.contentSha256,
      fileCount: encrypted.fileCount,
      objectKey,
      downloadToken,
      expiresAt,
      package: encrypted,
      note: "Decrypt offline: rarecrest-wiki vault-decrypt <file.rcvault> --out ./Vault",
    };
  }

  /**
   * Enqueue vault package build. Small namespaces run inline; large ones process async.
   * Poll via getVaultPackageJob(jobId).
   */
  async enqueueVaultPackage(input: {
    namespace: string;
    vertical: VerticalKey;
    actorId: string;
    passphrase?: string;
    asyncThreshold?: number;
  }) {
    if (!isDirectorObsidianNamespace(input.namespace)) {
      throw new WikiError("Namespace not eligible for vault package", 403);
    }
    this.assertRateLimit(`vault-package:${input.actorId}`, 10, 60_000);
    const threshold = input.asyncThreshold ?? 25;
    const pages = await this.listPages(input.namespace);
    const eligible = pages.filter((p) => isObsidianSyncSafeSensitivity(String(p.sensitivity)));

    let jobId: string | null = null;
    try {
      const row = await this.db.query(
        `INSERT INTO rarecrest.wiki_vault_package_jobs
           (namespace, vertical, actor_id, status)
         VALUES ($1,$2,$3,'pending')
         RETURNING id`,
        [input.namespace, input.vertical, input.actorId],
      );
      jobId = (row.rows[0]?.id as string) ?? null;
    } catch {
      // migration may be pending — fall through to sync
    }

    const run = async () => {
      if (jobId) {
        try {
          await this.db.query(
            `UPDATE rarecrest.wiki_vault_package_jobs SET status='running', updated_at=NOW() WHERE id=$1`,
            [jobId],
          );
        } catch {
          /* ignore */
        }
      }
      try {
        const result = await this.createVaultPackage({
          namespace: input.namespace,
          vertical: input.vertical,
          actorId: input.actorId,
          passphrase: input.passphrase,
          skipRateLimit: true,
        });
        if (jobId) {
          try {
            await this.db.query(
              `UPDATE rarecrest.wiki_vault_package_jobs
               SET status='ready', package_id=$2, result_json=$3::jsonb, updated_at=NOW()
               WHERE id=$1`,
              [
                jobId,
                result.packageId,
                JSON.stringify({
                  packageId: result.packageId,
                  contentSha256: result.contentSha256,
                  fileCount: result.fileCount,
                  objectKey: result.objectKey,
                  downloadToken: result.downloadToken,
                  expiresAt: result.expiresAt,
                  package: result.package,
                  note: result.note,
                }),
              ],
            );
          } catch {
            /* ignore */
          }
        }
        return result;
      } catch (err) {
        if (jobId) {
          try {
            await this.db.query(
              `UPDATE rarecrest.wiki_vault_package_jobs
               SET status='failed', error=$2, updated_at=NOW() WHERE id=$1`,
              [jobId, err instanceof Error ? err.message : String(err)],
            );
          } catch {
            /* ignore */
          }
        }
        throw err;
      }
    };

    if (eligible.length <= threshold || !jobId) {
      const result = await run();
      return { jobId, status: "ready" as const, ...result };
    }

    // Fire-and-forget for large namespaces
    void run().catch(() => undefined);
    return {
      jobId,
      status: "pending" as const,
      namespace: input.namespace,
      note: `Large namespace (${eligible.length} pages). Poll GET /api/v1/wiki/obsidian/vault-package/jobs/${jobId}`,
    };
  }

  async getVaultPackageJob(jobId: string, actorId: string) {
    const row = await this.db.query(
      `SELECT id, namespace, vertical, actor_id AS "actorId", status, package_id AS "packageId",
              error, result_json AS "result", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM rarecrest.wiki_vault_package_jobs WHERE id = $1`,
      [jobId],
    );
    const job = row.rows[0];
    if (!job) throw new WikiError("Vault package job not found", 404);
    if (String(job.actorId) !== actorId) {
      throw new WikiError("Vault package job access denied", 403);
    }
    return job;
  }

  filterPageForCaller(
    page: Record<string, unknown> | null,
    opts: { isDirector: boolean; isAgent: boolean },
  ): Record<string, unknown> | null {
    if (!page) return null;
    const sensitivity = String(page.sensitivity ?? "internal");
    if (opts.isAgent && (sensitivity === "phi_ref" || sensitivity === "financial")) {
      return {
        ...page,
        body: `_redacted — ${sensitivity} content unavailable to agents_`,
        frontmatter: { ...(page.frontmatter as object), redacted: true },
      };
    }
    return page;
  }

  async exportCanvas(namespace: string) {
    const pages = await this.listPages(namespace);
    const links = await this.db.query(
      `SELECT from_page_id AS "fromId", to_slug AS "toSlug" FROM rarecrest.wiki_links WHERE namespace = $1`,
      [namespace],
    );
    return pagesToCanvas(
      pages.map((p) => ({ id: p.id as string, slug: p.slug as string, title: p.title as string })),
      links.rows.map((l) => ({ fromId: l.fromId as string, toSlug: l.toSlug as string })),
    );
  }

  async exportBases(namespace: string) {
    return buildBasesView({
      name: `Wiki ${namespace}`,
      filters: [`namespace = ${namespace}`, "status != archived"],
      formulas: { ageDays: "now() - updated_at" },
    });
  }

  async thinkingSession(namespace: string, vertical: VerticalKey, topic: string, actorId: string, notes: string[] = []) {
    const body = renderThinkingSession(topic, notes);
    return this.upsertPage({
      namespace,
      vertical,
      slug: slugify(`think-${topic}`),
      title: `Thinking: ${topic}`,
      pageType: "decision",
      body,
      frontmatter: { tags: ["thinking", "decision"] },
      sensitivity: "internal",
      actorId,
    });
  }

  async createBridgeProjection(input: {
    fromVertical: VerticalKey;
    toVertical: VerticalKey;
    actorId: string;
    title: string;
    redactedBody: string;
  }) {
    const namespace = namespaceForBridge(input.fromVertical, input.toVertical);
    // Bridges live under holding vertical for access control
    return this.upsertPage({
      namespace,
      vertical: "holding",
      slug: slugify(input.title),
      title: input.title,
      pageType: "bridge",
      body: `# ${input.title}\n\n> Bridge projection ${input.fromVertical} → ${input.toVertical} (redacted)\n\n${input.redactedBody}\n`,
      frontmatter: {
        tags: ["bridge"],
        fromVertical: input.fromVertical,
        toVertical: input.toVertical,
      },
      sensitivity: "internal",
      status: "draft",
      actorId: input.actorId,
    });
  }
}

export function contentHash(title: string, body: string): string {
  return createHash("sha256").update(`${title}\n${body}`).digest("hex");
}
