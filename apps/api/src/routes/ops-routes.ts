import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import { isVerifiedDirector } from "../trust.js";

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
}
