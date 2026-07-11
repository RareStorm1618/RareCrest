/** WO-17: Append-only DecisionTraceService */
import type { DecisionTraceEntry, VerticalKey } from "@rarecrest/contracts";
import type { DatabaseClient } from "@rarecrest/db";
import { randomUUID } from "node:crypto";

export interface AppendTraceInput {
  entityId?: string;
  vertical: VerticalKey;
  action: string;
  verdict: "allow" | "deny";
  payload: Record<string, unknown>;
  retentionRegime?: string;
}

export class DecisionTraceService {
  constructor(private db: DatabaseClient) {}

  async append(input: AppendTraceInput): Promise<DecisionTraceEntry> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const retentionRegime = input.retentionRegime ?? this.defaultRetention(input.vertical);

    await this.db.query(
      `INSERT INTO rarecrest.decision_traces
         (id, entity_id, vertical, action, verdict, payload, retention_regime, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        input.entityId ?? null,
        input.vertical,
        input.action,
        input.verdict,
        JSON.stringify(input.payload),
        retentionRegime,
        createdAt,
      ],
    );

    return {
      id,
      entityId: input.entityId ?? "",
      vertical: input.vertical,
      action: input.action,
      verdict: input.verdict,
      payload: input.payload,
      createdAt,
      retentionRegime,
    };
  }

  async listByEntity(entityId: string, limit = 100): Promise<DecisionTraceEntry[]> {
    const result = await this.db.query<{
      id: string;
      entity_id: string;
      vertical: VerticalKey;
      action: string;
      verdict: "allow" | "deny";
      payload: Record<string, unknown>;
      retention_regime: string;
      created_at: string;
    }>(
      `SELECT id, entity_id, vertical, action, verdict, payload, retention_regime, created_at
       FROM rarecrest.decision_traces
       WHERE entity_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [entityId, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      entityId: row.entity_id,
      vertical: row.vertical,
      action: row.action,
      verdict: row.verdict,
      payload: row.payload,
      createdAt: row.created_at,
      retentionRegime: row.retention_regime,
    }));
  }

  private defaultRetention(vertical: VerticalKey): string {
    const regimes: Record<VerticalKey, string> = {
      rareangels: "hipaa-7yr",
      rareedge: "finra-7yr",
      hopecoin: "aml-7yr",
      rarestorm: "irs-7yr",
      healkids: "coppa-7yr",
    };
    return regimes[vertical] ?? "standard-3yr";
  }
}
