/**
 * Vertical federation ingress — RareCrest as system of record for events
 * emitted by vertical products (RareEdge, RareAngels, HopeCoin, …).
 *
 * Auth: HMAC-SHA256 over `${timestamp}.${deliveryId}.${rawBody}` using
 * FEDERATION_WEBHOOK_SECRET_<VERTICAL> (or shared FEDERATION_WEBHOOK_SECRET).
 * Replay window: ±5 minutes. Idempotency: UNIQUE (vertical, delivery_id).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { VerticalKey } from "@rarecrest/contracts";
import type { DatabaseClient } from "@rarecrest/db";
import { isValidVertical } from "../auth.js";
import { loadSecret } from "../secrets.js";
import { HOLDING_METRIC_KEYS, recordMetric, type HoldingMetricKey } from "./holding-metrics.js";
import { AttentionFlagService } from "./attention-flag.js";
import { validateAttentionSignalType } from "@rarecrest/portfolio";
import type { AttentionSeverity } from "@rarecrest/contracts";

export const FEDERATION_EVENT_TYPES = [
  "heartbeat",
  "metric.record",
  "attention.raise",
  "alert.escalate",
] as const;

export type FederationEventType = (typeof FEDERATION_EVENT_TYPES)[number];

export const FEDERATION_MAX_SKEW_SECONDS = 300;

export interface FederationEffect {
  kind: "metric" | "attention" | "none" | "error";
  detail: string;
  refId?: string;
}

export interface VerticalIngressEvent {
  id: string;
  vertical: string;
  sourceSystem: string;
  eventType: string;
  deliveryId: string;
  entityId: string | null;
  externalRef: string | null;
  payload: Record<string, unknown>;
  effects: FederationEffect[];
  status: "accepted" | "duplicate" | "rejected";
  rejectReason: string | null;
  receivedAt: string;
}

export class FederationAuthError extends Error {
  statusCode = 401;
  constructor(message: string) {
    super(message);
    this.name = "FederationAuthError";
  }
}

export class FederationValidationError extends Error {
  statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "FederationValidationError";
  }
}

/** Resolve webhook secret for a vertical — per-vertical first, then shared. */
export function federationSecretFor(vertical: string): string | undefined {
  const key = `FEDERATION_WEBHOOK_SECRET_${vertical.toUpperCase()}`;
  return loadSecret(key) || loadSecret("FEDERATION_WEBHOOK_SECRET") || undefined;
}

export function signFederationPayload(
  secret: string,
  timestamp: string,
  deliveryId: string,
  rawBody: string,
): string {
  const mac = createHmac("sha256", secret)
    .update(`${timestamp}.${deliveryId}.${rawBody}`)
    .digest("hex");
  return `sha256=${mac}`;
}

export function verifyFederationSignature(opts: {
  secret: string;
  signatureHeader: string;
  timestamp: string;
  deliveryId: string;
  rawBody: string;
  nowMs?: number;
}): void {
  const now = opts.nowMs ?? Date.now();
  const ts = Number(opts.timestamp);
  if (!Number.isFinite(ts)) {
    throw new FederationAuthError("Invalid X-RareCrest-Timestamp");
  }
  const skew = Math.abs(now / 1000 - ts);
  if (skew > FEDERATION_MAX_SKEW_SECONDS) {
    throw new FederationAuthError("Federation timestamp outside replay window");
  }

  const expected = signFederationPayload(opts.secret, opts.timestamp, opts.deliveryId, opts.rawBody);
  const provided = opts.signatureHeader.trim();
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new FederationAuthError("Invalid federation signature");
  }
}

function mapIngressRow(row: Record<string, unknown>): VerticalIngressEvent {
  const effectsRaw = row.effects;
  const effects = Array.isArray(effectsRaw)
    ? (effectsRaw as FederationEffect[])
    : typeof effectsRaw === "string"
      ? (JSON.parse(effectsRaw) as FederationEffect[])
      : [];
  const payloadRaw = row.payload;
  const payload =
    payloadRaw && typeof payloadRaw === "object" && !Array.isArray(payloadRaw)
      ? (payloadRaw as Record<string, unknown>)
      : typeof payloadRaw === "string"
        ? (JSON.parse(payloadRaw) as Record<string, unknown>)
        : {};
  return {
    id: String(row.id),
    vertical: String(row.vertical),
    sourceSystem: String(row.source_system),
    eventType: String(row.event_type),
    deliveryId: String(row.delivery_id),
    entityId: row.entity_id ? String(row.entity_id) : null,
    externalRef: row.external_ref ? String(row.external_ref) : null,
    payload,
    effects,
    status: row.status as VerticalIngressEvent["status"],
    rejectReason: row.reject_reason ? String(row.reject_reason) : null,
    receivedAt: new Date(row.received_at as string).toISOString(),
  };
}

async function assertEntityInVertical(
  db: DatabaseClient,
  entityId: string,
  vertical: VerticalKey,
): Promise<void> {
  const result = await db.query(
    `SELECT id FROM rarecrest.entities WHERE id = $1 AND vertical = $2 AND deleted_at IS NULL`,
    [entityId, vertical],
  );
  if (result.rows.length === 0) {
    throw new FederationValidationError(
      `entityId ${entityId} not found in vertical ${vertical}`,
    );
  }
}

function isMetricKey(value: string): value is HoldingMetricKey {
  return (HOLDING_METRIC_KEYS as readonly string[]).includes(value);
}

async function applyEffects(
  db: DatabaseClient,
  vertical: VerticalKey,
  eventType: FederationEventType,
  payload: Record<string, unknown>,
  deliveryId: string,
): Promise<{ effects: FederationEffect[]; entityId: string | null; externalRef: string | null }> {
  const effects: FederationEffect[] = [];
  let entityId: string | null =
    typeof payload.entityId === "string" && payload.entityId.length > 0
      ? payload.entityId
      : null;
  const externalRef =
    typeof payload.externalRef === "string"
      ? payload.externalRef
      : typeof payload.sourceRef === "string"
        ? payload.sourceRef
        : null;

  if (entityId) {
    await assertEntityInVertical(db, entityId, vertical);
  }

  if (eventType === "heartbeat") {
    effects.push({ kind: "none", detail: "heartbeat recorded" });
    return { effects, entityId, externalRef };
  }

  if (eventType === "metric.record") {
    const metricKey = typeof payload.metricKey === "string" ? payload.metricKey : "";
    const value = typeof payload.value === "number" ? payload.value : Number(payload.value);
    if (!isMetricKey(metricKey)) {
      throw new FederationValidationError(
        `metricKey must be one of: ${HOLDING_METRIC_KEYS.join(", ")}`,
      );
    }
    if (!Number.isFinite(value)) {
      throw new FederationValidationError("metric value must be a finite number");
    }
    const event = await recordMetric(db, {
      vertical,
      metricKey,
      value,
      entityId,
      sourceRef: externalRef ?? `federation:${deliveryId}`,
      actorId: `federation:${vertical}`,
    });
    effects.push({ kind: "metric", detail: `${metricKey}=${value}`, refId: event.id });
    return { effects, entityId, externalRef };
  }

  if (eventType === "attention.raise" || eventType === "alert.escalate") {
    if (!entityId) {
      throw new FederationValidationError("entityId is required for attention/alert events");
    }
    const signalTypeRaw =
      typeof payload.signalType === "string"
        ? payload.signalType
        : eventType === "alert.escalate"
          ? "pending_high_stakes_decision"
          : "";
    if (!validateAttentionSignalType(signalTypeRaw)) {
      throw new FederationValidationError(`Invalid signalType: ${signalTypeRaw}`);
    }
    const message =
      typeof payload.message === "string" && payload.message.trim().length > 0
        ? payload.message.trim()
        : eventType === "alert.escalate"
          ? `Escalation from ${vertical}`
          : "";
    if (!message) {
      throw new FederationValidationError("message is required for attention.raise");
    }
    const severity =
      typeof payload.severity === "string" ? (payload.severity as AttentionSeverity) : undefined;
    const linkPath = typeof payload.linkPath === "string" ? payload.linkPath : undefined;
    const attention = new AttentionFlagService(db);
    const flag = await attention.raiseFlag(entityId, {
      signalType: signalTypeRaw,
      message,
      severity,
      linkPath,
      sourceRef: externalRef ?? `federation:${deliveryId}`,
    });
    effects.push({
      kind: "attention",
      detail: `${signalTypeRaw}: ${message.slice(0, 80)}`,
      refId: flag.id,
    });
    return { effects, entityId, externalRef };
  }

  throw new FederationValidationError(`Unsupported eventType: ${eventType}`);
}

export interface IngestFederationInput {
  vertical: string;
  rawBody: string;
  timestamp: string;
  deliveryId: string;
  signatureHeader: string;
  nowMs?: number;
}

export interface IngestFederationResult {
  event: VerticalIngressEvent;
  created: boolean;
}

export async function ingestFederationEvent(
  db: DatabaseClient,
  input: IngestFederationInput,
): Promise<IngestFederationResult> {
  if (!isValidVertical(input.vertical)) {
    throw new FederationValidationError(`Invalid vertical: ${input.vertical}`);
  }
  const vertical = input.vertical as VerticalKey;

  const secret = federationSecretFor(vertical);
  if (!secret) {
    throw new FederationAuthError(
      `Federation webhook secret not configured for ${vertical} ` +
        `(set FEDERATION_WEBHOOK_SECRET_${vertical.toUpperCase()} or FEDERATION_WEBHOOK_SECRET)`,
    );
  }

  if (!input.deliveryId || input.deliveryId.length > 128) {
    throw new FederationValidationError("X-RareCrest-Delivery-Id is required (max 128 chars)");
  }

  verifyFederationSignature({
    secret,
    signatureHeader: input.signatureHeader,
    timestamp: input.timestamp,
    deliveryId: input.deliveryId,
    rawBody: input.rawBody,
    nowMs: input.nowMs,
  });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(input.rawBody) as Record<string, unknown>;
  } catch {
    throw new FederationValidationError("Body must be JSON");
  }

  const eventType = typeof body.eventType === "string" ? body.eventType : "";
  if (!(FEDERATION_EVENT_TYPES as readonly string[]).includes(eventType)) {
    throw new FederationValidationError(
      `eventType must be one of: ${FEDERATION_EVENT_TYPES.join(", ")}`,
    );
  }
  const sourceSystem =
    typeof body.sourceSystem === "string" && body.sourceSystem.trim().length > 0
      ? body.sourceSystem.trim().slice(0, 100)
      : `${vertical}-product`;
  const payload =
    body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : {};

  const existing = await db.query<Record<string, unknown>>(
    `SELECT id, vertical, source_system, event_type, delivery_id, entity_id, external_ref,
            payload, effects, status, reject_reason, received_at
     FROM rarecrest.vertical_ingress_events
     WHERE vertical = $1 AND delivery_id = $2`,
    [vertical, input.deliveryId],
  );
  if (existing.rows.length > 0) {
    return { event: mapIngressRow(existing.rows[0]), created: false };
  }

  let effects: FederationEffect[];
  let entityId: string | null;
  let externalRef: string | null;
  try {
    const applied = await applyEffects(
      db,
      vertical,
      eventType as FederationEventType,
      payload,
      input.deliveryId,
    );
    effects = applied.effects;
    entityId = applied.entityId;
    externalRef = applied.externalRef;
  } catch (err) {
    if (err instanceof FederationValidationError) {
      const rejected = await db.query<Record<string, unknown>>(
        `INSERT INTO rarecrest.vertical_ingress_events
           (vertical, source_system, event_type, delivery_id, payload, effects, status, reject_reason)
         VALUES ($1, $2, $3, $4, $5::jsonb, '[]'::jsonb, 'rejected', $6)
         ON CONFLICT (vertical, delivery_id) DO NOTHING
         RETURNING id, vertical, source_system, event_type, delivery_id, entity_id, external_ref,
                   payload, effects, status, reject_reason, received_at`,
        [vertical, sourceSystem, eventType, input.deliveryId, JSON.stringify(payload), err.message],
      );
      if (rejected.rows.length > 0) {
        return { event: mapIngressRow(rejected.rows[0]), created: true };
      }
      const again = await db.query<Record<string, unknown>>(
        `SELECT id, vertical, source_system, event_type, delivery_id, entity_id, external_ref,
                payload, effects, status, reject_reason, received_at
         FROM rarecrest.vertical_ingress_events
         WHERE vertical = $1 AND delivery_id = $2`,
        [vertical, input.deliveryId],
      );
      return { event: mapIngressRow(again.rows[0]), created: false };
    }
    throw err;
  }

  const inserted = await db.query<Record<string, unknown>>(
    `INSERT INTO rarecrest.vertical_ingress_events
       (vertical, source_system, event_type, delivery_id, entity_id, external_ref,
        payload, effects, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, 'accepted')
     ON CONFLICT (vertical, delivery_id) DO NOTHING
     RETURNING id, vertical, source_system, event_type, delivery_id, entity_id, external_ref,
               payload, effects, status, reject_reason, received_at`,
    [
      vertical,
      sourceSystem,
      eventType,
      input.deliveryId,
      entityId,
      externalRef,
      JSON.stringify(payload),
      JSON.stringify(effects),
    ],
  );

  if (inserted.rows.length === 0) {
    const again = await db.query<Record<string, unknown>>(
      `SELECT id, vertical, source_system, event_type, delivery_id, entity_id, external_ref,
              payload, effects, status, reject_reason, received_at
       FROM rarecrest.vertical_ingress_events
       WHERE vertical = $1 AND delivery_id = $2`,
      [vertical, input.deliveryId],
    );
    return { event: mapIngressRow(again.rows[0]), created: false };
  }

  return { event: mapIngressRow(inserted.rows[0]), created: true };
}

export async function listFederationEvents(
  db: DatabaseClient,
  opts: { vertical?: string; limit?: number } = {},
): Promise<VerticalIngressEvent[]> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const verticalFilter = opts.vertical ? "WHERE vertical = $1" : "";
  const params: unknown[] = opts.vertical ? [opts.vertical, limit] : [limit];
  const limitParam = opts.vertical ? "$2" : "$1";
  const result = await db.query<Record<string, unknown>>(
    `SELECT id, vertical, source_system, event_type, delivery_id, entity_id, external_ref,
            payload, effects, status, reject_reason, received_at
     FROM rarecrest.vertical_ingress_events
     ${verticalFilter}
     ORDER BY received_at DESC
     LIMIT ${limitParam}`,
    params,
  );
  return result.rows.map(mapIngressRow);
}
