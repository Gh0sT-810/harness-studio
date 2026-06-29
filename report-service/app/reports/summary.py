"""Summary, Pass@N "Breaking" and difficulty logic.

Ported from the reference harness so the report's summary rows, breaking
strings, difficulty and overall Pass@ metrics match byte-for-byte.
"""

from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from statistics import median
from typing import Dict, List, Optional, Tuple

from app.reports.models import IterationRecord, KNOWN_RUNNERS, MODEL_ORDER


# ---------------------------------------------------------------------------
# Status normalization
# ---------------------------------------------------------------------------

def _normalize_status_token(status: Optional[str]) -> Optional[str]:
    if not status:
        return None

    token = status.strip().lower()
    if not token:
        return None

    mapping = {
        "passed": "PASSED",
        "pass": "PASSED",
        "success": "PASSED",
        "succeeded": "PASSED",
        "completed": "PASSED",
        "complete": "PASSED",
        "done": "PASSED",
        "ok": "PASSED",
        "verified": "PASSED",
        "fail": "FAILED",
        "failed": "FAILED",
        "failure": "FAILED",
        "verification_failed": "FAILED",
        "verification-failed": "FAILED",
        "verification error": "FAILED",
        "timeout": "TIMEOUT",
        "timed_out": "TIMEOUT",
        "timed-out": "TIMEOUT",
        "timed out": "TIMEOUT",
        "time_out": "TIMEOUT",
        "crash": "CRASHED",
        "crashed": "CRASHED",
        "error": "CRASHED",
        "errored": "CRASHED",
        "exception": "CRASHED",
        "terminated": "TERMINATED",
        "unknown": "UNKNOWN",
        "pending": "PENDING",
        "in_progress": "EXECUTING",
        "executing": "EXECUTING",
        "running": "EXECUTING",
    }

    if token in mapping:
        return mapping[token]

    return token.upper()


def _simplify_status(
    status: str,
    status_reason: Optional[str] = None,
    completion_reason: Optional[str] = None,
    extra: Optional[Dict[str, object]] = None,
) -> str:
    status_upper = status.upper()

    if status_upper in ["PASSED", "SUCCESS", "SUCCEEDED", "COMPLETED", "COMPLETE", "DONE", "OK", "VERIFIED"]:
        return "PASSED"
    elif status_upper in ["FAILED", "FAIL", "FAILURE", "VERIFICATION_FAILED", "VERIFICATION-FAILED", "VERIFICATION ERROR"]:
        return "FAILED"
    elif status_upper in ["TIMEOUT", "TIMED_OUT", "TIMED-OUT", "TIMED OUT", "TIME_OUT"]:
        return "FAILED"  # Timeout is treated as failed
    elif status_upper in ["CRASHED", "PENDING", "EXECUTING", "UNKNOWN"]:
        return status_upper
    return status_upper


def infer_status(
    status: Optional[str],
    *,
    extra: Optional[Dict[str, object]] = None,
    status_reason: Optional[str] = None,
    completion_reason: Optional[str] = None,
) -> str:
    extra = extra or {}

    candidates = [status, extra.get("status"), extra.get("verification_status"), extra.get("state"), extra.get("execution_status")]

    for candidate in candidates:
        normalized = _normalize_status_token(candidate)
        if normalized and normalized != "UNKNOWN":
            return _simplify_status(normalized, status_reason, completion_reason, extra)

    normalized = _normalize_status_token(status)
    if normalized:
        return _simplify_status(normalized, status_reason, completion_reason, extra)
    return "UNKNOWN"


def extract_record_status(record: IterationRecord) -> str:
    normalized = infer_status(
        record.status,
        extra=record.extra,
        status_reason=record.status_reason,
        completion_reason=record.completion_reason,
    )
    return normalized if normalized != "UNKNOWN" else ""


# ---------------------------------------------------------------------------
# Runner stats + Pass@N "Breaking"
# ---------------------------------------------------------------------------

def aggregate_runner_stats(records: List[IterationRecord]) -> Dict[str, object]:
    stats: Dict[str, object] = {
        "total": 0,
        "pass_count": 0,
        "fail_count": 0,
        "crash_count": 0,
        "timeout_count": 0,
        "other_count": 0,
        "tool_calls_total": 0,
        "tool_calls_by_tool": Counter(),
        "completion_reasons": [],
        "status_reasons": [],
        "errors": [],
        "records": records,
    }

    normalized_records: List[Tuple[IterationRecord, str]] = []
    for record in records:
        normalized = infer_status(
            record.status,
            extra=record.extra,
            status_reason=record.status_reason,
            completion_reason=record.completion_reason,
        )
        normalized = (normalized or "").upper()
        normalized_records.append((record, normalized))

    records_for_stats: List[Tuple[IterationRecord, str]] = []
    for record, normalized in normalized_records:
        # Only PASSED and FAILED iterations are counted in reports.
        if normalized in ["PASSED", "FAILED"]:
            records_for_stats.append((record, normalized))

    stats["records"] = [record for record, _ in records_for_stats]

    for record, normalized_status in records_for_stats:
        status = normalized_status.lower()
        stats["total"] += 1
        if status == "passed":
            stats["pass_count"] += 1
        elif status == "failed":
            stats["fail_count"] += 1

        if record.tool_calls_total is not None:
            stats["tool_calls_total"] += record.tool_calls_total

        if record.tool_calls_by_tool:
            stats["tool_calls_by_tool"].update(
                {tool: int(count) for tool, count in record.tool_calls_by_tool.items()}
            )
        elif record.extra:
            usage = record.extra.get("tool_usage") or {}
            by_tool = usage.get("by_tool") or {}
            stats["tool_calls_by_tool"].update({tool: int(count) for tool, count in by_tool.items()})
            if record.tool_calls_total is None:
                stats["tool_calls_total"] += sum(int(count) for count in by_tool.values())

        if record.completion_reason:
            stats["completion_reasons"].append(record.completion_reason)
        if record.status_reason:
            stats["status_reasons"].append(record.status_reason)
        if record.extra:
            if record.extra.get("error"):
                stats["errors"].append(str(record.extra["error"]))
            if record.extra.get("status_reason"):
                stats["status_reasons"].append(str(record.extra["status_reason"]))

    return stats


def format_breaking_string(stats: Dict[str, object]) -> str:
    total = stats.get("total", 0)
    if not total:
        return ""  # Empty string for crashed/empty iterations
    break_count = total - stats.get("pass_count", 0)
    if break_count:
        return f"Yes, {break_count}/{total}"
    return f"No, 0/{total}"


# ---------------------------------------------------------------------------
# Difficulty
# ---------------------------------------------------------------------------

def determine_model_difficulty_from_stats(stats: Dict[str, object]) -> str:
    total = stats.get("total", 0)
    if not total:
        return "unknown"

    pass_count = stats.get("pass_count", 0)
    success_rate = (pass_count / total) * 100

    records = stats.get("records", [])
    steps_list = []
    for rec in records:
        if getattr(rec, "total_steps", None) is not None:
            steps_list.append(rec.total_steps)

    if steps_list:
        median_steps = int(median(steps_list))
        if success_rate < 40.0 or median_steps > 50:
            return "hard"
        if success_rate == 100.0 and median_steps <= 25:
            return "easy"
        return "medium"

    if success_rate >= 100:
        return "easy"
    elif success_rate >= 40:
        return "medium"
    else:
        return "hard"


def difficulty_from_runner_stats(runner_map: Dict[str, List[IterationRecord]]) -> str:
    all_records: List[IterationRecord] = []
    for runner_records in runner_map.values():
        all_records.extend(runner_records)

    if not all_records:
        return "Unknown"

    passed_count = 0
    failed_count = 0
    for record in all_records:
        normalized = infer_status(
            record.status,
            extra=record.extra,
            status_reason=record.status_reason,
            completion_reason=record.completion_reason,
        )
        normalized = (normalized or "").upper()
        if normalized == "PASSED":
            passed_count += 1
        elif normalized == "FAILED":
            failed_count += 1

    total_iterations = passed_count + failed_count
    if total_iterations == 0:
        return "Unknown"

    pass_percentage = (passed_count / total_iterations) * 100
    if pass_percentage == 100.0:
        return "Easy"
    elif pass_percentage > 40.0:
        return "Medium"
    else:
        return "Hard"


# ---------------------------------------------------------------------------
# Timings + median steps
# ---------------------------------------------------------------------------

def compute_task_timings(records: List[IterationRecord]) -> Dict[str, Optional[float]]:
    if not records:
        return {
            "total_seconds": None,
            "average_iteration_seconds": None,
            "start_timestamp": None,
            "end_timestamp": None,
        }

    iteration_durations = [r.duration_seconds for r in records if r.duration_seconds is not None]
    earliest = [r.start_timestamp for r in records if r.start_timestamp]
    latest = [r.end_timestamp for r in records if r.end_timestamp]

    total_seconds = sum(iteration_durations) if iteration_durations else None
    avg_seconds = (total_seconds / len(iteration_durations)) if iteration_durations else None

    start_ts = min(earliest) if earliest else None
    end_ts = max(latest) if latest else None

    return {
        "total_seconds": total_seconds,
        "average_iteration_seconds": avg_seconds,
        "start_timestamp": start_ts,
        "end_timestamp": end_ts,
    }


def compute_median_steps(records: List[IterationRecord]) -> Optional[int]:
    steps_list = []
    for record in records:
        if record.total_steps is not None:
            try:
                steps_list.append(int(record.total_steps))
            except (ValueError, TypeError):
                continue

    if not steps_list:
        return None

    return int(median(steps_list))


# ---------------------------------------------------------------------------
# Prompt selection
# ---------------------------------------------------------------------------

def select_prompt(runner_map: Dict[str, List[IterationRecord]]) -> Optional[str]:
    for runner_key, _ in MODEL_ORDER:
        for record in runner_map.get(runner_key, []):
            if record.prompt:
                return record.prompt
    for records in runner_map.values():
        for record in records:
            if record.prompt:
                return record.prompt
    return None


def select_prompt_id(runner_map: Dict[str, List[IterationRecord]]) -> Optional[str]:
    for runner_key, _ in MODEL_ORDER:
        for record in runner_map.get(runner_key, []):
            if record.prompt_id:
                return str(record.prompt_id)
    for records in runner_map.values():
        for record in records:
            if record.prompt_id:
                return str(record.prompt_id)
    return None


# ---------------------------------------------------------------------------
# Summary builder
# ---------------------------------------------------------------------------

def build_summary(
    records: List[IterationRecord],
) -> Tuple[List[Dict[str, object]], Dict[str, Dict[str, List[IterationRecord]]]]:
    task_map: Dict[str, Dict[str, List[IterationRecord]]] = defaultdict(lambda: defaultdict(list))

    for record in records:
        task_map[record.task_id][record.runner].append(record)

    for runner_map in task_map.values():
        for runner_records in runner_map.values():
            runner_records.sort(key=lambda r: r.iteration)

    summary_rows: List[Dict[str, object]] = []
    for task_id, runner_map in task_map.items():
        prompt = select_prompt(runner_map)
        prompt_id = select_prompt_id(runner_map) or task_id

        row: Dict[str, object] = {
            "Prompt ID": prompt_id or "",
            "Task": task_id,
            "Prompt": prompt or "",
        }

        flattened_records: List[IterationRecord] = []
        for runner_records in runner_map.values():
            flattened_records.extend(runner_records)

        timings = compute_task_timings(flattened_records)
        row["Total Time Seconds"] = timings["total_seconds"]
        row["Task Start Time"] = timings["start_timestamp"]
        row["Task End Time"] = timings["end_timestamp"]
        row["Average Iteration Time Minutes"] = (
            round(timings["average_iteration_seconds"] / 60.0, 2)
            if timings["average_iteration_seconds"] is not None
            else None
        )

        for runner_key, label in MODEL_ORDER:
            records_for_runner = runner_map.get(runner_key, [])
            if records_for_runner:
                stats = aggregate_runner_stats(records_for_runner)
                row[f"{label} Breaking"] = format_breaking_string(stats)
                row[f"{label} Difficulty"] = determine_model_difficulty_from_stats(stats)
                row[f"{label} Median Steps"] = compute_median_steps(records_for_runner)

        row["Difficulty"] = difficulty_from_runner_stats(runner_map)
        summary_rows.append(row)

    summary_rows.sort(key=lambda row: row["Task"])
    return summary_rows, task_map


def calculate_overall_pass_at(summary_rows: List[Dict]) -> Dict:
    """Average Pass@ metrics parsed back out of the "Breaking" columns."""
    if not summary_rows:
        return {"batch_average": 0.0, "by_model": {}}

    model_columns = []
    for key in summary_rows[0].keys():
        if key.endswith(" Breaking"):
            model_columns.append(key)

    model_pass_rates: Dict[str, List[float]] = {col.replace(" Breaking", ""): [] for col in model_columns}
    all_pass_rates: List[float] = []

    for row in summary_rows:
        for col in model_columns:
            breaking_value = row.get(col, "")
            if not breaking_value:
                continue
            match = re.search(r"(\d+)/(\d+)", str(breaking_value))
            if match:
                break_count = int(match.group(1))
                total = int(match.group(2))
                if total > 0:
                    pass_rate = ((total - break_count) / total) * 100
                    model_name = col.replace(" Breaking", "")
                    model_pass_rates[model_name].append(pass_rate)
                    all_pass_rates.append(pass_rate)

    by_model = {}
    for model_name, rates in model_pass_rates.items():
        if rates:
            by_model[model_name] = round(sum(rates) / len(rates), 1)

    batch_average = round(sum(all_pass_rates) / len(all_pass_rates), 1) if all_pass_rates else 0.0

    return {"batch_average": batch_average, "by_model": by_model}


# ---------------------------------------------------------------------------
# Shared formatting
# ---------------------------------------------------------------------------

def format_seconds(value: Optional[float]) -> str:
    if value is None:
        return ""
    seconds = max(0, int(round(value)))
    hours, rem = divmod(seconds, 3600)
    minutes, secs = divmod(rem, 60)
    return f"{hours:02}:{minutes:02}:{secs:02}"
