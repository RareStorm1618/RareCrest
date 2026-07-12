-- WO-24/34/35/36/37: Entity Portfolio schema

ALTER TABLE rarecrest.entities
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50) DEFAULT 'for_profit_platform'
    CHECK (entity_type IN ('nonprofit', 'for_profit_platform', 'fund', 'token_protocol', 'holding')),
  ADD COLUMN IF NOT EXISTS is_holding_entity BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS regulatory_regimes JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS governance_status VARCHAR(50) NOT NULL DEFAULT 'not_assessed',
  ADD COLUMN IF NOT EXISTS deployment_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS maturity_level INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assessed_at TIMESTAMPTZ DEFAULT NULL;

-- Allow holding as a vertical scope for the holding entity
ALTER TABLE rarecrest.entities DROP CONSTRAINT IF EXISTS entities_vertical_check;
ALTER TABLE rarecrest.entities ADD CONSTRAINT entities_vertical_check
  CHECK (vertical IN ('rarestorm', 'rareangels', 'rareedge', 'hopecoin', 'healkids', 'holding'));

CREATE TABLE IF NOT EXISTS rarecrest.attention_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  flag_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message TEXT NOT NULL,
  link_path VARCHAR(500),
  resolved_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attention_flags_entity ON rarecrest.attention_flags (entity_id) WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS rarecrest.entity_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  to_entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  relationship_type VARCHAR(100) NOT NULL,
  direction VARCHAR(20) NOT NULL DEFAULT 'directed',
  constraint_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_entity_relationships_from ON rarecrest.entity_relationships (from_entity_id) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON rarecrest.attention_flags TO rarecrest_api;
GRANT SELECT, INSERT, UPDATE ON rarecrest.entity_relationships TO rarecrest_api;
