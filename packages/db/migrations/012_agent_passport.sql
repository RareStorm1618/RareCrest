-- WO-50: Agent passport issuance and history

CREATE TABLE IF NOT EXISTS rarecrest.agent_passports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255) NOT NULL,
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  rights JSONB NOT NULL DEFAULT '[]',
  risk_tier VARCHAR(20) NOT NULL CHECK (risk_tier IN ('low', 'moderate', 'high')),
  valid_until TIMESTAMPTZ NOT NULL,
  issued_by VARCHAR(255) NOT NULL,
  hard_rule_clear BOOLEAN NOT NULL DEFAULT FALSE,
  constraints JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_passports_lookup
  ON rarecrest.agent_passports (agent_id, entity_id, created_at DESC);

GRANT SELECT, INSERT ON rarecrest.agent_passports TO rarecrest_api;
