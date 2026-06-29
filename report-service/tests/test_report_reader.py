from app.artifacts import ArtifactClientError
from app.reports.reader import BatchReportReader, _aggregate_timeline_tools, _resolve_runner


class FakeArtifactClient:
    def __init__(self, timeline=None, raise_error=False):
        self.timeline = timeline or {}
        self.raise_error = raise_error
        self.calls = []

    def get_json(self, artifact_id):
        self.calls.append(artifact_id)
        if self.raise_error:
            raise ArtifactClientError("boom")
        return self.timeline


def _row(**overrides):
    row = {
        "iteration_uuid": "iter-1",
        "iteration_number": 1,
        "status": "passed",
        "failure_context": "",
        "verification_comments": "looks good",
        "total_steps": 10,
        "last_model_response": "task done",
        "result_data": {},
        "verification_details": {},
        "timeline_artifact_id": None,
        "duration_seconds": 12.0,
        "started_at": "2026-01-01 00:00:00",
        "completed_at": "2026-01-01 00:00:12",
        "execution_uuid": "exec-1",
        "snapshot_task_id": "TASK-1",
        "snapshot_prompt": "Do the thing",
        "provider_key": "anthropic",
        "model_name": "claude-sonnet-4",
        "display_name": "Claude Sonnet 4",
        "task_prompt": "fallback prompt",
    }
    row.update(overrides)
    return row


def test_resolve_runner():
    assert _resolve_runner("anthropic", "claude-opus-4-5", "Claude Opus 4.5") == "anthropic_opus"
    assert _resolve_runner("anthropic", "claude-sonnet-4", "Claude Sonnet 4") == "anthropic"
    assert _resolve_runner("openai", "computer-use", "OpenAI") == "openai"
    assert _resolve_runner("gemini", "computer-use", "Gemini") == "gemini"
    assert _resolve_runner(None, None, None) == "unknown"


def test_aggregate_timeline_tools():
    timeline = {
        "steps": [
            {"type": "navigate"},
            {"type": "model_action", "action": "click"},
            {"type": "model_action", "action": "click"},
            {"type": "model_action", "action": "type"},
            {"type": "final"},
        ]
    }
    total, by_tool, unique = _aggregate_timeline_tools(timeline)
    assert total == 3
    assert by_tool == {"click": 2, "type": 1}
    assert unique == ["click", "type"]


def test_row_to_record_maps_fields_and_tool_calls():
    reader = BatchReportReader(artifact_client=FakeArtifactClient(timeline={"steps": [{"action": "click"}]}))
    record = reader._row_to_record(_row(timeline_artifact_id="art-1"))
    assert record.task_id == "TASK-1"
    assert record.runner == "anthropic"
    assert record.duration_seconds == 12.0
    assert record.total_steps == 10
    assert record.tool_calls_total == 1
    assert record.tool_calls_by_tool == {"click": 1}
    assert record.unique_tools == ["click"]
    assert record.iteration_uuid == "iter-1"
    assert record.execution_uuid == "exec-1"


def test_model_response_falls_back_to_result_data():
    reader = BatchReportReader(artifact_client=FakeArtifactClient())
    record = reader._row_to_record(_row(last_model_response="", result_data={"modelResponse": "from result_data"}))
    assert record.last_model_response == "from result_data"


def test_tool_calls_degrade_on_artifact_error():
    reader = BatchReportReader(artifact_client=FakeArtifactClient(raise_error=True))
    record = reader._row_to_record(_row(timeline_artifact_id="art-1"))
    assert record.tool_calls_total == 0
    assert record.tool_calls_by_tool == {}
    assert record.unique_tools == []


def test_null_timestamps_yield_none_duration_and_timestamps():
    reader = BatchReportReader(artifact_client=FakeArtifactClient())
    record = reader._row_to_record(_row(duration_seconds=None, started_at=None, completed_at=None))
    assert record.duration_seconds is None
    assert record.start_timestamp is None
    assert record.end_timestamp is None
