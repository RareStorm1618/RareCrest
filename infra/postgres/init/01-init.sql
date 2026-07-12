-- RareCrest PostgreSQL initialization
-- WO-1: Provision managed PostgreSQL with scoped service credentials

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create scoped service roles (WO-1: per-service credentials)
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

-- Grant connect
GRANT CONNECT ON DATABASE rarecrest TO rarecrest_api;
GRANT CONNECT ON DATABASE rarecrest TO rarecrest_governance;
GRANT CONNECT ON DATABASE rarecrest TO rarecrest_intelligence;

-- Schema for application tables (WO-2 will expand)
CREATE SCHEMA IF NOT EXISTS rarecrest;
GRANT USAGE, CREATE ON SCHEMA rarecrest TO rarecrest_api;
GRANT USAGE ON SCHEMA rarecrest TO rarecrest_governance;
GRANT USAGE ON SCHEMA rarecrest TO rarecrest_intelligence;

-- Migration tracking table
CREATE TABLE IF NOT EXISTS rarecrest.schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checksum VARCHAR(64) NOT NULL
);

GRANT SELECT, INSERT ON rarecrest.schema_migrations TO rarecrest_api;
GRANT SELECT, INSERT ON rarecrest.schema_migrations TO rarecrest_governance;
GRANT SELECT, INSERT ON rarecrest.schema_migrations TO rarecrest_intelligence;

-- Allow API role to apply migrations and own app tables
ALTER DEFAULT PRIVILEGES IN SCHEMA rarecrest
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES TO rarecrest_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA rarecrest
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO rarecrest_api;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA rarecrest TO rarecrest_api;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA rarecrest TO rarecrest_api;

-- Revoke public access (internal-only)
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
