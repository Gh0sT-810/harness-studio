import pytest

from app.reports.models import IterationRecord


def _make_record(**overrides) -> IterationRecord:
    defaults = dict(
        task_id="TASK-1",
        iteration=1,
        runner="anthropic",
        status="passed",
        status_reason=None,
        completion_reason=None,
        duration_seconds=12.0,
        timelapse=None,
        file_timelapse_seconds=None,
        tool_calls_total=0,
        tool_calls_by_tool={},
        unique_tools=[],
        prompt="Do the thing",
        prompt_id="TASK-1",
        model="Claude Sonnet 4",
        run_id="exec-1",
        start_timestamp="2026-01-01 00:00:00",
        end_timestamp="2026-01-01 00:00:12",
        iteration_directory=None,
        execution_uuid="exec-1",
        iteration_uuid="iter-1",
        verification_comments="looks good",
        last_model_response="task done",
        eval_insights=None,
        total_steps=10,
        extra={},
    )
    defaults.update(overrides)
    return IterationRecord(**defaults)


@pytest.fixture
def make_record():
    return _make_record
