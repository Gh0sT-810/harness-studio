from app.runners.base import RunnerResult, RunnerStep
from app.tasks.execution import execute_iteration


class FakeRepository:
    def __init__(self):
        self.heartbeats = []
        self.completed = []
        self.timeline_artifacts = []

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
            "model_config": {
                "id": "model-1",
                "provider_id": "provider-1",
                "provider_key": "text",
                "adapter_key": "text_only",
                "model_name": "local-test-model",
                "display_name": "Local Test Model",
                "capabilities": {},
                "config": {},
                "cost_config": {},
                "timeout_seconds": 60,
                "secret_ref": "",
            },
        }

    def heartbeat(self, iteration_id, worker_id, lease_seconds):
        self.heartbeats.append((iteration_id, worker_id, lease_seconds))
        return True

    def complete_iteration(self, iteration_id, worker_id, status, result_data, verification_details, verification_comments, total_steps):
        self.completed.append((iteration_id, worker_id, status, result_data, verification_details, verification_comments, total_steps))
        return {"id": iteration_id, "status": status}

    def set_timeline_artifact(self, iteration_id, artifact_id):
        self.timeline_artifacts.append((iteration_id, artifact_id))

    def batch_counts(self, batch_id):
        return {"total": 1, "passed": 1}


class FakeRunner:
    def __init__(self):
        self.iteration = None

    def run(self, iteration):
        self.iteration = iteration
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


class FakeArtifactRunner:
    def run(self, iteration):
        return RunnerResult(
            status="passed",
            result_data={"runner": "artifact"},
            verification_details={"strategy": "playwright_capture"},
            verification_comments="captured",
            steps=[RunnerStep(message="captured", payload={"step": 1})],
            artifacts=[
                {
                    "id": "timeline-1",
                    "scope": "iterations/iteration-1",
                    "artifactType": "timeline",
                    "metadata": {"filename": "action_timeline.json"},
                },
                {
                    "id": "screenshot-1",
                    "scope": "iterations/iteration-1",
                    "artifactType": "screenshot",
                    "metadata": {"filename": "after.png"},
                },
            ],
            timeline_artifact_id="timeline-1",
        )


class FailingRunner:
    def run(self, iteration):
        raise RuntimeError("artifact upload failed")


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
    runner = FakeRunner()

    result = execute_iteration(
        "iteration-1",
        repository=repository,
        event_publisher=events,
        runner=runner,
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
    assert runner.iteration["model_config"]["adapter_key"] == "text_only"


def test_execute_iteration_persists_timeline_and_publishes_artifact_events():
    repository = FakeRepository()
    events = FakeEvents()

    result = execute_iteration(
        "iteration-1",
        repository=repository,
        event_publisher=events,
        runner=FakeArtifactRunner(),
        worker_id="worker-1",
        lease_seconds=60,
    )

    assert result == {"id": "iteration-1", "status": "passed"}
    assert repository.timeline_artifacts == [("iteration-1", "timeline-1")]
    assert ("artifact.created", "iteration-1", {"artifactId": "timeline-1", "artifactType": "timeline", "scope": "iterations/iteration-1", "filename": "action_timeline.json", "iterationId": "iteration-1", "executionId": "execution-1"}) in events.iteration_events
    assert ("artifact.created", "iteration-1", {"artifactId": "screenshot-1", "artifactType": "screenshot", "scope": "iterations/iteration-1", "filename": "after.png", "iterationId": "iteration-1", "executionId": "execution-1"}) in events.iteration_events


def test_execute_iteration_records_failed_runner_as_failed_iteration():
    repository = FakeRepository()
    events = FakeEvents()

    result = execute_iteration(
        "iteration-1",
        repository=repository,
        event_publisher=events,
        runner=FailingRunner(),
        worker_id="worker-1",
        lease_seconds=60,
    )

    assert result == {"id": "iteration-1", "status": "failed"}
    assert repository.completed[-1][2] == "failed"
    assert repository.completed[-1][3]["error"] == "artifact upload failed"
    assert events.iteration_events[-1] == ("iteration.completed", "iteration-1", {"status": "failed"})
