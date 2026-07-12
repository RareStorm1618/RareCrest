/**
 * Provenance service — verify decision-trace / metric chains, anchor merkle roots,
 * and assemble LP board-pack evidence from SoR tables.
 */
import { createHash } from "node:crypto";
import type { DatabaseClient } from "@rarecrest/db";
import {
  assembleBoardPack,
  buildMerkleRoot,
  computeMetricContentHash,
  type BoardPackInput,
  type TraceChainRow,
  type MetricChainRow,
  verifyMetricChain,
  verifyTraceChain,
  type TraceChainVerifyResult,
} from "@rarecrest/export";
import { computeNorthStar } from "./holding-metrics.js";

export interface ProvenanceRootRow {
  id: string;
  periodStart: string;
  periodEnd: string;
  leafCount: number;
  merkleRoot: string;
  entityRoots: Record<string, string>;
  metricRoots: Record<string, string>;
  extras: Record<string, unknown>;
  anchorRef: string | null;
  createdAt: string;
}

function mapRoot(row: Record<string, unknown>): ProvenanceRootRow {
  return {
    id: String(row.id),
    periodStart: new Date(row.period_start as string).toISOString(),
    periodEnd: new Date(row.period_end as string).toISOString(),
    leafCount: Number(row.leaf_count),
    merkleRoot: String(row.merkle_root),
    entityRoots: (row.entity_roots as Record<string, string>) ?? {},
    metricRoots: (row.metric_roots as Record<string, string>) ?? {},
    extras: (row.extras as Record<string, unknown>) ?? {},
    anchorRef: row.anchor_ref ? String(row.anchor_ref) : null,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

export async function verifyEntityTraceChain(
  db: DatabaseClient,
  entityId: string,
): Promise<TraceChainVerifyResult> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT id, entity_id, action, payload, prev_hash, content_hash, created_at
     FROM rarecrest.decision_traces
     WHERE entity_id = $1
     ORDER BY created_at ASC`,
    [entityId],
  );
  const rows: TraceChainRow[] = result.rows.map((row) => {
    const payloadRaw = row.payload;
    const payload =
      payloadRaw && typeof payloadRaw === "object" && !Array.isArray(payloadRaw)
        ? (payloadRaw as Record<string, unknown>)
        : typeof payloadRaw === "string"
          ? (JSON.parse(payloadRaw) as Record<string, unknown>)
          : {};
    return {
      id: String(row.id),
      entityId: String(row.entity_id),
      action: String(row.action),
      payload,
      prevHash: row.prev_hash ? String(row.prev_hash) : null,
      contentHash: row.content_hash ? String(row.content_hash) : null,
      createdAt: new Date(row.created_at as string).toISOString(),
    };
  });
  return verifyTraceChain(rows);
}

export async function verifyMetricKeyChain(
  db: DatabaseClient,
  metricKey: string,
): Promise<TraceChainVerifyResult> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT id, metric_key, prev_hash, content_hash, vertical, value_numeric,
            entity_id, source_ref, actor_id
     FROM rarecrest.holding_metric_events
     WHERE metric_key = $1
     ORDER BY recorded_at ASC`,
    [metricKey],
  );
  const rows: MetricChainRow[] = result.rows.map((row) => ({
    id: String(row.id),
    metricKey: String(row.metric_key),
    prevHash: row.prev_hash ? String(row.prev_hash) : null,
    contentHash: row.content_hash ? String(row.content_hash) : null,
    vertical: String(row.vertical),
    value: Number(row.value_numeric),
    entityId: row.entity_id ? String(row.entity_id) : null,
    sourceRef: row.source_ref ? String(row.source_ref) : null,
    actorId: String(row.actor_id),
  }));
  return verifyMetricChain(rows);
}

export async function collectProvenanceLeaves(
  db: DatabaseClient,
): Promise<{
  entityRoots: Record<string, string>;
  metricRoots: Record<string, string>;
  extras: Record<string, unknown>;
  leaves: string[];
}> {
  const [entityHeads, metricHeads, ks, seals] = await Promise.all([
    db.query<{ entity_id: string; content_hash: string }>(
      `SELECT DISTINCT ON (entity_id) entity_id, content_hash
       FROM rarecrest.decision_traces
       WHERE entity_id IS NOT NULL AND content_hash IS NOT NULL
       ORDER BY entity_id, created_at DESC`,
    ),
    db.query<{ metric_key: string; content_hash: string }>(
      `SELECT DISTINCT ON (metric_key) metric_key, content_hash
       FROM rarecrest.holding_metric_events
       WHERE content_hash IS NOT NULL
       ORDER BY metric_key, recorded_at DESC`,
    ),
    db.query<{ entity_id: string; state: string }>(
      `SELECT entity_id, state FROM rarecrest.kill_switches`,
    ),
    db.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM rarecrest.seals WHERE executed_at IS NOT NULL`,
    ),
  ]);

  const entityRoots: Record<string, string> = {};
  for (const row of entityHeads.rows) {
    entityRoots[row.entity_id] = row.content_hash;
  }
  const metricRoots: Record<string, string> = {};
  for (const row of metricHeads.rows) {
    metricRoots[row.metric_key] = row.content_hash;
  }

  const ksLeaves = ks.rows.map((row) => `ks:${row.entity_id}:${row.state}`);
  const extras = {
    killSwitchSnapshot: ks.rows.map((r) => ({ entityId: r.entity_id, state: r.state })),
    executedSeals: Number(seals.rows[0]?.cnt ?? 0),
  };

  const leaves = [
    ...Object.entries(entityRoots).map(([id, hash]) => `trace:${id}:${hash}`),
    ...Object.entries(metricRoots).map(([key, hash]) => `metric:${key}:${hash}`),
    ...ksLeaves,
  ];

  return { entityRoots, metricRoots, extras, leaves };
}

export async function anchorProvenanceRoot(
  db: DatabaseClient,
  opts: { periodHours?: number; anchorRef?: string | null } = {},
): Promise<ProvenanceRootRow> {
  const periodHours = opts.periodHours ?? 24;
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - periodHours * 3600_000);
  const { entityRoots, metricRoots, extras, leaves } = await collectProvenanceLeaves(db);
  const digests = leaves.map((leaf) => createHash("sha256").update(leaf).digest("hex"));
  const merkleRoot = buildMerkleRoot(digests);

  const result = await db.query<Record<string, unknown>>(
    `INSERT INTO rarecrest.provenance_roots
       (period_start, period_end, leaf_count, merkle_root, entity_roots, metric_roots, extras, anchor_ref)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)
     RETURNING id, period_start, period_end, leaf_count, merkle_root, entity_roots, metric_roots,
               extras, anchor_ref, created_at`,
    [
      periodStart.toISOString(),
      periodEnd.toISOString(),
      digests.length,
      merkleRoot,
      JSON.stringify(entityRoots),
      JSON.stringify(metricRoots),
      JSON.stringify(extras),
      opts.anchorRef ?? null,
    ],
  );
  return mapRoot(result.rows[0]);
}

export async function getLatestProvenanceRoot(db: DatabaseClient): Promise<ProvenanceRootRow | null> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT id, period_start, period_end, leaf_count, merkle_root, entity_roots, metric_roots,
            extras, anchor_ref, created_at
     FROM rarecrest.provenance_roots
     ORDER BY created_at DESC LIMIT 1`,
  );
  if (result.rows.length === 0) return null;
  return mapRoot(result.rows[0]);
}

export async function verifyProvenanceRoot(
  db: DatabaseClient,
  rootId: string,
): Promise<{ valid: boolean; stored: ProvenanceRootRow; recomputed: string }> {
  const result = await db.query<Record<string, unknown>>(
    `SELECT id, period_start, period_end, leaf_count, merkle_root, entity_roots, metric_roots,
            extras, anchor_ref, created_at
     FROM rarecrest.provenance_roots WHERE id = $1`,
    [rootId],
  );
  if (result.rows.length === 0) {
    throw new Error(`Provenance root not found: ${rootId}`);
  }
  const stored = mapRoot(result.rows[0]);
  // Recompute merkle from the *stored* leaf set — detects tampering of the root row itself.
  const storedLeaves = [
    ...Object.entries(stored.entityRoots).map(([id, hash]) => `trace:${id}:${hash}`),
    ...Object.entries(stored.metricRoots).map(([key, hash]) => `metric:${key}:${hash}`),
    ...((stored.extras.killSwitchSnapshot as Array<{ entityId: string; state: string }> | undefined) ?? []).map(
      (k) => `ks:${k.entityId}:${k.state}`,
    ),
  ];
  const storedDigests = storedLeaves.map((leaf) => createHash("sha256").update(leaf).digest("hex"));
  const recomputed = buildMerkleRoot(storedDigests);
  return { valid: recomputed === stored.merkleRoot, stored, recomputed };
}

export async function buildBoardPackInput(
  db: DatabaseClient,
  windowDays = 30,
): Promise<BoardPackInput> {
  const sinceIso = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const [
    northStar,
    openSessions,
    readySessions,
    sealedCount,
    recentSeals,
    killSwitches,
    attentionOpen,
    fedAccepted,
    fedRejected,
    fedRecent,
    latestRoot,
    sampleEntities,
  ] = await Promise.all([
    computeNorthStar(db, windowDays),
    db.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM rarecrest.parliament_sessions WHERE status = 'open'`),
    db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM rarecrest.parliament_sessions WHERE status = 'ready_for_seal'`,
    ),
    db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM rarecrest.seals WHERE sealed_at >= $1`,
      [sinceIso],
    ),
    db.query<Record<string, unknown>>(
      `SELECT s.session_id, ps.stake_class, s.mode, s.sealed_at, s.effect_digest
       FROM rarecrest.seals s
       JOIN rarecrest.parliament_sessions ps ON ps.id = s.session_id
       WHERE s.sealed_at >= $1
       ORDER BY s.sealed_at DESC LIMIT 20`,
      [sinceIso],
    ),
    db.query<{ entity_id: string; name: string; state: string }>(
      `SELECT ks.entity_id, e.name, ks.state
       FROM rarecrest.kill_switches ks
       JOIN rarecrest.entities e ON e.id = ks.entity_id
       ORDER BY e.name ASC`,
    ),
    db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM rarecrest.attention_flags WHERE resolved_at IS NULL`,
    ),
    db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM rarecrest.vertical_ingress_events
       WHERE status = 'accepted' AND received_at >= $1`,
      [sinceIso],
    ),
    db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM rarecrest.vertical_ingress_events
       WHERE status = 'rejected' AND received_at >= $1`,
      [sinceIso],
    ),
    db.query<Record<string, unknown>>(
      `SELECT vertical, event_type, status, received_at
       FROM rarecrest.vertical_ingress_events
       WHERE received_at >= $1
       ORDER BY received_at DESC LIMIT 15`,
      [sinceIso],
    ),
    getLatestProvenanceRoot(db),
    db.query<{ id: string; name: string }>(
      `SELECT id, name FROM rarecrest.entities WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 5`,
    ),
  ]);

  const traceVerifySample: BoardPackInput["traceVerifySample"] = [];
  for (const entity of sampleEntities.rows) {
    const verify = await verifyEntityTraceChain(db, entity.id);
    traceVerifySample.push({
      entityId: entity.id,
      entityName: entity.name,
      valid: verify.valid,
      checked: verify.checked,
    });
  }

  return {
    windowDays,
    northStar: {
      capitalRoutedUsd: northStar.capitalRoutedUsd,
      healingHours: northStar.healingHours,
      familiesSupported: northStar.familiesSupported,
      donationPctBpsAvg: northStar.donationPctBpsAvg,
      dualMissionScore: northStar.dualMissionScore,
    },
    parliament: {
      openSessions: Number(openSessions.rows[0]?.c ?? 0),
      readyForSeal: Number(readySessions.rows[0]?.c ?? 0),
      sealedInWindow: Number(sealedCount.rows[0]?.c ?? 0),
      recentSeals: recentSeals.rows.map((row) => ({
        sessionId: String(row.session_id),
        stakeClass: String(row.stake_class),
        mode: String(row.mode),
        sealedAt: new Date(row.sealed_at as string).toISOString(),
        effectDigest: row.effect_digest ? String(row.effect_digest) : null,
      })),
    },
    killSwitches: killSwitches.rows.map((row) => ({
      entityId: row.entity_id,
      entityName: row.name,
      state: row.state,
    })),
    attentionOpen: Number(attentionOpen.rows[0]?.c ?? 0),
    federation: {
      acceptedInWindow: Number(fedAccepted.rows[0]?.c ?? 0),
      rejectedInWindow: Number(fedRejected.rows[0]?.c ?? 0),
      recent: fedRecent.rows.map((row) => ({
        vertical: String(row.vertical),
        eventType: String(row.event_type),
        status: String(row.status),
        receivedAt: new Date(row.received_at as string).toISOString(),
      })),
    },
    provenance: {
      latestRootId: latestRoot?.id ?? null,
      latestMerkleRoot: latestRoot?.merkleRoot ?? null,
      latestRootAt: latestRoot?.createdAt ?? null,
      entityHeads: latestRoot ? Object.keys(latestRoot.entityRoots).length : 0,
      metricHeads: latestRoot ? Object.keys(latestRoot.metricRoots).length : 0,
    },
    traceVerifySample,
  };
}

export { assembleBoardPack, computeMetricContentHash };
