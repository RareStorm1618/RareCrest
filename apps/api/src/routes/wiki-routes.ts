import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import type { VerticalKey } from "@rarecrest/contracts";
import {
  VERTICAL_CHARTERS,
  classifyWikiPrincipal,
  assertWikiVerbAllowed,
  type WikiVerb,
} from "@rarecrest/wiki";
import { z } from "zod";
import { formatZodErrors, verticalSchema } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";
import { isVerifiedDirector } from "../trust.js";
import { WikiError, WikiService } from "../services/wiki.js";

const ENTITY_NS = /^entity\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/working$/i;

async function assertWikiAccess(
  db: DatabaseClient,
  auth: { vertical: VerticalKey; userId: string; role?: string; authMethod: string },
  headers: Record<string, unknown>,
  namespace: string,
  vertical: VerticalKey,
) {
  if (namespace.startsWith("holding/") || namespace.startsWith("bridges/")) {
    if (!isVerifiedDirector(auth as never, headers)) {
      throw new WikiError("Holding/bridge namespaces require verified director", 403);
    }
  } else if (namespace.startsWith("vertical/")) {
    const v = namespace.split("/")[1] as VerticalKey;
    if (auth.vertical !== v && !isVerifiedDirector(auth as never, headers)) {
      throw new WikiError("Cross-vertical wiki access denied", 403);
    }
  } else if (auth.vertical !== vertical && !isVerifiedDirector(auth as never, headers)) {
    throw new WikiError("Namespace vertical mismatch", 403);
  }

  const entityMatch = ENTITY_NS.exec(namespace);
  if (entityMatch) {
    await assertEntityAccess(db, entityMatch[1], auth as never);
  }
}

function enforceVerb(
  verb: WikiVerb,
  auth: { role?: string; userId: string; authMethod: string },
  headers: Record<string, unknown>,
) {
  const principal = classifyWikiPrincipal(auth);
  const verifiedDirector = isVerifiedDirector(auth as never, headers);
  try {
    assertWikiVerbAllowed(verb, principal, { verifiedDirector });
  } catch (err) {
    const e = err as { message?: string; statusCode?: number };
    throw new WikiError(e.message ?? "Wiki verb denied", e.statusCode ?? 403);
  }
}

function mapWikiErr(err: unknown, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) {
  if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
  if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
  if (err instanceof WikiError) return reply.status(err.statusCode).send({ message: err.message });
  throw err;
}

export function registerWikiRoutes(app: FastifyInstance, db: DatabaseClient) {
  const wiki = new WikiService(db);

  app.get("/api/v1/wiki/charters", async (_request, reply) => {
    return reply.send({ charters: VERTICAL_CHARTERS });
  });

  app.post("/api/v1/wiki/namespace", async (request, reply) => {
    const schema = z.object({
      vertical: verticalSchema,
      entityId: z.string().uuid().optional(),
      bridgeTo: verticalSchema.optional(),
      holdingCanon: z.boolean().optional(),
    });
    try {
      const body = schema.parse(request.body);
      if (body.entityId) await assertEntityAccess(db, body.entityId, request.auth);
      const namespace = wiki.resolveNamespace(body);
      await assertWikiAccess(db, request.auth, request.headers as never, namespace, body.vertical);
      return reply.send({ namespace, charter: wiki.charter(body.vertical) });
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });

  app.post("/api/v1/wiki/ingest", async (request, reply) => {
    const schema = z.object({
      vertical: verticalSchema,
      entityId: z.string().uuid().optional(),
      holdingCanon: z.boolean().optional(),
      title: z.string().min(1),
      body: z.string().min(1).optional(),
      html: z.string().optional(),
      sourceKind: z.enum(["document", "web", "decision_trace", "structured_doc", "autoresearch", "export"]).default("document"),
      sensitivity: z.enum(["public", "internal", "phi_ref", "financial"]).optional(),
    });
    try {
      enforceVerb("ingest", request.auth, request.headers as never);
      const body = schema.parse(request.body);
      if (!body.body && !body.html) return reply.status(400).send({ message: "body or html required" });
      if (body.entityId) await assertEntityAccess(db, body.entityId, request.auth);
      const namespace = wiki.resolveNamespace(body);
      await assertWikiAccess(db, request.auth, request.headers as never, namespace, body.vertical);
      await wiki.assertRateLimitDb(`ingest:${request.auth.userId}`, 120, 60_000);
      const result = await wiki.ingest({
        namespace,
        vertical: body.vertical,
        entityId: body.entityId,
        title: body.title,
        body: body.body ?? "",
        html: body.html,
        sourceKind: body.sourceKind,
        sensitivity: body.sensitivity,
        actorId: request.auth.userId,
      });
      return reply.status(201).send({ namespace, ...result });
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });

  app.get("/api/v1/wiki/pages", async (request, reply) => {
    const q = request.query as { namespace?: string; pageType?: string; vertical?: string };
    if (!q.namespace || !q.vertical) return reply.status(400).send({ message: "namespace and vertical required" });
    try {
      await assertWikiAccess(db, request.auth, request.headers as never, q.namespace, q.vertical as VerticalKey);
      const pages = await wiki.listPages(q.namespace, q.pageType);
      return reply.send({ namespace: q.namespace, pages });
    } catch (err) {
      if (err instanceof WikiError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/wiki/pages/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const q = request.query as { namespace?: string; vertical?: string };
    if (!q.namespace || !q.vertical) return reply.status(400).send({ message: "namespace and vertical required" });
    try {
      enforceVerb("query", request.auth, request.headers as never);
      await assertWikiAccess(db, request.auth, request.headers as never, q.namespace, q.vertical as VerticalKey);
      const page = await wiki.getPage(q.namespace, slug);
      if (!page) return reply.status(404).send({ message: "Page not found" });
      const principal = classifyWikiPrincipal(request.auth);
      const filtered = wiki.filterPageForCaller(page as Record<string, unknown>, {
        isDirector: isVerifiedDirector(request.auth, request.headers as never),
        isAgent: principal === "agent",
      });
      return reply.send(filtered);
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });

  app.post("/api/v1/wiki/query", async (request, reply) => {
    const schema = z.object({
      namespace: z.string().min(1),
      vertical: verticalSchema,
      question: z.string().min(1),
      fileAnswer: z.boolean().default(true),
    });
    try {
      enforceVerb("query", request.auth, request.headers as never);
      const body = schema.parse(request.body);
      await assertWikiAccess(db, request.auth, request.headers as never, body.namespace, body.vertical);
      const principal = classifyWikiPrincipal(request.auth);
      const result = await wiki.query(body.namespace, body.question, body.fileAnswer, request.auth.userId, {
        redactSensitive: principal === "agent",
        includeDrafts: principal !== "agent",
      });
      return reply.send(result);
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });

  app.post("/api/v1/wiki/lint", async (request, reply) => {
    const schema = z.object({ namespace: z.string().min(1), vertical: verticalSchema });
    try {
      enforceVerb("lint", request.auth, request.headers as never);
      const body = schema.parse(request.body);
      await assertWikiAccess(db, request.auth, request.headers as never, body.namespace, body.vertical);
      return reply.send(await wiki.lint(body.namespace, body.vertical, request.auth.userId));
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });

  app.get("/api/v1/wiki/doctor", async (request, reply) => {
    const q = request.query as { namespace?: string; vertical?: string };
    if (!q.namespace || !q.vertical) return reply.status(400).send({ message: "namespace and vertical required" });
    try {
      enforceVerb("doctor", request.auth, request.headers as never);
      await assertWikiAccess(db, request.auth, request.headers as never, q.namespace, q.vertical as VerticalKey);
      return reply.send(await wiki.doctor(q.namespace));
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });

  app.post("/api/v1/wiki/lock", async (request, reply) => {
    const schema = z.object({
      namespace: z.string().min(1),
      vertical: verticalSchema,
      slug: z.string().min(1),
      ttlSeconds: z.number().int().min(30).max(600).optional(),
    });
    try {
      enforceVerb("lock", request.auth, request.headers as never);
      const body = schema.parse(request.body);
      await assertWikiAccess(db, request.auth, request.headers as never, body.namespace, body.vertical);
      const ok = await wiki.acquireLock(body.namespace, body.slug, request.auth.userId, body.ttlSeconds);
      if (!ok) return reply.status(409).send({ message: "Page locked by another writer" });
      return reply.send({ locked: true, slug: body.slug, holder: request.auth.userId });
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });

  app.post("/api/v1/wiki/unlock", async (request, reply) => {
    const schema = z.object({
      namespace: z.string().min(1),
      vertical: verticalSchema,
      slug: z.string().min(1),
    });
    try {
      enforceVerb("lock", request.auth, request.headers as never);
      const body = schema.parse(request.body);
      await assertWikiAccess(db, request.auth, request.headers as never, body.namespace, body.vertical);
      await wiki.releaseLock(body.namespace, body.slug, request.auth.userId);
      return reply.send({ locked: false, slug: body.slug });
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });

  app.post("/api/v1/wiki/contradictions", async (request, reply) => {
    const schema = z.object({
      namespace: z.string().min(1),
      vertical: verticalSchema,
      pageASlug: z.string().min(1),
      pageBSlug: z.string().min(1),
      claimA: z.string().min(1),
      claimB: z.string().min(1),
    });
    try {
      enforceVerb("contradictions", request.auth, request.headers as never);
      const body = schema.parse(request.body);
      await assertWikiAccess(db, request.auth, request.headers as never, body.namespace, body.vertical);
      return reply.status(201).send(
        await wiki.flagContradictions(body.namespace, body.pageASlug, body.pageBSlug, body.claimA, body.claimB),
      );
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });

  app.get("/api/v1/wiki/contradictions", async (request, reply) => {
    const q = request.query as { namespace?: string; vertical?: string; includeAll?: string };
    if (!q.namespace || !q.vertical) return reply.status(400).send({ message: "namespace and vertical required" });
    try {
      enforceVerb("contradictions", request.auth, request.headers as never);
      await assertWikiAccess(db, request.auth, request.headers as never, q.namespace, q.vertical as VerticalKey);
      const contradictions = await wiki.listContradictions(q.namespace, q.includeAll === "true");
      return reply.send({ namespace: q.namespace, contradictions });
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });

  app.post("/api/v1/wiki/contradictions/:id/resolve", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      namespace: z.string().min(1),
      vertical: verticalSchema,
      resolution: z.enum(["resolved", "accepted_tension"]),
      note: z.string().optional(),
    });
    try {
      const body = schema.parse(request.body);
      const principal = classifyWikiPrincipal(request.auth);
      if (principal === "agent") {
        throw new WikiError("Contradiction resolution requires a human or director, not an agent", 403);
      }
      await assertWikiAccess(db, request.auth, request.headers as never, body.namespace, body.vertical);
      const resolved = await wiki.resolveContradiction({
        id,
        namespace: body.namespace,
        resolution: body.resolution,
        actorId: request.auth.userId,
        note: body.note,
      });
      return reply.send(resolved);
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });

  app.post("/api/v1/wiki/promote", async (request, reply) => {
    const schema = z.object({
      namespace: z.string().min(1),
      vertical: verticalSchema,
      slug: z.string().min(1),
      reason: z.string().min(1),
    });
    try {
      enforceVerb("promote", request.auth, request.headers as never);
      const body = schema.parse(request.body);
      await assertWikiAccess(db, request.auth, request.headers as never, body.namespace, body.vertical);
      const charter = wiki.charter(body.vertical);
      const result = await wiki.promote({
        namespace: body.namespace,
        slug: body.slug,
        actorId: request.auth.userId,
        reason: body.reason,
        requireDualControl: charter.financialDualControl || body.vertical === "holding",
      });
      return reply.send(result);
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });

  app.post("/api/v1/wiki/ingest/decision-traces", async (request, reply) => {
    const schema = z.object({
      vertical: verticalSchema,
      entityId: z.string().uuid(),
      since: z.string().datetime().optional(),
      traceIds: z.array(z.string().uuid()).optional(),
      limit: z.number().int().min(1).max(500).optional(),
      holdingCanon: z.boolean().optional(),
    });
    try {
      enforceVerb("ingest_decision_traces", request.auth, request.headers as never);
      const body = schema.parse(request.body);
      await assertEntityAccess(db, body.entityId, request.auth);
      const namespace = wiki.resolveNamespace({
        vertical: body.vertical,
        entityId: body.holdingCanon ? undefined : body.entityId,
        holdingCanon: body.holdingCanon,
      });
      await assertWikiAccess(db, request.auth, request.headers as never, namespace, body.vertical);
      const result = await wiki.ingestDecisionTraces({
        namespace,
        vertical: body.vertical,
        entityId: body.entityId,
        actorId: request.auth.userId,
        since: body.since,
        traceIds: body.traceIds,
        limit: body.limit,
      });
      return reply.status(201).send({ namespace, ...result });
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });

  app.post("/api/v1/wiki/autoresearch", async (request, reply) => {
    const schema = z.object({
      vertical: verticalSchema,
      entityId: z.string().uuid().optional(),
      holdingCanon: z.boolean().optional(),
      topic: z.string().min(1),
      rounds: z.number().int().min(1).max(5).optional(),
    });
    try {
      enforceVerb("autoresearch", request.auth, request.headers as never);
      const body = schema.parse(request.body);
      if (body.entityId) await assertEntityAccess(db, body.entityId, request.auth);
      const namespace = wiki.resolveNamespace(body);
      await assertWikiAccess(db, request.auth, request.headers as never, namespace, body.vertical);
      const result = await wiki.autoresearch({
        namespace,
        vertical: body.vertical,
        topic: body.topic,
        actorId: request.auth.userId,
        rounds: body.rounds,
      });
      return reply.status(201).send({ namespace, ...result });
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });

  app.get("/api/v1/wiki/export/canvas", async (request, reply) => {
    const q = request.query as { namespace?: string; vertical?: string };
    if (!q.namespace || !q.vertical) return reply.status(400).send({ message: "namespace and vertical required" });
    try {
      enforceVerb("export_metadata", request.auth, request.headers as never);
      await assertWikiAccess(db, request.auth, request.headers as never, q.namespace, q.vertical as VerticalKey);
      return reply.send(await wiki.exportCanvas(q.namespace));
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });

  app.get("/api/v1/wiki/export/bases", async (request, reply) => {
    const q = request.query as { namespace?: string; vertical?: string };
    if (!q.namespace || !q.vertical) return reply.status(400).send({ message: "namespace and vertical required" });
    try {
      enforceVerb("export_metadata", request.auth, request.headers as never);
      await assertWikiAccess(db, request.auth, request.headers as never, q.namespace, q.vertical as VerticalKey);
      const yaml = await wiki.exportBases(q.namespace);
      return reply.send({ namespace: q.namespace, basesYaml: yaml });
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });

  app.post("/api/v1/wiki/think", async (request, reply) => {
    const schema = z.object({
      vertical: verticalSchema.default("holding"),
      holdingCanon: z.boolean().default(true),
      topic: z.string().min(1),
      notes: z.array(z.string()).default([]),
    });
    try {
      enforceVerb("think", request.auth, request.headers as never);
      const body = schema.parse(request.body);
      const namespace = wiki.resolveNamespace({ vertical: body.vertical, holdingCanon: body.holdingCanon });
      await assertWikiAccess(db, request.auth, request.headers as never, namespace, body.vertical);
      const page = await wiki.thinkingSession(namespace, body.vertical, body.topic, request.auth.userId, body.notes);
      return reply.status(201).send({ namespace, page });
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });

  app.post("/api/v1/wiki/bridges", async (request, reply) => {
    const schema = z.object({
      fromVertical: verticalSchema,
      toVertical: verticalSchema,
      title: z.string().min(1),
      redactedBody: z.string().min(1),
    });
    try {
      enforceVerb("bridges", request.auth, request.headers as never);
      const body = schema.parse(request.body);
      if (!isVerifiedDirector(request.auth, request.headers as never)) {
        return reply.status(403).send({ message: "Only verified director may create bridge projections" });
      }
      const page = await wiki.createBridgeProjection({
        ...body,
        actorId: request.auth.userId,
      });
      return reply.status(201).send({ page });
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });

  app.post("/api/v1/wiki/obsidian/sync-manifest", async (request, reply) => {
    const schema = z.object({
      namespace: z.string().min(1),
      vertical: verticalSchema,
      since: z.string().datetime().optional(),
      includeBodies: z.boolean().optional(),
    });
    try {
      enforceVerb("vault_package", request.auth, request.headers as never);
      const body = schema.parse(request.body);
      if (!isVerifiedDirector(request.auth, request.headers as never)) {
        return reply.status(403).send({ message: "Obsidian sync requires verified director" });
      }
      await assertWikiAccess(db, request.auth, request.headers as never, body.namespace, body.vertical);
      const manifest = await wiki.buildObsidianSyncManifest({
        namespace: body.namespace,
        vertical: body.vertical,
        actorId: request.auth.userId,
        since: body.since,
        includeBodies: body.includeBodies,
      });
      return reply.send(manifest);
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });

  app.post("/api/v1/wiki/obsidian/vault-package", async (request, reply) => {
    const schema = z.object({
      namespace: z.string().min(1),
      vertical: verticalSchema,
      passphrase: z.string().min(12).optional(),
      async: z.boolean().optional(),
    });
    try {
      enforceVerb("vault_package", request.auth, request.headers as never);
      const body = schema.parse(request.body);
      if (!isVerifiedDirector(request.auth, request.headers as never)) {
        return reply.status(403).send({ message: "Vault packages require verified director" });
      }
      await assertWikiAccess(db, request.auth, request.headers as never, body.namespace, body.vertical);
      const result = await wiki.enqueueVaultPackage({
        namespace: body.namespace,
        vertical: body.vertical,
        actorId: request.auth.userId,
        passphrase: body.passphrase,
        asyncThreshold: body.async === false ? Number.MAX_SAFE_INTEGER : body.async === true ? 0 : 25,
      });
      return reply.status(result.status === "pending" ? 202 : 201).send(result);
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });

  app.get("/api/v1/wiki/obsidian/vault-package/jobs/:jobId", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    try {
      enforceVerb("vault_package", request.auth, request.headers as never);
      if (!isVerifiedDirector(request.auth, request.headers as never)) {
        return reply.status(403).send({ message: "Vault packages require verified director" });
      }
      const job = await wiki.getVaultPackageJob(jobId, request.auth.userId);
      return reply.send(job);
    } catch (err) {
      return mapWikiErr(err, reply);
    }
  });
}
