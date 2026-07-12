-- WO-72: Agent version history for rollback targets

CREATE TABLE IF NOT EXISTS rarecrest.agent_version_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255) NOT NULL,
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  version VARCHAR(100) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_version_history_lookup
  ON rarecrest.agent_version_history (agent_id, entity_id, recorded_at DESC);

GRANT SELECT, INSERT ON rarecrest.agent_version_history TO rarecrest_api;
