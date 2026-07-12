-- WO-48/49: Capability registry + agency mapping

CREATE TABLE IF NOT EXISTS rarecrest.capability_registry_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  coverage_pct NUMERIC(5,2) NOT NULL CHECK (coverage_pct >= 0 AND coverage_pct <= 100),
  covered JSONB NOT NULL DEFAULT '[]',
  gaps JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rarecrest.capability_agency_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  map JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_capability_registry_entity
  ON rarecrest.capability_registry_snapshots (entity_id, created_at DESC);

CREATE INDEX idx_capability_agency_map_entity
  ON rarecrest.capability_agency_maps (entity_id, created_at DESC);

GRANT SELECT, INSERT ON rarecrest.capability_registry_snapshots TO rarecrest_api;
GRANT SELECT, INSERT ON rarecrest.capability_agency_maps TO rarecrest_api;
