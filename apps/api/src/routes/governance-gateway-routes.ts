import type { FastifyInstance } from "fastify";
import type { GovernanceClient } from "@rarecrest/governance-client";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";

export function registerGovernanceGatewayRoutes(
  app: FastifyInstance,
  governance: GovernanceClient,
  intelligence: IntelligenceClient,
) {
  app.post("/api/v1/governance/gateway", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const verdict = await governance.checkHardRules(body as never);
    await intelligence.appendTrace({
      vertical: request.auth.vertical,
      entityId: body.entityId as string | undefined,
      action: "governance_gateway",
      verdict: verdict.allowed ? "allow" : "deny",
      payload: { traceId: verdict.traceId, reasons: verdict.reasons },
    });
    return reply.send(verdict);
  });
}
