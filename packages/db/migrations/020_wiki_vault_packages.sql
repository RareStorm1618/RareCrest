-- Encrypted Obsidian vault packages (Private Canon Fortress)

CREATE TABLE IF NOT EXISTS rarecrest.wiki_vault_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace VARCHAR(255) NOT NULL,
  vertical VARCHAR(50) NOT NULL,
  actor_id VARCHAR(255) NOT NULL,
  content_sha256 TEXT NOT NULL,
  object_key TEXT NOT NULL,
  file_count INT NOT NULL DEFAULT 0,
  download_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ready'
    CHECK (status IN ('pending', 'ready', 'expired', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wiki_vault_packages_token
  ON rarecrest.wiki_vault_packages (download_token_hash);

CREATE INDEX IF NOT EXISTS idx_wiki_vault_packages_ns
  ON rarecrest.wiki_vault_packages (namespace, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON rarecrest.wiki_vault_packages TO rarecrest_api;

-- Async build jobs for large namespaces (poll until ready)
CREATE TABLE IF NOT EXISTS rarecrest.wiki_vault_package_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace VARCHAR(255) NOT NULL,
  vertical VARCHAR(50) NOT NULL,
  actor_id VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'ready', 'failed')),
  package_id UUID REFERENCES rarecrest.wiki_vault_packages(id),
  error TEXT,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wiki_vault_package_jobs_actor
  ON rarecrest.wiki_vault_package_jobs (actor_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON rarecrest.wiki_vault_package_jobs TO rarecrest_api;
