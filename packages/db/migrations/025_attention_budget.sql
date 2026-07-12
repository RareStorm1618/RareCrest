-- S1 Attention Budget Protocol: per-agent daily interrupt token budgets +
-- deferred-to-brief lane on attention_flags.

ALTER TABLE rarecrest.attention_flags
  ADD COLUMN IF NOT EXISTS deferred_to_brief BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS agent_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS interrupt_paid BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS rarecrest.agent_attention_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255) NOT NULL,
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  critical_tokens INT NOT NULL DEFAULT 3,
  awareness_tokens INT NOT NULL DEFAULT 10,
  critical_spent INT NOT NULL DEFAULT 0,
  awareness_spent INT NOT NULL DEFAULT 0,
  UNIQUE (agent_id, entity_id, day)
);

CREATE TABLE IF NOT EXISTS rarecrest.attention_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255) NOT NULL,
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  flag_id UUID REFERENCES rarecrest.attention_flags(id),
  severity VARCHAR(20) NOT NULL,
  token_kind VARCHAR(20) NOT NULL CHECK (token_kind IN ('critical', 'awareness', 'deferred')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attention_flags_interrupt
  ON rarecrest.attention_flags (entity_id, created_at DESC)
  WHERE resolved_at IS NULL AND deferred_to_brief = FALSE;

GRANT SELECT, INSERT, UPDATE ON rarecrest.agent_attention_budgets TO rarecrest_api;
GRANT SELECT, INSERT ON rarecrest.attention_escalations TO rarecrest_api;
