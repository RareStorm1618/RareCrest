-- Wave 1: continuous agent governance — durable human-instruction ledger
-- Financial/action releases must point to a live, non-revoked, non-expired
-- human instruction row (never a client-supplied opaque string alone).

CREATE TABLE IF NOT EXISTS rarecrest.human_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  vertical VARCHAR(50) NOT NULL,
  actor_id VARCHAR(255) NOT NULL,
  action_scope VARCHAR(100) NOT NULL,
  instruction TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_human_instructions_entity
  ON rarecrest.human_instructions (entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_human_instructions_live
  ON rarecrest.human_instructions (entity_id, expires_at)
  WHERE revoked_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON rarecrest.human_instructions TO rarecrest_api, rarecrest_governance;

-- kill_switch_events.action already allows 'disarm' (see 016_kill_switches.sql);
-- this guard keeps the check constraint correct even if 016 predates this file
-- in an environment that applied migrations out of order.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kill_switch_events_action_check'
  ) THEN
    ALTER TABLE rarecrest.kill_switch_events DROP CONSTRAINT kill_switch_events_action_check;
  END IF;
  ALTER TABLE rarecrest.kill_switch_events
    ADD CONSTRAINT kill_switch_events_action_check
    CHECK (action IN ('arm', 'trigger', 'disarm'));
END $$;
