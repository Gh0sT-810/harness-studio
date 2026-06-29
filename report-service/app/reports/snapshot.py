"""JSON snapshot builder.

Produces the exact 6-key snapshot the reference harness emits:
``summary, summary_table, iterations, tasks, single_task_tables, filters``
(insertion order preserved; serialized with ``json.dumps(indent=2, default=str)``).
"""

from __future__ import annotations

from typing import Callable, Dict, List, Optional

from app.reports.models import IterationRecord, KNOWN_RUNNERS, MODEL_ORDER
from app.reports.summary import (
    aggregate_runner_stats,
    extract_record_status,
    format_seconds,
)


def _get_record_tool_usage_map(record: IterationRecord) -> Dict[str, int]:
    if record.tool_calls_by_tool:
        return {tool: int(count) for tool, count in record.tool_calls_by_tool.items()}
    usage = (record.extra or {}).get("tool_usage") or {}
    by_tool = usage.get("by_tool") or {}
    return {tool: int(count) for tool, count in by_tool.items()}


def extract_record_model_response(record: IterationRecord) -> str:
    """Model response for a record.

    harness-studio has no on-disk iteration directory, so this mirrors the
    reference's no-directory path: DB field first, then the standard fallbacks.
    """
    if record.last_model_response:
        return record.last_model_response
    if record.completion_reason:
        return record.completion_reason
    if record.status_reason:
        return record.status_reason
    extra = record.extra or {}
    if extra.get("status_reason"):
        return str(extra["status_reason"])
    if extra.get("error"):
        return str(extra["error"])
    return "No response captured."


def _format_iteration_details_simple(
    records: List[IterationRecord],
    value_getter: Callable[[IterationRecord], object],
) -> str:
    if not records:
        return ""

    parts: List[str] = []
    for record in records:
        value = value_getter(record)
        value_str = str(value).strip() if value else ""
        if value_str:
            parts.append(value_str)

    return "\n\n".join(parts) if parts else ""


def summarize_runner(runner_key: str, records: List[IterationRecord]) -> Dict[str, object]:
    label = dict(MODEL_ORDER).get(
        runner_key, KNOWN_RUNNERS.get(runner_key, runner_key.title())
    )
    records_sorted = sorted(records, key=lambda r: r.iteration)
    stats = aggregate_runner_stats(records_sorted)

    model_response = _format_iteration_details_simple(
        records_sorted, extract_record_model_response
    )
    pass_fail_text = ", ".join([extract_record_status(r) or "" for r in records_sorted]) if records_sorted else ""

    return {
        "runner_key": runner_key,
        "runner_label": label,
        "total_iterations": stats["total"],
        "pass_count": stats["pass_count"],
        "fail_count": stats["fail_count"],
        "crash_count": stats["crash_count"],
        "timeout_count": stats["timeout_count"],
        "tool_calls_total": stats["tool_calls_total"],
        "model_response": model_response,
        "pass_fail_text": pass_fail_text,
        "comments": "",
    }


def serialize_iteration(record: IterationRecord) -> Dict[str, object]:
    return {
        "task_id": record.task_id,
        "runner": record.runner_label,
        "runner_key": record.runner,
        "iteration": record.iteration,
        "status": record.status,
        "status_reason": record.status_reason,
        "completion_reason": record.completion_reason,
        "duration_seconds": record.duration_seconds,
        "timelapse": record.timelapse,
        "file_timelapse_seconds": record.file_timelapse_seconds,
        "tool_calls_total": record.tool_calls_total,
        "tool_calls_by_tool": record.tool_calls_by_tool,
        "unique_tools": record.unique_tools,
        "prompt": record.prompt,
        "prompt_id": record.prompt_id,
        "model": record.model,
        "run_id": record.run_id,
        "start_timestamp": record.start_timestamp,
        "end_timestamp": record.end_timestamp,
        "iteration_directory": record.iteration_directory,
        "extra": record.extra,
    }


def build_snapshot(
    summary_rows: List[Dict[str, object]],
    iterations: List[IterationRecord],
    task_rows: Dict[str, Dict[str, List[IterationRecord]]],
) -> Dict[str, object]:
    serialized_iterations = [serialize_iteration(record) for record in iterations]
    tasks = sorted(task_rows.keys())

    models_with_data = set()
    for task_id, runner_map in task_rows.items():
        for runner_key in runner_map.keys():
            if runner_key in dict(MODEL_ORDER):
                models_with_data.add(runner_key)

    models_with_data_labels = [label for runner_key, label in MODEL_ORDER if runner_key in models_with_data]

    filters = {
        "models": models_with_data_labels,
        "runners": models_with_data_labels,
        "tasks": tasks,
    }

    summary_table: List[Dict[str, object]] = []
    single_task_tables: Dict[str, List[Dict[str, object]]] = {}

    for summary_row in summary_rows:
        total_time = summary_row.get("Total Time Seconds")
        summary_table.append({
            "Prompt ID": summary_row.get("Prompt ID"),
            "Task": summary_row.get("Task"),
            "Prompt": summary_row.get("Prompt"),
            "Difficulty": summary_row.get("Difficulty"),
            "TotalTimeSeconds": total_time,
            "TotalTimeFormatted": format_seconds(total_time) if total_time is not None else None,
            "TaskStartTime": summary_row.get("Task Start Time"),
            "TaskEndTime": summary_row.get("Task End Time"),
            "AverageIterationMinutes": summary_row.get("Average Iteration Time Minutes"),
        })

    for task_id, runner_map in task_rows.items():
        task_iterations: List[Dict[str, object]] = []
        for runner_key, records in runner_map.items():
            for record in records:
                task_iterations.append({
                    "Task": task_id,
                    "Iteration": record.iteration,
                    "Prompt": record.prompt,
                    "PromptId": record.prompt_id,
                    "RunnerKey": runner_key,
                    "RunnerLabel": KNOWN_RUNNERS.get(runner_key, runner_key.title()),
                    "Status": record.status,
                    "ExecutionTimeSeconds": record.duration_seconds,
                    "ExecutionTimeFormatted": format_seconds(record.duration_seconds) if record.duration_seconds is not None else None,
                    "StartTime": record.start_timestamp,
                    "EndTime": record.end_timestamp,
                })

        task_iterations.sort(key=lambda row: (row.get("Iteration", 0), row.get("RunnerLabel", "")))
        single_task_tables[task_id] = task_iterations

    tasks_map = {}
    for task_id, runner_map in task_rows.items():
        runner_summary = {}
        for runner_key, label in MODEL_ORDER:
            if runner_key in runner_map and runner_map[runner_key]:
                runner_summary[label] = summarize_runner(runner_key, runner_map[runner_key])
        tasks_map[task_id] = runner_summary

    return {
        "summary": summary_rows,
        "summary_table": summary_table,
        "iterations": serialized_iterations,
        "tasks": tasks_map,
        "single_task_tables": single_task_tables,
        "filters": filters,
    }
