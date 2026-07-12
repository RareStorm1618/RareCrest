import Fastify from "fastify";
import { DatabaseClient } from "@rarecrest/db";
import { ModelRouter } from "./model-router.js";
import { DecisionTraceService } from "./decision-trace.js";
import { SkillCompanionService } from "./skill-companion.js";
import { runEvaluation } from "./evaluation-runner.js";
import type { VerticalKey } from "@rarecrest/contracts";

const PORT = Number(process.env.INTELLIGENCE_PORT ?? 3002);

export async function buildIntelligenceApp() {
  const app = Fastify({ logger: true });
  const db = new DatabaseClient({
    connectionString: process.env.INTELLIGENCE_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  });

  const router = new ModelRouter({
    providers: [
      { id: "primary", name: "Primary", endpoint: "http://localhost", priority: 1, enabled: true },
      { id: "fallback", name: "Fallback", endpoint: "http://localhost", priority: 2, enabled: true },
    ],
    failoverEnabled: true,
  });

  const traces = new DecisionTraceService(db);
  const companion = new SkillCompanionService(router);

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
  }>("/rpc/score", async (request, reply) => {
    const scoringUrl = process.env.SCORING_URL ?? "http://localhost:3003";
    const response = await fetch(`${scoringUrl}/rpc/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      const result = await companion.complete(request.body as never);
      return reply.send(result);
    },
  );

  app.post<{ Body: { kind: string; entityContext: object | null } }>(
    "/rpc/framing-guard/evaluate",
    async (request, reply) => {
      const result = companion.evaluateGuard(request.body.kind as never, request.body.entityContext as never);
      return reply.send(result);
    },
  );

  app.post<{ Body: { agentId: string; entityId: string; accuracy: number; overrideRate: number; accuracyFloor?: number; overrideCeiling?: number } }>(
    "/rpc/evaluation/run",
    async (request, reply) => {
      const result = runEvaluation({
        agentId: request.body.agentId,
        entityId: request.body.entityId,
        accuracy: request.body.accuracy,
        overrideRate: request.body.overrideRate,
        accuracyFloor: request.body.accuracyFloor ?? 0.85,
        overrideCeiling: request.body.overrideCeiling ?? 0.15,
      });
      return reply.send(result);
    },
  );

  return { app, db };
}

async function main() {
  const { app } = await buildIntelligenceApp();
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`Intelligence Services listening on 0.0.0.0:${PORT}`);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
