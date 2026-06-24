-- Phase 8: task operator fields (difficulty, status, max steps, start url)
ALTER TABLE catalog.tasks
  ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'enabled',
  ADD COLUMN IF NOT EXISTS max_steps INTEGER NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS start_url TEXT NOT NULL DEFAULT '';
