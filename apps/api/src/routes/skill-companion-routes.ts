import type { FastifyInstance } from "fastify";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import type { DatabaseClient } from "@rarecrest/db";
import type { VerticalKey } from "@rarecrest/contracts";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";
import { WikiService } from "../services/wiki.js";
import { namespaceForEntity, classifyWikiPrincipal } from "@rarecrest/wiki";

const companionBodySchema = z.object({
  entityId: z.string().uuid(),
  question: z.string().min(1),
  context: z.array(z.string()).optional(),
  requestKind: z
    .enum(["substantive", "architecture", "drive_only", "generic_summary", "migration"])
    .optional(),
  fileAnswerToWiki: z.boolean().optional(),
});

export async function buildEntityContext(
  db: DatabaseClient,
  entityId: string,
  vertical: string,
  entityVertical: string,
) {
  const [entityRow, assessment] = await Promise.all([
    db.query<{ entity_type: string | null; regulatory_regimes: string[] | null }>(
      `SELECT entity_type, regulatory_regimes FROM rarecrest.entities WHERE id = $1`,
      [entityId],
    ),
    db.query<{ readiness_band: string; maturity_level: number; status: string }>(
      `SELECT readiness_band, maturity_level, status FROM rarecrest.readiness_assessments
       WHERE entity_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [entityId],
    ),
  ]);
  const e = entityRow.rows[0];
  const a = assessment.rows[0];
  return {
    entityId,
    entityType: e?.entity_type ?? null,
    vertical: entityVertical || vertical,
    regulatoryRegimes: Array.isArray(e?.regulatory_regimes) ? e.regulatory_regimes : [],
    readinessBand: a?.readiness_band ?? null,
    maturityLevel: a?.maturity_level ?? null,
    migrationMode: null as string | null,
    diagnosticsComplete: a?.status === "complete",
  };
}

/**
 * Fail-open by design: this is a defense-in-depth net on top of the intelligence
 * service's own framing guard, not the primary control. Patterns are intentionally
 * simple/conservative (guaranteed, risk-free, 100% claims) — false positives are
 * cheaper than a shipped compliance violation.
 */
const PROHIBITED_CLAIM_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "guaranteed", pattern: /\bguarantee(d|s)?\b/i },
  { label: "risk_free", pattern: /\brisk[-\s]?free\b/i },
  { label: "no_risk", pattern: /\bno\s+risk\b/i },
  { label: "cannot_lose", pattern: /\bcan(?:not|'t)\s+(?:lose|fail)\b/i },
  { label: "100_percent_claim", pattern: /\b100\s*%\s*(safe|secure|effective|accurate|success(?:ful)?)\b/i },
  { label: "assured_returns", pattern: /\bassured\s+returns?\b/i },
];

export function scanProhibitedClaims(text: string): string[] {
  const hits: string[] = [];
  for (const { label, pattern } of PROHIBITED_CLAIM_PATTERNS) {
    if (pattern.test(text)) hits.push(label);
  }
  return hits;
}

interface ProhibitedClaimsCapableClient {
  checkProhibitedClaims?: (input: { text: string }) => Promise<{ violations?: string[] }>;
}

/** Prefer the intelligence service's own checker when it exists; otherwise fall
 * back to the local regex scan above. Never skip the check silently. */
async function detectProhibitedClaims(
  intelligence: IntelligenceClient,
  text: string,
): Promise<string[]> {
  const client = intelligence as unknown as ProhibitedClaimsCapableClient;
  if (typeof client.checkProhibitedClaims === "function") {
    try {
      const verdict = await client.checkProhibitedClaims({ text });
      return verdict.violations ?? [];
    } catch {
      // Intelligence RPC unavailable — fall through to local scan rather than skip.
    }
  }
  return scanProhibitedClaims(text);
}

const DRAFT_WATERMARK = "> DRAFT — not canon. Human promote required.\n\n";

async function wikiContextForEntity(
  db: DatabaseClient,
  entityId: string,
  vertical: VerticalKey,
  question: string,
  actorId: string,
  opts?: { redactSensitive?: boolean },
): Promise<string[]> {
  try {
    const wiki = new WikiService(db);
    const namespace = namespaceForEntity(entityId);
    const result = await wiki.query(namespace, question, false, actorId, {
      redactSensitive: opts?.redactSensitive === true,
    });
    const citations = (result.citations as Array<{ title?: string; slug?: string }> | undefined) ?? [];
    return [
      `Wiki namespace ${namespace}`,
      ...citations.slice(0, 6).map((c) => `[[${c.title ?? c.slug}]]`),
      String(result.answer ?? "").slice(0, 1200),
    ].filter(Boolean);
  } catch {
    return [];
  }
}

export function registerSkillCompanionRoutes(
  app: FastifyInstance,
  db: DatabaseClient,
  intelligence: IntelligenceClient,
) {
  app.post("/api/v1/skill-companion", async (request, reply) => {
    try {
      const body = companionBodySchema.parse(request.body);
      const entity = await assertEntityAccess(db, body.entityId, request.auth);
      const entityContext = await buildEntityContext(
        db,
        body.entityId,
        request.auth.vertical,
        entity.vertical,
      );
      const wikiCtx = await wikiContextForEntity(
        db,
        body.entityId,
        entity.vertical as VerticalKey,
        body.question,
        request.auth.userId,
        { redactSensitive: classifyWikiPrincipal(request.auth) === "agent" },
      );
      const context = [...(body.context ?? []), ...wikiCtx];
      const result = await intelligence.skillCompanionComplete({
        entityId: body.entityId,
        vertical: request.auth.vertical,
        question: body.question,
        context,
        requestKind: body.requestKind,
        entityContext,
      });
      const guard = result.guard as { allowed?: boolean; redirectTo?: string; reason?: string } | undefined;
      if (guard && guard.allowed === false) {
        return reply.status(403).send({
          message: guard.reason ?? "Request blocked by framing guard",
          redirectTo: guard.redirectTo,
          guard,
        });
      }

      let prohibitedClaims: string[] = [];
      if (typeof result.answer === "string") {
        prohibitedClaims = await detectProhibitedClaims(intelligence, result.answer);
        if (prohibitedClaims.length > 0) {
          return reply.status(403).send({
            message: "Response blocked — prohibited claims detected",
            prohibitedClaims,
          });
        }
      }

      if (body.fileAnswerToWiki && typeof result.answer === "string") {
        const wiki = new WikiService(db);
        await wiki.ingest({
          namespace: namespaceForEntity(body.entityId),
          vertical: entity.vertical as VerticalKey,
          entityId: body.entityId,
          title: `Companion: ${body.question.slice(0, 80)}`,
          body: `${DRAFT_WATERMARK}${result.answer}`,
          sourceKind: "structured_doc",
          actorId: request.auth.userId,
        });
      }
      return reply.send({ ...result, wikiCitations: wikiCtx.slice(0, 8) });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/skill-companion/stream", async (request, reply) => {
    try {
      const body = companionBodySchema.parse(request.body);
      const entity = await assertEntityAccess(db, body.entityId, request.auth);
      const entityContext = await buildEntityContext(
        db,
        body.entityId,
        request.auth.vertical,
        entity.vertical,
      );

      const wikiCtx = await wikiContextForEntity(
        db,
        body.entityId,
        entity.vertical as VerticalKey,
        body.question,
        request.auth.userId,
        { redactSensitive: classifyWikiPrincipal(request.auth) === "agent" },
      );
      const context = [...(body.context ?? []), ...wikiCtx];

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const writeEvent = (event: string, data: unknown) => {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        writeEvent("wiki", { citations: wikiCtx.slice(0, 8) });
        for await (const chunk of intelligence.skillCompanionStream({
          entityId: body.entityId,
          vertical: request.auth.vertical,
          question: body.question,
          context,
          requestKind: body.requestKind,
          entityContext,
        })) {
          writeEvent(chunk.event, chunk.data);
          if (chunk.event === "guard" && chunk.data.allowed === false) {
            writeEvent("done", { ok: false });
            break;
          }
        }
      } catch (err) {
        writeEvent("error", { message: err instanceof Error ? err.message : "stream failed" });
        writeEvent("done", { ok: false });
      }
      reply.raw.end();
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}
