import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import {
  defaultSlaTargetHours,
  filterRoster,
  isHealthDegraded,
  isSlaBreached,
  type AgentHealth,
  type AgentStatus,
  type ReviewCategory,
} from "@rarecrest/runtime-control";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";

export function registerRuntimeRoutes(app: FastifyInstance, db: DatabaseClient, intelligence: IntelligenceClient) {
  app.get("/api/v1/runtime/agents", async (request, reply) => {
    const q = request.query as { entityId?: string; status?: AgentStatus; health?: AgentHealth };
    const result = await db.query(
      `SELECT id, agent_id AS "agentId", entity_id AS "entityId", owner,
              current_activity AS "currentActivity", status, health, version
       FROM rarecrest.agent_roster ORDER BY updated_at DESC`,
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
    });
    const body = schema.parse(request.body);
    const result = await db.query(
      `INSERT INTO rarecrest.agent_roster (agent_id, entity_id, owner, version, status, health, current_activity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (agent_id, entity_id) DO UPDATE SET
         status = EXCLUDED.status, health = EXCLUDED.health, current_activity = EXCLUDED.current_activity,
         version = EXCLUDED.version, updated_at = NOW()
       RETURNING id, agent_id AS "agentId", entity_id AS "entityId", owner, status, health, version`,
      [body.agentId, body.entityId, body.owner, body.version ?? null, body.status, body.health, body.currentActivity ?? null],
    );
    return reply.status(201).send(result.rows[0]);
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
      const agent = await db.query(
        `SELECT version FROM rarecrest.agent_roster WHERE agent_id = $1 AND entity_id = $2`,
        [body.agentId, body.entityId],
      );
      if (agent.rows.length === 0) return reply.status(404).send({ message: "Agent not found" });

      if (!body.targetVersion) {
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

      await db.query(
        `UPDATE rarecrest.agent_roster SET version = $1, status = 'running', health = 'healthy', updated_at = NOW()
         WHERE agent_id = $2 AND entity_id = $3`,
        [body.targetVersion, body.agentId, body.entityId],
      );
      const rb = await db.query(
        `INSERT INTO rarecrest.agent_rollbacks (agent_id, entity_id, from_version, to_version, reason, status)
         VALUES ($1, $2, $3, $4, $5, 'completed') RETURNING id`,
        [body.agentId, body.entityId, agent.rows[0].version, body.targetVersion, body.reason],
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
      throw err;
    }
  });

  app.get("/api/v1/runtime/human-review", async (_request, reply) => {
    const result = await db.query(
      `SELECT id, entity_id AS "entityId", agent_id AS "agentId", category, decision_needed AS "decisionNeeded",
              status, sla_target_at AS "slaTargetAt", created_at AS "createdAt"
       FROM rarecrest.human_review_queue WHERE status = 'pending' ORDER BY sla_target_at ASC`,
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
    });
    const body = schema.parse(request.body);
    const hours = defaultSlaTargetHours(body.category as ReviewCategory);
    const sla = new Date(Date.now() + hours * 3600000).toISOString();
    const result = await db.query(
      `INSERT INTO rarecrest.human_review_queue (entity_id, agent_id, category, decision_needed, sla_target_at, held_action)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id, status, sla_target_at AS "slaTargetAt"`,
      [body.entityId, body.agentId, body.category, body.decisionNeeded, sla, JSON.stringify(body.heldAction)],
    );
    return reply.status(201).send(result.rows[0]);
  });

  app.post("/api/v1/runtime/human-review/:id/resolve", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({ approved: z.boolean(), resolutionNote: z.string().min(1) });
    const body = schema.parse(request.body);
    const result = await db.query(
      `UPDATE rarecrest.human_review_queue
       SET status = $1, resolution_note = $2, resolved_at = NOW()
       WHERE id = $3 AND status = 'pending'
       RETURNING id, status, held_action AS "heldAction"`,
      [body.approved ? "approved" : "denied", body.resolutionNote, id],
    );
    if (result.rows.length === 0) return reply.status(404).send({ message: "Item not found" });
    return reply.send({ ...result.rows[0], actionReleased: body.approved });
  });
}
