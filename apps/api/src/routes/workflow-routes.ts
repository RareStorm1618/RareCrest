import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import type { IntelligenceClient } from "@rarecrest/intelligence-client";
import {
  WORKFLOW_DEFINITIONS,
  WORKFLOW_IDS,
  getWorkflow,
  isStepUnlocked,
  validateWorkflowArtifact,
  type WorkflowId,
} from "@rarecrest/skill-companion";
import { z } from "zod";
import { formatZodErrors } from "../validation.js";

export function registerWorkflowRoutes(app: FastifyInstance, db: DatabaseClient, intelligence: IntelligenceClient) {
  app.get("/api/v1/workflows", async (_request, reply) => {
    return reply.send({
      workflows: WORKFLOW_IDS.map((id) => ({ id, title: WORKFLOW_DEFINITIONS[id].title, steps: WORKFLOW_DEFINITIONS[id].steps.length })),
    });
  });

  app.post("/api/v1/workflows/run", async (request, reply) => {
    const schema = z.object({
      workflowId: z.enum(WORKFLOW_IDS as unknown as [WorkflowId, ...WorkflowId[]]),
      entityId: z.string().uuid(),
      stepId: z.string(),
      stepOutput: z.record(z.unknown()).default({}),
    });
    try {
      const body = schema.parse(request.body);
      const workflow = getWorkflow(body.workflowId);
      const existing = await db.query(
        `SELECT id, completed_steps FROM rarecrest.workflow_runs
         WHERE entity_id = $1 AND workflow_id = $2 AND status = 'in_progress'
         ORDER BY created_at DESC LIMIT 1`,
        [body.entityId, body.workflowId],
      );
      const completedSteps: string[] = Array.isArray(existing.rows[0]?.completed_steps)
        ? (existing.rows[0].completed_steps as string[])
        : [];
      if (!isStepUnlocked(completedSteps, body.stepId, workflow)) {
        return reply.status(400).send({ message: "Complete prior workflow steps first" });
      }
      const artifact = {
        workflowId: body.workflowId,
        entityId: body.entityId,
        stepId: body.stepId,
        output: body.stepOutput,
        complete: Object.keys(body.stepOutput).length > 0,
      };
      const validation = validateWorkflowArtifact(artifact);
      await intelligence.skillCompanionComplete({
        entityId: body.entityId,
        vertical: request.auth.vertical,
        question: workflow.steps.find((s) => s.id === body.stepId)?.prompt ?? "workflow step",
        context: [JSON.stringify(artifact)],
      });
      const nextCompleted = completedSteps.includes(body.stepId) ? completedSteps : [...completedSteps, body.stepId];
      const allDone = workflow.steps.every((s) => nextCompleted.includes(s.id));
      const status = validation.incomplete ? "incomplete" : allDone ? "complete" : "in_progress";
      let runId = existing.rows[0]?.id as string | undefined;
      if (runId) {
        await db.query(
          `UPDATE rarecrest.workflow_runs SET completed_steps = $1::jsonb, artifacts = artifacts || $2::jsonb, status = $3, updated_at = NOW() WHERE id = $4`,
          [JSON.stringify(nextCompleted), JSON.stringify([artifact]), status, runId],
        );
      } else {
        const ins = await db.query(
          `INSERT INTO rarecrest.workflow_runs (entity_id, workflow_id, completed_steps, artifacts, status)
           VALUES ($1, $2, $3::jsonb, $4::jsonb, $5) RETURNING id`,
          [body.entityId, body.workflowId, JSON.stringify(nextCompleted), JSON.stringify([artifact]), status],
        );
        runId = ins.rows[0].id as string;
      }
      return reply.send({
        runId,
        workflowId: body.workflowId,
        status,
        stepsCompleted: nextCompleted.length,
        artifactValidation: validation,
      });
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      throw err;
    }
  });
}
