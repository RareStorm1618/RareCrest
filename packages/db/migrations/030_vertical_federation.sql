-- Vertical federation ingress: HMAC-authenticated events from RareEdge /
-- RareAngels / HopeCoin / HealKids / RareStorm land here as the holding SoR.
-- Idempotent on (vertical, delivery_id). Effects (metrics, attention) are
-- applied once and recorded on the row; duplicates return the prior acceptance.

CREATE TABLE IF NOT EXISTS rarecrest.vertical_ingress_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical VARCHAR(50) NOT NULL,
  source_system VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  delivery_id VARCHAR(128) NOT NULL,
  entity_id UUID REFERENCES rarecrest.entities(id),
  external_ref VARCHAR(255),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  effects JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(40) NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('accepted', 'duplicate', 'rejected')),
  reject_reason TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vertical, delivery_id)
);

CREATE INDEX IF NOT EXISTS idx_vertical_ingress_received
  ON rarecrest.vertical_ingress_events (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_vertical_ingress_vertical_time
  ON rarecrest.vertical_ingress_events (vertical, received_at DESC);

GRANT SELECT, INSERT, UPDATE ON rarecrest.vertical_ingress_events TO rarecrest_api;
