-- Command Center + wiki performance indexes (WO perf pass)

-- Deduplicate director_sessions before adding a unique constraint on director_id,
-- keeping the most recently engaged row per director. No-op on a clean table.
DELETE FROM rarecrest.director_sessions
WHERE id NOT IN (
  SELECT DISTINCT ON (director_id) id FROM rarecrest.director_sessions
  ORDER BY director_id, last_engaged_at DESC
);

-- One row per director for session tracking (enables ON CONFLICT (director_id) upserts)
CREATE UNIQUE INDEX IF NOT EXISTS idx_director_sessions_director_unique
  ON rarecrest.director_sessions (director_id);

CREATE INDEX IF NOT EXISTS idx_director_sessions_engaged
  ON rarecrest.director_sessions (director_id, last_engaged_at DESC);

CREATE INDEX IF NOT EXISTS idx_wiki_lint_ns_score
  ON rarecrest.wiki_lint_reports (namespace, score, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wiki_promotions_status
  ON rarecrest.wiki_promotions (status) WHERE status = 'pending_second';

CREATE INDEX IF NOT EXISTS idx_wiki_contradictions_open
  ON rarecrest.wiki_contradictions (status) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_attention_flags_open
  ON rarecrest.attention_flags (entity_id, created_at DESC) WHERE resolved_at IS NULL;
