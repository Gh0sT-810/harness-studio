import json

from app.db import connect


def report_job_from_row(row) -> dict:
    payload = row[5]
    if isinstance(payload, (bytes, bytearray)):
        payload = json.loads(payload.decode())
    elif isinstance(payload, str):
        payload = json.loads(payload)
    elif payload is None:
        payload = {}
    return {
        "id": row[0],
        "jobType": row[1],
        "scopeType": row[2],
        "scopeId": row[3],
        "format": row[4],
        "payload": payload,
        "status": row[6],
        "error": row[7] or "",
        "generatedArtifactId": row[8] or "",
        "requestedBy": row[9] or "",
        "createdAt": str(row[10]),
        "startedAt": str(row[11]) if row[11] else "",
        "completedAt": str(row[12]) if row[12] else "",
    }


REPORT_JOB_COLUMNS = """
id::text, job_type, scope_type, scope_id, format, payload, status, error,
COALESCE(generated_artifact_id::text, ''), COALESCE(requested_by::text, ''),
created_at, started_at, completed_at
"""


class ReportJobRepository:
    def create(self, job_type: str, scope_type: str, scope_id: str, output_format: str, payload: dict, requested_by: str = "") -> dict:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    INSERT INTO reports.report_jobs (scope, job_type, scope_type, scope_id, format, payload, requested_by)
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb, NULLIF(%s, '')::uuid)
                    RETURNING {REPORT_JOB_COLUMNS}
                    """,
                    (f"{scope_type}/{scope_id}", job_type, scope_type, scope_id, output_format, json.dumps(payload), requested_by),
                )
                return report_job_from_row(cursor.fetchone())

    def get(self, job_id: str) -> dict:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT {REPORT_JOB_COLUMNS}
                    FROM reports.report_jobs
                    WHERE id = %s
                    """,
                    (job_id,),
                )
                row = cursor.fetchone()
                if row is None:
                    raise KeyError(job_id)
                return report_job_from_row(row)

    def latest_by_scope(self, scope_type: str, scope_id: str) -> dict:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT {REPORT_JOB_COLUMNS}
                    FROM reports.report_jobs
                    WHERE scope_type = %s AND scope_id = %s
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (scope_type, scope_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise KeyError(scope_id)
                return report_job_from_row(row)

    def mark_running(self, job_id: str) -> dict:
        return self._update(
            """
            UPDATE reports.report_jobs
            SET status = 'running',
                started_at = COALESCE(started_at, now()),
                error = ''
            WHERE id = %s
            RETURNING {columns}
            """,
            (job_id,),
        )

    def mark_completed(self, job_id: str, artifact_id: str, artifacts: dict | None = None) -> dict:
        payload_update = json.dumps({"artifacts": artifacts or {}})
        return self._update(
            """
            UPDATE reports.report_jobs
            SET status = 'completed',
                generated_artifact_id = %s,
                payload = payload || %s::jsonb,
                completed_at = now(),
                error = ''
            WHERE id = %s
            RETURNING {columns}
            """,
            (artifact_id, payload_update, job_id),
        )

    def mark_failed(self, job_id: str, error: str) -> dict:
        return self._update(
            """
            UPDATE reports.report_jobs
            SET status = 'failed',
                error = %s,
                completed_at = now()
            WHERE id = %s
            RETURNING {columns}
            """,
            (error, job_id),
        )

    def _update(self, sql: str, params: tuple) -> dict:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql.format(columns=REPORT_JOB_COLUMNS), params)
                row = cursor.fetchone()
                if row is None:
                    raise KeyError(params[-1])
                return report_job_from_row(row)
