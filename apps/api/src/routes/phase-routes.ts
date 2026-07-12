import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import type { GovernanceClient } from "@rarecrest/governance-client";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";

/** Legacy phase route registrations — canonical implementations moved to dedicated route modules */
export function registerPhaseRoutes(
  _app: FastifyInstance,
  _db: DatabaseClient,
  _governance: GovernanceClient,
  _intelligence: IntelligenceClient,
) {
  // WO-22: governance-gateway-routes.ts
  // WO-23: entity-registry-routes.ts
  // WO-25: assessment-routes.ts
  // WO-27: export-routes.ts
  // WO-28: skill-companion-routes.ts
  // WO-29: spec-routes.ts
  // WO-68/72: runtime-routes.ts
}
