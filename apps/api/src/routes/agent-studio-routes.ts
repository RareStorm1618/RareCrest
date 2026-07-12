import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import type { GovernanceClient } from "@rarecrest/governance-client";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import { ENVELOPE_CHECKLIST, issueAgentPassport, validatePermissionEnvelope } from "@rarecrest/agent-studio";
import type { AgentRight } from "@rarecrest/contracts";
import { buildAgentBlueprint } from "@rarecrest/design-studio";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";
import { appendDenyTrace } from "../trust.js";

export function registerAgentStudioRoutes(
  app: FastifyInstance,
  db: DatabaseClient,
  governance: GovernanceClient,
  intelligence: IntelligenceClient,
) {
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
      await assertEntityAccess(db, body.entityId, request.auth);
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
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/agents/passport", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      agentId: z.string().min(1),
      requestedRights: z.array(z.enum(["sensitive_data", "code_execution", "external_comms"])),
      touchesPhi: z.boolean(),
      touchesFinancial: z.boolean(),
      encryptionLayerPresent: z.boolean(),
      issuedBy: z.string().min(1),
      humanInstructionId: z.string().optional(),
    });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, body.entityId, request.auth);

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
      if (!govVerdict.allowed) {
        await appendDenyTrace(intelligence, {
          vertical: request.auth.vertical,
          entityId: body.entityId,
          action: "passport_issuance",
          reason: govVerdict.reasons.join("; ") || "hard_rule_deny",
          route: "/api/v1/agents/passport",
          statusCode: 403,
        });
        return reply.status(403).send({
          message: "Passport issuance blocked by hard-rule evaluator",
          reasons: govVerdict.reasons,
          traceId: govVerdict.traceId,
        });
      }

      const passport = issueAgentPassport({
        agentId: body.agentId,
        entityId: body.entityId,
        requestedRights: body.requestedRights as AgentRight[],
        touchesPhi: body.touchesPhi,
        touchesFinancial: body.touchesFinancial,
        encryptionLayerPresent: body.encryptionLayerPresent,
        issuedBy: body.issuedBy,
      });
      if (!passport.hardRuleClear) {
        await appendDenyTrace(intelligence, {
          vertical: request.auth.vertical,
          entityId: body.entityId,
          action: "passport_issuance",
          reason: "local_hard_rule_precheck",
          route: "/api/v1/agents/passport",
          statusCode: 403,
        });
        return reply.status(403).send({
          message: "Passport issuance blocked by local hard-rule pre-check",
          constraints: passport.constraints,
        });
      }

      const inserted = await db.query(
        `INSERT INTO rarecrest.agent_passports
          (agent_id, entity_id, rights, risk_tier, valid_until, issued_by, hard_rule_clear, constraints)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8::jsonb)
         RETURNING id, agent_id AS "agentId", entity_id AS "entityId", rights, risk_tier AS "riskTier",
                   valid_until AS "validUntil", issued_by AS "issuedBy", hard_rule_clear AS "hardRuleClear",
                   constraints, created_at AS "createdAt"`,
        [
          passport.agentId,
          passport.entityId,
          JSON.stringify(passport.rights),
          passport.riskTier,
          passport.validUntil,
          passport.issuedBy,
          true,
          JSON.stringify(passport.constraints),
        ],
      );
      return reply.status(201).send(inserted.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/agents/passport/:entityId/:agentId", async (request, reply) => {
    const { entityId, agentId } = request.params as { entityId: string; agentId: string };
    await assertEntityAccess(db, entityId, request.auth);
    const result = await db.query(
      `SELECT id, agent_id AS "agentId", entity_id AS "entityId", rights, risk_tier AS "riskTier",
              valid_until AS "validUntil", issued_by AS "issuedBy", hard_rule_clear AS "hardRuleClear",
              constraints, created_at AS "createdAt"
       FROM rarecrest.agent_passports
       WHERE entity_id = $1 AND agent_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [entityId, agentId],
    );
    if (!result.rows[0]) return reply.status(404).send({ message: "Passport not found" });
    return reply.send(result.rows[0]);
  });

  app.post("/api/v1/agents/blueprint", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      selectedLayers: z.array(z.enum(["signals", "models", "workflows", "governance"])).min(1),
      humanReviewRequired: z.boolean(),
    });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, body.entityId, request.auth);
      return reply.send(
        buildAgentBlueprint({
          entityId: body.entityId,
          selectedLayers: body.selectedLayers,
          humanReviewRequired: body.humanReviewRequired,
        }),
      );
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}
