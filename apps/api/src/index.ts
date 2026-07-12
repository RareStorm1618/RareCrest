import Fastify from "fastify";
import cors from "@fastify/cors";
import { DatabaseClient } from "@rarecrest/db";
import { GovernanceClient } from "@rarecrest/governance-client";
import { IntelligenceClient } from "@rarecrest/intelligence-client";
import { extractAuth, enforceTenancy, AuthError, TenancyViolationError } from "./auth.js";
import { mapRouteError } from "./errors.js";
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
import { PortfolioService } from "./services/portfolio.js";
import { mapEntityRow } from "./services/portfolio.js";
import { z } from "zod";

const PORT = Number(process.env.API_PORT ?? 3000);
const HOST = process.env.API_HOST ?? "0.0.0.0";

export async function buildApp() {
  const app = Fastify({ logger: true });

  const db = new DatabaseClient({
    connectionString: process.env.DATABASE_URL ?? "",
  });

  const governance = new GovernanceClient({
    baseUrl: process.env.GOVERNANCE_ENGINE_URL ?? "http://localhost:3001",
  });

  const intelligence = new IntelligenceClient({
    baseUrl: process.env.INTELLIGENCE_SERVICES_URL ?? "http://localhost:3002",
  });

  await app.register(cors, { origin: true });

  app.addHook("preHandler", async (request) => {
    if (request.url === "/health") return;
    request.auth = extractAuth(request);
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

  const portfolio = new PortfolioService(db);

  registerPhaseRoutes(app, db, governance, intelligence);
  registerPortfolioRoutes(app, portfolio);
  registerDiagnosticsRoutes(app, db);
  registerMigrationRoutes(app, db);
  registerTaskDecompositionRoutes(app, db);
  registerRegulatoryProfileRoutes(app, db);
  registerAttentionFlagRoutes(app, db);
  registerWorkflowRoutes(app, db, intelligence);
  registerAgentStudioRoutes(app, db, governance);
  registerMigrationWorkspaceRoutes(app, db);
  registerLegalRoutes(app, db);
  registerVendorShortcutRoutes(app, db);
  registerCapabilityRoutes(app, db);
  registerCommandRoutes(app, db);
  registerAssessmentRoutes(app, db);
  registerExportRoutes(app, db, intelligence);
  registerSkillCompanionRoutes(app, db, intelligence);
  registerSpecRoutes(app, db, governance);
  registerGovernanceGatewayRoutes(app, governance, intelligence);
  registerEntityRegistryRoutes(app, db);
  registerRuntimeRoutes(app, db, intelligence, governance);
  registerIpRoutes(app, db);
  registerDesignStudioRoutes(app, db);

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
      const verdict = await governance.checkHardRules(body);
      return reply.send(verdict);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send(formatZodErrors(err));
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
  const { app } = await buildApp();
  await app.listen({ port: PORT, host: HOST });
  console.log(`API Server listening on ${HOST}:${PORT}`);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
