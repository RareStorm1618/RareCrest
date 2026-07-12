/** WO-72: Agent version history for rollback without client-supplied version */

export function shouldRecordVersion(previous: string | null | undefined, next: string | null | undefined): boolean {
  return !!next && next !== previous;
}

export async function lookupLatestKnownGoodVersion(
  query: (sql: string, params: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>,
  agentId: string,
  entityId: string,
): Promise<string | null> {
  const result = await query(
    `SELECT version FROM rarecrest.agent_version_history
     WHERE agent_id = $1 AND entity_id = $2
     ORDER BY recorded_at DESC LIMIT 1 OFFSET 1`,
    [agentId, entityId],
  );
  const version = result.rows[0]?.version;
  return typeof version === "string" ? version : null;
}
