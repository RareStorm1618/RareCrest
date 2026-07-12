import type { DatabaseClient } from "@rarecrest/db";
import type { VerticalKey } from "@rarecrest/contracts";
import type { AuthContext } from "./auth.js";
import { enforceTenancy } from "./auth.js";

export class EntityAccessError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 403 | 404 = 404,
  ) {
    super(message);
    this.name = "EntityAccessError";
  }
}

export interface EntityRow {
  id: string;
  name: string;
  vertical: VerticalKey;
}

/** Verify entity exists and belongs to the authenticated vertical (unless director bypass). */
export async function assertEntityAccess(
  db: DatabaseClient,
  entityId: string,
  auth: AuthContext,
  directorBypass = false,
): Promise<EntityRow> {
  const result = await db.query(
    `SELECT id, name, vertical FROM rarecrest.entities WHERE id = $1 AND deleted_at IS NULL`,
    [entityId],
  );
  if (result.rows.length === 0) {
    throw new EntityAccessError("Entity not found", 404);
  }
  const row = result.rows[0];
  const vertical = row.vertical as VerticalKey;
  if (!directorBypass) {
    enforceTenancy(auth, vertical);
  }
  return { id: row.id as string, name: row.name as string, vertical };
}
