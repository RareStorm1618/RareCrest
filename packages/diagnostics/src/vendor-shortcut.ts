export type ShortcutSystemType =
  | "ehr"
  | "billing"
  | "crm"
  | "support"
  | "knowledge_base"
  | "identity";

export interface VendorShortcutSignal {
  systemType: ShortcutSystemType;
  exportable: boolean;
  freshnessHours: number;
  integrationCoverage: number;
}

export interface VendorShortcutResult {
  readinessScore: number;
  recommendedPath: "vendor_shortcut" | "hybrid_bridge" | "greenfield_build";
  blockers: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function scoreVendorShortcut(signals: VendorShortcutSignal[]): VendorShortcutResult {
  if (signals.length === 0) {
    return {
      readinessScore: 0,
      recommendedPath: "greenfield_build",
      blockers: ["No source systems supplied"],
    };
  }

  let total = 0;
  const blockers: string[] = [];

  for (const signal of signals) {
    const coverage = clamp(signal.integrationCoverage, 0, 100);
    const exportability = signal.exportable ? 100 : 0;
    const freshness = clamp(100 - signal.freshnessHours * 2, 0, 100);
    const score = coverage * 0.45 + exportability * 0.35 + freshness * 0.2;
    total += score;

    if (!signal.exportable) blockers.push(`${signal.systemType} lacks exportability`);
    if (signal.freshnessHours > 24) blockers.push(`${signal.systemType} data freshness exceeds 24h`);
  }

  const readinessScore = Math.round(total / signals.length);

  if (readinessScore >= 75 && blockers.length <= 1) {
    return { readinessScore, recommendedPath: "vendor_shortcut", blockers };
  }
  if (readinessScore >= 45) {
    return { readinessScore, recommendedPath: "hybrid_bridge", blockers };
  }
  return { readinessScore, recommendedPath: "greenfield_build", blockers };
}
