"""Collect batch iteration records from the harness-studio database.

This is the harness-studio-specific data layer for the report. It maps
``execution.iterations`` (joined to executions, model registry and tasks) into
``IterationRecord`` objects that the shared summary/snapshot/workbook builders
consume, and enriches them with tool-call counts read from each iteration's
action-timeline artifact (best-effort).
"""

from __future__ import annotations

import json
import logging
from typing import Dict, List, Optional, Tuple

from app.artifacts import ArtifactClient, ArtifactClientError
from app.db import connect
from app.reports.models import IterationRecord
from app.settings import get_settings

logger = logging.getLogger(__name__)


_ITERATIONS_QUERY = """
SELECT
    i.id::text AS iteration_uuid,
    i.iteration_number,
    i.status,
    i.failure_context,
    i.verification_comments,
    i.total_steps,
    i.last_model_response,
    i.result_data,
    i.verification_details,
    i.timeline_artifact_id::text AS timeline_artifact_id,
    EXTRACT(EPOCH FROM (i.completed_at - i.started_at)) AS duration_seconds,
    i.started_at,
    i.completed_at,
    e.id::text AS execution_uuid,
    e.snapshot_task_id,
    e.snapshot_prompt,
    mp.key AS provider_key,
    md.model_name,
    md.display_name,
    t.prompt AS task_prompt
FROM execution.iterations i
JOIN execution.executions e ON e.id = i.execution_id
LEFT JOIN catalog.model_definitions md ON md.id = e.model_id
LEFT JOIN catalog.model_providers mp ON mp.id = md.provider_id
LEFT JOIN catalog.tasks t ON t.id = e.task_id
WHERE e.batch_id = %s
ORDER BY e.snapshot_task_id, i.iteration_number
"""

_BATCH_META_QUERY = """
SELECT id::text, name, iteration_count
FROM execution.batches
WHERE id = %s
"""


def _resolve_runner(provider_key: Optional[str], model_name: Optional[str], display_name: Optional[str]) -> str:
    """Map the model registry to a report runner key (anthropic/anthropic_opus/openai/gemini)."""
    key = (provider_key or "").strip().lower()
    name = f"{model_name or ''} {display_name or ''}".lower()
    if key == "anthropic":
        return "anthropic_opus" if "opus" in name else "anthropic"
    if key in ("openai", "gemini"):
        return key
    return key or "unknown"


def _as_dict(value) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, (bytes, bytearray)):
        try:
            return json.loads(value.decode())
        except Exception:
            return {}
    if isinstance(value, str) and value.strip():
        try:
            return json.loads(value)
        except Exception:
            return {}
    return {}


def _aggregate_timeline_tools(timeline: dict) -> Tuple[int, Dict[str, int], List[str]]:
    """Count tool calls from an action-timeline document.

    Each model action step (one with an ``action``) is one tool call, grouped by
    action name — the harness-studio analogue of the reference tool log.
    """
    steps = (timeline or {}).get("steps") or []
    counter: Dict[str, int] = {}
    for step in steps:
        if not isinstance(step, dict):
            continue
        action = step.get("action")
        if not action:
            continue
        counter[str(action)] = counter.get(str(action), 0) + 1
    total = sum(counter.values())
    unique = sorted(counter.keys())
    return total, counter, unique


class BatchReportReader:
    def __init__(self, artifact_client: Optional[ArtifactClient] = None):
        settings = get_settings()
        self.artifact_client = artifact_client or ArtifactClient(
            settings.artifact_service_base_url, settings.artifact_service_timeout_seconds
        )

    def load_batch_meta(self, batch_id: str) -> dict:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(_BATCH_META_QUERY, (batch_id,))
                row = cursor.fetchone()
                if row is None:
                    raise KeyError(batch_id)
                return {"id": row[0], "name": row[1], "iteration_count": int(row[2]) if row[2] is not None else None}

    def collect_records(self, batch_id: str) -> List[IterationRecord]:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(_ITERATIONS_QUERY, (batch_id,))
                rows = cursor.fetchall()
                columns = [desc[0] for desc in cursor.description]

        records: List[IterationRecord] = []
        for raw in rows:
            row = dict(zip(columns, raw))
            # Mirror the reference: only raw "crashed" iterations are dropped.
            if row.get("status") and str(row["status"]).upper() == "CRASHED":
                continue
            records.append(self._row_to_record(row))

        if not records:
            raise ValueError(f"No valid iteration records for batch {batch_id}")

        return records

    def _row_to_record(self, row: dict) -> IterationRecord:
        runner = _resolve_runner(row.get("provider_key"), row.get("model_name"), row.get("display_name"))
        result_data = _as_dict(row.get("result_data"))
        verification_details = _as_dict(row.get("verification_details"))

        model_response = (
            row.get("last_model_response")
            or result_data.get("modelResponse")
            or verification_details.get("modelResponse")
            or None
        )

        duration = row.get("duration_seconds")
        duration = float(duration) if duration is not None else None
        total_steps = row.get("total_steps")
        task_id = row.get("snapshot_task_id") or ""
        prompt = (row.get("snapshot_prompt") or row.get("task_prompt") or "") or None

        record = IterationRecord(
            task_id=task_id,
            iteration=row.get("iteration_number"),
            runner=runner,
            status=row.get("status") or "",
            status_reason=row.get("failure_context") or None,
            completion_reason=None,
            duration_seconds=duration,
            timelapse=None,
            file_timelapse_seconds=None,
            tool_calls_total=0,
            tool_calls_by_tool={},
            unique_tools=[],
            prompt=prompt,
            prompt_id=task_id,
            model=row.get("display_name") or row.get("model_name"),
            run_id=row.get("execution_uuid"),
            start_timestamp=str(row["started_at"]) if row.get("started_at") else None,
            end_timestamp=str(row["completed_at"]) if row.get("completed_at") else None,
            iteration_directory=None,
            execution_uuid=row.get("execution_uuid"),
            iteration_uuid=row.get("iteration_uuid"),
            verification_comments=row.get("verification_comments") or None,
            last_model_response=model_response,
            eval_insights=None,
            total_steps=int(total_steps) if total_steps is not None else None,
            extra={},
        )

        self._enrich_tool_calls(record, row.get("timeline_artifact_id"))
        return record

    def _enrich_tool_calls(self, record: IterationRecord, timeline_artifact_id: Optional[str]) -> None:
        if not timeline_artifact_id:
            return
        try:
            timeline = self.artifact_client.get_json(timeline_artifact_id)
        except ArtifactClientError as exc:
            logger.warning("Unable to read timeline artifact %s: %s", timeline_artifact_id, exc)
            return
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Unexpected error reading timeline artifact %s: %s", timeline_artifact_id, exc)
            return

        total, by_tool, unique = _aggregate_timeline_tools(timeline)
        record.tool_calls_total = total
        record.tool_calls_by_tool = by_tool
        record.unique_tools = unique
