-- WO-61: Regulatory compliance calendar persistence

CREATE TABLE IF NOT EXISTS rarecrest.regulatory_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  regime VARCHAR(100) NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  cadence VARCHAR(20) NOT NULL CHECK (cadence IN ('monthly', 'quarterly', 'annual')),
  priority VARCHAR(20) NOT NULL CHECK (priority IN ('normal', 'high', 'critical')),
  source_period_start TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_regulatory_calendar_entity_due
  ON rarecrest.regulatory_calendar_events (entity_id, due_at);

GRANT SELECT, INSERT ON rarecrest.regulatory_calendar_events TO rarecrest_api;
