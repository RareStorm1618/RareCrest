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

export { DatabaseClient as default };
