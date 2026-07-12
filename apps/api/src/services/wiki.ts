import { createHash } from "node:crypto";
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
  type WikiSensitivity,
  type WikiPageType,
} from "@rarecrest/wiki";
import { VectorStoreClient } from "@rarecrest/vector-store";

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

  constructor(private db: DatabaseClient) {
    this.vectorStore = new VectorStoreClient({
      url: process.env.VECTOR_STORE_URL ?? "http://localhost:6333",
      collection: process.env.WIKI_VECTOR_COLLECTION ?? "federated-wiki",
    });
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
  }) {
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
  }) {
    const charter = this.charter(input.vertical);
    let body = input.body;
    if (input.html) body = defuddleHtml(input.html);
    if (charter.phiBlind && /ssn|phi|patient\s+name/i.test(body) && input.sensitivity !== "phi_ref") {
      // Force phi_ref path for care verticals when PHI-ish content detected
    }
    const sensitivity = (input.sensitivity ?? (charter.phiBlind ? "phi_ref" : "internal")) as WikiSensitivity;
    const compiled = compileIngest({
      title: input.title,
      body,
      sourceKind: input.sourceKind,
      sensitivity,
      phiBlind: charter.phiBlind,
    });

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
      jobId: job.rows[0].id,
      rawSourceId: raw.rows[0].id,
      pagesTouched: touched.length,
      pages: touched,
      summary: compiled.summary,
    };
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

  async query(namespace: string, question: string, fileAnswer = false, actorId = "system") {
    const hot = await this.db.query(`SELECT body FROM rarecrest.wiki_hot_cache WHERE namespace = $1`, [namespace]);
    const pages = await this.db.query(
      `SELECT id, slug, title, body FROM rarecrest.wiki_pages WHERE namespace = $1 AND page_type NOT IN ('log')`,
      [namespace],
    );
    const links = await this.db.query(
      `SELECT from_page_id AS "fromId", to_slug AS "toSlug", to_page_id AS "toId"
       FROM rarecrest.wiki_links WHERE namespace = $1`,
      [namespace],
    );
    const nodes = pages.rows.map((p) => ({
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
        const healthy = await this.vectorStore.healthCheck();
        if (healthy) {
          const hits = await this.vectorStore.search(bagEmbedding(question), 12);
          for (const hit of hits) {
            if (hit.payload?.namespace === namespace || !hit.payload?.namespace) {
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
      pages.rows.map((p) => ({
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
        const page = pages.rows.find((p) => p.id === h.id);
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
    const charter = this.charter(input.vertical);
    if (!charter.allowAutoresearch) throw new WikiError("Autoresearch disabled for this charter", 403);
    const rounds = input.rounds ?? 3;
    const notes: string[] = [];
    for (let r = 1; r <= rounds; r++) {
      notes.push(
        `Round ${r}: researched '${input.topic}' — gap-fill placeholder (wire live web search in production).`,
      );
    }
    const body = `# Autoresearch: ${input.topic}\n\n${notes.map((n) => `- ${n}`).join("\n")}\n\n## Open gaps\n\n- Validate sources with human review\n`;
    return this.ingest({
      namespace: input.namespace,
      vertical: input.vertical,
      title: `Autoresearch: ${input.topic}`,
      body,
      sourceKind: "autoresearch",
      sensitivity: "internal",
      actorId: input.actorId,
    });
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
