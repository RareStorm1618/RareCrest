-- WO-2: Core relational schema
-- WO-3: Tenancy keys and soft-delete windows

CREATE TABLE IF NOT EXISTS rarecrest.entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  vertical VARCHAR(50) NOT NULL CHECK (vertical IN ('rarestorm', 'rareangels', 'rareedge', 'hopecoin', 'healkids')),
  tenancy_key VARCHAR(255) NOT NULL,
  mode VARCHAR(50) NOT NULL DEFAULT 'assessment',
  band VARCHAR(50) NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  UNIQUE (tenancy_key, vertical)
);

CREATE INDEX idx_entities_vertical ON rarecrest.entities (vertical) WHERE deleted_at IS NULL;
CREATE INDEX idx_entities_tenancy ON rarecrest.entities (tenancy_key) WHERE deleted_at IS NULL;

-- Rights grants (WO-11 foundation)
CREATE TABLE IF NOT EXISTS rarecrest.rights_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255) NOT NULL,
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  vertical VARCHAR(50) NOT NULL,
  rights JSONB NOT NULL DEFAULT '[]',
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by VARCHAR(255) NOT NULL,
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_rights_grants_agent ON rarecrest.rights_grants (agent_id) WHERE deleted_at IS NULL;

-- Decision trace store (WO-4: append-only)
CREATE TABLE IF NOT EXISTS rarecrest.decision_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES rarecrest.entities(id),
  vertical VARCHAR(50) NOT NULL,
  action VARCHAR(255) NOT NULL,
  verdict VARCHAR(10) NOT NULL CHECK (verdict IN ('allow', 'deny')),
  payload JSONB NOT NULL DEFAULT '{}',
  retention_regime VARCHAR(100) NOT NULL DEFAULT 'standard',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only: no UPDATE or DELETE triggers
CREATE OR REPLACE FUNCTION rarecrest.prevent_trace_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'decision_traces is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS no_update_decision_traces ON rarecrest.decision_traces;
CREATE TRIGGER no_update_decision_traces
  BEFORE UPDATE OR DELETE ON rarecrest.decision_traces
  FOR EACH ROW EXECUTE FUNCTION rarecrest.prevent_trace_mutation();

CREATE INDEX idx_decision_traces_entity ON rarecrest.decision_traces (entity_id, created_at);
CREATE INDEX idx_decision_traces_vertical ON rarecrest.decision_traces (vertical, created_at);

-- Structured documents (dual-track authoring foundation)
CREATE TABLE IF NOT EXISTS rarecrest.structured_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  vertical VARCHAR(50) NOT NULL,
  doc_type VARCHAR(100) NOT NULL,
  narrative TEXT NOT NULL DEFAULT '',
  schema_payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Grant table permissions to scoped roles
GRANT SELECT, INSERT, UPDATE ON rarecrest.entities TO rarecrest_api;
GRANT SELECT, INSERT, UPDATE ON rarecrest.rights_grants TO rarecrest_api, rarecrest_governance;
GRANT SELECT, INSERT ON rarecrest.decision_traces TO rarecrest_api, rarecrest_governance, rarecrest_intelligence;
GRANT SELECT, INSERT, UPDATE ON rarecrest.structured_documents TO rarecrest_api;
