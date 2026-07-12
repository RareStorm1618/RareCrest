import type { VerticalKey } from "@rarecrest/contracts";
import pg from "pg";

export interface DbConfig {
  connectionString: string;
  maxConnections?: number;
}

export class DatabaseClient {
  private pool: pg.Pool;

  constructor(config: DbConfig) {
    this.pool = new pg.Pool({
      connectionString: config.connectionString,
      max: config.maxConnections ?? 10,
    });
  }

  async query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query("SELECT 1 AS ok");
      return result.rows[0]?.ok === 1;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** Tenancy enforcement — every query must include vertical scope */
export function tenancyWhereClause(
  vertical: VerticalKey,
  alias = "e",
): { clause: string; params: [VerticalKey] } {
  return {
    clause: `${alias}.vertical = $1 AND ${alias}.deleted_at IS NULL`,
    params: [vertical],
  };
}

/** Soft-delete window — mark deleted, never hard delete */
export function softDeleteClause(alias = "e"): string {
  return `${alias}.deleted_at IS NULL`;
}

/** Mark entity deleted within vertical scope (WO-3) */
export async function softDeleteEntity(
  db: DatabaseClient,
  entityId: string,
  vertical: VerticalKey,
): Promise<boolean> {
  const { clause, params } = tenancyWhereClause(vertical, "e");
  const result = await db.query(
    `UPDATE rarecrest.entities e
     SET deleted_at = NOW(), updated_at = NOW()
     WHERE e.id = $2 AND ${clause}`,
    [...params, entityId],
  );
  return (result.rowCount ?? 0) > 0;
}

export { DatabaseClient as default };
