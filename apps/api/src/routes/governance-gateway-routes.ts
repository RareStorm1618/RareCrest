import type { FastifyInstance } from "fastify";
import type { GovernanceClient } from "@rarecrest/governance-client";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import { enforceTenancy } from "../auth.js";
import { hardRuleCheckSchema, formatZodErrors } from "../validation.js";
import { z } from "zod";

export function registerGovernanceGatewayRoutes(
  app: FastifyInstance,
  governance: GovernanceClient,
  intelligence: IntelligenceClient,
) {
  app.post("/api/v1/governance/gateway", async (request, reply) => {
    try {
      const body = hardRuleCheckSchema.parse(request.body);
      enforceTenancy(request.auth, body.vertical);
      const verdict = await governance.checkHardRules(body);
      await intelligence.appendTrace({
        vertical: body.vertical,
        entityId: body.entityId,
        action: "governance_gateway",
        verdict: verdict.allowed ? "allow" : "deny",
        payload: { traceId: verdict.traceId, reasons: verdict.reasons },
      });
      return reply.send(verdict);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  const activationSchema = z.object({
    agentId: z.string().min(1),
    entityId: z.string().uuid(),
    hardRuleClear: z.boolean(),
    envelopeEnforceable: z.boolean(),
    evaluationSuiteRegistered: z.boolean(),
    killSwitchesLive: z.boolean(),
    humanReviewRoutingLive: z.boolean(),
  });

  app.post("/api/v1/governance/runtime/activate", async (request, reply) => {
    try {
      const body = activationSchema.parse(request.body);
      const verdict = await governance.evaluateActivation(body);
      await intelligence.appendTrace({
        vertical: request.auth.vertical,
        entityId: body.entityId,
        action: "runtime_activation",
        verdict: verdict.permitted ? "allow" : "deny",
        payload: { agentId: body.agentId, missingControls: verdict.missingControls },
      });
      if (!verdict.permitted) {
        return reply.status(403).send(verdict);
      }
      return reply.send(verdict);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });
}
