import csv
import io

from app.reports.csv_export import CSV_FIELDNAMES, build_csv_bytes


def test_csv_has_one_row_per_iteration_with_all_details(make_record):
    records = [
        make_record(task_id="T1", runner="anthropic", iteration=1, status="passed", total_steps=10, verification_comments="ok", last_model_response="did the thing"),
        make_record(task_id="T1", runner="openai", iteration=1, status="failed", total_steps=40, verification_comments="missed step", last_model_response="gave up"),
    ]
    data = build_csv_bytes(records).decode()
    reader = csv.DictReader(io.StringIO(data))

    assert reader.fieldnames == CSV_FIELDNAMES
    rows = list(reader)
    assert len(rows) == 2

    first = rows[0]
    # All the detail columns are populated, not just a summary.
    assert first["task_id"] == "T1"
    assert first["status"] == "passed"
    assert first["total_steps"] == "10"
    assert first["model_response"] == "did the thing"
    assert first["verification_comments"] == "ok"
    assert first["execution_uuid"]
    assert first["iteration_uuid"]


def test_csv_serializes_tool_calls(make_record):
    record = make_record(tool_calls_total=3, tool_calls_by_tool={"click": 2, "type": 1}, unique_tools=["click", "type"])
    data = build_csv_bytes([record]).decode()
    row = next(csv.DictReader(io.StringIO(data)))
    assert row["tool_calls_total"] == "3"
    assert '"click": 2' in row["tool_calls_by_tool"]
    assert "click" in row["unique_tools"]


def test_csv_handles_newlines_in_model_response(make_record):
    record = make_record(last_model_response="line one\nline two")
    data = build_csv_bytes([record]).decode()
    rows = list(csv.DictReader(io.StringIO(data)))
    assert len(rows) == 1
    assert rows[0]["model_response"] == "line one\nline two"
