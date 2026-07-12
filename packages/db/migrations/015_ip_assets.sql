-- WO-62/63: IP asset registry and reconciliation support

CREATE TABLE IF NOT EXISTS rarecrest.ip_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  asset_type VARCHAR(30) NOT NULL CHECK (asset_type IN ('patent', 'trademark', 'copyright', 'trade_secret', 'dataset', 'model')),
  title TEXT NOT NULL,
  jurisdiction VARCHAR(20) NOT NULL,
  filing_date TIMESTAMPTZ NOT NULL,
  registration_number VARCHAR(255),
  owner_id VARCHAR(255) NOT NULL,
  beneficial_owner_id VARCHAR(255),
  chain_fingerprint TEXT NOT NULL,
  lifecycle_status VARCHAR(30) NOT NULL CHECK (lifecycle_status IN ('active', 'pending_verification', 'disputed', 'expired')),
  title_valid BOOLEAN NOT NULL DEFAULT FALSE,
  title_gaps JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ip_assets_entity_status
  ON rarecrest.ip_assets (entity_id, lifecycle_status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON rarecrest.ip_assets TO rarecrest_api;
