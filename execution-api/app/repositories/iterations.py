import json

from app.db import connect


class PostgresIterationRepository:
    def batch_counts(self, batch_id: str) -> dict[str, int]:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT iterations.status, count(*)::int
                    FROM execution.iterations
                    JOIN execution.executions ON executions.id = iterations.execution_id
                    WHERE executions.batch_id = %s
                    GROUP BY iterations.status
                    """,
                    (batch_id,),
                )
                counts = {"total": 0}
                for status, count in cursor.fetchall():
                    counts[status] = count
                    counts["total"] += count
                return counts

    def get_iteration(self, iteration_id: str) -> dict:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT iterations.id::text, executions.id::text, executions.batch_id::text, iterations.status,
                           iterations.cancel_requested,
                           gyms.base_url, executions.snapshot_prompt, executions.snapshot_task_id,
                           executions.snapshot_grader_config, executions.snapshot_simulator_config,
                           executions.snapshot_db_json_validator, executions.snapshot_verifier_path,
                           executions.snapshot_verification_strategy,
                           models.id::text, models.provider_id::text, COALESCE(providers.key, providers.name, ''),
                           providers.adapter_key, models.model_name, models.display_name,
                           models.capabilities, models.config, models.cost_config, models.timeout_seconds,
                           models.max_output_tokens, providers.secret_ref
                    FROM execution.iterations
                    JOIN execution.executions ON executions.id = iterations.execution_id
                    JOIN catalog.gyms ON gyms.id = executions.gym_id
                    JOIN catalog.model_definitions models ON models.id = executions.model_id
                    JOIN catalog.model_providers providers ON providers.id = models.provider_id
                    WHERE iterations.id = %s
                    """,
                    (iteration_id,),
                )
                row = cursor.fetchone()
                if row is None:
                    return {"id": iteration_id, "batch_id": "", "status": "not_found"}
                return {
                    "id": row[0],
                    "execution_id": row[1],
                    "batch_id": row[2],
                    "status": row[3],
                    "cancel_requested": row[4],
                    "gym_base_url": row[5],
                    "snapshot_prompt": row[6],
                    "snapshot_task_id": row[7],
                    "snapshot_grader_config": row[8] or {},
                    "snapshot_simulator_config": row[9] or {},
                    "snapshot_db_json_validator": row[10] or {},
                    "snapshot_verifier_path": row[11] or "",
                    "snapshot_verification_strategy": row[12] or "verification_endpoint",
                    "model_config": {
                        "id": row[13],
                        "provider_id": row[14],
                        "provider_key": row[15],
                        "adapter_key": row[16],
                        "model_name": row[17],
                        "display_name": row[18],
                        "capabilities": row[19] or {},
                        "config": row[20] or {},
                        "cost_config": row[21] or {},
                        "timeout_seconds": row[22],
                        "max_output_tokens": row[23],
                        "secret_ref": row[24],
                    },
                }

    def claim_iteration(self, iteration_id: str, worker_id: str, lease_seconds: int) -> dict | None:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE execution.iterations
                    SET status = 'executing',
                        sub_status = 'running',
                        worker_id = %s,
                        heartbeat_at = now(),
                        lease_expires_at = now() + (%s || ' seconds')::interval,
                        started_at = COALESCE(started_at, now())
                    FROM execution.executions
                    WHERE iterations.execution_id = executions.id
                      AND iterations.id = %s
                      AND iterations.status IN ('pending', 'retrying')
                      AND iterations.cancel_requested = false
                    RETURNING iterations.id::text, executions.id::text, executions.batch_id::text, iterations.attempt
                    """,
                    (worker_id, lease_seconds, iteration_id),
                )
                row = cursor.fetchone()
                if row is None:
                    return None
                return {"id": row[0], "execution_id": row[1], "batch_id": row[2], "attempt": row[3]}

    def heartbeat(self, iteration_id: str, worker_id: str, lease_seconds: int) -> bool:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE execution.iterations
                    SET heartbeat_at = now(),
                        lease_expires_at = now() + (%s || ' seconds')::interval
                    WHERE id = %s
                      AND worker_id = %s
                      AND status = 'executing'
                    RETURNING true
                    """,
                    (lease_seconds, iteration_id, worker_id),
                )
                row = cursor.fetchone()
                return bool(row and row[0])

    def complete_iteration(
        self,
        iteration_id: str,
        worker_id: str,
        status: str,
        result_data: dict,
        verification_details: dict,
        verification_comments: str,
        total_steps: int,
    ) -> dict:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE execution.iterations
                    SET status = %s,
                        sub_status = '',
                        completed_at = now(),
                        lease_expires_at = NULL,
                        result_data = %s::jsonb,
                        verification_details = %s::jsonb,
                        verification_comments = %s,
                        total_steps = %s
                    WHERE id = %s
                      AND worker_id = %s
                    RETURNING id::text, status
                    """,
                    (
                        status,
                        json.dumps(result_data),
                        json.dumps(verification_details),
                        verification_comments,
                        total_steps,
                        iteration_id,
                        worker_id,
                    ),
                )
                row = cursor.fetchone()
                if row is None:
                    return {"id": iteration_id, "status": "not_found"}
                return {"id": row[0], "status": row[1]}

    def set_timeline_artifact(self, iteration_id: str, artifact_id: str) -> None:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE execution.iterations
                    SET timeline_artifact_id = %s
                    WHERE id = %s
                    """,
                    (artifact_id, iteration_id),
                )

    def record_token_usage(self, iteration_id: str, usage: dict) -> dict:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO execution.token_usage (
                        iteration_id, execution_id, batch_id, gym_id, task_id, model_id,
                        provider, model_name, gym_name, task_name,
                        input_tokens, output_tokens, cost_usd
                    )
                    SELECT iterations.id, executions.id, executions.batch_id, executions.gym_id, executions.task_id, executions.model_id,
                           COALESCE(providers.name, ''), COALESCE(models.display_name, models.model_name, ''),
                           COALESCE(gyms.name, ''), COALESCE(tasks.task_id, ''),
                           %s, %s, %s
                    FROM execution.iterations
                    JOIN execution.executions ON executions.id = iterations.execution_id
                    JOIN catalog.model_definitions models ON models.id = executions.model_id
                    LEFT JOIN catalog.model_providers providers ON providers.id = models.provider_id
                    JOIN catalog.gyms ON gyms.id = executions.gym_id
                    LEFT JOIN catalog.tasks ON tasks.id = executions.task_id
                    WHERE iterations.id = %s
                    RETURNING id::text, input_tokens, output_tokens, cost_usd::float8
                    """,
                    (
                        int(usage.get("input_tokens", usage.get("inputTokens", 0)) or 0),
                        int(usage.get("output_tokens", usage.get("outputTokens", 0)) or 0),
                        float(usage.get("cost_usd", usage.get("costUsd", 0)) or 0),
                        iteration_id,
                    ),
                )
                row = cursor.fetchone()
                if row is None:
                    raise KeyError(iteration_id)
                return {"id": row[0], "input_tokens": row[1], "output_tokens": row[2], "cost_usd": row[3]}

    def recover_expired_leases(self, max_attempts: int) -> list[dict]:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE execution.iterations
                    SET status = CASE WHEN attempt < %s THEN 'retrying' ELSE 'crashed' END,
                        sub_status = 'lease_expired',
                        failure_context = 'worker lease expired',
                        attempt = attempt + 1,
                        worker_id = '',
                        heartbeat_at = NULL,
                        lease_expires_at = NULL
                    FROM execution.executions
                    WHERE iterations.execution_id = executions.id
                      AND iterations.status = 'executing'
                      AND iterations.lease_expires_at < now()
                    RETURNING iterations.id::text, executions.id::text, executions.batch_id::text, iterations.status
                    """,
                    (max_attempts,),
                )
                return [
                    {"id": row[0], "execution_id": row[1], "batch_id": row[2], "status": row[3]}
                    for row in cursor.fetchall()
                ]

    def list_dispatchable_iterations(self, batch_id: str) -> list[dict]:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT iterations.id::text, executions.id::text, executions.batch_id::text
                    FROM execution.iterations
                    JOIN execution.executions ON executions.id = iterations.execution_id
                    WHERE executions.batch_id = %s
                      AND iterations.status IN ('pending', 'retrying')
                      AND COALESCE(iterations.cancel_requested, false) = false
                      AND COALESCE(iterations.celery_task_id, '') = ''
                    ORDER BY executions.created_at, iterations.iteration_number
                    """,
                    (batch_id,),
                )
                return [{"id": row[0], "execution_id": row[1], "batch_id": row[2]} for row in cursor.fetchall()]

    def mark_enqueued(self, iteration_id: str, celery_task_id: str) -> None:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE execution.iterations
                    SET celery_task_id = %s,
                        sub_status = 'queued'
                    WHERE id = %s
                    """,
                    (celery_task_id, iteration_id),
                )

    def mark_cancelled(self, iteration_id: str) -> dict:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE execution.iterations
                    SET cancel_requested = true,
                        cancelled_at = now(),
                        status = CASE
                            WHEN status IN ('pending', 'retrying') THEN 'cancelled'
                            ELSE status
                        END,
                        sub_status = 'cancel_requested'
                    WHERE id = %s
                    RETURNING id::text, status
                    """,
                    (iteration_id,),
                )
                row = cursor.fetchone()
                if row is None:
                    return {"id": iteration_id, "status": "not_found"}
                return {"id": row[0], "status": row[1]}
