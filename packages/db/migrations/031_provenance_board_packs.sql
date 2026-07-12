-- Provenance wave: chain holding metrics like decision traces, and store
-- periodic merkle roots that bind entity-trace heads + metric heads into an
-- LP-grade anchor (object-store ref optional via anchor_ref).

ALTER TABLE rarecrest.holding_metric_events
  ADD COLUMN IF NOT EXISTS prev_hash TEXT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_holding_metrics_key_hash
  ON rarecrest.holding_metric_events (metric_key, recorded_at DESC)
  WHERE content_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS rarecrest.provenance_roots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  leaf_count INT NOT NULL,
  merkle_root TEXT NOT NULL,
  entity_roots JSONB NOT NULL DEFAULT '{}'::jsonb,
  metric_roots JSONB NOT NULL DEFAULT '{}'::jsonb,
  extras JSONB NOT NULL DEFAULT '{}'::jsonb,
  anchor_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provenance_roots_created
  ON rarecrest.provenance_roots (created_at DESC);

GRANT SELECT, INSERT ON rarecrest.provenance_roots TO rarecrest_api;
