-- EXO Wave B: Holding metrics — durable North Star events (capital routed, healing
-- hours, families supported, donation percentage) feeding the dual-mission score.
-- EXO Wave C: Durable AI spend ledger — every skill-companion/model-router call that
-- estimates token usage gets an append-only row here, independent of the in-memory
-- per-vertical daily budget in services/intelligence/src/budgets.ts.

CREATE TABLE IF NOT EXISTS rarecrest.holding_metric_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical VARCHAR(50) NOT NULL,
  entity_id UUID REFERENCES rarecrest.entities(id),
  metric_key VARCHAR(100) NOT NULL,
  -- keys: capital_routed_usd, healing_hours, families_supported, donation_pct_bps
  value_numeric DOUBLE PRECISION NOT NULL,
  unit VARCHAR(40) NOT NULL DEFAULT 'count',
  source_ref VARCHAR(255),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id VARCHAR(255) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_holding_metrics_key_time
  ON rarecrest.holding_metric_events (metric_key, recorded_at DESC);

CREATE TABLE IF NOT EXISTS rarecrest.ai_spend_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical VARCHAR(50) NOT NULL,
  entity_id UUID,
  agent_id VARCHAR(255),
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100),
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  estimated_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  correlation_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_spend_ledger_vertical_time
  ON rarecrest.ai_spend_ledger (vertical, created_at DESC);

GRANT SELECT, INSERT ON rarecrest.holding_metric_events TO rarecrest_api;
GRANT SELECT, INSERT ON rarecrest.ai_spend_ledger TO rarecrest_api;
