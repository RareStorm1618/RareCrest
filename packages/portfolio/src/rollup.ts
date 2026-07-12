import type { GovernanceStatus } from "@rarecrest/contracts";

export interface PortfolioRollupEntity {
  band: string;
  governanceStatus: GovernanceStatus;
  attentionFlagCount: number;
  mode: string;
}

export function aggregateByBand(entities: PortfolioRollupEntity[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entity of entities) {
    counts[entity.band] = (counts[entity.band] ?? 0) + 1;
  }
  return counts;
}

export function aggregateByGovernanceStatus(
  entities: PortfolioRollupEntity[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entity of entities) {
    counts[entity.governanceStatus] = (counts[entity.governanceStatus] ?? 0) + 1;
  }
  return counts;
}

export function aggregateByMigrationMode(entities: PortfolioRollupEntity[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entity of entities) {
    counts[entity.mode] = (counts[entity.mode] ?? 0) + 1;
  }
  return counts;
}

export function totalAttentionFlagCount(entities: PortfolioRollupEntity[]): number {
  return entities.reduce((sum, entity) => sum + entity.attentionFlagCount, 0);
}

export function isPortfolioClear(entities: PortfolioRollupEntity[]): boolean {
  return totalAttentionFlagCount(entities) === 0;
}
