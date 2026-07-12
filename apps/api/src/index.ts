import Fastify from "fastify";
import cors from "@fastify/cors";
import { DatabaseClient } from "@rarecrest/db";
import { GovernanceClient } from "@rarecrest/governance-client";
import { IntelligenceClient } from "@rarecrest/intelligence-client";
import { enforceTenancy, AuthError, TenancyViolationError, resolveAuth } from "./auth.js";
import { mapRouteError } from "./errors.js";
import { assertEntityAccess, EntityAccessError } from "./tenancy.js";
import {
  createEntitySchema,
  hardRuleCheckSchema,
  formatZodErrors,
  validate,
} from "./validation.js";
import { registerPhaseRoutes } from "./routes/phase-routes.js";
import { registerPortfolioRoutes } from "./routes/portfolio-routes.js";
import { registerDiagnosticsRoutes } from "./routes/diagnostics-routes.js";
import { registerMigrationRoutes } from "./routes/migration-routes.js";
import { registerTaskDecompositionRoutes } from "./routes/task-decomposition-routes.js";
import { registerRegulatoryProfileRoutes } from "./routes/regulatory-profile-routes.js";
import { registerAttentionFlagRoutes } from "./routes/attention-flag-routes.js";
import { registerWorkflowRoutes } from "./routes/workflow-routes.js";
import { registerAgentStudioRoutes } from "./routes/agent-studio-routes.js";
import { registerMigrationWorkspaceRoutes } from "./routes/migration-workspace-routes.js";
import { registerLegalRoutes } from "./routes/legal-routes.js";
import { registerVendorShortcutRoutes } from "./routes/vendor-shortcut-routes.js";
import { registerCapabilityRoutes } from "./routes/capability-routes.js";
import { registerCommandRoutes } from "./routes/command-routes.js";
import { registerAssessmentRoutes } from "./routes/assessment-routes.js";
import { registerExportRoutes } from "./routes/export-routes.js";
import { registerSkillCompanionRoutes } from "./routes/skill-companion-routes.js";
import { registerSpecRoutes } from "./routes/spec-routes.js";
import { registerGovernanceGatewayRoutes } from "./routes/governance-gateway-routes.js";
import { registerEntityRegistryRoutes } from "./routes/entity-registry-routes.js";
import { registerRuntimeRoutes } from "./routes/runtime-routes.js";
import { registerIpRoutes } from "./routes/ip-routes.js";
import { registerDesignStudioRoutes } from "./routes/design-studio-routes.js";
import { registerKillSwitchRoutes } from "./routes/kill-switch-routes.js";
import { registerPhiVaultRoutes } from "./routes/phi-vault-routes.js";
import { registerAuthRevocationRoutes } from "./routes/auth-revocation-routes.js";
import { registerWikiRoutes } from "./routes/wiki-routes.js";
import { registerJobsRoutes } from "./routes/jobs-routes.js";
import { registerHumanInstructionRoutes } from "./routes/human-instruction-routes.js";
import { registerOpsRoutes } from "./routes/ops-routes.js";
import { registerOfficerRoutes } from "./routes/officer-routes.js";
import { registerParliamentRoutes } from "./routes/parliament-routes.js";
import { PortfolioService } from "./services/portfolio.js";
import { mapEntityRow } from "./services/portfolio.js";
import {
  assertPrivateDeploymentOrDie,
  corsOriginOption,
  requireInternalServiceTokenOrDie,
} from "./fortress.js";
import { loadSecret } from "./secrets.js";
import { renderMetricsText } from "./observability.js";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const PORT = Number(process.env.API_PORT ?? 3000);
const HOST = process.env.API_HOST ?? "0.0.0.0";

export async function buildApp() {
  const app = Fastify({ logger: true });

  const db = new DatabaseClient({
    connectionString: process.env.DATABASE_URL ?? "",
  });

  const internalServiceToken = loadSecret("INTERNAL_SERVICE_TOKEN");

  const governance = new GovernanceClient({
    baseUrl: process.env.GOVERNANCE_ENGINE_URL ?? "http://localhost:3001",
    internalServiceToken,
  });

  const intelligence = new IntelligenceClient({
    baseUrl: process.env.INTELLIGENCE_SERVICES_URL ?? "http://localhost:3002",
    internalServiceToken,
  });

  await app.register(cors, { origin: corsOriginOption(HOST) });

  app.addHook("preHandler", async (request) => {
    if (request.url === "/health" || request.url === "/metrics") return;
    request.auth = await resolveAuth(request, { db });
  });

  app.get("/health", async () => {
    const dbOk = await db.healthCheck();
    const govOk = await governance.healthCheck();
    const intelOk = await intelligence.healthCheck();
    return {
      status: dbOk && govOk ? "ok" : "degraded",
      service: "api-server",
      timestamp: new Date().toISOString(),
      checks: { database: dbOk, governance: govOk, intelligence: intelOk },
    };
  });

  /** Prometheus-ish text exposition; unauthenticated like /health, no PHI/secrets. */
  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", "text/plain; version=0.0.4");
    return reply.send(renderMetricsText());
  });

  const portfolio = new PortfolioService(db);

  registerPhaseRoutes(app, db, governance, intelligence);
  registerPortfolioRoutes(app, portfolio, db);
  registerDiagnosticsRoutes(app, db);
  registerMigrationRoutes(app, db);
  registerTaskDecompositionRoutes(app, db);
  registerRegulatoryProfileRoutes(app, db);
  registerAttentionFlagRoutes(app, db);
  registerWorkflowRoutes(app, db, intelligence);
  registerAgentStudioRoutes(app, db, governance, intelligence);
  registerMigrationWorkspaceRoutes(app, db);
  registerLegalRoutes(app, db);
  registerVendorShortcutRoutes(app, db);
  registerCapabilityRoutes(app, db);
  registerCommandRoutes(app, db);
  registerAssessmentRoutes(app, db);
  registerExportRoutes(app, db, intelligence);
  registerSkillCompanionRoutes(app, db, intelligence);
  registerSpecRoutes(app, db, governance);
  registerGovernanceGatewayRoutes(app, db, governance, intelligence);
  registerEntityRegistryRoutes(app, db);
  registerRuntimeRoutes(app, db, intelligence, governance);
  registerIpRoutes(app, db);
  registerDesignStudioRoutes(app, db);
  registerKillSwitchRoutes(app, db, governance);
  registerPhiVaultRoutes(app, db);
  registerAuthRevocationRoutes(app, db);
  registerWikiRoutes(app, db);
  registerJobsRoutes(app, db, intelligence);
  registerHumanInstructionRoutes(app, db);
  registerOpsRoutes(app, db);
  registerOfficerRoutes(app, db, governance, intelligence);
  registerParliamentRoutes(app, db, intelligence);

  app.post("/api/v1/entities", async (request, reply) => {
    try {
      const body = validate(createEntitySchema, request.body);
      enforceTenancy(request.auth, body.vertical);
      reply.header("Deprecation", "true");
      reply.header("Link", '</api/v1/portfolio/entities>; rel="successor-version"');
      const row = await portfolio.registerEntity({
        name: body.name,
        vertical: body.vertical,
        tenancyKey: body.tenancyKey,
        entityType: body.entityType ?? "nonprofit",
        mode: body.mode,
        band: body.band,
      });
      return reply.status(201).send(mapEntityRow(row));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send(formatZodErrors(err));
      }
      const mapped = mapRouteError(err);
      if (mapped) return reply.status(mapped.status).send(mapped.body);
      throw err;
    }
  });

  app.get("/api/v1/entities", async (request, reply) => {
    enforceTenancy(request.auth, request.auth.vertical);
    reply.header("Deprecation", "true");
    reply.header("Link", '</api/v1/portfolio/status>; rel="successor-version"');
    const rollup = await portfolio.getRollup(request.auth.vertical);
    return reply.send(rollup.entities);
  });

  app.post("/api/v1/governance/hard-rule-check", async (request, reply) => {
    try {
      const body = validate(hardRuleCheckSchema, request.body);
      enforceTenancy(request.auth, body.vertical);
      await assertEntityAccess(db, body.entityId, request.auth);
      const verdict = await governance.checkHardRules(body);
      return reply.send(verdict);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send(formatZodErrors(err));
      }
      if (err instanceof EntityAccessError) {
        return reply.status(err.statusCode).send({ message: err.message });
      }
      if (err instanceof AuthError || err instanceof TenancyViolationError) {
        return reply.status(403).send({ message: (err as Error).message });
      }
      throw err;
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    const mapped = mapRouteError(error);
    if (mapped) {
      return reply.status(mapped.status).send(mapped.body);
    }
    app.log.error(error);
    reply.status(500).send({ message: "Internal server error" });
  });

  return { app, db, governance, intelligence };
}

async function main() {
  assertPrivateDeploymentOrDie(HOST);
  requireInternalServiceTokenOrDie(HOST);
  const { app } = await buildApp();
  await app.listen({ port: PORT, host: HOST });
  console.log(`API Server listening on ${HOST}:${PORT} (fortress posture active)`);
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
