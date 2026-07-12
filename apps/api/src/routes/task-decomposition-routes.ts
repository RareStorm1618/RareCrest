import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@rarecrest/db";
import { z } from "zod";
import { TASK_CATEGORIES, type RoleItem } from "@rarecrest/diagnostics";
import { formatZodErrors } from "../validation.js";
import { TaskDecompositionService } from "../services/task-decomposition.js";
import { assertEntityAccess, EntityAccessError } from "../tenancy.js";

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

function normalizeRoles(roles: z.infer<typeof roleSchema>[]): RoleItem[] {
  return roles.map((role) => ({
    id: role.id ?? randomUUID(),
    name: role.name,
    tasks: role.tasks.map((task) => ({
      id: task.id ?? randomUUID(),
      title: task.title,
      category: task.category,
      agentReadinessScore: task.agentReadinessScore,
    })),
  }));
}

export function registerTaskDecompositionRoutes(app: FastifyInstance, db: DatabaseClient) {
  const service = new TaskDecompositionService(db);

  app.get("/api/v1/diagnostics/:entityId/task-decomposition", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      const matrices = await service.list(entityId);
      return reply.send({ entityId, matrices });
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/diagnostics/:entityId/task-decomposition", async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const schema = z.object({
      functionName: z.string().min(1),
      roles: z.array(roleSchema).min(1),
    });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, entityId, request.auth);
      const matrix = await service.create(entityId, {
        functionName: body.functionName,
        roles: normalizeRoles(body.roles),
      });
      return reply.status(201).send(matrix);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      if (err instanceof Error) return reply.status(400).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/diagnostics/:entityId/task-decomposition/:matrixId", async (request, reply) => {
    const { entityId, matrixId } = request.params as { entityId: string; matrixId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      const matrix = await service.get(entityId, matrixId);
      if (!matrix) return reply.status(404).send({ message: "Matrix not found" });
      return reply.send(matrix);
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });

  app.patch("/api/v1/diagnostics/:entityId/task-decomposition/:matrixId", async (request, reply) => {
    const { entityId, matrixId } = request.params as { entityId: string; matrixId: string };
    const schema = z.object({
      functionName: z.string().min(1).optional(),
      roles: z.array(roleSchema).min(1).optional(),
    });
    try {
      const body = schema.parse(request.body);
      await assertEntityAccess(db, entityId, request.auth);
      const matrix = await service.update(entityId, matrixId, {
        functionName: body.functionName,
        roles: body.roles ? normalizeRoles(body.roles) : undefined,
      });
      if (!matrix) return reply.status(404).send({ message: "Matrix not found" });
      return reply.send(matrix);
    } catch (err) {
      if (err instanceof z.ZodError) return reply.status(400).send(formatZodErrors(err));
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      if (err instanceof Error) return reply.status(400).send({ message: err.message });
      throw err;
    }
  });

  app.post("/api/v1/diagnostics/:entityId/task-decomposition/:matrixId/complete", async (request, reply) => {
    const { entityId, matrixId } = request.params as { entityId: string; matrixId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      const matrix = await service.complete(entityId, matrixId);
      if (!matrix) return reply.status(404).send({ message: "Matrix not found" });
      return reply.send(matrix);
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      if (err instanceof Error) return reply.status(400).send({ message: err.message });
      throw err;
    }
  });

  app.get("/api/v1/diagnostics/:entityId/task-decomposition/:matrixId/export", async (request, reply) => {
    const { entityId, matrixId } = request.params as { entityId: string; matrixId: string };
    try {
      await assertEntityAccess(db, entityId, request.auth);
      const matrix = await service.get(entityId, matrixId);
      if (!matrix) return reply.status(404).send({ message: "Matrix not found" });
      if (matrix.status !== "complete") {
        return reply.status(400).send({ message: "Complete the matrix before export" });
      }
      return reply.send(service.export(matrix));
    } catch (err) {
      if (err instanceof EntityAccessError) return reply.status(err.statusCode).send({ message: err.message });
      throw err;
    }
  });
}
