-- S2: Officer Passports — director-assigned officer roles scoped to a pre-shaped
-- rights template (see @rarecrest/contracts OFFICER_ROLE_TEMPLATES). Each active
-- assignment is backed by an issued agent_passports row.

CREATE TABLE IF NOT EXISTS rarecrest.officer_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  officer_role VARCHAR(50) NOT NULL,
  agent_id VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  issued_passport_id UUID REFERENCES rarecrest.agent_passports(id),
  assigned_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most one active assignment per (entity, role) at a time. Replacing an
-- officer deactivates the prior row before inserting the new one (see
-- officer-routes.ts#assignOfficer) rather than relying on this index alone,
-- but the partial unique index is the fail-closed backstop against races.
CREATE UNIQUE INDEX IF NOT EXISTS idx_officer_assignments_active
  ON rarecrest.officer_assignments (entity_id, officer_role) WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_officer_assignments_lookup
  ON rarecrest.officer_assignments (entity_id, agent_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON rarecrest.officer_assignments TO rarecrest_api;
