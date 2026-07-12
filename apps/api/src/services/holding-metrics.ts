import type { DatabaseClient } from "@rarecrest/db";
import { computeMetricContentHash } from "@rarecrest/export";

export const HOLDING_METRIC_KEYS = [
  "capital_routed_usd",
  "healing_hours",
  "families_supported",
  "donation_pct_bps",
] as const;

export type HoldingMetricKey = (typeof HOLDING_METRIC_KEYS)[number];

export interface RecordMetricInput {
  vertical: string;
  metricKey: HoldingMetricKey;
  value: number;
  entityId?: string | null;
  sourceRef?: string | null;
  actorId: string;
}

export interface HoldingMetricEvent {
  id: string;
  vertical: string;
  entityId: string | null;
  metricKey: string;
  value: number;
  unit: string;
  sourceRef: string | null;
  recordedAt: string;
  actorId: string;
  prevHash?: string | null;
  contentHash?: string | null;
}

/** Units are fixed per metric key — never client-supplied, to keep aggregation honest. */
const METRIC_UNITS: Record<HoldingMetricKey, string> = {
  capital_routed_usd: "usd",
  healing_hours: "hours",
  families_supported: "count",
  donation_pct_bps: "bps",
};

function mapMetricRow(row: Record<string, unknown>): HoldingMetricEvent {
  return {
    id: row.id as string,
    vertical: row.vertical as string,
    entityId: (row.entity_id as string | null) ?? null,
    metricKey: row.metric_key as string,
    value: Number(row.value_numeric),
    unit: row.unit as string,
    sourceRef: (row.source_ref as string | null) ?? null,
    recordedAt: new Date(row.recorded_at as string).toISOString(),
    actorId: row.actor_id as string,
    prevHash: (row.prev_hash as string | null) ?? null,
    contentHash: (row.content_hash as string | null) ?? null,
  };
}

async function latestMetricContentHash(db: DatabaseClient, metricKey: string): Promise<string | null> {
  try {
    const result = await db.query<{ content_hash: string | null }>(
      `SELECT content_hash FROM rarecrest.holding_metric_events
       WHERE metric_key = $1 ORDER BY recorded_at DESC LIMIT 1`,
      [metricKey],
    );
    return result.rows[0]?.content_hash ?? null;
  } catch {
    return null;
  }
}

export async function recordMetric(db: DatabaseClient, input: RecordMetricInput): Promise<HoldingMetricEvent> {
  const prevHash = await latestMetricContentHash(db, input.metricKey);
  const contentHash = computeMetricContentHash({
    vertical: input.vertical,
    metricKey: input.metricKey,
    value: input.value,
    entityId: input.entityId ?? null,
    sourceRef: input.sourceRef ?? null,
    actorId: input.actorId,
  });
  const result = await db.query<Record<string, unknown>>(
    `INSERT INTO rarecrest.holding_metric_events
       (vertical, entity_id, metric_key, value_numeric, unit, source_ref, actor_id, prev_hash, content_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, vertical, entity_id, metric_key, value_numeric, unit, source_ref, recorded_at, actor_id,
               prev_hash, content_hash`,
    [
      input.vertical,
      input.entityId ?? null,
      input.metricKey,
      input.value,
      METRIC_UNITS[input.metricKey],
      input.sourceRef ?? null,
      input.actorId,
      prevHash,
      contentHash,
    ],
  );
  return mapMetricRow(result.rows[0]);
}

export interface NorthStarTotals {
  capitalRoutedUsd: number;
  healingHours: number;
  familiesSupported: number;
  donationPctBpsAvg: number;
}

export interface NorthStarSummary extends NorthStarTotals {
  windowDays: number;
  dualMissionScore: number;
  generatedAt: string;
}

/**
 * Normalization targets for the dual-mission score — deliberately simple and
 * documented rather than "smart": each raw total is capped at 1.0 against a
 * target, then the four normalized components are averaged and scaled to
 * 0-100. `donation_pct_bps` is already a percentage-of-10000 so it normalizes
 * against the natural 10,000bps (100%) ceiling rather than a guessed target.
 */
export const NORTH_STAR_TARGETS = {
  capitalRoutedUsd: 1_000_000,
  healingHours: 10_000,
  familiesSupported: 1_000,
  donationPctBpsMax: 10_000,
} as const;

function normalize(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(1, value / target));
}

/**
 * dualMissionScore = average(normalized capital, normalized healing hours,
 * normalized families supported, normalized donation %) * 100, rounded to
 * one decimal. A pure function so the heuristic itself is unit-testable
 * without a database.
 */
export function computeDualMissionScore(totals: NorthStarTotals): number {
  const components = [
    normalize(totals.capitalRoutedUsd, NORTH_STAR_TARGETS.capitalRoutedUsd),
    normalize(totals.healingHours, NORTH_STAR_TARGETS.healingHours),
    normalize(totals.familiesSupported, NORTH_STAR_TARGETS.familiesSupported),
    normalize(totals.donationPctBpsAvg, NORTH_STAR_TARGETS.donationPctBpsMax),
  ];
  const average = components.reduce((sum, c) => sum + c, 0) / components.length;
  return Math.round(average * 1000) / 10;
}

/** Aggregates the trailing `windowDays` of holding_metric_events into North Star totals + score. */
export async function computeNorthStar(db: DatabaseClient, windowDays = 30): Promise<NorthStarSummary> {
  const result = await db.query<{ metric_key: string; total: string; avg: string }>(
    `SELECT metric_key,
            SUM(value_numeric) AS total,
            AVG(value_numeric) AS avg
     FROM rarecrest.holding_metric_events
     WHERE recorded_at >= NOW() - ($1 || ' days')::interval
     GROUP BY metric_key`,
    [windowDays],
  );

  const byKey = new Map(result.rows.map((row) => [row.metric_key, row]));
  const totals: NorthStarTotals = {
    capitalRoutedUsd: Number(byKey.get("capital_routed_usd")?.total ?? 0),
    healingHours: Number(byKey.get("healing_hours")?.total ?? 0),
    familiesSupported: Number(byKey.get("families_supported")?.total ?? 0),
    donationPctBpsAvg: Number(byKey.get("donation_pct_bps")?.avg ?? 0),
  };

  return {
    ...totals,
    windowDays,
    dualMissionScore: computeDualMissionScore(totals),
    generatedAt: new Date().toISOString(),
  };
}
