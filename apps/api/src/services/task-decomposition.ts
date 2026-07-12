import type { DatabaseClient } from "@rarecrest/db";
import {
  exportTaskDecompositionMatrix,
  type RoleItem,
  type TaskDecompositionMatrix,
  type TaskDecompositionExport,
  validateMatrixForCompletion,
  validateTaskCategory,
  validateAgentReadinessScore,
} from "@rarecrest/diagnostics";
import { randomUUID } from "node:crypto";

export interface CreateMatrixInput {
  functionName: string;
  roles: RoleItem[];
}

export interface UpdateMatrixInput {
  functionName?: string;
  roles?: RoleItem[];
}

export class TaskDecompositionService {
  constructor(private db: DatabaseClient) {}

  async create(entityId: string, input: CreateMatrixInput): Promise<TaskDecompositionMatrix> {
    this.validateRoles(input.roles);
    const result = await this.db.query(
      `INSERT INTO rarecrest.task_decomposition_matrices (entity_id, function_name, roles)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id, entity_id, function_name, roles, status, completed_at, created_at, updated_at`,
      [entityId, input.functionName, JSON.stringify(input.roles)],
    );
    return this.rowToMatrix(result.rows[0]);
  }

  async get(entityId: string, matrixId: string): Promise<TaskDecompositionMatrix | null> {
    const result = await this.db.query(
      `SELECT id, entity_id, function_name, roles, status, completed_at
       FROM rarecrest.task_decomposition_matrices
       WHERE id = $1 AND entity_id = $2`,
      [matrixId, entityId],
    );
    if (result.rows.length === 0) return null;
    return this.rowToMatrix(result.rows[0]);
  }

  async list(entityId: string): Promise<TaskDecompositionMatrix[]> {
    const result = await this.db.query(
      `SELECT id, entity_id, function_name, roles, status, completed_at
       FROM rarecrest.task_decomposition_matrices
       WHERE entity_id = $1
       ORDER BY created_at DESC`,
      [entityId],
    );
    return result.rows.map((row) => this.rowToMatrix(row));
  }

  async update(entityId: string, matrixId: string, input: UpdateMatrixInput): Promise<TaskDecompositionMatrix | null> {
    const existing = await this.get(entityId, matrixId);
    if (!existing) return null;
    if (existing.status === "complete") {
      throw new Error("Completed matrices cannot be edited");
    }
    if (input.roles) this.validateRoles(input.roles);

    const functionName = input.functionName ?? existing.functionName;
    const roles = input.roles ?? existing.roles;

    const result = await this.db.query(
      `UPDATE rarecrest.task_decomposition_matrices
       SET function_name = $1, roles = $2::jsonb, updated_at = NOW()
       WHERE id = $3 AND entity_id = $4
       RETURNING id, entity_id, function_name, roles, status, completed_at`,
      [functionName, JSON.stringify(roles), matrixId, entityId],
    );
    return this.rowToMatrix(result.rows[0]);
  }

  async complete(entityId: string, matrixId: string): Promise<TaskDecompositionMatrix | null> {
    const existing = await this.get(entityId, matrixId);
    if (!existing) return null;

    const errors = validateMatrixForCompletion(existing);
    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }

    const result = await this.db.query(
      `UPDATE rarecrest.task_decomposition_matrices
       SET status = 'complete', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND entity_id = $2
       RETURNING id, entity_id, function_name, roles, status, completed_at`,
      [matrixId, entityId],
    );
    return this.rowToMatrix(result.rows[0]);
  }

  export(matrix: TaskDecompositionMatrix): TaskDecompositionExport {
    return exportTaskDecompositionMatrix(matrix);
  }

  private validateRoles(roles: RoleItem[]): void {
    for (const role of roles) {
      if (!role.id) role.id = randomUUID();
      for (const task of role.tasks) {
        if (!task.id) task.id = randomUUID();
        if (!validateTaskCategory(task.category)) {
          throw new Error(`Invalid task category: ${task.category}`);
        }
        if (task.agentReadinessScore !== undefined && !validateAgentReadinessScore(task.agentReadinessScore)) {
          throw new Error(`Invalid agent-readiness score for task ${task.title}`);
        }
      }
    }
  }

  private rowToMatrix(row: Record<string, unknown>): TaskDecompositionMatrix {
    return {
      id: row.id as string,
      entityId: row.entity_id as string,
      functionName: row.function_name as string,
      roles: (row.roles as RoleItem[]) ?? [],
      status: row.status as "draft" | "complete",
      completedAt: (row.completed_at as string | null) ?? null,
    };
  }
}
