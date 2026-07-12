-- WO-33: Task Decomposition Matrix persistence

CREATE TABLE IF NOT EXISTS rarecrest.task_decomposition_matrices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES rarecrest.entities(id),
  function_name VARCHAR(200) NOT NULL,
  roles JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'complete')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_decomposition_entity ON rarecrest.task_decomposition_matrices (entity_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON rarecrest.task_decomposition_matrices TO rarecrest_api;
