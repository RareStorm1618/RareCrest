import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import type { GovernanceClient } from "@rarecrest/governance-client";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import {
  buildImmutableLog,
  buildHeldActionRelease,
  computeLearningVelocity,
  defaultSlaTargetHours,
  filterRoster,
  isHealthDegraded,
  isSlaBreached,
  lookupLatestKnownGoodVersion,
  shouldRecordVersion,
  type LearningSignal,
  type AgentHealth,
  type AgentStatus,
  type ReviewCategory,
} from "@rarecrest/runtime-control";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";
import { deriveActivationControls, appendDenyTrace } from "../trust.js";

const activationControlsSchema = z.object({
  hardRuleClear: z.boolean(),
  envelopeEnforceable: z.boolean(),
  evaluationSuiteRegistered: z.boolean(),
  killSwitchesLive: z.boolean(),
  humanReviewRoutingLive: z.boolean(),
});

export function registerRuntimeRoutes(
  app: FastifyInstance,
  db: DatabaseClient,
  intelligence: IntelligenceClient,
  governance: GovernanceClient,
) {
  app.get("/api/v1/runtime/agents", async (request, reply) => {
    const q = request.query as { entityId?: string; status?: AgentStatus; health?: AgentHealth };
    const result = await db.query(
      `SELECT ar.id, ar.agent_id AS "agentId", ar.entity_id AS "entityId", ar.owner,
              ar.current_activity AS "currentActivity", ar.status, ar.health, ar.version
       FROM rarecrest.agent_roster ar
       JOIN rarecrest.entities e ON e.id = ar.entity_id
       WHERE e.vertical = $1 AND e.deleted_at IS NULL
       ORDER BY ar.updated_at DESC`,
      [request.auth.vertical],
    );
    const agents = filterRoster(result.rows as never, q);
    return reply.send({ agents, degradedCount: agents.filter((a) => isHealthDegraded(a.health)).length });
  });

  app.post("/api/v1/runtime/agents", async (request, reply) => {
    const schema = z.object({
      agentId: z.string(),
      entityId: z.string().uuid(),
      owner: z.string(),
      version: z.string().optional(),
      status: z.enum(["running", "inactive", "halted"]).default("inactive"),
      health: z.enum(["healthy", "degraded", "critical"]).default("healthy"),
      currentActivity: z.string().optional(),
      /** Client-supplied controls are ignored; kept optional for backward-compatible payloads. */
      activationControls: activationControlsSchema.optional(),
    });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, body.entityId, request.auth);

      if (body.status === "running") {
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
        if (!verdict.permitted) {
          await appendDenyTrace(intelligence, {
            vertical: request.auth.vertical,
            entityId: body.entityId,
            action: "runtime_agent_activation",
            reason: "activation_controls_missing",
            route: "/api/v1/runtime/agents",
            statusCode: 403,
          });
          return reply.status(403).send({
            message: "Activation blocked — controls derived server-side",
            ...verdict,
            derivedControls: controls,
          });
        }
      }

      const existing = await db.query(
        `SELECT version FROM rarecrest.agent_roster WHERE agent_id = $1 AND entity_id = $2`,
        [body.agentId, body.entityId],
      );
      const previousVersion = existing.rows[0]?.version as string | null | undefined;

      const result = await db.query(
        `INSERT INTO rarecrest.agent_roster (agent_id, entity_id, owner, version, status, health, current_activity)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (agent_id, entity_id) DO UPDATE SET
           status = EXCLUDED.status, health = EXCLUDED.health, current_activity = EXCLUDED.current_activity,
           version = EXCLUDED.version, updated_at = NOW()
         RETURNING id, agent_id AS "agentId", entity_id AS "entityId", owner, status, health, version`,
        [body.agentId, body.entityId, body.owner, body.version ?? null, body.status, body.health, body.currentActivity ?? null],
      );
      if (shouldRecordVersion(previousVersion, body.version ?? null)) {
        await db.query(
          `INSERT INTO rarecrest.agent_version_history (agent_id, entity_id, version) VALUES ($1, $2, $3)`,
          [body.agentId, body.entityId, body.version],
        );
      }
      return reply.status(201).send(result.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/runtime/rollback", async (request, reply) => {
    const schema = z.object({
      agentId: z.string(),
      entityId: z.string().uuid(),
      targetVersion: z.string().optional(),
      reason: z.string().min(1),
    });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, body.entityId, request.auth);
      const agent = await db.query(
        `SELECT version FROM rarecrest.agent_roster WHERE agent_id = $1 AND entity_id = $2`,
        [body.agentId, body.entityId],
      );
      if (agent.rows.length === 0) return reply.status(404).send({ message: "Agent not found" });

      let targetVersion = body.targetVersion;
      if (!targetVersion) {
        targetVersion = (await lookupLatestKnownGoodVersion(
          (sql, params) => db.query(sql, params),
          body.agentId,
          body.entityId,
        )) ?? undefined;
      }

      if (!targetVersion) {
        await db.query(
          `UPDATE rarecrest.agent_roster SET status = 'halted', updated_at = NOW() WHERE agent_id = $1 AND entity_id = $2`,
          [body.agentId, body.entityId],
        );
        await db.query(
          `INSERT INTO rarecrest.agent_rollbacks (agent_id, entity_id, from_version, reason, status)
           VALUES ($1, $2, $3, $4, 'halted_instead')`,
          [body.agentId, body.entityId, agent.rows[0].version, body.reason],
        );
        return reply.send({ agentId: body.agentId, status: "halted_instead", message: "No prior known-good state — agent halted" });
      }

      // Fail-closed: rolling back to "running" requires the same server-derived activation controls.
      const controls = await deriveActivationControls(db, body.entityId, body.agentId);
      const activation = await governance.evaluateActivation({
        agentId: body.agentId,
        entityId: body.entityId,
        hardRuleClear: controls.hardRuleClear,
        envelopeEnforceable: controls.envelopeEnforceable,
        evaluationSuiteRegistered: controls.evaluationSuiteRegistered,
        killSwitchesLive: controls.killSwitchesLive,
        humanReviewRoutingLive: controls.humanReviewRoutingLive,
      });
      if (!activation.permitted) {
        await db.query(
          `UPDATE rarecrest.agent_roster SET status = 'halted', updated_at = NOW() WHERE agent_id = $1 AND entity_id = $2`,
          [body.agentId, body.entityId],
        );
        await db.query(
          `INSERT INTO rarecrest.agent_rollbacks (agent_id, entity_id, from_version, to_version, reason, status)
           VALUES ($1, $2, $3, $4, $5, 'halted_instead')`,
          [body.agentId, body.entityId, agent.rows[0].version, targetVersion, body.reason],
        );
        await appendDenyTrace(intelligence, {
          vertical: request.auth.vertical,
          entityId: body.entityId,
          action: "agent_rollback",
          reason: "activation_controls_missing_after_rollback",
          route: "/api/v1/runtime/rollback",
          statusCode: 403,
        });
        return reply.status(403).send({
          agentId: body.agentId,
          status: "halted_instead",
          message: "Rollback blocked — activation controls not clear; agent halted",
          missingControls: activation.missingControls,
          derivedControls: controls,
        });
      }

      await db.query(
        `UPDATE rarecrest.agent_roster SET version = $1, status = 'running', health = 'healthy', updated_at = NOW()
         WHERE agent_id = $2 AND entity_id = $3`,
        [targetVersion, body.agentId, body.entityId],
      );
      const rb = await db.query(
        `INSERT INTO rarecrest.agent_rollbacks (agent_id, entity_id, from_version, to_version, reason, status)
         VALUES ($1, $2, $3, $4, $5, 'completed') RETURNING id`,
        [body.agentId, body.entityId, agent.rows[0].version, targetVersion, body.reason],
      );
      await intelligence.appendTrace({
        entityId: body.entityId,
        vertical: request.auth.vertical,
        action: "agent_rollback",
        verdict: "allow",
        payload: { agentId: body.agentId, rollbackId: rb.rows[0].id },
      });
      return reply.send({ agentId: body.agentId, status: "completed", rollbackId: rb.rows[0].id });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/runtime/human-review", async (request, reply) => {
    const result = await db.query(
      `SELECT hr.id, hr.entity_id AS "entityId", hr.agent_id AS "agentId", hr.category,
              hr.decision_needed AS "decisionNeeded", hr.status, hr.sla_target_at AS "slaTargetAt",
              hr.created_at AS "createdAt"
       FROM rarecrest.human_review_queue hr
       JOIN rarecrest.entities e ON e.id = hr.entity_id
       WHERE hr.status = 'pending' AND e.vertical = $1 AND e.deleted_at IS NULL
       ORDER BY hr.sla_target_at ASC`,
      [request.auth.vertical],
    );
    return reply.send({ items: result.rows, breached: result.rows.filter((r) => isSlaBreached(r.slaTargetAt as string)) });
  });

  app.post("/api/v1/runtime/human-review", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      agentId: z.string(),
      category: z.enum(["money", "legal", "customer_of_record", "crisis", "hard_rule_adjacent"]),
      decisionNeeded: z.string().min(1),
      heldAction: z.record(z.unknown()).default({}),
      attentionFlagId: z.string().uuid().optional(),
    });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, body.entityId, request.auth);
      const hours = defaultSlaTargetHours(body.category as ReviewCategory);
      const sla = new Date(Date.now() + hours * 3600000).toISOString();
      const result = await db.query(
        `INSERT INTO rarecrest.human_review_queue (entity_id, agent_id, category, decision_needed, sla_target_at, held_action, attention_flag_id)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
         RETURNING id, status, sla_target_at AS "slaTargetAt"`,
        [body.entityId, body.agentId, body.category, body.decisionNeeded, sla, JSON.stringify(body.heldAction), body.attentionFlagId ?? null],
      );
      return reply.status(201).send(result.rows[0]);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/runtime/human-review/:id/resolve", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({ approved: z.boolean(), resolutionNote: z.string().min(1) });
    try {
      const body = schema.parse(request.body);
      const pending = await db.query(
        `SELECT hr.id, hr.entity_id AS "entityId", hr.agent_id AS "agentId", hr.category,
                hr.held_action AS "heldAction"
         FROM rarecrest.human_review_queue hr
         JOIN rarecrest.entities e ON e.id = hr.entity_id
         WHERE hr.id = $1 AND hr.status = 'pending' AND e.vertical = $2 AND e.deleted_at IS NULL`,
        [id, request.auth.vertical],
      );
      if (pending.rows.length === 0) return reply.status(404).send({ message: "Item not found" });
      const pendingRow = pending.rows[0];
      const heldAction = pendingRow.heldAction as Record<string, unknown>;

      if (body.approved) {
        const category = pendingRow.category as string;
        const touchesFinancial =
          category === "money" || heldAction.touchesFinancial === true || heldAction.action === "trade";
        if (touchesFinancial) {
          const humanInstructionId =
            typeof heldAction.humanInstructionId === "string" ? heldAction.humanInstructionId.trim() : "";
          if (!humanInstructionId) {
            await appendDenyTrace(intelligence, {
              vertical: request.auth.vertical,
              entityId: pendingRow.entityId as string,
              action: "held_action_release",
              reason: "missing_human_instruction_id",
              route: "/api/v1/runtime/human-review/:id/resolve",
              statusCode: 403,
            });
            return reply.status(403).send({
              message: "Financial held-action release requires humanInstructionId on heldAction",
              reviewId: id,
            });
          }
          const verdict = await governance.checkHardRules({
            agentId: String(pendingRow.agentId ?? "unknown"),
            entityId: pendingRow.entityId as string,
            vertical: request.auth.vertical,
            requestedRights: [],
            touchesPhi: false,
            touchesFinancial: true,
            encryptionLayerPresent: true,
            humanInstructionId,
          });
          if (!verdict.allowed) {
            await appendDenyTrace(intelligence, {
              vertical: request.auth.vertical,
              entityId: pendingRow.entityId as string,
              action: "held_action_release",
              reason: verdict.reasons.join("; ") || "hard_rule_deny",
              route: "/api/v1/runtime/human-review/:id/resolve",
              statusCode: 403,
            });
            return reply.status(403).send({
              message: "Financial held-action release blocked by hard-rule evaluator",
              reasons: verdict.reasons,
              traceId: verdict.traceId,
              reviewId: id,
            });
          }

          // Dual-control financial commit: first approval records pending_second;
          // a different second approver is required before release (strict always; optional secondApproverId in body).
          const existing = await db.query(
            `SELECT id, first_approver_id AS "firstApproverId", status
             FROM rarecrest.financial_commit_approvals
             WHERE review_id = $1 AND status = 'pending_second'
             ORDER BY created_at DESC LIMIT 1`,
            [id],
          );
          if (existing.rows.length === 0) {
            await db.query(
              `INSERT INTO rarecrest.financial_commit_approvals
                 (review_id, entity_id, human_instruction_id, first_approver_id, status)
               VALUES ($1, $2, $3, $4, 'pending_second')`,
              [id, pendingRow.entityId, humanInstructionId, request.auth.userId],
            );
            return reply.status(202).send({
              reviewId: id,
              status: "pending_second_approver",
              message:
                "Financial dual-control: first approval recorded. A different approver must resolve again to commit.",
              firstApproverId: request.auth.userId,
            });
          }
          const firstApproverId = existing.rows[0].firstApproverId as string;
          if (firstApproverId === request.auth.userId) {
            await appendDenyTrace(intelligence, {
              vertical: request.auth.vertical,
              entityId: pendingRow.entityId as string,
              action: "held_action_release",
              reason: "dual_control_same_actor",
              route: "/api/v1/runtime/human-review/:id/resolve",
              statusCode: 403,
            });
            return reply.status(403).send({
              message: "Financial dual-control requires a different second approver",
              reviewId: id,
              firstApproverId,
            });
          }
          await db.query(
            `UPDATE rarecrest.financial_commit_approvals
             SET second_approver_id = $1, status = 'committed', completed_at = NOW()
             WHERE id = $2`,
            [request.auth.userId, existing.rows[0].id],
          );
        }
      }

      const result = await db.query(
        `UPDATE rarecrest.human_review_queue hr
         SET status = $1, resolution_note = $2, resolved_at = NOW()
         FROM rarecrest.entities e
         WHERE hr.id = $3 AND hr.status = 'pending' AND e.id = hr.entity_id AND e.vertical = $4
         RETURNING hr.id, hr.status, hr.entity_id AS "entityId", hr.agent_id AS "agentId",
                   hr.category, hr.held_action AS "heldAction"`,
        [body.approved ? "approved" : "denied", body.resolutionNote, id, request.auth.vertical],
      );
      if (result.rows.length === 0) return reply.status(404).send({ message: "Item not found" });
      const row = result.rows[0];
      let actionReleased = false;
      if (body.approved) {
        const release = buildHeldActionRelease(id, heldAction);
        if (release) {
          await intelligence.appendTrace({
            entityId: row.entityId as string,
            vertical: request.auth.vertical,
            action: release.action,
            verdict: "allow",
            payload: release.payload,
          });
          actionReleased = true;
        }
      }
      return reply.send({ ...row, actionReleased });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });

  app.post("/api/v1/runtime/evaluations", async (request, reply) => {
    const schema = z.object({
      agentId: z.string(),
      entityId: z.string().uuid(),
      accuracy: z.number().min(0).max(1),
      overrideRate: z.number().min(0).max(1),
      accuracyFloor: z.number().min(0).max(1).optional(),
      overrideCeiling: z.number().min(0).max(1).optional(),
    });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, body.entityId, request.auth);
      const result = await intelligence.runEvaluation({
        agentId: body.agentId,
        entityId: body.entityId,
        accuracy: body.accuracy,
        overrideRate: body.overrideRate,
        accuracyFloor: body.accuracyFloor,
        overrideCeiling: body.overrideCeiling,
      });
      return reply.send(result);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/runtime/learning-velocity", async (request, reply) => {
    const schema = z.object({
      entityId: z.string().uuid(),
      agentId: z.string().optional(),
      windowDays: z.coerce.number().int().min(1).max(365).default(30),
    });
    try {
      const query = schema.parse(request.query);
      await assertEntityAccess(db, query.entityId, request.auth);

      const evalRows = await db.query(
        `SELECT created_at AS "createdAt", drift_detected AS "driftDetected"
         FROM rarecrest.evaluation_runs
         WHERE entity_id = $1 AND ($2::text IS NULL OR agent_id = $2)
         ORDER BY created_at DESC
         LIMIT 200`,
        [query.entityId, query.agentId ?? null],
      );
      const versionRows = await db.query(
        `SELECT recorded_at AS "recordedAt"
         FROM rarecrest.agent_version_history
         WHERE entity_id = $1 AND ($2::text IS NULL OR agent_id = $2)
         ORDER BY recorded_at DESC
         LIMIT 200`,
        [query.entityId, query.agentId ?? null],
      );

      const signals: LearningSignal[] = [
        ...evalRows.rows.map((row) => ({
          occurredAt: String(row.createdAt),
          delta: row.driftDetected ? -0.2 : 0.25,
          source: "evaluation" as const,
        })),
        ...versionRows.rows.map((row) => ({
          occurredAt: String(row.recordedAt),
          delta: 0.08,
          source: "version_change" as const,
        })),
      ];

      const velocity = computeLearningVelocity(signals, query.windowDays);
      return reply.send({ entityId: query.entityId, agentId: query.agentId ?? null, windowDays: query.windowDays, velocity });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/runtime/immutable-log/:entityId", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      const result = await db.query(
        `SELECT id, action, verdict, created_at AS "createdAt"
         FROM rarecrest.decision_traces
         WHERE entity_id = $1
         ORDER BY created_at ASC
         LIMIT 500`,
        [entityId],
      );
      const entries = buildImmutableLog(
        result.rows.map((row) => ({
          id: String(row.id),
          action: String(row.action),
          verdict: row.verdict as "allow" | "deny",
          createdAt: new Date(row.createdAt as string).toISOString(),
        })),
      );
      return reply.send({ entityId, entries });
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}
