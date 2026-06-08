ALTER TABLE catalog.model_providers
  ADD COLUMN IF NOT EXISTS key TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS base_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS secret_ref TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE catalog.model_providers
  DROP CONSTRAINT IF EXISTS model_providers_adapter_key_key;

UPDATE catalog.model_providers
SET key = COALESCE(NULLIF(key, ''), adapter_key),
    display_name = COALESCE(NULLIF(display_name, ''), name)
WHERE key IS NULL OR key = '' OR display_name IS NULL OR display_name = '';

ALTER TABLE catalog.model_providers
  ALTER COLUMN key SET NOT NULL,
  ALTER COLUMN display_name SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS model_providers_key_unique_idx ON catalog.model_providers (key);

ALTER TABLE catalog.model_definitions
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS timeout_seconds INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS max_output_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS model_definitions_enabled_idx ON catalog.model_definitions (enabled, is_default, display_name);
CREATE UNIQUE INDEX IF NOT EXISTS model_definitions_provider_default_idx
  ON catalog.model_definitions (provider_id)
  WHERE is_default = true AND enabled = true;

INSERT INTO catalog.model_providers (key, name, display_name, adapter_key, enabled, config)
VALUES
  ('openai', 'OpenAI', 'OpenAI', 'openai_responses_computer', false, '{"adapterKeys":["openai_responses_computer"]}'::jsonb),
  ('anthropic', 'Anthropic', 'Anthropic', 'anthropic_computer_use', false, '{"adapterKeys":["anthropic_computer_use"]}'::jsonb),
  ('gemini', 'Gemini', 'Gemini', 'gemini_computer_use', false, '{"adapterKeys":["gemini_computer_use"]}'::jsonb),
  ('text', 'Text', 'Text', 'text_only', true, '{"adapterKeys":["text_only","llm_grader","embedding"]}'::jsonb)
ON CONFLICT (key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    adapter_key = EXCLUDED.adapter_key,
    config = catalog.model_providers.config || EXCLUDED.config,
    updated_at = now();
