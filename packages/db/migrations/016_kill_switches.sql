-- Trust wave: durable kill-switch state + dual-control ceremony log

CREATE TABLE IF NOT EXISTS rarecrest.kill_switches (
  entity_id UUID PRIMARY KEY REFERENCES rarecrest.entities(id),
  state VARCHAR(20) NOT NULL CHECK (state IN ('idle', 'armed', 'triggered')),
  armed_by VARCHAR(255),
  armed_at TIMESTAMPTZ,
  armed_reason TEXT,
  triggered_by VARCHAR(255),
  triggered_at TIMESTAMPTZ,
  triggered_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rarecrest.kill_switch_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  action VARCHAR(20) NOT NULL CHECK (action IN ('arm', 'trigger', 'disarm')),
  actor_id VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  state_after VARCHAR(20) NOT NULL,
  dual_control_ok BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kill_switch_events_entity
  ON rarecrest.kill_switch_events (entity_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON rarecrest.kill_switches TO rarecrest_api, rarecrest_governance;
GRANT SELECT, INSERT ON rarecrest.kill_switch_events TO rarecrest_api, rarecrest_governance;
