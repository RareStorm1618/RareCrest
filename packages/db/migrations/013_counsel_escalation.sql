-- WO-59: Counsel escalation records

CREATE TABLE IF NOT EXISTS rarecrest.counsel_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  matter_id UUID REFERENCES rarecrest.legal_matters(id),
  trigger_code VARCHAR(80) NOT NULL,
  rationale TEXT NOT NULL,
  urgency VARCHAR(20) NOT NULL CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
  required_within_hours INTEGER NOT NULL CHECK (required_within_hours > 0),
  escalated BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_counsel_escalations_entity
  ON rarecrest.counsel_escalations (entity_id, created_at DESC);

GRANT SELECT, INSERT ON rarecrest.counsel_escalations TO rarecrest_api;
