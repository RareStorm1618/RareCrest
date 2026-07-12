-- Wave 3: Postgres-backed rate limits, async jobs, and decision-trace hash chain

CREATE TABLE IF NOT EXISTS rarecrest.api_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  count INT NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS rarecrest.async_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  actor_id VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','ready','failed')),
  payload JSONB NOT NULL DEFAULT '{}',
  result_json JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_async_jobs_actor ON rarecrest.async_jobs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_async_jobs_entity ON rarecrest.async_jobs (entity_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON rarecrest.api_rate_limits TO rarecrest_api;
GRANT SELECT, INSERT, UPDATE ON rarecrest.async_jobs TO rarecrest_api;

-- decision_traces hash chain (append-only table stays append-only; these columns are
-- populated at INSERT time only, never mutated afterward).
ALTER TABLE rarecrest.decision_traces
  ADD COLUMN IF NOT EXISTS prev_hash TEXT,
  ADD COLUMN IF NOT EXISTS content_hash TEXT;
