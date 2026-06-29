import json

from app.reports.snapshot import build_snapshot, serialize_iteration
from app.reports.summary import build_summary


SNAPSHOT_KEYS = ["summary", "summary_table", "iterations", "tasks", "single_task_tables", "filters"]

SUMMARY_TABLE_KEYS = {
    "Prompt ID", "Task", "Prompt", "Difficulty", "TotalTimeSeconds",
    "TotalTimeFormatted", "TaskStartTime", "TaskEndTime", "AverageIterationMinutes",
}

ITERATION_KEYS = {
    "task_id", "runner", "runner_key", "iteration", "status", "status_reason",
    "completion_reason", "duration_seconds", "timelapse", "file_timelapse_seconds",
    "tool_calls_total", "tool_calls_by_tool", "unique_tools", "prompt", "prompt_id",
    "model", "run_id", "start_timestamp", "end_timestamp", "iteration_directory", "extra",
}

SINGLE_TASK_KEYS = {
    "Task", "Iteration", "Prompt", "PromptId", "RunnerKey", "RunnerLabel", "Status",
    "ExecutionTimeSeconds", "ExecutionTimeFormatted", "StartTime", "EndTime",
}

RUNNER_SUMMARY_KEYS = {
    "runner_key", "runner_label", "total_iterations", "pass_count", "fail_count",
    "crash_count", "timeout_count", "tool_calls_total", "model_response",
    "pass_fail_text", "comments",
}


def _snapshot(make_record):
    records = [
        make_record(task_id="T1", runner="anthropic", iteration=1, status="passed"),
        make_record(task_id="T1", runner="openai", iteration=1, status="failed"),
        make_record(task_id="T2", runner="anthropic", iteration=1, status="passed"),
    ]
    summary_rows, task_map = build_summary(records)
    return build_snapshot(summary_rows, records, task_map)


def test_snapshot_top_level_keys_in_order(make_record):
    snap = _snapshot(make_record)
    assert list(snap.keys()) == SNAPSHOT_KEYS
    assert isinstance(snap["summary"], list)
    assert isinstance(snap["tasks"], dict)
    assert set(snap["filters"].keys()) == {"models", "runners", "tasks"}
    assert snap["filters"]["tasks"] == ["T1", "T2"]


def test_summary_table_has_exactly_nine_keys(make_record):
    snap = _snapshot(make_record)
    for row in snap["summary_table"]:
        assert set(row.keys()) == SUMMARY_TABLE_KEYS


def test_serialized_iteration_has_exactly_21_keys(make_record):
    keys = set(serialize_iteration(make_record()).keys())
    assert keys == ITERATION_KEYS
    assert len(keys) == 21


def test_single_task_tables_keys_and_sorting(make_record):
    records = [
        make_record(task_id="T1", runner="openai", iteration=2, status="passed"),
        make_record(task_id="T1", runner="anthropic", iteration=1, status="passed"),
    ]
    summary_rows, task_map = build_summary(records)
    snap = build_snapshot(summary_rows, records, task_map)
    rows = snap["single_task_tables"]["T1"]
    assert all(set(r.keys()) == SINGLE_TASK_KEYS for r in rows)
    ordering = [(r["Iteration"], r["RunnerLabel"]) for r in rows]
    assert ordering == sorted(ordering)


def test_tasks_runner_summary_keys(make_record):
    snap = _snapshot(make_record)
    summary = snap["tasks"]["T1"]["Claude Sonnet 4"]
    assert set(summary.keys()) == RUNNER_SUMMARY_KEYS
    assert summary["pass_fail_text"] == "PASSED"


def test_json_dump_preserves_order_and_indent(make_record):
    snap = _snapshot(make_record)
    payload = json.dumps(snap, indent=2, default=str)
    loaded = json.loads(payload)
    assert list(loaded.keys()) == SNAPSHOT_KEYS
    assert "\n  " in payload  # indent=2 applied
