import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import {
  buildMorningBrief,
  classifyQueueItem,
  filterDecisionItems,
  isPortfolioClear,
  rankPriorityItems,
  type AttentionQueueItem,
} from "@rarecrest/command-surface";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { isVerifiedDirector } from "../trust.js";

export function registerCommandRoutes(app: FastifyInstance, db: DatabaseClient) {
  async function loadAttentionQueue(vertical?: string): Promise<AttentionQueueItem[]> {
    const verticalFilter = vertical ? "AND e.vertical = $1" : "";
    const result = await db.query(
      `SELECT af.id, af.entity_id, COALESCE(af.signal_type, af.flag_type) AS signal_type,
              af.severity, af.message, af.link_path, af.source_ref, af.created_at, e.name AS entity_name
       FROM rarecrest.attention_flags af
       JOIN rarecrest.entities e ON e.id = af.entity_id
       WHERE af.resolved_at IS NULL
       ${verticalFilter}
       ORDER BY af.created_at DESC`,
      vertical ? [vertical] : [],
    );
    return result.rows.map((row) => {
      const signalType = row.signal_type as AttentionQueueItem["signalType"];
      return {
        id: row.id as string,
        entityId: row.entity_id as string,
        signalType,
        severity: row.severity as AttentionQueueItem["severity"],
        message: row.message as string,
        linkPath: row.link_path as string | null,
        sourceRef: row.source_ref as string | null,
        createdAt: (row.created_at as Date).toISOString(),
        sourceFeature: "portfolio",
        kind: classifyQueueItem(signalType),
        entityName: row.entity_name as string,
      };
    });
  }

  app.get("/api/v1/command/morning-brief", async (request, reply) => {
    const directorId = request.auth.userId;
    const session = await db.query(
      `SELECT last_engaged_at FROM rarecrest.director_sessions WHERE director_id = $1 ORDER BY last_engaged_at DESC LIMIT 1`,
      [directorId],
    );
    const since = session.rows[0]?.last_engaged_at ? new Date(session.rows[0].last_engaged_at as string) : null;
    const queue = await loadAttentionQueue(isVerifiedDirector(request.auth, request.headers) ? undefined : request.auth.vertical);
    const newItems = since
      ? queue.filter((q) => new Date(q.createdAt) > since)
      : queue;
    const resolved = await db.query(
      `SELECT id FROM rarecrest.attention_flags WHERE resolved_at IS NOT NULL AND resolved_at > COALESCE($1, '1970-01-01')`,
      [since?.toISOString() ?? null],
    );
    const brief = buildMorningBrief(
      since,
      newItems,
      resolved.rows.map((r) => r.id as string),
      queue.filter((q) => q.kind === "awareness"),
      [],
    );
    // Wiki health section (Private Canon Fortress)
    try {
      const lint = await db.query(
        `SELECT id, namespace, score, created_at FROM rarecrest.wiki_lint_reports
         WHERE score < 80 ORDER BY created_at DESC LIMIT 8`,
      );
      const pending = await db.query(
        `SELECT id, page_id FROM rarecrest.wiki_promotions WHERE status = 'pending_second' LIMIT 8`,
      );
      const wikiItems = [
        ...lint.rows.map((r) => ({
          id: String(r.id),
          label: `Wiki lint score ${r.score} · ${r.namespace}`,
          linkPath: "#/",
          sourceFeature: "wiki",
        })),
        ...pending.rows.map((r) => ({
          id: String(r.id),
          label: `Pending wiki promote dual-control`,
          linkPath: "#/",
          sourceFeature: "wiki",
        })),
      ];
      if (wikiItems.length > 0) {
        brief.sections.push({ type: "wiki_health", items: wikiItems });
        brief.unchanged = false;
      }
    } catch {
      // wiki tables may be absent
    }
    await db.query(
      `INSERT INTO rarecrest.director_sessions (director_id, last_engaged_at) VALUES ($1, NOW())`,
      [directorId],
    );
    return reply.send({ ...brief, portfolioClear: isPortfolioClear(queue) });
  });

  app.get("/api/v1/command/attention-queue", async (request, reply) => {
    const queue = await loadAttentionQueue(isVerifiedDirector(request.auth, request.headers) ? undefined : request.auth.vertical);
    return reply.send({ items: queue, portfolioClear: isPortfolioClear(queue) });
  });

  app.get("/api/v1/command/priorities", async (request, reply) => {
    const decisionsOnly = request.query as { decisionsOnly?: string };
    const queue = await loadAttentionQueue(isVerifiedDirector(request.auth, request.headers) ? undefined : request.auth.vertical);
    const filtered = decisionsOnly.decisionsOnly === "true" ? filterDecisionItems(queue) : queue;
    return reply.send({ ranked: rankPriorityItems(filtered) });
  });

  app.post("/api/v1/memory/records", async (request, reply) => {
    const schema = z.object({ title: z.string().min(1), content: z.string().min(1), tags: z.array(z.string()).default([]) });
    try {
      const body = schema.parse(request.body);
      const result = await db.query(
        `INSERT INTO rarecrest.shared_memory_records (title, content, tags) VALUES ($1, $2, $3::jsonb)
         RETURNING id, title, content, tags, created_at AS "createdAt"`,
        [body.title, body.content, JSON.stringify(body.tags)],
      );
      return reply.status(201).send(result.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  app.get("/api/v1/memory/records", async (_request, reply) => {
    const result = await db.query(
      `SELECT id, title, content, tags, created_at AS "createdAt" FROM rarecrest.shared_memory_records ORDER BY created_at DESC LIMIT 50`,
    );
    return reply.send({ records: result.rows });
  });
}
