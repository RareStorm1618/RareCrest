-- Trust wave 3: KMS-wrapped DEKs + session/token revocation denylist

ALTER TABLE rarecrest.phi_envelopes
  ADD COLUMN IF NOT EXISTS wrapped_dek TEXT,
  ADD COLUMN IF NOT EXISTS wrap_nonce TEXT,
  ADD COLUMN IF NOT EXISTS wrap_key_id VARCHAR(64);

CREATE TABLE IF NOT EXISTS rarecrest.token_revocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jti VARCHAR(255),
  subject VARCHAR(255) NOT NULL,
  revoked_by VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT token_revocations_target CHECK (jti IS NOT NULL OR subject IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_token_revocations_jti
  ON rarecrest.token_revocations (jti)
  WHERE jti IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_token_revocations_subject
  ON rarecrest.token_revocations (subject, created_at DESC);

CREATE TABLE IF NOT EXISTS rarecrest.financial_commit_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES rarecrest.human_review_queue(id),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  human_instruction_id VARCHAR(255) NOT NULL,
  first_approver_id VARCHAR(255) NOT NULL,
  second_approver_id VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending_second'
    CHECK (status IN ('pending_second', 'committed', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_financial_commit_review
  ON rarecrest.financial_commit_approvals (review_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON rarecrest.phi_envelopes TO rarecrest_api;
GRANT SELECT, INSERT ON rarecrest.token_revocations TO rarecrest_api;
GRANT SELECT, INSERT, UPDATE ON rarecrest.financial_commit_approvals TO rarecrest_api;
