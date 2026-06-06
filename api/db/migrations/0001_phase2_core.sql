CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS execution;
CREATE SCHEMA IF NOT EXISTS studio;
CREATE SCHEMA IF NOT EXISTS artifacts;
CREATE SCHEMA IF NOT EXISTS reports;

CREATE TABLE IF NOT EXISTS auth.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  role_id UUID NOT NULL REFERENCES auth.roles(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_whitelisted BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL UNIQUE,
  is_allowed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS auth.role_permissions (
  role_id UUID NOT NULL REFERENCES auth.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES auth.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS catalog.gyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  verification_strategy TEXT NOT NULL DEFAULT 'verification_endpoint',
  flow_count INTEGER NOT NULL DEFAULT 0,
  similarity_enabled BOOLEAN NOT NULL DEFAULT false,
  similarity_threshold NUMERIC(5,4) NOT NULL DEFAULT 0.8500,
  next_task_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gyms_verification_strategy_check CHECK (
    verification_strategy IN (
      'verification_endpoint',
      'run_id_assertions',
      'local_storage_assertions',
      'grader_config',
      'verifier_api_script',
      'db_json_validator'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS gyms_name_unique_idx ON catalog.gyms (lower(name));

CREATE TABLE IF NOT EXISTS catalog.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES catalog.gyms(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  grader_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  simulator_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  db_json_validator JSONB NOT NULL DEFAULT '{}'::jsonb,
  verifier_path TEXT NOT NULL DEFAULT '',
  import_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  export_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gym_id, task_id)
);

CREATE TABLE IF NOT EXISTS catalog.model_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  adapter_key TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog.model_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES catalog.model_providers(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  cost_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_id, model_name)
);

CREATE TABLE IF NOT EXISTS catalog.system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS execution.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  gym_id UUID NOT NULL REFERENCES catalog.gyms(id),
  created_by UUID REFERENCES auth.users(id),
  iteration_count INTEGER NOT NULL DEFAULT 1,
  rerun_enabled BOOLEAN NOT NULL DEFAULT true,
  notification_read BOOLEAN NOT NULL DEFAULT false,
  selected_task_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_model_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS execution.executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES execution.batches(id) ON DELETE CASCADE,
  gym_id UUID NOT NULL REFERENCES catalog.gyms(id),
  task_id UUID REFERENCES catalog.tasks(id),
  model_id UUID NOT NULL REFERENCES catalog.model_definitions(id),
  execution_type TEXT NOT NULL DEFAULT 'batch',
  artifact_scope TEXT NOT NULL DEFAULT '',
  playground_url TEXT NOT NULL DEFAULT '',
  snapshot_task_id TEXT NOT NULL,
  snapshot_prompt TEXT NOT NULL,
  snapshot_grader_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_simulator_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_db_json_validator JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_verifier_path TEXT NOT NULL DEFAULT '',
  snapshot_verification_strategy TEXT NOT NULL DEFAULT 'verification_endpoint',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS execution.iterations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES execution.executions(id) ON DELETE CASCADE,
  iteration_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sub_status TEXT NOT NULL DEFAULT '',
  failure_context TEXT NOT NULL DEFAULT '',
  attempt INTEGER NOT NULL DEFAULT 1,
  worker_id TEXT NOT NULL DEFAULT '',
  heartbeat_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  logs TEXT NOT NULL DEFAULT '',
  result_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification_comments TEXT NOT NULL DEFAULT '',
  total_steps INTEGER NOT NULL DEFAULT 0,
  last_model_response TEXT NOT NULL DEFAULT '',
  timeline_artifact_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (execution_id, iteration_number),
  CONSTRAINT iterations_status_check CHECK (
    status IN ('pending','retrying','executing','passed','failed','crashed','timeout','terminated','cancelled')
  )
);

CREATE TABLE IF NOT EXISTS execution.token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iteration_id UUID REFERENCES execution.iterations(id) ON DELETE SET NULL,
  model_id UUID REFERENCES catalog.model_definitions(id),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artifacts.artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  object_key TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports.report_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  generated_artifact_id UUID,
  requested_by UUID REFERENCES auth.users(id),
  error TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

INSERT INTO auth.roles (name, description)
VALUES
  ('admin', 'Full platform administrator'),
  ('reviewer', 'Review workflow user'),
  ('trainer', 'Training workflow user'),
  ('auditor', 'Audit workflow user')
ON CONFLICT (name) DO NOTHING;

INSERT INTO catalog.model_providers (name, adapter_key, enabled)
VALUES ('Local Provider', 'local', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO catalog.model_definitions (provider_id, model_name, display_name, capabilities, cost_config, enabled, is_default)
SELECT id, 'local-test-model', 'Local Test Model', '{"text": true}'::jsonb, '{}'::jsonb, true, true
FROM catalog.model_providers
WHERE adapter_key = 'local'
ON CONFLICT (provider_id, model_name) DO NOTHING;

CREATE INDEX IF NOT EXISTS tasks_gym_id_idx ON catalog.tasks (gym_id);
CREATE INDEX IF NOT EXISTS batches_gym_id_idx ON execution.batches (gym_id);
CREATE INDEX IF NOT EXISTS executions_batch_id_idx ON execution.executions (batch_id);
CREATE INDEX IF NOT EXISTS iterations_execution_id_idx ON execution.iterations (execution_id);

CREATE OR REPLACE FUNCTION execution.compute_execution_status(statuses TEXT[])
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN statuses IS NULL OR array_length(statuses, 1) IS NULL THEN 'pending'
    WHEN 'executing' = ANY(statuses) THEN 'executing'
    WHEN 'pending' = ANY(statuses) OR 'retrying' = ANY(statuses) THEN 'pending'
    WHEN 'crashed' = ANY(statuses) THEN 'crashed'
    WHEN 'timeout' = ANY(statuses) THEN 'timeout'
    WHEN 'terminated' = ANY(statuses) OR 'cancelled' = ANY(statuses) THEN 'terminated'
    WHEN 'failed' = ANY(statuses) THEN 'failed'
    ELSE 'passed'
  END
$$;

CREATE OR REPLACE FUNCTION execution.compute_batch_status(statuses TEXT[])
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN statuses IS NULL OR array_length(statuses, 1) IS NULL THEN 'pending'
    WHEN 'executing' = ANY(statuses) THEN 'executing'
    WHEN 'pending' = ANY(statuses) OR 'retrying' = ANY(statuses) THEN 'pending'
    WHEN 'crashed' = ANY(statuses) THEN 'crashed'
    WHEN 'timeout' = ANY(statuses) THEN 'failed'
    WHEN 'terminated' = ANY(statuses) OR 'cancelled' = ANY(statuses) THEN 'terminated'
    WHEN 'failed' = ANY(statuses) THEN 'failed'
    ELSE 'completed'
  END
$$;
