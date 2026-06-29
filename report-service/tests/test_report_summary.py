from app.reports.summary import (
    aggregate_runner_stats,
    build_summary,
    calculate_overall_pass_at,
    determine_model_difficulty_from_stats,
    difficulty_from_runner_stats,
    format_breaking_string,
)


def test_breaking_string_two_failures(make_record):
    records = [
        make_record(iteration=1, status="passed"),
        make_record(iteration=2, status="failed"),
        make_record(iteration=3, status="failed"),
    ]
    stats = aggregate_runner_stats(records)
    assert stats["total"] == 3
    assert stats["pass_count"] == 1
    assert format_breaking_string(stats) == "Yes, 2/3"


def test_breaking_string_all_pass(make_record):
    records = [make_record(iteration=i, status="passed") for i in range(1, 4)]
    assert format_breaking_string(aggregate_runner_stats(records)) == "No, 0/3"


def test_breaking_string_empty_when_all_crashed(make_record):
    records = [make_record(status="crashed"), make_record(status="crashed")]
    stats = aggregate_runner_stats(records)
    assert stats["total"] == 0
    assert format_breaking_string(stats) == ""


def test_timeout_counts_as_failed(make_record):
    records = [make_record(status="passed"), make_record(status="timeout")]
    stats = aggregate_runner_stats(records)
    assert stats["total"] == 2
    assert stats["pass_count"] == 1
    assert stats["fail_count"] == 1


def test_pending_executing_crashed_terminated_cancelled_excluded(make_record):
    records = [
        make_record(status="passed"),
        make_record(status="pending"),
        make_record(status="executing"),
        make_record(status="crashed"),
        make_record(status="terminated"),
        make_record(status="cancelled"),
    ]
    stats = aggregate_runner_stats(records)
    assert stats["total"] == 1  # only the passed iteration is counted
    assert stats["crash_count"] == 0
    assert stats["timeout_count"] == 0


def test_difficulty_from_runner_stats(make_record):
    easy = {"anthropic": [make_record(status="passed") for _ in range(3)]}
    assert difficulty_from_runner_stats(easy) == "Easy"

    hard = {"anthropic": [make_record(status="failed") for _ in range(3)]}
    assert difficulty_from_runner_stats(hard) == "Hard"

    medium = {"anthropic": [make_record(status="passed"), make_record(status="failed")]}
    assert difficulty_from_runner_stats(medium) == "Medium"  # 50% > 40%


def test_model_difficulty_with_steps(make_record):
    easy = aggregate_runner_stats([make_record(status="passed", total_steps=10) for _ in range(2)])
    assert determine_model_difficulty_from_stats(easy) == "easy"

    hard = aggregate_runner_stats([make_record(status="passed", total_steps=60) for _ in range(2)])
    assert determine_model_difficulty_from_stats(hard) == "hard"  # median steps > 50


def test_overall_pass_at(make_record):
    records = [
        make_record(task_id="T1", runner="anthropic", iteration=1, status="passed"),
        make_record(task_id="T1", runner="anthropic", iteration=2, status="failed"),
    ]
    summary_rows, _ = build_summary(records)
    overall = calculate_overall_pass_at(summary_rows)
    assert overall["batch_average"] == 50.0
    assert overall["by_model"]["Claude Sonnet 4"] == 50.0


def test_empty_overall_pass_at():
    assert calculate_overall_pass_at([]) == {"batch_average": 0.0, "by_model": {}}


def test_build_summary_row_shape(make_record):
    records = [make_record(task_id="T1", prompt_id="T1", runner="anthropic", iteration=1, status="passed")]
    summary_rows, task_map = build_summary(records)
    row = summary_rows[0]
    assert row["Prompt ID"] == "T1"
    assert row["Task"] == "T1"
    assert row["Claude Sonnet 4 Breaking"] == "No, 0/1"
    assert row["Difficulty"] == "Easy"
    assert "T1" in task_map
