from app.runners.base import RunnerResult, RunnerStep
from app.tasks.execution import execute_iteration


class FakeRepository:
    def __init__(self):
        self.heartbeats = []
        self.completed = []

    def claim_iteration(self, iteration_id, worker_id, lease_seconds):
        return {
            "id": iteration_id,
            "execution_id": "execution-1",
            "batch_id": "batch-1",
            "attempt": 1,
        }

    def get_iteration(self, iteration_id):
        return {
            "id": iteration_id,
            "execution_id": "execution-1",
            "batch_id": "batch-1",
            "gym_base_url": "https://example.com",
            "snapshot_prompt": "Do the thing",
        }

    def heartbeat(self, iteration_id, worker_id, lease_seconds):
        self.heartbeats.append((iteration_id, worker_id, lease_seconds))
        return True

    def complete_iteration(self, iteration_id, worker_id, status, result_data, verification_details, verification_comments, total_steps):
        self.completed.append((iteration_id, worker_id, status, result_data, verification_details, verification_comments, total_steps))
        return {"id": iteration_id, "status": status}

    def batch_counts(self, batch_id):
        return {"total": 1, "passed": 1}


class FakeRunner:
    def run(self, iteration):
        return RunnerResult(
            status="passed",
            result_data={"runner": "fake"},
            verification_details={"strategy": "local"},
            verification_comments="deterministic pass",
            steps=[
                RunnerStep(message="loaded task", payload={"step": 1}),
                RunnerStep(message="verified result", payload={"step": 2}),
            ],
        )


class FakeEvents:
    def __init__(self):
        self.iteration_events = []
        self.batch_events = []

    def publish_iteration_event(self, event_type, iteration, payload):
        self.iteration_events.append((event_type, iteration["id"], payload))

    def publish_batch_event(self, event_type, batch_id, payload):
        self.batch_events.append((event_type, batch_id, payload))


def test_execute_iteration_runs_claimed_iteration_to_completion():
    repository = FakeRepository()
    events = FakeEvents()

    result = execute_iteration(
        "iteration-1",
        repository=repository,
        event_publisher=events,
        runner=FakeRunner(),
        worker_id="worker-1",
        lease_seconds=60,
    )

    assert result == {"id": "iteration-1", "status": "passed"}
    assert repository.heartbeats == [
        ("iteration-1", "worker-1", 60),
        ("iteration-1", "worker-1", 60),
    ]
    assert repository.completed == [
        (
            "iteration-1",
            "worker-1",
            "passed",
            {"runner": "fake"},
            {"strategy": "local"},
            "deterministic pass",
            2,
        )
    ]
    assert events.iteration_events == [
        ("iteration.started", "iteration-1", {"status": "executing"}),
        ("iteration.step_added", "iteration-1", {"message": "loaded task", "step": 1}),
        ("iteration.step_added", "iteration-1", {"message": "verified result", "step": 2}),
        ("iteration.completed", "iteration-1", {"status": "passed"}),
    ]
    assert events.batch_events == [
        ("execution.updated", "batch-1", {"execution_id": "execution-1", "status": "passed"}),
        ("batch.summary_updated", "batch-1", {"counts": {"total": 1, "passed": 1}}),
    ]
