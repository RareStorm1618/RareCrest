-- WO-35: Regulatory profile audit trail + nullable entity type for incomplete profiles

ALTER TABLE rarecrest.entities DROP CONSTRAINT IF EXISTS entities_entity_type_check;
ALTER TABLE rarecrest.entities ALTER COLUMN entity_type DROP DEFAULT;
ALTER TABLE rarecrest.entities ALTER COLUMN entity_type DROP NOT NULL;
ALTER TABLE rarecrest.entities ADD CONSTRAINT entities_entity_type_check
  CHECK (entity_type IS NULL OR entity_type IN (
    'nonprofit', 'for_profit_platform', 'fund', 'token_protocol', 'holding'
  ));

CREATE TABLE IF NOT EXISTS rarecrest.regulatory_regime_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  action VARCHAR(20) NOT NULL CHECK (action IN ('add', 'remove', 'set_type', 'reset_defaults')),
  regime VARCHAR(100),
  actor_id VARCHAR(255) NOT NULL,
  prior_regimes JSONB NOT NULL,
  new_regimes JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_regulatory_regime_changes_entity
  ON rarecrest.regulatory_regime_changes (entity_id, created_at DESC);

GRANT SELECT, INSERT ON rarecrest.regulatory_regime_changes TO rarecrest_api;
