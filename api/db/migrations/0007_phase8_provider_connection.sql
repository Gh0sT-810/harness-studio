-- Phase 8: provider connection status (persisted result of the provider Test action)
ALTER TABLE catalog.model_providers
  ADD COLUMN IF NOT EXISTS connection_status TEXT NOT NULL DEFAULT 'untested',
  ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ;
