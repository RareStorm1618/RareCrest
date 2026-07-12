import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import { z } from "zod";
import { isVerifiedDirector } from "../trust.js";
import { formatZodErrors } from "../validation.js";
import { readInternalServiceToken } from "../fortress.js";
import { runNightShift } from "../worker/night-shift.js";

const BACKUP_CHECKLIST_NOTE =
  "docs/VPS-CUTOVER.md §7 Backup / restore drill checklist — quarterly pg_basebackup + WAL " +
  "replay verification, row-count parity on entities/decision_traces/attention_flags, and a " +
  "timed restore drill (RTO).";

/**
 * Director-only ops visibility: backup/WAL posture, plus a pointer at the durable
 * checklist source of truth (VPS-CUTOVER.md), and the same DB health probe used by
 * `/health`. No PHI/secrets — safe to gate on director role rather than unauthenticated.
 */
export function registerOpsRoutes(app: FastifyInstance, db: DatabaseClient) {
  app.get("/api/v1/ops/backup-status", async (request, reply) => {
    if (!isVerifiedDirector(request.auth, request.headers as Record<string, unknown>)) {
      return reply.status(403).send({ message: "Backup status requires a verified director" });
    }

    const walArchiving = process.env.POSTGRES_WAL_ARCHIVE
      ? process.env.POSTGRES_WAL_ARCHIVE.toLowerCase() === "on"
      : true;
    const databaseHealthy = await db.healthCheck();

    return reply.send({
      walArchiving,
      lastChecklist: BACKUP_CHECKLIST_NOTE,
      databaseHealthy,
      generatedAt: new Date().toISOString(),
    });
  });

  /**
   * EXO Wave C — director-only AI spend visibility: durable per-vertical totals
   * from rarecrest.ai_spend_ledger over a trailing window (default 7 days).
   */
  app.get("/api/v1/ops/ai-spend", async (request, reply) => {
    if (!isVerifiedDirector(request.auth, request.headers as Record<string, unknown>)) {
      return reply.status(403).send({ message: "AI spend visibility requires a verified director" });
    }
    const schema = z.object({ days: z.coerce.number().int().min(1).max(365).default(7) });
    try {
      const query = schema.parse(request.query);
      const result = await db.query<{
        vertical: string;
        input_tokens: string;
        output_tokens: string;
        estimated_usd: string;
        call_count: string;
      }>(
        `SELECT vertical,
                SUM(input_tokens)::text AS input_tokens,
                SUM(output_tokens)::text AS output_tokens,
                SUM(estimated_usd)::text AS estimated_usd,
                COUNT(*)::text AS call_count
         FROM rarecrest.ai_spend_ledger
         WHERE created_at >= NOW() - ($1 || ' days')::interval
         GROUP BY vertical
         ORDER BY vertical`,
        [query.days],
      );
      const byVertical = result.rows.map((row) => ({
        vertical: row.vertical,
        inputTokens: Number(row.input_tokens),
        outputTokens: Number(row.output_tokens),
        estimatedUsd: Number(row.estimated_usd),
        callCount: Number(row.call_count),
      }));
      const totalUsd = byVertical.reduce((sum, row) => sum + row.estimatedUsd, 0);
      return reply.send({
        days: query.days,
        byVertical,
        totalUsd,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  /**
   * EXO Wave A night-shift: the unattended periodic pass (see docs/SOLO-ORGANISM.md
   * "Night shift"), executing due Parliament seals and marking stale async jobs. Gated the
   * same way as `/api/v1/seals/due/execute` — a verified director, or a trusted internal
   * caller (cron/scheduler) presenting `x-internal-service-token`.
   */
  app.post("/api/v1/ops/night-shift/run", async (request, reply) => {
    const isDirector = isVerifiedDirector(request.auth, request.headers as Record<string, unknown>);
    const expectedToken = readInternalServiceToken();
    const providedToken = (request.headers as Record<string, unknown>)["x-internal-service-token"];
    const isInternal = Boolean(expectedToken) && typeof providedToken === "string" && providedToken === expectedToken;
    if (!isDirector && !isInternal) {
      return reply.status(403).send({
        message: "Night-shift run requires a verified director or a valid x-internal-service-token",
      });
    }
    const result = await runNightShift(db);
    return reply.send(result);
  });
}
