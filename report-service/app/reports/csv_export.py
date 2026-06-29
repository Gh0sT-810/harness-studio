"""Comprehensive per-iteration CSV export.

One row per iteration with every available detail (status, timing, steps, tool
calls, model response, verification comments, ids). Built directly from
``IterationRecord`` rather than the trimmed snapshot serialization so nothing is
lost.
"""

from __future__ import annotations

import csv
import io
import json
from typing import List

from app.reports.models import IterationRecord
from app.reports.snapshot import extract_record_model_response

CSV_FIELDNAMES = [
    "task_id",
    "prompt_id",
    "prompt",
    "runner",
    "runner_label",
    "iteration",
    "status",
    "status_reason",
    "completion_reason",
    "duration_seconds",
    "total_steps",
    "tool_calls_total",
    "tool_calls_by_tool",
    "unique_tools",
    "model_response",
    "verification_comments",
    "start_timestamp",
    "end_timestamp",
    "execution_uuid",
    "iteration_uuid",
]


def build_csv_bytes(records: List[IterationRecord]) -> bytes:
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_FIELDNAMES, extrasaction="ignore")
    writer.writeheader()
    for record in sorted(records, key=lambda r: (r.task_id or "", r.runner or "", r.iteration or 0)):
        writer.writerow({
            "task_id": record.task_id,
            "prompt_id": record.prompt_id,
            "prompt": record.prompt,
            "runner": record.runner,
            "runner_label": record.runner_label,
            "iteration": record.iteration,
            "status": record.status,
            "status_reason": record.status_reason,
            "completion_reason": record.completion_reason,
            "duration_seconds": record.duration_seconds,
            "total_steps": record.total_steps,
            "tool_calls_total": record.tool_calls_total,
            "tool_calls_by_tool": json.dumps(record.tool_calls_by_tool) if record.tool_calls_by_tool else "",
            "unique_tools": json.dumps(record.unique_tools) if record.unique_tools else "",
            "model_response": extract_record_model_response(record),
            "verification_comments": record.verification_comments or "",
            "start_timestamp": record.start_timestamp,
            "end_timestamp": record.end_timestamp,
            "execution_uuid": record.execution_uuid,
            "iteration_uuid": record.iteration_uuid,
        })
    return output.getvalue().encode()
