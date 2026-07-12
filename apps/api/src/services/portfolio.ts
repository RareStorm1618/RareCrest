import type {
  EntityType,
  GovernanceStatus,
  PortfolioRollup,
  VerticalKey,
} from "@rarecrest/contracts";
import type { DatabaseClient } from "@rarecrest/db";
import {
  buildDefaultRegulatoryProfile,
  isRegulatoryProfileIncomplete,
} from "@rarecrest/portfolio";

export interface RegisterEntityInput {
  name: string;
  vertical: VerticalKey;
  tenancyKey: string;
  entityType: EntityType;
  isHoldingEntity?: boolean;
  mode?: string;
  band?: string;
}

interface EntityRow {
  id: string;
  name: string;
  vertical: VerticalKey;
  tenancy_key: string;
  entity_type: EntityType | null;
  is_holding_entity: boolean;
  mode: string;
  band: string;
  regulatory_regimes: string[];
  governance_status: GovernanceStatus;
  deployment_locked: boolean;
  maturity_level: number;
  assessed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  attention_flag_count?: string;
}

function stateSummary(row: EntityRow): string {
  if (row.governance_status === "not_assessed" && row.band === "unknown") {
    return "Not yet assessed";
  }
  if (row.deployment_locked) {
    return `Locked — ${row.governance_status}`;
  }
  return `${row.band} / maturity ${row.maturity_level}`;
}

export class PortfolioService {
  constructor(private db: DatabaseClient) {}

  async registerEntity(input: RegisterEntityInput): Promise<EntityRow> {
    const regimes = buildDefaultRegulatoryProfile(input.entityType, input.vertical);
    const result = await this.db.query<EntityRow>(
      `INSERT INTO rarecrest.entities
         (name, vertical, tenancy_key, entity_type, is_holding_entity, mode, band, regulatory_regimes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, vertical, tenancy_key, entity_type, is_holding_entity, mode, band,
                 regulatory_regimes, governance_status, deployment_locked, maturity_level,
                 assessed_at, created_at, updated_at, deleted_at`,
      [
        input.name,
        input.vertical,
        input.tenancyKey,
        input.entityType,
        input.isHoldingEntity ?? false,
        input.mode ?? "assessment",
        input.band ?? "unknown",
        JSON.stringify(regimes),
      ],
    );
    return result.rows[0];
  }

  async getRollup(scopeVertical?: VerticalKey): Promise<PortfolioRollup> {
    const params: unknown[] = [];
    let where = "e.deleted_at IS NULL";
    if (scopeVertical) {
      where += " AND e.vertical = $1";
      params.push(scopeVertical);
    }

    const result = await this.db.query<EntityRow>(
      `SELECT e.id, e.name, e.vertical, e.tenancy_key, e.entity_type, e.is_holding_entity,
              e.mode, e.band, e.regulatory_regimes, e.governance_status, e.deployment_locked,
              e.maturity_level, e.assessed_at, e.created_at, e.updated_at, e.deleted_at,
              COUNT(af.id) FILTER (WHERE af.resolved_at IS NULL)::text AS attention_flag_count
       FROM rarecrest.entities e
       LEFT JOIN rarecrest.attention_flags af ON af.entity_id = e.id
       WHERE ${where}
       GROUP BY e.id
       ORDER BY e.is_holding_entity DESC, e.name ASC`,
      params,
    );

    const byBand: Record<string, number> = {};
    const byGovernanceStatus: Record<string, number> = {};
    let attentionFlagCount = 0;

    const entities = result.rows.map((row) => {
      const flagCount = Number(row.attention_flag_count ?? 0);
      attentionFlagCount += flagCount;
      byBand[row.band] = (byBand[row.band] ?? 0) + 1;
      byGovernanceStatus[row.governance_status] =
        (byGovernanceStatus[row.governance_status] ?? 0) + 1;

      return {
        id: row.id,
        name: row.name,
        vertical: row.vertical,
        entityType: row.entity_type,
        isHoldingEntity: row.is_holding_entity,
        mode: row.mode,
        band: row.band,
        regulatoryRegimes: row.regulatory_regimes,
        regulatoryProfileIncomplete: isRegulatoryProfileIncomplete(row.entity_type),
        governanceStatus: row.governance_status,
        deploymentLocked: row.deployment_locked,
        maturityLevel: row.maturity_level,
        attentionFlagCount: flagCount,
        stateSummary: stateSummary(row),
      };
    });

    return {
      entities,
      summary: {
        byBand,
        byGovernanceStatus,
        totalEntities: entities.length,
        attentionFlagCount,
        portfolioClear: attentionFlagCount === 0,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async getEntityById(id: string, scopeVertical?: VerticalKey): Promise<EntityRow | null> {
    const params: unknown[] = [id];
    let sql = `SELECT id, name, vertical, tenancy_key, entity_type, is_holding_entity, mode, band,
                      regulatory_regimes, governance_status, deployment_locked, maturity_level,
                      assessed_at, created_at, updated_at, deleted_at
               FROM rarecrest.entities WHERE id = $1 AND deleted_at IS NULL`;
    if (scopeVertical) {
      sql += " AND vertical = $2";
      params.push(scopeVertical);
    }
    const result = await this.db.query<EntityRow>(sql, params);
    return result.rows[0] ?? null;
  }

  async updateRegulatoryProfile(
    entityId: string,
    regimes: string[],
    scopeVertical?: VerticalKey,
  ): Promise<EntityRow | null> {
    const params: unknown[] = [JSON.stringify(regimes), entityId];
    let sql = `UPDATE rarecrest.entities
       SET regulatory_regimes = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL`;
    if (scopeVertical) {
      sql += " AND vertical = $3";
      params.push(scopeVertical);
    }
    sql += ` RETURNING id, name, vertical, tenancy_key, entity_type, is_holding_entity, mode, band,
                 regulatory_regimes, governance_status, deployment_locked, maturity_level,
                 assessed_at, created_at, updated_at, deleted_at`;
    const result = await this.db.query<EntityRow>(sql, params);
    return result.rows[0] ?? null;
  }

  async addAttentionFlag(
    entityId: string,
    flagType: string,
    severity: "low" | "medium" | "high" | "critical",
    message: string,
    linkPath?: string,
  ): Promise<{ id: string }> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO rarecrest.attention_flags (entity_id, flag_type, severity, message, link_path)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [entityId, flagType, severity, message, linkPath ?? null],
    );
    return result.rows[0];
  }

  async listAttentionFlags(entityId: string): Promise<Array<Record<string, unknown>>> {
    const result = await this.db.query(
      `SELECT id, entity_id AS "entityId", flag_type AS "flagType", severity, message,
              link_path AS "linkPath", created_at AS "createdAt"
       FROM rarecrest.attention_flags
       WHERE entity_id = $1 AND resolved_at IS NULL
       ORDER BY severity DESC, created_at DESC`,
      [entityId],
    );
    return result.rows;
  }

  async addRelationship(
    fromEntityId: string,
    toEntityId: string,
    relationshipType: string,
    constraintNote?: string,
  ): Promise<{ id: string }> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO rarecrest.entity_relationships
         (from_entity_id, to_entity_id, relationship_type, constraint_note)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [fromEntityId, toEntityId, relationshipType, constraintNote ?? null],
    );
    return result.rows[0];
  }

  async listRelationships(entityId: string): Promise<Array<Record<string, unknown>>> {
    const result = await this.db.query(
      `SELECT id, from_entity_id AS "fromEntityId", to_entity_id AS "toEntityId",
              relationship_type AS "relationshipType", direction, constraint_note AS "constraintNote"
       FROM rarecrest.entity_relationships
       WHERE (from_entity_id = $1 OR to_entity_id = $1) AND deleted_at IS NULL`,
      [entityId],
    );
    return result.rows;
  }
}

export function mapEntityRow(row: EntityRow) {
  return {
    id: row.id,
    name: row.name,
    vertical: row.vertical,
    tenancyKey: row.tenancy_key,
    entityType: row.entity_type,
    isHoldingEntity: row.is_holding_entity,
    mode: row.mode,
    band: row.band,
    regulatoryRegimes: row.regulatory_regimes,
    regulatoryProfileIncomplete: isRegulatoryProfileIncomplete(row.entity_type),
    governanceStatus: row.governance_status,
    deploymentLocked: row.deployment_locked,
    maturityLevel: row.maturity_level,
    assessedAt: row.assessed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}
