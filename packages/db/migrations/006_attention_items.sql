-- WO-36: Attention items, open decisions, conflicts, unverified claims

ALTER TABLE rarecrest.attention_flags
  ADD COLUMN IF NOT EXISTS signal_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS source_ref VARCHAR(255);

CREATE TABLE IF NOT EXISTS rarecrest.open_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved')),
  resolution_note TEXT,
  attention_flag_id UUID REFERENCES rarecrest.attention_flags(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rarecrest.documented_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  summary TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'unresolved'
    CHECK (status IN ('unresolved', 'resolved')),
  attention_flag_id UUID REFERENCES rarecrest.attention_flags(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rarecrest.unverified_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  claim_type VARCHAR(100) NOT NULL,
  claim_text TEXT NOT NULL,
  detected_by VARCHAR(100) NOT NULL DEFAULT 'legal_compliance',
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  attention_flag_id UUID REFERENCES rarecrest.attention_flags(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_open_decisions_entity ON rarecrest.open_decisions (entity_id) WHERE status = 'open';
CREATE INDEX idx_documented_conflicts_entity ON rarecrest.documented_conflicts (entity_id) WHERE status = 'unresolved';
CREATE INDEX idx_unverified_claims_entity ON rarecrest.unverified_claims (entity_id) WHERE verified = FALSE;

GRANT SELECT, INSERT, UPDATE ON rarecrest.open_decisions TO rarecrest_api;
GRANT SELECT, INSERT, UPDATE ON rarecrest.documented_conflicts TO rarecrest_api;
GRANT SELECT, INSERT, UPDATE ON rarecrest.unverified_claims TO rarecrest_api;
