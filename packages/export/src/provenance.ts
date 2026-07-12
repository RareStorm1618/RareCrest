/** Pure provenance primitives — merkle roots + hash-chain verification (no DB). */
import { createHash } from "node:crypto";

export interface TraceChainRow {
  id: string;
  entityId: string;
  action: string;
  payload: Record<string, unknown>;
  prevHash: string | null;
  contentHash: string | null;
  createdAt: string;
}

export interface TraceChainVerifyResult {
  valid: boolean;
  checked: number;
  headHash: string | null;
  brokenAt?: string;
  reason?: string;
}

/** Same formula as services/intelligence DecisionTraceService.computeTraceContentHash. */
export function computeTraceContentHash(
  entityId: string | undefined | null,
  action: string,
  payload: Record<string, unknown>,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ entityId: entityId ?? null, action, payload }))
    .digest("hex");
}

/**
 * Fail-closed walk of an entity's decision-trace chain (oldest → newest).
 * Any missing content_hash after the first row, or hash mismatch, is invalid.
 */
export function verifyTraceChain(rowsOldestFirst: TraceChainRow[]): TraceChainVerifyResult {
  if (rowsOldestFirst.length === 0) {
    return { valid: true, checked: 0, headHash: null };
  }

  let prev: string | null = null;
  for (let i = 0; i < rowsOldestFirst.length; i += 1) {
    const row = rowsOldestFirst[i];
    if (!row.contentHash) {
      return {
        valid: false,
        checked: i,
        headHash: prev,
        brokenAt: row.id,
        reason: "missing content_hash",
      };
    }
    const expected = computeTraceContentHash(row.entityId, row.action, row.payload);
    if (row.contentHash !== expected) {
      return {
        valid: false,
        checked: i,
        headHash: prev,
        brokenAt: row.id,
        reason: "content_hash mismatch",
      };
    }
    const expectedPrev = i === 0 ? null : prev;
    if ((row.prevHash ?? null) !== expectedPrev) {
      return {
        valid: false,
        checked: i,
        headHash: prev,
        brokenAt: row.id,
        reason: "prev_hash mismatch",
      };
    }
    prev = row.contentHash;
  }

  return { valid: true, checked: rowsOldestFirst.length, headHash: prev };
}

export function computeMetricContentHash(input: {
  vertical: string;
  metricKey: string;
  value: number;
  entityId: string | null;
  sourceRef: string | null;
  actorId: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        vertical: input.vertical,
        metricKey: input.metricKey,
        value: input.value,
        entityId: input.entityId,
        sourceRef: input.sourceRef,
        actorId: input.actorId,
      }),
    )
    .digest("hex");
}

export interface MetricChainRow {
  id: string;
  metricKey: string;
  prevHash: string | null;
  contentHash: string | null;
  vertical: string;
  value: number;
  entityId: string | null;
  sourceRef: string | null;
  actorId: string;
}

export function verifyMetricChain(rowsOldestFirst: MetricChainRow[]): TraceChainVerifyResult {
  if (rowsOldestFirst.length === 0) {
    return { valid: true, checked: 0, headHash: null };
  }
  let prev: string | null = null;
  for (let i = 0; i < rowsOldestFirst.length; i += 1) {
    const row = rowsOldestFirst[i];
    if (!row.contentHash) {
      return {
        valid: false,
        checked: i,
        headHash: prev,
        brokenAt: row.id,
        reason: "missing content_hash",
      };
    }
    const expected = computeMetricContentHash({
      vertical: row.vertical,
      metricKey: row.metricKey,
      value: row.value,
      entityId: row.entityId,
      sourceRef: row.sourceRef,
      actorId: row.actorId,
    });
    if (row.contentHash !== expected) {
      return {
        valid: false,
        checked: i,
        headHash: prev,
        brokenAt: row.id,
        reason: "content_hash mismatch",
      };
    }
    const expectedPrev = i === 0 ? null : prev;
    if ((row.prevHash ?? null) !== expectedPrev) {
      return {
        valid: false,
        checked: i,
        headHash: prev,
        brokenAt: row.id,
        reason: "prev_hash mismatch",
      };
    }
    prev = row.contentHash;
  }
  return { valid: true, checked: rowsOldestFirst.length, headHash: prev };
}

/**
 * Deterministic pairwise merkle fold over sorted leaf hashes.
 * Single leaf → that leaf; empty → sha256("").
 */
export function buildMerkleRoot(leafHashes: string[]): string {
  if (leafHashes.length === 0) {
    return createHash("sha256").update("").digest("hex");
  }
  const sorted = [...leafHashes].sort();
  let level = sorted;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;
      next.push(createHash("sha256").update(left + right).digest("hex"));
    }
    level = next;
  }
  return level[0];
}
