import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import type { GovernanceClient } from "@rarecrest/governance-client";
import { ENVELOPE_CHECKLIST, validatePermissionEnvelope } from "@rarecrest/agent-studio";
import type { AgentRight } from "@rarecrest/contracts";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";

export function registerAgentStudioRoutes(app: FastifyInstance, db: DatabaseClient, governance: GovernanceClient) {
  app.get("/api/v1/agents/permission-envelope/checklist", async (_request, reply) => {
    return reply.send({ checklist: ENVELOPE_CHECKLIST });
  });

  app.post("/api/v1/agents/validate-permissions", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      agentId: z.string().min(1),
      checklist: z.record(z.boolean()),
      requestedRights: z.array(z.enum(["sensitive_data", "code_execution", "external_comms"])),
      touchesPhi: z.boolean(),
      touchesFinancial: z.boolean(),
      encryptionLayerPresent: z.boolean(),
      destructiveWithinBounds: z.boolean(),
      humanInstructionId: z.string().optional(),
    });
    try {
      const body = schema.parse(request.body);
      const checklist = Object.fromEntries(
        ENVELOPE_CHECKLIST.map((k) => [k, body.checklist[k] ?? false]),
      ) as Record<(typeof ENVELOPE_CHECKLIST)[number], boolean>;

      const local = validatePermissionEnvelope({
        checklist,
        requestedRights: body.requestedRights as AgentRight[],
        touchesPhi: body.touchesPhi,
        touchesFinancial: body.touchesFinancial,
        encryptionLayerPresent: body.encryptionLayerPresent,
        destructiveWithinBounds: body.destructiveWithinBounds,
        humanInstructionId: body.humanInstructionId,
      });

      const govVerdict = await governance.checkHardRules({
        agentId: body.agentId,
        entityId: body.entityId,
        vertical: request.auth.vertical,
        requestedRights: body.requestedRights,
        touchesPhi: body.touchesPhi,
        touchesFinancial: body.touchesFinancial,
        encryptionLayerPresent: body.encryptionLayerPresent,
        humanInstructionId: body.humanInstructionId,
      });

      const deployable = local.deployable && govVerdict.allowed;
      await db.query(
        `INSERT INTO rarecrest.permission_envelope_audits (entity_id, agent_id, deployable, violations, hard_rule_clear)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [body.entityId, body.agentId, deployable, JSON.stringify([...local.violations, ...govVerdict.reasons]), local.hardRuleClear && govVerdict.allowed],
      );

      return reply.send({
        deployable,
        checklistComplete: local.checklistComplete,
        violations: [...local.violations, ...govVerdict.reasons],
        hardRuleClear: local.hardRuleClear && govVerdict.allowed,
        traceId: govVerdict.traceId,
      });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });
}
