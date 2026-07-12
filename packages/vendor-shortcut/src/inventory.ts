export type ShortcutSystemType =
  | "ehr"
  | "billing"
  | "crm"
  | "support"
  | "knowledge_base"
  | "identity";

export interface ShortcutInventoryItem {
  systemId: string;
  systemType: ShortcutSystemType;
  recordCount: number;
  exportable: boolean;
  dataFreshnessHours: number;
  dailyChangeRatePct: number;
}

export interface InventoryAssessment {
  totalRecords: number;
  exportableCoveragePct: number;
  highVolatilitySystems: string[];
  blockerReasons: string[];
  shortcutReady: boolean;
}

const HIGH_VOLATILITY_THRESHOLD = 12;
const DATA_FRESHNESS_SLA_HOURS = 48;
const REQUIRED_TYPES: ShortcutSystemType[] = ["identity", "crm", "billing"];

export function assessShortcutInventory(items: ShortcutInventoryItem[]): InventoryAssessment {
  const totalRecords = items.reduce((sum, item) => sum + item.recordCount, 0);
  const exportableRecords = items
    .filter((item) => item.exportable)
    .reduce((sum, item) => sum + item.recordCount, 0);
  const exportableCoveragePct = totalRecords === 0 ? 0 : Number(((exportableRecords / totalRecords) * 100).toFixed(2));
  const highVolatilitySystems = items
    .filter((item) => item.dailyChangeRatePct >= HIGH_VOLATILITY_THRESHOLD)
    .map((item) => item.systemId);

  const blockerReasons: string[] = [];
  const missingRequired = REQUIRED_TYPES.filter((required) => !items.some((item) => item.systemType === required));
  if (missingRequired.length > 0) {
    blockerReasons.push(`missing_required_systems:${missingRequired.join(",")}`);
  }

  const staleSystems = items.filter((item) => item.dataFreshnessHours > DATA_FRESHNESS_SLA_HOURS);
  if (staleSystems.length > 0) {
    blockerReasons.push(`stale_feeds:${staleSystems.map((item) => item.systemId).join(",")}`);
  }

  if (exportableCoveragePct < 80) {
    blockerReasons.push(`low_exportable_coverage:${exportableCoveragePct}`);
  }

  if (highVolatilitySystems.length > 2) {
    blockerReasons.push("change_rate_too_high");
  }

  return {
    totalRecords,
    exportableCoveragePct,
    highVolatilitySystems,
    blockerReasons,
    shortcutReady: blockerReasons.length === 0,
  };
}
