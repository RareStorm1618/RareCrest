import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import type { VerticalKey } from "@rarecrest/contracts";
import { VERTICAL_CHARTERS } from "@rarecrest/wiki";
import { z } from "zod";
import { formatZodErrors, verticalSchema } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";
import { isVerifiedDirector } from "../trust.js";
import { WikiError, WikiService } from "../services/wiki.js";

function assertNamespaceAccess(
  auth: { vertical: VerticalKey; userId: string; role?: string; authMethod: string },
  headers: Record<string, unknown>,
  namespace: string,
  vertical: VerticalKey,
) {
  if (namespace.startsWith("holding/") || namespace.startsWith("bridges/")) {
    if (!isVerifiedDirector(auth as never, headers) && auth.vertical !== "holding") {
      throw new WikiError("Holding/bridge namespaces require director or holding vertical", 403);
    }
    return;
  }
  if (namespace.startsWith("vertical/")) {
    const v = namespace.split("/")[1] as VerticalKey;
    if (auth.vertical !== v && !isVerifiedDirector(auth as never, headers)) {
      throw new WikiError("Cross-vertical wiki access denied", 403);
    }
    return;
  }
  if (auth.vertical !== vertical && !isVerifiedDirector(auth as never, headers)) {
    throw new WikiError("Namespace vertical mismatch", 403);
  }
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
      assertNamespaceAccess(request.auth, request.headers as never, namespace, body.vertical);
      return reply.send({ namespace, charter: wiki.charter(body.vertical) });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      if (err instanceof WikiError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
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
      fileAnswer: z.boolean().optional(),
    });
    try {
      const body = schema.parse(request.body);
      if (!body.body && !body.html) return reply.status(400).send({ message: "body or html required" });
      if (body.entityId) await assertEntityAccess(db, body.entityId, request.auth);
      const namespace = wiki.resolveNamespace(body);
      assertNamespaceAccess(request.auth, request.headers as never, namespace, body.vertical);
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
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      if (err instanceof WikiError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/wiki/pages", async (request, reply) => {
    const q = request.query as { namespace?: string; pageType?: string; vertical?: string };
    if (!q.namespace || !q.vertical) return reply.status(400).send({ message: "namespace and vertical required" });
    try {
      assertNamespaceAccess(request.auth, request.headers as never, q.namespace, q.vertical as VerticalKey);
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
      assertNamespaceAccess(request.auth, request.headers as never, q.namespace, q.vertical as VerticalKey);
      const page = await wiki.getPage(q.namespace, slug);
      if (!page) return reply.status(404).send({ message: "Page not found" });
      return reply.send(page);
    } catch (err) {
      if (err instanceof WikiError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
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
      const body = schema.parse(request.body);
      assertNamespaceAccess(request.auth, request.headers as never, body.namespace, body.vertical);
      const result = await wiki.query(body.namespace, body.question, body.fileAnswer, request.auth.userId);
      return reply.send(result);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof WikiError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/wiki/lint", async (request, reply) => {
    const schema = z.object({ namespace: z.string().min(1), vertical: verticalSchema });
    try {
      const body = schema.parse(request.body);
      assertNamespaceAccess(request.auth, request.headers as never, body.namespace, body.vertical);
      return reply.send(await wiki.lint(body.namespace, body.vertical, request.auth.userId));
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof WikiError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/wiki/doctor", async (request, reply) => {
    const q = request.query as { namespace?: string; vertical?: string };
    if (!q.namespace || !q.vertical) return reply.status(400).send({ message: "namespace and vertical required" });
    try {
      assertNamespaceAccess(request.auth, request.headers as never, q.namespace, q.vertical as VerticalKey);
      return reply.send(await wiki.doctor(q.namespace));
    } catch (err) {
      if (err instanceof WikiError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
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
      const body = schema.parse(request.body);
      assertNamespaceAccess(request.auth, request.headers as never, body.namespace, body.vertical);
      const ok = await wiki.acquireLock(body.namespace, body.slug, request.auth.userId, body.ttlSeconds);
      if (!ok) return reply.status(409).send({ message: "Page locked by another writer" });
      return reply.send({ locked: true, slug: body.slug, holder: request.auth.userId });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof WikiError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/wiki/unlock", async (request, reply) => {
    const schema = z.object({
      namespace: z.string().min(1),
      vertical: verticalSchema,
      slug: z.string().min(1),
    });
    try {
      const body = schema.parse(request.body);
      assertNamespaceAccess(request.auth, request.headers as never, body.namespace, body.vertical);
      await wiki.releaseLock(body.namespace, body.slug, request.auth.userId);
      return reply.send({ locked: false, slug: body.slug });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof WikiError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
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
      const body = schema.parse(request.body);
      assertNamespaceAccess(request.auth, request.headers as never, body.namespace, body.vertical);
      return reply.status(201).send(
        await wiki.flagContradictions(body.namespace, body.pageASlug, body.pageBSlug, body.claimA, body.claimB),
      );
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof WikiError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
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
      const body = schema.parse(request.body);
      assertNamespaceAccess(request.auth, request.headers as never, body.namespace, body.vertical);
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
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof WikiError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
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
      const body = schema.parse(request.body);
      if (body.entityId) await assertEntityAccess(db, body.entityId, request.auth);
      const namespace = wiki.resolveNamespace(body);
      assertNamespaceAccess(request.auth, request.headers as never, namespace, body.vertical);
      const result = await wiki.autoresearch({
        namespace,
        vertical: body.vertical,
        topic: body.topic,
        actorId: request.auth.userId,
        rounds: body.rounds,
      });
      return reply.status(201).send({ namespace, ...result });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      if (err instanceof WikiError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/wiki/export/canvas", async (request, reply) => {
    const q = request.query as { namespace?: string; vertical?: string };
    if (!q.namespace || !q.vertical) return reply.status(400).send({ message: "namespace and vertical required" });
    try {
      assertNamespaceAccess(request.auth, request.headers as never, q.namespace, q.vertical as VerticalKey);
      return reply.send(await wiki.exportCanvas(q.namespace));
    } catch (err) {
      if (err instanceof WikiError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/wiki/export/bases", async (request, reply) => {
    const q = request.query as { namespace?: string; vertical?: string };
    if (!q.namespace || !q.vertical) return reply.status(400).send({ message: "namespace and vertical required" });
    try {
      assertNamespaceAccess(request.auth, request.headers as never, q.namespace, q.vertical as VerticalKey);
      const yaml = await wiki.exportBases(q.namespace);
      return reply.send({ namespace: q.namespace, basesYaml: yaml });
    } catch (err) {
      if (err instanceof WikiError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
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
      const body = schema.parse(request.body);
      const namespace = wiki.resolveNamespace({ vertical: body.vertical, holdingCanon: body.holdingCanon });
      assertNamespaceAccess(request.auth, request.headers as never, namespace, body.vertical);
      const page = await wiki.thinkingSession(namespace, body.vertical, body.topic, request.auth.userId, body.notes);
      return reply.status(201).send({ namespace, page });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof WikiError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
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
      const body = schema.parse(request.body);
      if (!isVerifiedDirector(request.auth, request.headers as never) && request.auth.vertical !== "holding") {
        return reply.status(403).send({ message: "Only holding/director may create bridge projections" });
      }
      const page = await wiki.createBridgeProjection({
        ...body,
        actorId: request.auth.userId,
      });
      return reply.status(201).send({ page });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof WikiError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/wiki/obsidian/sync-manifest", async (request, reply) => {
    const schema = z.object({
      namespace: z.string().min(1),
      vertical: verticalSchema,
    });
    try {
      const body = schema.parse(request.body);
      assertNamespaceAccess(request.auth, request.headers as never, body.namespace, body.vertical);
      const pages = await wiki.listPages(body.namespace);
      // Non-PHI only for Obsidian satellite
      const safe = pages.filter((p) => p.sensitivity !== "phi_ref");
      return reply.send({
        namespace: body.namespace,
        format: "obsidian-markdown-manifest",
        files: safe.map((p) => ({
          path: `wiki/${p.pageType}/${p.slug}.md`,
          slug: p.slug,
          title: p.title,
          status: p.status,
          updatedAt: p.updatedAt,
        })),
        note: "Fetch page bodies via GET /api/v1/wiki/pages/:slug — PHI pages excluded",
      });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof WikiError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}
