-- WO-46/47: Vendor shortcut inventory and destination mapping

CREATE TABLE IF NOT EXISTS rarecrest.vendor_shortcut_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  system_id VARCHAR(255) NOT NULL,
  system_type VARCHAR(50) NOT NULL,
  record_count INTEGER NOT NULL CHECK (record_count >= 0),
  exportable BOOLEAN NOT NULL DEFAULT FALSE,
  data_freshness_hours INTEGER NOT NULL CHECK (data_freshness_hours >= 0),
  daily_change_rate_pct NUMERIC(6,2) NOT NULL CHECK (daily_change_rate_pct >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rarecrest.vendor_shortcut_destination_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  readiness_score NUMERIC(5,2) NOT NULL CHECK (readiness_score >= 0 AND readiness_score <= 100),
  mapping JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vendor_shortcut_inventory_entity
  ON rarecrest.vendor_shortcut_inventory (entity_id, created_at DESC);

CREATE INDEX idx_vendor_shortcut_maps_entity
  ON rarecrest.vendor_shortcut_destination_maps (entity_id, created_at DESC);

GRANT SELECT, INSERT ON rarecrest.vendor_shortcut_inventory TO rarecrest_api;
GRANT SELECT, INSERT ON rarecrest.vendor_shortcut_destination_maps TO rarecrest_api;
