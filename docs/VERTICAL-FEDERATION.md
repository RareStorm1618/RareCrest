# Vertical Federation — ingress contract

RareCrest is the **system of record** for the holding. Product verticals
(RareEdge, RareAngels, HopeCoin, HealKids, RareStorm) push signed events into
RareCrest; they do not become a second source of truth for governance metrics
or director attention.

This is **not** multi-instance RareCrest sync (partner org ↔ holding). That
cross-deployment federation remains a documented gap. This document covers
**vertical product → holding SoR** ingress.

## Endpoint

```
POST /api/v1/federation/ingress/:vertical
```

`:vertical` must be one of: `rarestorm` | `rareangels` | `rareedge` | `hopecoin` | `healkids` | `holding`.

No director Bearer token. Trust is HMAC + delivery id + timestamp.

### Required headers

| Header | Meaning |
|--------|---------|
| `X-RareCrest-Timestamp` | Unix seconds (UTC). Must be within ±300s of server time. |
| `X-RareCrest-Delivery-Id` | Idempotency key (≤128 chars). Same id → same acceptance, no double effects. |
| `X-RareCrest-Signature` | `sha256=<hex>` HMAC of `` `${timestamp}.${deliveryId}.${rawBody}` `` |

### Secrets

Prefer per-vertical secrets; fall back to a shared secret:

- `FEDERATION_WEBHOOK_SECRET_RAREEDGE` (or `_RAREANGELS`, `_HOPECOIN`, …)
- or `FEDERATION_WEBHOOK_SECRET`

Both support the `*_FILE` Docker/K8s pattern via `loadSecret`.

If no secret is configured for the vertical, ingress returns **401** (fail closed).

## Body

```json
{
  "eventType": "heartbeat | metric.record | attention.raise | alert.escalate",
  "sourceSystem": "rareedge-trading",
  "payload": { }
}
```

### Event types

| `eventType` | Effect |
|-------------|--------|
| `heartbeat` | Ledger only — proves the vertical pipe is alive. |
| `metric.record` | Writes `holding_metric_events`. Payload: `metricKey`, `value`, optional `entityId`, `sourceRef` / `externalRef`. Keys: `capital_routed_usd`, `healing_hours`, `families_supported`, `donation_pct_bps`. |
| `attention.raise` | Raises an attention flag. Requires `entityId`, `signalType`, `message`. Optional `severity`, `linkPath`. |
| `alert.escalate` | Convenience: attention with default `pending_high_stakes_decision` if `signalType` omitted. Requires `entityId`. |

`entityId`, when present, **must** belong to the path `:vertical` (tenancy fail-closed).

## Responses

| Status | Meaning |
|--------|---------|
| 201 | New accepted event; effects applied once. |
| 200 | Duplicate `delivery_id` — prior acceptance returned, no re-apply. |
| 401 | Missing/invalid signature, skew, or secret not configured. |
| 422 | Signature ok but payload rejected (recorded as `status=rejected`). |
| 400 | Invalid vertical / bad shape before processing. |

Director list:

```
GET /api/v1/federation/events?vertical=rareedge&limit=25
```

Requires verified director / human. Command Center includes the latest 10 events as `federationFeed`.

## Example (curl)

```bash
VERTICAL=rareedge
SECRET="$FEDERATION_WEBHOOK_SECRET_RAREEDGE"
TS=$(date +%s)
DELIVERY_ID="rareedge-$(uuidgen)"
BODY='{"eventType":"metric.record","sourceSystem":"rareedge-trading","payload":{"metricKey":"capital_routed_usd","value":10000,"entityId":"<uuid>"}}'
SIG=$(node -e "const c=require('crypto');const s=process.env.SECRET;const t=process.env.TS;const d=process.env.D;const b=process.env.B;process.stdout.write('sha256='+c.createHmac('sha256',s).update(t+'.'+d+'.'+b).digest('hex'))")

curl -X POST "https://rarecrest.internal/api/v1/federation/ingress/$VERTICAL" \
  -H "Content-Type: application/json" \
  -H "X-RareCrest-Timestamp: $TS" \
  -H "X-RareCrest-Delivery-Id: $DELIVERY_ID" \
  -H "X-RareCrest-Signature: $SIG" \
  --data "$BODY"
```

## What this deliberately does not do

- Pull/sync from vertical DBs (ingress is push-only).
- Move money or mutate financial state in RareCrest (metrics + attention only).
- Accept PHI in payloads (treat payload as non-PHI operational signals; PHI stays in vault paths).
- Multi-instance canon sync between RareCrest deployments.
