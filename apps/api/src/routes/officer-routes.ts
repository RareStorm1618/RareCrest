import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import type { GovernanceClient } from "@rarecrest/governance-client";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import {
  OFFICER_ROLE_TEMPLATES,
  assertRightsWithinOfficerTemplate,
  OfficerTemplateViolationError,
  type AgentRight,
  type OfficerRole,
} from "@rarecrest/contracts";
import { issueAgentPassport } from "@rarecrest/agent-studio";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";
import { appendDenyTrace } from "../trust.js";
import { roleAllows } from "../rbac.js";
import { isVerifiedDirector } from "../trust.js";
import { entityEncryptionLayerPresent } from "./phi-vault-routes.js";

/**
 * S2 Officer Passports: director-assigned officer roles, each pre-shaped by an
 * OFFICER_ROLE_TEMPLATE (@rarecrest/contracts) that caps requestable rights at
 * a template-specific ceiling — always a subset of the global two-of-three
 * rule, never all three, never more than 2. Assignment reuses the exact
 * passport-issuance path from agent-studio-routes.ts (governance hard-rule
 * check → local issueAgentPassport pre-check → insert) so an officer never
 * receives a passport that would fail the same fail-closed gates a
 * non-officer agent would face. Officer passports are always issued with
 * touchesPhi=false / touchesFinancial=false: the templates structurally
 * exclude sensitive_data from every maxRights ceiling, and "financialPrepOnly"
 * roles may only prepare — never commit — financial actions, so the passport
 * itself never claims financial-execution authority.
 */

export class OfficerAssignmentError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "OfficerAssignmentError";
  }
}

function assertDirector(request: FastifyRequest) {
  const allowed =
    roleAllows(request.auth.role, "officer_assign") ||
    isVerifiedDirector(request.auth, request.headers as Record<string, unknown>);
  if (!allowed) {
    throw new OfficerAssignmentError(
      "Officer assignment requires role=director or a verified director",
      403,
    );
  }
}

const OFFICER_ROLES = Object.keys(OFFICER_ROLE_TEMPLATES) as [OfficerRole, ...OfficerRole[]];

interface OfficerAssignmentRow {
  id: string;
  entityId: string;
  officerRole: OfficerRole;
  agentId: string;
  active: boolean;
  issuedPassportId: string | null;
  assignedBy: string;
  createdAt: string;
}

export function registerOfficerRoutes(
  app: FastifyInstance,
  db: DatabaseClient,
  governance: GovernanceClient,
  intelligence: IntelligenceClient,
) {
  app.get("/api/v1/runtime/officers/templates", async (_request, reply) => {
    return reply.send({ templates: OFFICER_ROLE_TEMPLATES });
  });

  app.get("/api/v1/runtime/entities/:entityId/officers", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      const result = await db.query<OfficerAssignmentRow>(
        `SELECT id, entity_id AS "entityId", officer_role AS "officerRole", agent_id AS "agentId",
                active, issued_passport_id AS "issuedPassportId", assigned_by AS "assignedBy",
                created_at AS "createdAt"
         FROM rarecrest.officer_assignments
         WHERE entity_id = $1
         ORDER BY active DESC, created_at DESC`,
        [entityId],
      );
      return reply.send({ assignments: result.rows });
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/runtime/officers/assign", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      officerRole: z.enum(OFFICER_ROLES),
      agentId: z.string().min(1),
      requestedRights: z.array(z.enum(["sensitive_data", "code_execution", "external_comms"])).optional(),
    });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, body.entityId, request.auth);
      assertDirector(request);

      const template = OFFICER_ROLE_TEMPLATES[body.officerRole];
      const requestedRights = (body.requestedRights ?? template.maxRights) as AgentRight[];

      try {
        assertRightsWithinOfficerTemplate(body.officerRole, requestedRights);
      } catch (violation) {
        if (violation instanceof OfficerTemplateViolationError) {
          await appendDenyTrace(intelligence, {
            vertical: request.auth.vertical,
            entityId: body.entityId,
            action: "officer_assignment",
            reason: violation.message,
            route: "/api/v1/runtime/officers/assign",
            statusCode: 403,
          });
          return reply.status(403).send({ message: violation.message, role: violation.role, rights: violation.rights });
        }
        throw violation;
      }

      const encryptionLayerPresent = await entityEncryptionLayerPresent(db, body.entityId);
      const govVerdict = await governance.checkHardRules({
        agentId: body.agentId,
        entityId: body.entityId,
        vertical: request.auth.vertical,
        requestedRights,
        touchesPhi: false,
        touchesFinancial: false,
        encryptionLayerPresent,
      });
      if (!govVerdict.allowed) {
        await appendDenyTrace(intelligence, {
          vertical: request.auth.vertical,
          entityId: body.entityId,
          action: "officer_assignment",
          reason: govVerdict.reasons.join("; ") || "hard_rule_deny",
          route: "/api/v1/runtime/officers/assign",
          statusCode: 403,
        });
        return reply.status(403).send({
          message: "Officer passport issuance blocked by hard-rule evaluator",
          reasons: govVerdict.reasons,
          traceId: govVerdict.traceId,
        });
      }

      const passport = issueAgentPassport({
        agentId: body.agentId,
        entityId: body.entityId,
        requestedRights,
        touchesPhi: false,
        touchesFinancial: false,
        encryptionLayerPresent,
        issuedBy: request.auth.userId,
      });
      if (!passport.hardRuleClear) {
        await appendDenyTrace(intelligence, {
          vertical: request.auth.vertical,
          entityId: body.entityId,
          action: "officer_assignment",
          reason: "local_hard_rule_precheck",
          route: "/api/v1/runtime/officers/assign",
          statusCode: 403,
        });
        return reply.status(403).send({
          message: "Officer passport issuance blocked by local hard-rule pre-check",
          constraints: passport.constraints,
        });
      }

      const passportRow = await db.query<{ id: string }>(
        `INSERT INTO rarecrest.agent_passports
          (agent_id, entity_id, rights, risk_tier, valid_until, issued_by, hard_rule_clear, constraints)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8::jsonb)
         RETURNING id`,
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
      const passportId = passportRow.rows[0].id;

      // Deactivate any prior active assignment for this (entity, role) before
      // inserting the new one — the partial unique index is the backstop, this
      // explicit deactivate is what keeps the replace semantics observable.
      await db.query(
        `UPDATE rarecrest.officer_assignments SET active = FALSE
         WHERE entity_id = $1 AND officer_role = $2 AND active = TRUE`,
        [body.entityId, body.officerRole],
      );

      const inserted = await db.query<OfficerAssignmentRow>(
        `INSERT INTO rarecrest.officer_assignments
          (entity_id, officer_role, agent_id, active, issued_passport_id, assigned_by)
         VALUES ($1, $2, $3, TRUE, $4, $5)
         RETURNING id, entity_id AS "entityId", officer_role AS "officerRole", agent_id AS "agentId",
                   active, issued_passport_id AS "issuedPassportId", assigned_by AS "assignedBy",
                   created_at AS "createdAt"`,
        [body.entityId, body.officerRole, body.agentId, passportId, request.auth.userId],
      );

      await intelligence.appendTrace({
        entityId: body.entityId,
        vertical: request.auth.vertical,
        action: "officer_assignment",
        verdict: "allow",
        payload: { officerRole: body.officerRole, agentId: body.agentId, passportId },
      });

      return reply.status(201).send(inserted.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      if (err instanceof OfficerAssignmentError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/runtime/officers/:assignmentId/deactivate", async (request, reply) => {
    const { assignmentId } = request.params as { assignmentId: string };
    try {
      const existing = await db.query<{ entityId: string }>(
        `SELECT entity_id AS "entityId" FROM rarecrest.officer_assignments WHERE id = $1`,
        [assignmentId],
      );
      if (existing.rows.length === 0) return reply.status(404).send({ message: "Officer assignment not found" });
      await assertEntityAccess(db, existing.rows[0].entityId, request.auth);
      assertDirector(request);

      const result = await db.query<OfficerAssignmentRow>(
        `UPDATE rarecrest.officer_assignments SET active = FALSE
         WHERE id = $1
         RETURNING id, entity_id AS "entityId", officer_role AS "officerRole", agent_id AS "agentId",
                   active, issued_passport_id AS "issuedPassportId", assigned_by AS "assignedBy",
                   created_at AS "createdAt"`,
        [assignmentId],
      );
      return reply.send(result.rows[0]);
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      if (err instanceof OfficerAssignmentError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}
