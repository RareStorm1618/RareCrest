# Provenance & Board Packs

RareCrest treats audit evidence as a fiduciary product: decision traces and holding
metrics are hash-chained, periodic merkle roots bind those heads (plus kill-switch
snapshots), and an LP **board pack** projects the dual-mission story into one
exportable artifact.

## Decision-trace verify

```
GET /api/v1/provenance/traces/:entityId/verify
```

Re-walks `decision_traces` oldest→newest using `computeTraceContentHash`
(entityId + action + payload). Fail-closed: missing/`null` `content_hash` or any
mismatch → **409** with `{ valid: false, brokenAt, reason }`.

## Holding-metric chain

Migration `031` adds `prev_hash` / `content_hash` on `holding_metric_events`.
`recordMetric` chains **per `metric_key`**.

```
GET /api/v1/provenance/metrics/verify?metricKey=capital_routed_usd
```

## Provenance roots

```
POST /api/v1/provenance/root/anchor     # director or x-internal-service-token
GET  /api/v1/provenance/root/latest
GET  /api/v1/provenance/root/:id/verify
```

Leaves = entity trace heads + metric heads + `ks:{entityId}:{state}` snapshots.
Merkle root is a deterministic pairwise fold (`buildMerkleRoot` in `@rarecrest/export`).
Night-shift anchors a 24h root after seal execution (best-effort).

External publication beyond object-store `anchor_ref` is still optional; the DB root
is the SoR.

## Board pack

```
GET  /api/v1/exports/board-pack/preview?windowDays=30
POST /api/v1/exports/board-pack
```

Sections: North Star, Parliament & seals, kill switches, attention, federation,
provenance root, decision-trace verify sample. Stored via `export_packs` like
oversight packs. Command Center → “Generate LP board pack”.

Pure assemblers live in `@rarecrest/export` (`assembleBoardPack`, `verifyTraceChain`,
`buildMerkleRoot`).
