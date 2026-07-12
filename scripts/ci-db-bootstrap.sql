-- Minimal bootstrap for CI integration (postgres service container)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS rarecrest;

CREATE TABLE IF NOT EXISTS rarecrest.schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checksum VARCHAR(64) NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rarecrest_api') THEN
    CREATE ROLE rarecrest_api WITH LOGIN PASSWORD 'rarecrest_api_dev';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rarecrest_governance') THEN
    CREATE ROLE rarecrest_governance WITH LOGIN PASSWORD 'rarecrest_governance_dev';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rarecrest_intelligence') THEN
    CREATE ROLE rarecrest_intelligence WITH LOGIN PASSWORD 'rarecrest_intelligence_dev';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE rarecrest TO rarecrest_api;
GRANT CONNECT ON DATABASE rarecrest TO rarecrest_governance;
GRANT CONNECT ON DATABASE rarecrest TO rarecrest_intelligence;
GRANT USAGE ON SCHEMA rarecrest TO rarecrest_api;
GRANT USAGE ON SCHEMA rarecrest TO rarecrest_governance;
GRANT USAGE ON SCHEMA rarecrest TO rarecrest_intelligence;
GRANT SELECT, INSERT ON rarecrest.schema_migrations TO rarecrest_api;
GRANT SELECT, INSERT ON rarecrest.schema_migrations TO rarecrest_governance;
GRANT SELECT, INSERT ON rarecrest.schema_migrations TO rarecrest_intelligence;
