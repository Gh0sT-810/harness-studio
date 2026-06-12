import inspect
import threading

from app.celery_app import celery_app
from app.adapters.registry import AdapterRegistry
from app.events import RedisEventPublisher
from app.models.registry import ModelDefinition
from app.repositories.iterations import PostgresIterationRepository
from app.runners.playwright_capture import PlaywrightCaptureRunner
from app.settings import get_settings


class LiveProgressObserver:
    """Publishes live-monitor events as the runner persists steps/artifacts.

    DB updates happen before events (set_timeline_artifact precedes
    iteration.step_added) and every published id is recorded so the
    completion path does not emit duplicates.
    """

    def __init__(self, repository, event_publisher, iteration, iteration_id: str):
        self.repository = repository
        self.event_publisher = event_publisher
        self.iteration = iteration
        self.iteration_id = iteration_id
        self.published_artifact_ids: set[str] = set()
        self.published_step_ids: set[str] = set()
        self.timeline_artifact_id = ""

    def on_artifact(self, artifact: dict) -> None:
        payload = {
            "artifactId": artifact["id"],
            "artifactType": artifact["artifactType"],
            "scope": artifact["scope"],
            "filename": artifact.get("metadata", {}).get("filename", ""),
            "iterationId": self.iteration_id,
            "executionId": self.iteration.get("execution_id", ""),
        }
        step_index = artifact.get("metadata", {}).get("timelineStepIndex")
        if step_index is not None:
            payload["timelineStepIndex"] = step_index
        self.event_publisher.publish_iteration_event("artifact.created", self.iteration, payload)
        self.published_artifact_ids.add(artifact["id"])

    def on_step(self, step: dict, timeline_artifact: dict | None) -> None:
        if (
            timeline_artifact
            and timeline_artifact["id"] != self.timeline_artifact_id
            and hasattr(self.repository, "set_timeline_artifact")
        ):
            self.repository.set_timeline_artifact(self.iteration_id, timeline_artifact["id"])
            self.timeline_artifact_id = timeline_artifact["id"]
        self.event_publisher.publish_iteration_event(
            "iteration.step_added",
            self.iteration,
            {"message": step.get("message", ""), **step},
        )
        self.published_step_ids.add(str(step.get("id", "")))


def _run_with_observer(runner, iteration: dict, observer):
    run = runner.run
    try:
        accepts_observer = "observer" in inspect.signature(run).parameters
    except (TypeError, ValueError):
        accepts_observer = False
    if accepts_observer:
        return run(iteration, observer=observer)
    return run(iteration)


def execute_iteration(
    iteration_id: str,
    repository=None,
    event_publisher=None,
    runner=None,
    worker_id: str | None = None,
    lease_seconds: int | None = None,
    heartbeat_seconds: float | None = None,
) -> dict[str, str]:
    settings = get_settings()
    repository = repository or PostgresIterationRepository()
    event_publisher = event_publisher or RedisEventPublisher()
    runner = runner or PlaywrightCaptureRunner()
    worker_id = worker_id or settings.worker_id
    lease_seconds = lease_seconds or settings.lease_seconds
    heartbeat_seconds = heartbeat_seconds or settings.heartbeat_seconds

    iteration = repository.claim_iteration(iteration_id, worker_id, lease_seconds)
    if iteration is None:
        return {"id": iteration_id, "status": "not_claimed"}
    iteration = {**repository.get_iteration(iteration_id), **iteration}
    if iteration.get("model_config"):
        model = ModelDefinition.from_mapping(iteration["model_config"])
        adapter = AdapterRegistry().resolve(model)
        iteration["model_config"] = {**iteration["model_config"], "resolved_adapter": adapter.__class__.__name__}
        iteration["model_adapter"] = adapter
    if iteration.get("cancel_requested"):
        completed = repository.complete_iteration(
            iteration_id,
            worker_id,
            "cancelled",
            {"runner": runner.__class__.__name__, "cancelled": True},
            {"status": "cancelled"},
            "Iteration was cancelled before runner execution.",
            0,
        )
        event_publisher.publish_iteration_event("iteration.completed", iteration, {"status": completed["status"]})
        event_publisher.publish_batch_event(
            "execution.updated",
            iteration["batch_id"],
            {"execution_id": iteration["execution_id"], "status": completed["status"]},
        )
        event_publisher.publish_batch_event(
            "batch.summary_updated",
            iteration["batch_id"],
            {"counts": repository.batch_counts(iteration["batch_id"])},
        )
        return completed

    event_publisher.publish_iteration_event("iteration.started", iteration, {"status": "executing"})
    stop_heartbeat = threading.Event()

    def heartbeat_loop() -> None:
        while not stop_heartbeat.wait(heartbeat_seconds):
            try:
                repository.heartbeat(iteration_id, worker_id, lease_seconds)
            except Exception:
                pass

    heartbeat_thread = threading.Thread(target=heartbeat_loop, daemon=True)
    heartbeat_thread.start()
    observer = LiveProgressObserver(repository, event_publisher, iteration, iteration_id)
    try:
        result = _run_with_observer(runner, iteration, observer)
    except Exception as exc:
        stop_heartbeat.set()
        heartbeat_thread.join(timeout=heartbeat_seconds)
        completed = repository.complete_iteration(
            iteration_id,
            worker_id,
            "failed",
            {"error": str(exc), "runner": runner.__class__.__name__},
            {"status": "failed", "error": str(exc)},
            str(exc),
            0,
        )
        event_publisher.publish_iteration_event("iteration.completed", iteration, {"status": completed["status"]})
        event_publisher.publish_batch_event(
            "execution.updated",
            iteration["batch_id"],
            {"execution_id": iteration["execution_id"], "status": completed["status"]},
        )
        event_publisher.publish_batch_event(
            "batch.summary_updated",
            iteration["batch_id"],
            {"counts": repository.batch_counts(iteration["batch_id"])},
        )
        return completed
    finally:
        stop_heartbeat.set()
        heartbeat_thread.join(timeout=heartbeat_seconds)
    if (
        result.timeline_artifact_id
        and result.timeline_artifact_id != observer.timeline_artifact_id
        and hasattr(repository, "set_timeline_artifact")
    ):
        repository.set_timeline_artifact(iteration_id, result.timeline_artifact_id)
    for artifact in result.artifacts:
        if artifact["id"] in observer.published_artifact_ids:
            continue
        event_publisher.publish_iteration_event(
            "artifact.created",
            iteration,
            {
                "artifactId": artifact["id"],
                "artifactType": artifact["artifactType"],
                "scope": artifact["scope"],
                "filename": artifact.get("metadata", {}).get("filename", ""),
                "iterationId": iteration_id,
                "executionId": iteration.get("execution_id", ""),
            },
        )

    for step in result.steps:
        if str(step.payload.get("id", "")) in observer.published_step_ids:
            continue
        repository.heartbeat(iteration_id, worker_id, lease_seconds)
        event_publisher.publish_iteration_event(
            "iteration.step_added",
            iteration,
            {"message": step.message, **step.payload},
        )

    if getattr(result, "token_usage", None) and hasattr(repository, "record_token_usage"):
        repository.record_token_usage(iteration_id, result.token_usage)

    completed = repository.complete_iteration(
        iteration_id,
        worker_id,
        result.status,
        result.result_data,
        result.verification_details,
        result.verification_comments,
        len(result.steps),
    )
    event_publisher.publish_iteration_event("iteration.completed", iteration, {"status": completed["status"]})
    event_publisher.publish_batch_event(
        "execution.updated",
        iteration["batch_id"],
        {"execution_id": iteration["execution_id"], "status": completed["status"]},
    )
    event_publisher.publish_batch_event(
        "batch.summary_updated",
        iteration["batch_id"],
        {"counts": repository.batch_counts(iteration["batch_id"])},
    )
    return completed


def _run_iteration(iteration_id: str) -> dict[str, str]:
    return execute_iteration(iteration_id)


if celery_app is not None:
    run_iteration = celery_app.task(name="app.tasks.execution.run_iteration")(_run_iteration)
else:
    run_iteration = _run_iteration
