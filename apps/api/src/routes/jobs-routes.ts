import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import type { VerticalKey } from "@rarecrest/contracts";
import { namespaceForEntity } from "@rarecrest/wiki";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";
import { AsyncJobError, AsyncJobService, type AsyncJobType } from "../services/async-jobs.js";
import { WikiService } from "../services/wiki.js";
import { buildOversightPackForEntity } from "./export-routes.js";

const enqueueSchema = z.object({
  jobType: z.enum(["export_oversight", "decision_trace_sync"]),
  entityId: z.string().uuid(),
  payload: z.record(z.unknown()).optional(),
});

async function runJob(
  jobs: AsyncJobService,
  jobId: string,
  jobType: AsyncJobType,
  ctx: {
    db: DatabaseClient;
    intelligence: IntelligenceClient;
    entityId: string;
    entityName: string;
    entityVertical: VerticalKey;
    actorId: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await jobs.run(jobId, async () => {
    if (jobType === "export_oversight") {
      const format = ctx.payload.format === "pdf" ? ("pdf" as const) : ("markdown" as const);
      return buildOversightPackForEntity(
        ctx.db,
        ctx.intelligence,
        ctx.entityId,
        ctx.entityName,
        ctx.entityVertical,
        format,
      );
    }
    const wiki = new WikiService(ctx.db);
    return wiki.ingestDecisionTraces({
      namespace: namespaceForEntity(ctx.entityId),
      vertical: ctx.entityVertical,
      entityId: ctx.entityId,
      actorId: ctx.actorId,
      since: typeof ctx.payload.since === "string" ? ctx.payload.since : undefined,
      limit: typeof ctx.payload.limit === "number" ? ctx.payload.limit : undefined,
    });
  });
}

/**
 * Wave 3: durable async job envelope for long-running work (large oversight packs,
 * decision-trace → wiki syncs). Entity-scoped (director or same-vertical actor) via
 * assertEntityAccess; jobs run fire-and-forget with pending→running→(ready|failed) tracking.
 */
export function registerJobsRoutes(
  app: FastifyInstance,
  db: DatabaseClient,
  intelligence: IntelligenceClient,
) {
  const jobs = new AsyncJobService(db);

  app.post("/api/v1/jobs", async (request, reply) => {
    try {
      const body = enqueueSchema.parse(request.body);
      const entity = await assertEntityAccess(db, body.entityId, request.auth);
      const job = await jobs.enqueue({
        jobType: body.jobType,
        entityId: body.entityId,
        actorId: request.auth.userId,
        payload: body.payload ?? {},
      });

      void runJob(jobs, job.id, body.jobType, {
        db,
        intelligence,
        entityId: body.entityId,
        entityName: entity.name as string,
        entityVertical: entity.vertical as VerticalKey,
        actorId: request.auth.userId,
        payload: body.payload ?? {},
      }).catch(() => undefined);

      return reply.status(202).send(job);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/jobs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const job = await jobs.get(id, request.auth.userId);
      return reply.send(job);
    } catch (err) {
      if (err instanceof AsyncJobError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}
