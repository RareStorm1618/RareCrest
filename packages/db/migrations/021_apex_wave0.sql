-- Wave 0 security lockdown: tenancy-scope shared memory records

ALTER TABLE rarecrest.shared_memory_records
  ADD COLUMN IF NOT EXISTS vertical VARCHAR(50),
  ADD COLUMN IF NOT EXISTS actor_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_shared_memory_records_vertical
  ON rarecrest.shared_memory_records (vertical, created_at DESC);
