-- WO-37..66 depth pass: workflows, migration, legal, command, memory

CREATE TABLE IF NOT EXISTS rarecrest.workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  workflow_id VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'complete', 'incomplete')),
  completed_steps JSONB NOT NULL DEFAULT '[]',
  artifacts JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rarecrest.rewrite_step_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  steps JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_id)
);

CREATE TABLE IF NOT EXISTS rarecrest.edge_twin_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  plan JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rarecrest.override_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  agent_id VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rarecrest.legal_matters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  title VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  disclaimer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rarecrest.director_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  director_id VARCHAR(255) NOT NULL,
  last_engaged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rarecrest.shared_memory_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rarecrest.permission_envelope_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  agent_id VARCHAR(255) NOT NULL,
  deployable BOOLEAN NOT NULL,
  violations JSONB NOT NULL DEFAULT '[]',
  hard_rule_clear BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE ON rarecrest.workflow_runs TO rarecrest_api;
GRANT SELECT, INSERT, UPDATE ON rarecrest.rewrite_step_progress TO rarecrest_api;
GRANT SELECT, INSERT ON rarecrest.edge_twin_plans TO rarecrest_api;
GRANT SELECT, INSERT ON rarecrest.override_events TO rarecrest_api;
GRANT SELECT, INSERT, UPDATE ON rarecrest.legal_matters TO rarecrest_api;
GRANT SELECT, INSERT, UPDATE ON rarecrest.director_sessions TO rarecrest_api;
GRANT SELECT, INSERT ON rarecrest.shared_memory_records TO rarecrest_api;
GRANT SELECT, INSERT ON rarecrest.permission_envelope_audits TO rarecrest_api;
