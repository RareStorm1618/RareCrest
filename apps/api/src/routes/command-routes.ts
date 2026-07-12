import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import {
  buildMorningBrief,
  classifyQueueItem,
  filterDecisionItems,
  isPortfolioClear,
  rankPriorityItems,
  type AttentionQueueItem,
  type MorningBrief,
  type PriorityItem,
} from "@rarecrest/command-surface";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { isVerifiedDirector } from "../trust.js";
import type { AuthContext } from "../auth.js";

/** AC-CMD-001: agent_roster activity → morning-brief agent_activity section. */
export function mapAgentActivity(
  rows: Array<Record<string, unknown>>,
): Array<{ id: string; label: string; linkPath: string; sourceFeature: string }> {
  return rows.map((row) => {
    const agentId = String(row.agent_id);
    const entityId = String(row.entity_id);
    const activity = row.current_activity ? String(row.current_activity) : `${row.status}/${row.health}`;
    return {
      id: `${agentId}:${entityId}`,
      label: `${agentId} — ${activity}`,
      linkPath: `#/entities/${entityId}/runtime`,
      sourceFeature: "runtime",
    };
  });
}

export interface CommandDashboard {
  brief: MorningBrief;
  ranked: PriorityItem[];
  queue: AttentionQueueItem[];
  portfolioClear: boolean;
}

/** Postgres-backed director-session upsert (migration 024 adds the unique index on director_id). */
export async function upsertDirectorSession(db: DatabaseClient, directorId: string): Promise<void> {
  await db.query(
    `INSERT INTO rarecrest.director_sessions (director_id, last_engaged_at)
     VALUES ($1, NOW())
     ON CONFLICT (director_id) DO UPDATE SET last_engaged_at = NOW()`,
    [directorId],
  );
}

async function loadAttentionQueue(db: DatabaseClient, vertical?: string): Promise<AttentionQueueItem[]> {
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

/** Resolve a link for wiki-health items: the holding entity's wiki tab, else `#/command`. */
function wikiFallbackLinkPath(holdingEntityId: string | null): string {
  return holdingEntityId ? `#/entities/${holdingEntityId}/wiki` : "#/command";
}

interface WikiHealthBundle {
  items: Array<{ id: string; label: string; linkPath: string; sourceFeature: string }>;
}

/** Best-effort wiki-health section — wiki tables may be absent in some environments. */
async function loadWikiHealth(db: DatabaseClient): Promise<WikiHealthBundle> {
  try {
    const [lint, pending, openContradictions, holdingEntity] = await Promise.all([
      db.query(
        `SELECT id, namespace, score, created_at FROM rarecrest.wiki_lint_reports
         WHERE score < 80 AND (namespace = 'holding/canon' OR namespace LIKE 'bridges/%')
         ORDER BY created_at DESC LIMIT 8`,
      ),
      db.query(
        `SELECT wp.id, wp.page_id AS "pageId", wpg.entity_id AS "entityId"
         FROM rarecrest.wiki_promotions wp
         LEFT JOIN rarecrest.wiki_pages wpg ON wpg.id = wp.page_id
         WHERE wp.status = 'pending_second' LIMIT 8`,
      ),
      db.query(`SELECT COUNT(*)::int AS count FROM rarecrest.wiki_contradictions WHERE status = 'open'`),
      db.query(
        `SELECT id FROM rarecrest.entities WHERE vertical = 'holding' AND deleted_at IS NULL LIMIT 1`,
      ),
    ]);
    const holdingEntityId = (holdingEntity.rows[0]?.id as string | undefined) ?? null;
    const fallbackLink = wikiFallbackLinkPath(holdingEntityId);
    const contradictionCount = Number(openContradictions.rows[0]?.count ?? 0);
    const items = [
      ...lint.rows.map((r) => ({
        id: String(r.id),
        label: `Wiki lint score ${r.score} · ${r.namespace}`,
        linkPath: fallbackLink,
        sourceFeature: "wiki",
      })),
      ...pending.rows.map((r) => ({
        id: String(r.id),
        label: `Pending wiki promote dual-control`,
        linkPath: r.entityId ? `#/entities/${r.entityId}/wiki` : fallbackLink,
        sourceFeature: "wiki",
      })),
      ...(contradictionCount > 0
        ? [
            {
              id: "wiki-contradictions-open",
              label: `${contradictionCount} open wiki contradiction${contradictionCount === 1 ? "" : "s"}`,
              linkPath: fallbackLink,
              sourceFeature: "wiki",
            },
          ]
        : []),
    ];
    return { items };
  } catch {
    return { items: [] };
  }
}

/**
 * Build the full Command Center dashboard payload in one pass. Attention queue,
 * resolved flags, agent roster, and wiki-health signals load in parallel — this is
 * the single query set shared by /command/dashboard and (for fallback callers)
 * /command/morning-brief, /command/priorities, and /command/attention-queue.
 */
export async function buildCommandDashboard(
  db: DatabaseClient,
  auth: AuthContext,
  headers: Record<string, unknown>,
  opts: { touchSession?: boolean } = {},
): Promise<CommandDashboard> {
  const directorId = auth.userId;
  const verticalFilter = isVerifiedDirector(auth, headers) ? undefined : auth.vertical;

  const [sessionResult, queue] = await Promise.all([
    db.query(
      `SELECT last_engaged_at FROM rarecrest.director_sessions WHERE director_id = $1 ORDER BY last_engaged_at DESC LIMIT 1`,
      [directorId],
    ),
    loadAttentionQueue(db, verticalFilter),
  ]);
  const since = sessionResult.rows[0]?.last_engaged_at
    ? new Date(sessionResult.rows[0].last_engaged_at as string)
    : null;
  const sinceIso = since?.toISOString() ?? null;

  const [resolved, roster, wikiHealth] = await Promise.all([
    db.query(
      `SELECT id FROM rarecrest.attention_flags WHERE resolved_at IS NOT NULL AND resolved_at > COALESCE($1, '1970-01-01')`,
      [sinceIso],
    ),
    db.query(
      `SELECT agent_id, entity_id, status, health, current_activity, updated_at
       FROM rarecrest.agent_roster
       WHERE updated_at > COALESCE($1, NOW() - INTERVAL '24 hours')
       ORDER BY updated_at DESC LIMIT 20`,
      [sinceIso],
    ),
    loadWikiHealth(db),
  ]);

  const newItems = since ? queue.filter((q) => new Date(q.createdAt) > since) : queue;
  const agentActivity = mapAgentActivity(roster.rows);
  const brief = buildMorningBrief(
    since,
    newItems,
    resolved.rows.map((r) => r.id as string),
    queue.filter((q) => q.kind === "awareness"),
    agentActivity,
  );
  if (wikiHealth.items.length > 0) {
    brief.sections.push({ type: "wiki_health", items: wikiHealth.items });
    brief.unchanged = false;
  }

  if (opts.touchSession !== false) {
    await upsertDirectorSession(db, directorId);
  }

  return {
    brief,
    ranked: rankPriorityItems(queue),
    queue,
    portfolioClear: isPortfolioClear(queue),
  };
}

export function registerCommandRoutes(app: FastifyInstance, db: DatabaseClient) {
  app.get("/api/v1/command/dashboard", async (request, reply) => {
    const dashboard = await buildCommandDashboard(db, request.auth, request.headers as Record<string, unknown>);
    reply.header("Cache-Control", "private, max-age=10");
    return reply.send(dashboard);
  });

  app.get("/api/v1/command/morning-brief", async (request, reply) => {
    const dashboard = await buildCommandDashboard(db, request.auth, request.headers as Record<string, unknown>);
    return reply.send({ ...dashboard.brief, portfolioClear: dashboard.portfolioClear });
  });

  app.get("/api/v1/command/attention-queue", async (request, reply) => {
    const dashboard = await buildCommandDashboard(db, request.auth, request.headers as Record<string, unknown>, {
      touchSession: false,
    });
    return reply.send({ items: dashboard.queue, portfolioClear: dashboard.portfolioClear });
  });

  app.get("/api/v1/command/priorities", async (request, reply) => {
    const decisionsOnly = request.query as { decisionsOnly?: string };
    const dashboard = await buildCommandDashboard(db, request.auth, request.headers as Record<string, unknown>, {
      touchSession: false,
    });
    const ranked =
      decisionsOnly.decisionsOnly === "true"
        ? rankPriorityItems(filterDecisionItems(dashboard.queue))
        : dashboard.ranked;
    return reply.send({ ranked });
  });

  app.post("/api/v1/memory/records", async (request, reply) => {
    const schema = z.object({ title: z.string().min(1), content: z.string().min(1), tags: z.array(z.string()).default([]) });
    try {
      const body = schema.parse(request.body);
      const result = await db.query(
        `INSERT INTO rarecrest.shared_memory_records (title, content, tags, vertical, actor_id)
         VALUES ($1, $2, $3::jsonb, $4, $5)
         RETURNING id, title, content, tags, vertical, actor_id AS "actorId", created_at AS "createdAt"`,
        [body.title, body.content, JSON.stringify(body.tags), request.auth.vertical, request.auth.userId],
      );
      return reply.status(201).send(result.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  app.get("/api/v1/memory/records", async (request, reply) => {
    const director = isVerifiedDirector(request.auth, request.headers);
    const result = await db.query(
      `SELECT id, title, content, tags, vertical, actor_id AS "actorId", created_at AS "createdAt"
       FROM rarecrest.shared_memory_records
       WHERE $1::boolean OR vertical = $2 OR vertical IS NULL
       ORDER BY created_at DESC LIMIT 50`,
      [director, request.auth.vertical],
    );
    return reply.send({ records: result.rows });
  });
}
