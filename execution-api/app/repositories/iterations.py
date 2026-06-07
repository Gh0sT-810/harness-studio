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
                           gyms.base_url, executions.snapshot_prompt, executions.snapshot_task_id
                    FROM execution.iterations
                    JOIN execution.executions ON executions.id = iterations.execution_id
                    JOIN catalog.gyms ON gyms.id = executions.gym_id
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
                    "gym_base_url": row[4],
                    "snapshot_prompt": row[5],
                    "snapshot_task_id": row[6],
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
