import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import { z } from "zod";
import { TASK_CATEGORIES } from "@rarecrest/diagnostics";
import { formatZodErrors } from "../validation.js";
import { TaskDecompositionService } from "../services/task-decomposition.js";

const taskSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  category: z.enum(TASK_CATEGORIES),
  agentReadinessScore: z.number().int().min(1).max(5).optional(),
});

const roleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  tasks: z.array(taskSchema).min(1),
});

export function registerTaskDecompositionRoutes(app: FastifyInstance, db: DatabaseClient) {
  const service = new TaskDecompositionService(db);

  app.get("/api/v1/diagnostics/:entityId/task-decomposition", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const matrices = await service.list(entityId);
    return reply.send({ entityId, matrices });
  });

  app.post("/api/v1/diagnostics/:entityId/task-decomposition", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const schema = z.object({
      functionName: z.string().min(1),
      roles: z.array(roleSchema).min(1),
    });
    try {
      const body = schema.parse(request.body);
      const matrix = await service.create(entityId, body);
      return reply.status(201).send(matrix);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof Error) return reply.status(400).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/diagnostics/:entityId/task-decomposition/:matrixId", async (request, reply) => {
    const { entityId, matrixId } = request.params as { entityId: string; matrixId: string };
    const matrix = await service.get(entityId, matrixId);
    if (!matrix) return reply.status(404).send({ message: "Matrix not found" });
    return reply.send(matrix);
  });

  app.patch("/api/v1/diagnostics/:entityId/task-decomposition/:matrixId", async (request, reply) => {
    const { entityId, matrixId } = request.params as { entityId: string; matrixId: string };
    const schema = z.object({
      functionName: z.string().min(1).optional(),
      roles: z.array(roleSchema).min(1).optional(),
    });
    try {
      const body = schema.parse(request.body);
      const matrix = await service.update(entityId, matrixId, body);
      if (!matrix) return reply.status(404).send({ message: "Matrix not found" });
      return reply.send(matrix);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof Error) return reply.status(400).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/diagnostics/:entityId/task-decomposition/:matrixId/complete", async (request, reply) => {
    const { entityId, matrixId } = request.params as { entityId: string; matrixId: string };
    try {
      const matrix = await service.complete(entityId, matrixId);
      if (!matrix) return reply.status(404).send({ message: "Matrix not found" });
      return reply.send(matrix);
    } catch (err) {
      if (err instanceof Error) return reply.status(400).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/diagnostics/:entityId/task-decomposition/:matrixId/export", async (request, reply) => {
    const { entityId, matrixId } = request.params as { entityId: string; matrixId: string };
    const matrix = await service.get(entityId, matrixId);
    if (!matrix) return reply.status(404).send({ message: "Matrix not found" });
    if (matrix.status !== "complete") {
      return reply.status(400).send({ message: "Complete the matrix before export" });
    }
    return reply.send(service.export(matrix));
  });
}
