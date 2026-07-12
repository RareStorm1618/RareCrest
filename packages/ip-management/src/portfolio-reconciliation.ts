/** WO-62/63: Portfolio reconciliation for IP inventory */

export interface ReconciliationAsset {
  id: string;
  title: string;
  status: string;
}

export interface PortfolioReconciliation {
  missingInRegistry: string[];
  orphanedInRegistry: string[];
  statusMismatches: Array<{ id: string; expected: string; actual: string }>;
  healthy: boolean;
}

export function reconcilePortfolio(
  expectedAssets: Array<{ id: string; expectedStatus: string }>,
  registryAssets: ReconciliationAsset[],
): PortfolioReconciliation {
  const registryById = new Map(registryAssets.map((a) => [a.id, a]));
  const expectedById = new Map(expectedAssets.map((a) => [a.id, a]));

  const missingInRegistry = expectedAssets
    .filter((asset) => !registryById.has(asset.id))
    .map((asset) => asset.id);

  const orphanedInRegistry = registryAssets
    .filter((asset) => !expectedById.has(asset.id))
    .map((asset) => asset.id);

  const statusMismatches = expectedAssets
    .map((asset) => {
      const current = registryById.get(asset.id);
      if (!current || current.status === asset.expectedStatus) return null;
      return { id: asset.id, expected: asset.expectedStatus, actual: current.status };
    })
    .filter((row): row is { id: string; expected: string; actual: string } => row !== null);

  return {
    missingInRegistry,
    orphanedInRegistry,
    statusMismatches,
    healthy: missingInRegistry.length === 0 && orphanedInRegistry.length === 0 && statusMismatches.length === 0,
  };
}
