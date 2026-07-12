-- Federated Canon Wiki (Plan A)

CREATE TABLE IF NOT EXISTS rarecrest.wiki_raw_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace VARCHAR(255) NOT NULL,
  vertical VARCHAR(50) NOT NULL,
  entity_id UUID REFERENCES rarecrest.entities(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_kind VARCHAR(40) NOT NULL DEFAULT 'document'
    CHECK (source_kind IN ('document', 'web', 'decision_trace', 'structured_doc', 'autoresearch', 'export')),
  sensitivity VARCHAR(20) NOT NULL DEFAULT 'internal'
    CHECK (sensitivity IN ('public', 'internal', 'phi_ref', 'financial')),
  content_hash TEXT NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (namespace, content_hash)
);

CREATE TABLE IF NOT EXISTS rarecrest.wiki_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace VARCHAR(255) NOT NULL,
  vertical VARCHAR(50) NOT NULL,
  entity_id UUID REFERENCES rarecrest.entities(id),
  slug VARCHAR(255) NOT NULL,
  title TEXT NOT NULL,
  page_type VARCHAR(40) NOT NULL
    CHECK (page_type IN ('source', 'entity', 'concept', 'decision', 'stakeholder', 'competitor', 'bridge', 'index', 'log', 'hot', 'answer', 'overview')),
  body TEXT NOT NULL,
  frontmatter JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'canon', 'superseded', 'archived')),
  sensitivity VARCHAR(20) NOT NULL DEFAULT 'internal'
    CHECK (sensitivity IN ('public', 'internal', 'phi_ref', 'financial')),
  lock_holder VARCHAR(255),
  lock_until TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1,
  created_by VARCHAR(255) NOT NULL,
  updated_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (namespace, slug)
);

CREATE TABLE IF NOT EXISTS rarecrest.wiki_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace VARCHAR(255) NOT NULL,
  from_page_id UUID NOT NULL REFERENCES rarecrest.wiki_pages(id) ON DELETE CASCADE,
  to_slug VARCHAR(255) NOT NULL,
  to_page_id UUID REFERENCES rarecrest.wiki_pages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (from_page_id, to_slug)
);

CREATE TABLE IF NOT EXISTS rarecrest.wiki_ingest_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace VARCHAR(255) NOT NULL,
  vertical VARCHAR(50) NOT NULL,
  raw_source_id UUID REFERENCES rarecrest.wiki_raw_sources(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  pages_touched INT NOT NULL DEFAULT 0,
  summary TEXT,
  error TEXT,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rarecrest.wiki_lint_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace VARCHAR(255) NOT NULL,
  vertical VARCHAR(50) NOT NULL,
  findings JSONB NOT NULL DEFAULT '[]',
  score INT NOT NULL DEFAULT 100,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rarecrest.wiki_hot_cache (
  namespace VARCHAR(255) PRIMARY KEY,
  vertical VARCHAR(50) NOT NULL,
  body TEXT NOT NULL,
  updated_by VARCHAR(255) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rarecrest.wiki_log_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace VARCHAR(255) NOT NULL,
  vertical VARCHAR(50) NOT NULL,
  action VARCHAR(40) NOT NULL,
  detail TEXT NOT NULL,
  actor_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rarecrest.wiki_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES rarecrest.wiki_pages(id),
  from_status VARCHAR(20) NOT NULL,
  to_status VARCHAR(20) NOT NULL,
  first_approver_id VARCHAR(255) NOT NULL,
  second_approver_id VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending_second'
    CHECK (status IN ('pending_second', 'committed', 'rejected')),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rarecrest.wiki_contradictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace VARCHAR(255) NOT NULL,
  page_a_id UUID NOT NULL REFERENCES rarecrest.wiki_pages(id) ON DELETE CASCADE,
  page_b_id UUID NOT NULL REFERENCES rarecrest.wiki_pages(id) ON DELETE CASCADE,
  claim_a TEXT NOT NULL,
  claim_b TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'accepted_tension')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (page_a_id, page_b_id, claim_a, claim_b)
);

CREATE INDEX idx_wiki_pages_ns_type ON rarecrest.wiki_pages (namespace, page_type, status);
CREATE INDEX idx_wiki_pages_vertical ON rarecrest.wiki_pages (vertical, updated_at DESC);
CREATE INDEX idx_wiki_links_to ON rarecrest.wiki_links (namespace, to_slug);
CREATE INDEX idx_wiki_raw_ns ON rarecrest.wiki_raw_sources (namespace, created_at DESC);
CREATE INDEX idx_wiki_log_ns ON rarecrest.wiki_log_entries (namespace, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON rarecrest.wiki_raw_sources TO rarecrest_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON rarecrest.wiki_pages TO rarecrest_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON rarecrest.wiki_links TO rarecrest_api;
GRANT SELECT, INSERT, UPDATE ON rarecrest.wiki_ingest_jobs TO rarecrest_api;
GRANT SELECT, INSERT ON rarecrest.wiki_lint_reports TO rarecrest_api;
GRANT SELECT, INSERT, UPDATE ON rarecrest.wiki_hot_cache TO rarecrest_api;
GRANT SELECT, INSERT ON rarecrest.wiki_log_entries TO rarecrest_api;
GRANT SELECT, INSERT, UPDATE ON rarecrest.wiki_promotions TO rarecrest_api;
GRANT SELECT, INSERT, UPDATE ON rarecrest.wiki_contradictions TO rarecrest_api;
