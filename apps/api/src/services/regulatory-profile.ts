import type { EntityType, VerticalKey } from "@rarecrest/contracts";
import type { DatabaseClient } from "@rarecrest/db";
import {
  addRegime,
  buildDefaultRegulatoryProfile,
  buildRegulatoryProfileView,
  removeRegime,
  type RegulatoryProfileView,
} from "@rarecrest/portfolio";

interface EntityRow {
  id: string;
  vertical: VerticalKey;
  entity_type: EntityType | null;
  is_holding_entity: boolean;
  regulatory_regimes: string[];
}

export class RegulatoryProfileService {
  constructor(private db: DatabaseClient) {}

  async getProfile(entityId: string, scopeVertical?: VerticalKey): Promise<RegulatoryProfileView | null> {
    const row = await this.loadEntity(entityId, scopeVertical);
    if (!row) return null;
    return buildRegulatoryProfileView({
      entityId: row.id,
      entityType: row.entity_type,
      vertical: row.vertical,
      regimes: row.regulatory_regimes,
      isHoldingEntity: row.is_holding_entity,
    });
  }

  async setEntityType(
    entityId: string,
    entityType: EntityType,
    actorId: string,
    scopeVertical?: VerticalKey,
  ): Promise<RegulatoryProfileView | null> {
    const row = await this.loadEntity(entityId, scopeVertical);
    if (!row) return null;

    const regimes = buildDefaultRegulatoryProfile(entityType, row.vertical);
    await this.persistRegimes(entityId, row.regulatory_regimes, regimes, "set_type", actorId, null);

    const result = await this.db.query<EntityRow>(
      `UPDATE rarecrest.entities
       SET entity_type = $1, regulatory_regimes = $2::jsonb, updated_at = NOW()
       WHERE id = $3 AND deleted_at IS NULL
       RETURNING id, vertical, entity_type, is_holding_entity, regulatory_regimes`,
      [entityType, JSON.stringify(regimes), entityId],
    );
    return this.rowToView(result.rows[0]);
  }

  async addRegimeToProfile(
    entityId: string,
    regime: string,
    actorId: string,
    scopeVertical?: VerticalKey,
  ): Promise<RegulatoryProfileView | null> {
    const row = await this.loadEntity(entityId, scopeVertical);
    if (!row) return null;
    if (row.entity_type == null) {
      throw new Error("Set entity type before modifying regulatory regimes");
    }

    const regimes = addRegime(row.regulatory_regimes, regime);
    await this.persistRegimes(entityId, row.regulatory_regimes, regimes, "add", actorId, regime);

    const result = await this.db.query<EntityRow>(
      `UPDATE rarecrest.entities SET regulatory_regimes = $1::jsonb, updated_at = NOW()
       WHERE id = $2 RETURNING id, vertical, entity_type, is_holding_entity, regulatory_regimes`,
      [JSON.stringify(regimes), entityId],
    );
    return this.rowToView(result.rows[0]);
  }

  async removeRegimeFromProfile(
    entityId: string,
    regime: string,
    actorId: string,
    scopeVertical?: VerticalKey,
  ): Promise<RegulatoryProfileView | null> {
    const row = await this.loadEntity(entityId, scopeVertical);
    if (!row) return null;

    const regimes = removeRegime(row.regulatory_regimes, regime);
    await this.persistRegimes(entityId, row.regulatory_regimes, regimes, "remove", actorId, regime);

    const result = await this.db.query<EntityRow>(
      `UPDATE rarecrest.entities SET regulatory_regimes = $1::jsonb, updated_at = NOW()
       WHERE id = $2 RETURNING id, vertical, entity_type, is_holding_entity, regulatory_regimes`,
      [JSON.stringify(regimes), entityId],
    );
    return this.rowToView(result.rows[0]);
  }

  async listRegimeChanges(entityId: string, limit = 20): Promise<Array<Record<string, unknown>>> {
    const result = await this.db.query(
      `SELECT id, entity_id AS "entityId", action, regime, actor_id AS "actorId",
              prior_regimes AS "priorRegimes", new_regimes AS "newRegimes", created_at AS "createdAt"
       FROM rarecrest.regulatory_regime_changes
       WHERE entity_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [entityId, limit],
    );
    return result.rows;
  }

  private async loadEntity(entityId: string, scopeVertical?: VerticalKey): Promise<EntityRow | null> {
    const params: unknown[] = [entityId];
    let sql = `SELECT id, vertical, entity_type, is_holding_entity, regulatory_regimes
               FROM rarecrest.entities WHERE id = $1 AND deleted_at IS NULL`;
    if (scopeVertical) {
      sql += " AND vertical = $2";
      params.push(scopeVertical);
    }
    const result = await this.db.query<EntityRow>(sql, params);
    return result.rows[0] ?? null;
  }

  private async persistRegimes(
    entityId: string,
    prior: string[],
    next: string[],
    action: "add" | "remove" | "set_type" | "reset_defaults",
    actorId: string,
    regime: string | null,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO rarecrest.regulatory_regime_changes
         (entity_id, action, regime, actor_id, prior_regimes, new_regimes)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
      [entityId, action, regime, actorId, JSON.stringify(prior), JSON.stringify(next)],
    );
  }

  private rowToView(row: EntityRow): RegulatoryProfileView {
    return buildRegulatoryProfileView({
      entityId: row.id,
      entityType: row.entity_type,
      vertical: row.vertical,
      regimes: row.regulatory_regimes,
      isHoldingEntity: row.is_holding_entity,
    });
  }
}
