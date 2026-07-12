-- S4 Autopilot levels + shadow officer passports.
-- Autopilot is an entity autonomy ceiling (never money/PHI/irreversible execution).
-- Shadow assignments draft/vote but cannot seal, kill-switch, activate, or execute finance.

ALTER TABLE rarecrest.entities
  ADD COLUMN IF NOT EXISTS autopilot_level VARCHAR(20) NOT NULL DEFAULT 'off'
    CHECK (autopilot_level IN ('off', 'observe', 'draft', 'propose')),
  ADD COLUMN IF NOT EXISTS autopilot_set_by VARCHAR(255),
  ADD COLUMN IF NOT EXISTS autopilot_set_at TIMESTAMPTZ;

ALTER TABLE rarecrest.officer_assignments
  ADD COLUMN IF NOT EXISTS assignment_mode VARCHAR(10) NOT NULL DEFAULT 'live'
    CHECK (assignment_mode IN ('live', 'shadow'));

CREATE INDEX IF NOT EXISTS idx_entities_autopilot
  ON rarecrest.entities (autopilot_level)
  WHERE deleted_at IS NULL;
