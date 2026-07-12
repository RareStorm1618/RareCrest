-- Trust wave: agent-blind PHI vault (ciphertext only; no plaintext columns)

CREATE TABLE IF NOT EXISTS rarecrest.entity_encryption_layers (
  entity_id UUID PRIMARY KEY REFERENCES rarecrest.entities(id),
  key_id VARCHAR(64) NOT NULL,
  algorithm VARCHAR(32) NOT NULL DEFAULT 'aes-256-gcm',
  registered_by VARCHAR(255) NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS rarecrest.phi_envelopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  purpose VARCHAR(64) NOT NULL,
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  key_id VARCHAR(64) NOT NULL,
  aad_hash TEXT NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Agents may store/reference envelopes; decrypt is human-only and audited separately.
  agent_visible_ref BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS rarecrest.phi_decrypt_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id UUID NOT NULL REFERENCES rarecrest.phi_envelopes(id),
  actor_id VARCHAR(255) NOT NULL,
  actor_role VARCHAR(64),
  denied BOOLEAN NOT NULL DEFAULT FALSE,
  deny_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_phi_envelopes_entity ON rarecrest.phi_envelopes (entity_id, created_at DESC);
CREATE INDEX idx_phi_decrypt_audit_envelope ON rarecrest.phi_decrypt_audit (envelope_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON rarecrest.entity_encryption_layers TO rarecrest_api;
GRANT SELECT, INSERT ON rarecrest.phi_envelopes TO rarecrest_api;
GRANT SELECT, INSERT ON rarecrest.phi_decrypt_audit TO rarecrest_api;
