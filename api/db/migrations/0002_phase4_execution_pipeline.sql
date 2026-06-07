ALTER TABLE execution.iterations
  ADD COLUMN IF NOT EXISTS celery_task_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS iterations_celery_task_id_idx
  ON execution.iterations (celery_task_id)
  WHERE celery_task_id <> '';

CREATE INDEX IF NOT EXISTS iterations_dispatchable_idx
  ON execution.iterations (status, cancel_requested, celery_task_id)
  WHERE status IN ('pending', 'retrying');

CREATE INDEX IF NOT EXISTS iterations_expired_lease_idx
  ON execution.iterations (lease_expires_at)
  WHERE status = 'executing';
