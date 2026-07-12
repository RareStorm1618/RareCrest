-- S3: Parliament + Seal — multi-officer, multi-stakeholder-lens deliberation
-- gate in front of wiki_promote / financial_release / activation / doctrine
-- actions, with an explicit human-sealed release (immediate or time-locked).

CREATE TABLE IF NOT EXISTS rarecrest.parliament_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  topic TEXT NOT NULL,
  stake_class VARCHAR(40) NOT NULL CHECK (stake_class IN ('wiki_promote','financial_release','activation','doctrine')),
  status VARCHAR(30) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','ready_for_seal','sealed','rejected','expired')),
  created_by VARCHAR(255) NOT NULL,
  red_team_nay BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rarecrest.parliament_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES rarecrest.parliament_sessions(id),
  officer_role VARCHAR(50) NOT NULL,
  agent_id VARCHAR(255) NOT NULL,
  vote VARCHAR(10) NOT NULL CHECK (vote IN ('aye','nay','abstain')),
  rationale TEXT NOT NULL DEFAULT '',
  stakeholder_lens VARCHAR(30) NOT NULL
    CHECK (stakeholder_lens IN ('lp','patient','regulator','engineering','fiduciary')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, agent_id, stakeholder_lens)
);

CREATE TABLE IF NOT EXISTS rarecrest.seals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES rarecrest.parliament_sessions(id),
  sealed_by VARCHAR(255) NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mode VARCHAR(20) NOT NULL CHECK (mode IN ('immediate','time_lock')),
  execute_after TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  human_instruction_id UUID,
  override_note TEXT,
  correlation_id VARCHAR(64),
  payload JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_parliament_sessions_entity
  ON rarecrest.parliament_sessions (entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_parliament_votes_session
  ON rarecrest.parliament_votes (session_id);

CREATE INDEX IF NOT EXISTS idx_seals_session
  ON rarecrest.seals (session_id);

CREATE INDEX IF NOT EXISTS idx_seals_due
  ON rarecrest.seals (execute_after)
  WHERE mode = 'time_lock' AND cancelled_at IS NULL AND executed_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON rarecrest.parliament_sessions TO rarecrest_api;
GRANT SELECT, INSERT, UPDATE ON rarecrest.parliament_votes TO rarecrest_api;
GRANT SELECT, INSERT, UPDATE ON rarecrest.seals TO rarecrest_api;
