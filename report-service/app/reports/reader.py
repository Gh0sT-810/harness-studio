from app.db import connect


class BatchReportReader:
    def load_batch_report(self, batch_id: str) -> dict:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT batches.id::text, batches.name
                    FROM execution.batches
                    WHERE batches.id = %s
                    """,
                    (batch_id,),
                )
                batch_row = cursor.fetchone()
                if batch_row is None:
                    raise KeyError(batch_id)
                cursor.execute(
                    """
                    SELECT iterations.status, COUNT(*)
                    FROM execution.iterations
                    JOIN execution.executions ON executions.id = iterations.execution_id
                    WHERE executions.batch_id = %s
                    GROUP BY iterations.status
                    """,
                    (batch_id,),
                )
                counts = {row[0]: int(row[1]) for row in cursor.fetchall()}
                total = sum(counts.values())
                passed = counts.get("passed", 0)
                cursor.execute(
                    """
                    SELECT executions.model_id::text, COUNT(*), COUNT(*) FILTER (WHERE iterations.status = 'passed')
                    FROM execution.executions
                    JOIN execution.iterations ON iterations.execution_id = executions.id
                    WHERE executions.batch_id = %s
                    GROUP BY executions.model_id
                    ORDER BY executions.model_id
                    """,
                    (batch_id,),
                )
                models = [
                    {"modelId": row[0], "runs": int(row[1]), "passed": int(row[2]), "passRate": (int(row[2]) / int(row[1]) if row[1] else 0)}
                    for row in cursor.fetchall()
                ]
                return {
                    "batch": {"id": batch_row[0], "name": batch_row[1]},
                    "summary": {
                        "total": total,
                        "passed": passed,
                        "failed": counts.get("failed", 0),
                        "passRate": passed / total if total else 0,
                    },
                    "models": models,
                    "tasks": [],
                }
