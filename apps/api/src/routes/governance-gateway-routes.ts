import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import type { GovernanceClient } from "@rarecrest/governance-client";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import { enforceTenancy } from "../auth.js";
import { hardRuleCheckSchema, formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";
import { deriveActivationControls, appendDenyTrace } from "../trust.js";
import { z } from "zod";

export function registerGovernanceGatewayRoutes(
  app: FastifyInstance,
  db: DatabaseClient,
  governance: GovernanceClient,
  intelligence: IntelligenceClient,
) {
  app.post("/api/v1/governance/gateway", async (request, reply) => {
    try {
      const body = hardRuleCheckSchema.parse(request.body);
      enforceTenancy(request.auth, body.vertical);
      await assertEntityAccess(db, body.entityId, request.auth);
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
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  const activationSchema = z.object({
    agentId: z.string().min(1),
    entityId: z.string().uuid(),
    /** Client-supplied controls are ignored; kept optional for backward-compatible payloads. */
    hardRuleClear: z.boolean().optional(),
    envelopeEnforceable: z.boolean().optional(),
    evaluationSuiteRegistered: z.boolean().optional(),
    killSwitchesLive: z.boolean().optional(),
    humanReviewRoutingLive: z.boolean().optional(),
  });

  app.post("/api/v1/governance/runtime/activate", async (request, reply) => {
    try {
      const body = activationSchema.parse(request.body);
      await assertEntityAccess(db, body.entityId, request.auth);
      const controls = await deriveActivationControls(db, body.entityId, body.agentId);
      const verdict = await governance.evaluateActivation({
        agentId: body.agentId,
        entityId: body.entityId,
        hardRuleClear: controls.hardRuleClear,
        envelopeEnforceable: controls.envelopeEnforceable,
        evaluationSuiteRegistered: controls.evaluationSuiteRegistered,
        killSwitchesLive: controls.killSwitchesLive,
        humanReviewRoutingLive: controls.humanReviewRoutingLive,
      });
      await intelligence.appendTrace({
        vertical: request.auth.vertical,
        entityId: body.entityId,
        action: "runtime_activation",
        verdict: verdict.permitted ? "allow" : "deny",
        payload: {
          agentId: body.agentId,
          missingControls: verdict.missingControls,
          derivedControls: controls,
        },
      });
      if (!verdict.permitted) {
        await appendDenyTrace(intelligence, {
          vertical: request.auth.vertical,
          entityId: body.entityId,
          action: "runtime_activation",
          reason: "activation_controls_missing",
          route: "/api/v1/governance/runtime/activate",
          statusCode: 403,
        });
        return reply.status(403).send({ ...verdict, derivedControls: controls });
      }
      return reply.send({ ...verdict, derivedControls: controls });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}
