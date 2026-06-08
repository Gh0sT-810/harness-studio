ALTER TABLE reports.report_jobs
  ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'batch_report',
  ADD COLUMN IF NOT EXISTS scope_type TEXT NOT NULL DEFAULT 'batch',
  ADD COLUMN IF NOT EXISTS scope_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'json',
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_report_jobs_scope ON reports.report_jobs (scope_type, scope_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_jobs_status ON reports.report_jobs (status, created_at DESC);

ALTER TABLE execution.token_usage
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES execution.batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS execution_id UUID REFERENCES execution.executions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gym_id UUID REFERENCES catalog.gyms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES catalog.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS model_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS gym_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS task_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED;

CREATE INDEX IF NOT EXISTS idx_token_usage_batch ON execution.token_usage (batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_model ON execution.token_usage (model_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_gym ON execution.token_usage (gym_id, created_at DESC);
