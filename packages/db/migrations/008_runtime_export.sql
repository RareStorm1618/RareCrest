-- WO-68/72/27/29 depth pass

CREATE TABLE IF NOT EXISTS rarecrest.agent_roster (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255) NOT NULL,
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  owner VARCHAR(255) NOT NULL,
  current_activity TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'inactive' CHECK (status IN ('running', 'inactive', 'halted')),
  health VARCHAR(20) NOT NULL DEFAULT 'healthy' CHECK (health IN ('healthy', 'degraded', 'critical')),
  version VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, entity_id)
);

CREATE TABLE IF NOT EXISTS rarecrest.human_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  agent_id VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN ('money', 'legal', 'customer_of_record', 'crisis', 'hard_rule_adjacent')),
  decision_needed TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  sla_target_at TIMESTAMPTZ NOT NULL,
  held_action JSONB NOT NULL DEFAULT '{}',
  resolution_note TEXT,
  attention_flag_id UUID REFERENCES rarecrest.attention_flags(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rarecrest.agent_rollbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255) NOT NULL,
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  from_version VARCHAR(100),
  to_version VARCHAR(100),
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('completed', 'halted_instead', 'unavailable')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rarecrest.export_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES rarecrest.entities(id),
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('entity', 'portfolio')),
  format VARCHAR(20) NOT NULL CHECK (format IN ('pdf', 'markdown')),
  object_key VARCHAR(500) NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rarecrest.evaluation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(255) NOT NULL,
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  accuracy NUMERIC(5,4) NOT NULL,
  override_rate NUMERIC(5,4) NOT NULL,
  drift_detected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_roster_entity ON rarecrest.agent_roster (entity_id);
CREATE INDEX idx_human_review_pending ON rarecrest.human_review_queue (status) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE ON rarecrest.agent_roster TO rarecrest_api;
GRANT SELECT, INSERT, UPDATE ON rarecrest.human_review_queue TO rarecrest_api;
GRANT SELECT, INSERT ON rarecrest.agent_rollbacks TO rarecrest_api;
GRANT SELECT, INSERT ON rarecrest.export_packs TO rarecrest_api;
GRANT SELECT, INSERT ON rarecrest.evaluation_runs TO rarecrest_api;
