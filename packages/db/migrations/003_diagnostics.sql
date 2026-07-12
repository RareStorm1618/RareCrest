-- WO-31/25: Readiness assessments with resumable partial state

CREATE TABLE IF NOT EXISTS rarecrest.readiness_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  vertical VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'complete')),
  current_step VARCHAR(100) NOT NULL DEFAULT 'readiness_score',
  responses JSONB NOT NULL DEFAULT '{}',
  readiness_total INTEGER,
  readiness_band VARCHAR(50),
  maturity_level INTEGER,
  governance_maturity INTEGER,
  deployment_locked BOOLEAN NOT NULL DEFAULT FALSE,
  migration_halted BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_readiness_assessments_entity ON rarecrest.readiness_assessments (entity_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON rarecrest.readiness_assessments TO rarecrest_api;
