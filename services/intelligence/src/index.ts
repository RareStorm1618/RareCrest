import Fastify from "fastify";
import { readFileSync } from "node:fs";
import { DatabaseClient } from "@rarecrest/db";
import { ModelRouter, applyProviderEndpoints, parseProviderAllowlist, parseProviderEndpoints } from "./model-router.js";
import { recordSpend } from "./spend-ledger.js";
import { DecisionTraceService } from "./decision-trace.js";
import { SkillCompanionService } from "./skill-companion.js";
import { runEvaluation, persistEvaluationRun } from "./evaluation-runner.js";
import type { VerticalKey } from "@rarecrest/contracts";
import { draftLegalSupportResponse } from "./legal-support-teammate.js";
import { scanProhibitedClaims } from "./prohibited-claims.js";
import { AutoCaptureService } from "./auto-capture.js";
import { BudgetExceededError, checkAndConsumeBudget, estimateTokens } from "./budgets.js";

const PORT = Number(process.env.INTELLIGENCE_PORT ?? 3002);

/** Load a secret from env, or from a file path referenced by *_FILE (Docker/K8s secrets pattern). */
function loadSecret(envName: string): string | undefined {
  const fileVar = `${envName}_FILE`;
  const filePath = process.env[fileVar];
  if (filePath) {
    try {
      const value = readFileSync(filePath, "utf8").trim();
      if (value.length > 0) return value;
    } catch {
      // fall through to direct env var
    }
  }
  const direct = process.env[envName];
  return direct && direct.length > 0 ? direct : undefined;
}

function isStrictPosture(): boolean {
  const strict = (process.env.AUTH_TRUST_MODE ?? "").toLowerCase() === "strict";
  const requireFlag = process.env.REQUIRE_INTERNAL_RPC_AUTH === "1" ||
    (process.env.REQUIRE_INTERNAL_RPC_AUTH ?? "").toLowerCase() === "true";
  return strict || requireFlag;
}

export async function buildIntelligenceApp() {
  const app = Fastify({ logger: true });
  const db = new DatabaseClient({
    connectionString: process.env.INTELLIGENCE_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  });

  // MODEL_PROVIDERS is an allowlist of provider ids (comma-separated; default
  // primary,fallback,mock) — an unlisted provider is never routable even if enabled.
  // MODEL_PROVIDER_ENDPOINTS is an optional JSON map of id -> endpoint override.
  const providerAllowlist = parseProviderAllowlist(process.env.MODEL_PROVIDERS);
  const providerEndpoints = parseProviderEndpoints(process.env.MODEL_PROVIDER_ENDPOINTS);
  const baseProviders = [
    { id: "primary", name: "Primary", endpoint: "http://localhost", priority: 1, enabled: true },
    { id: "fallback", name: "Fallback", endpoint: "http://localhost", priority: 2, enabled: true },
    { id: "mock", name: "Mock", endpoint: "http://localhost", priority: 3, enabled: true },
  ];
  const router = new ModelRouter({
    providers: applyProviderEndpoints(baseProviders, providerEndpoints),
    failoverEnabled: true,
    allowlist: providerAllowlist,
  });

  const traces = new DecisionTraceService(db);
  const companion = new SkillCompanionService(router);
  const autoCapture = new AutoCaptureService();

  app.addHook("preHandler", async (request, reply) => {
    if (request.url === "/health" || request.url.startsWith("/health?")) return;
    const expected = loadSecret("INTERNAL_SERVICE_TOKEN");
    if (!expected) {
      if (isStrictPosture()) {
        return reply.status(503).send({
          message: "Internal RPC refused: INTERNAL_SERVICE_TOKEN (or _FILE) required under strict trust mode",
        });
      }
      return;
    }
    const provided = request.headers["x-internal-service-token"];
    if (provided !== expected) {
      return reply.status(401).send({ message: "Unauthorized internal RPC" });
    }
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "intelligence-services",
    timestamp: new Date().toISOString(),
  }));

  app.post<{
    Body: {
      entityId: string;
      vertical: VerticalKey;
      dimensions: Array<{ name: string; value: number; weight: number }>;
    };
  }  >("/rpc/score", async (request, reply) => {
    const scoringUrl = process.env.SCORING_URL ?? "http://localhost:3003";
    const internalServiceToken = loadSecret("INTERNAL_SERVICE_TOKEN");
    const response = await fetch(`${scoringUrl}/rpc/score`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(internalServiceToken ? { "x-internal-service-token": internalServiceToken } : {}),
      },
      body: JSON.stringify(request.body),
    });
    if (!response.ok) return reply.status(502).send({ message: "Scoring service unavailable" });
    return reply.send(await response.json());
  });

  app.post<{
    Body: {
      entityId?: string;
      vertical: VerticalKey;
      action: string;
      verdict: "allow" | "deny";
      payload: Record<string, unknown>;
      retentionRegime?: string;
    };
  }>("/rpc/decision-trace/append", async (request, reply) => {
    const entry = await traces.append(request.body);
    return reply.status(201).send(entry);
  });

  app.get<{ Params: { entityId: string } }>(
    "/rpc/decision-trace/:entityId",
    async (request, reply) => {
      const entries = await traces.listByEntity(request.params.entityId);
      return reply.send(entries);
    },
  );

  app.post<{ Body: { entityId: string; vertical: string; question: string; context?: string[]; requestKind?: string; entityContext?: object | null } }>(
    "/rpc/skill-companion/complete",
    async (request, reply) => {
      try {
        checkAndConsumeBudget(
          request.body.vertical,
          estimateTokens(JSON.stringify(request.body)),
        );
      } catch (err) {
        if (err instanceof BudgetExceededError) {
          return reply.status(err.statusCode).send({ message: err.message });
        }
        throw err;
      }
      const result = await companion.complete(request.body as never);

      // EXO Wave C — durable spend record, best-effort and after the response is
      // computed; a len/4 heuristic on request/result JSON, matching estimateTokens.
      await recordSpend(db, {
        vertical: request.body.vertical,
        entityId: request.body.entityId ?? null,
        provider: router.getActiveProviders()[0]?.id ?? "unknown",
        inputTokens: estimateTokens(JSON.stringify(request.body)),
        outputTokens: estimateTokens(JSON.stringify(result)),
      });

      return reply.send(result);
    },
  );

  app.post<{ Body: { entityId: string; vertical: string; question: string; context?: string[]; requestKind?: string; entityContext?: object | null } }>(
    "/rpc/skill-companion/stream",
    async (request, reply) => {
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const writeEvent = (event: string, data: unknown) => {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      try {
        const guard = companion.evaluateGuard(
          (request.body.requestKind ?? "substantive") as never,
          (request.body.entityContext ?? null) as never,
        );
        if (!guard.allowed) {
          writeEvent("guard", guard);
          writeEvent("done", { ok: false });
          reply.raw.end();
          return;
        }
        writeEvent("guard", guard);
        for await (const chunk of companion.stream(request.body as never)) {
          writeEvent("token", { text: chunk });
        }
        const complete = await companion.complete(request.body as never);
        writeEvent("complete", complete);
        writeEvent("done", { ok: true });
      } catch (err) {
        writeEvent("error", { message: err instanceof Error ? err.message : "stream failed" });
      }
      reply.raw.end();
    },
  );

  app.post<{ Body: { kind: string; entityContext: object | null } }>(
    "/rpc/framing-guard/evaluate",
    async (request, reply) => {
      const result = companion.evaluateGuard(request.body.kind as never, request.body.entityContext as never);
      return reply.send(result);
    },
  );

  app.post<{
    Body: {
      issue: string;
      urgency: "low" | "medium" | "high" | "critical";
      jurisdiction?: string;
      containsRegulatedData: boolean;
    };
  }>("/rpc/legal-support", async (request, reply) => {
    const response = draftLegalSupportResponse(request.body);
    return reply.send(response);
  });

  app.post<{ Body: { agentId: string; entityId: string; accuracy: number; overrideRate: number; accuracyFloor?: number; overrideCeiling?: number } }>(
    "/rpc/evaluation/run",
    async (request, reply) => {
      const input = {
        agentId: request.body.agentId,
        entityId: request.body.entityId,
        accuracy: request.body.accuracy,
        overrideRate: request.body.overrideRate,
        accuracyFloor: request.body.accuracyFloor ?? 0.85,
        overrideCeiling: request.body.overrideCeiling ?? 0.15,
      };
      const result = runEvaluation(input);
      const persisted = await persistEvaluationRun(db, input, result);
      return reply.send(persisted);
    },
  );

  app.post<{ Body: { entityId: string; vertical: VerticalKey; source: string; signalType: "policy_violation" | "accuracy_drop" | "override_spike" | "new_regulation" | "operator_note"; confidence: number; payload: Record<string, unknown> } }>(
    "/rpc/auto-capture",
    async (request, reply) => {
      const verdict = autoCapture.evaluate(request.body);
      if (!verdict.accepted) {
        return reply.status(202).send(verdict);
      }
      const trace = await traces.append({
        entityId: request.body.entityId,
        vertical: request.body.vertical,
        action: `auto_capture:${request.body.signalType}`,
        verdict: "allow",
        payload: {
          source: request.body.source,
          captureKind: verdict.captureKind,
          score: verdict.score,
          signal: request.body.payload,
        },
      });
      return reply.status(201).send({ ...verdict, traceId: trace.id });
    },
  );

  app.post<{ Body: { claims: string[] } }>(
    "/rpc/prohibited-claims",
    async (request, reply) => {
      const result = scanProhibitedClaims({ claims: request.body.claims });
      return reply.send(result);
    },
  );

  return { app, db };
}

// Fail-closed private bind: default to loopback-only, matching the scoring/API fortress
// posture. Set INTELLIGENCE_HOST to bind elsewhere (e.g. behind a private network/VPN).
const HOST = process.env.INTELLIGENCE_HOST ?? "127.0.0.1";

async function main() {
  const { app } = await buildIntelligenceApp();
  await app.listen({ port: PORT, host: HOST });
  console.log(`Intelligence Services listening on ${HOST}:${PORT}`);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
