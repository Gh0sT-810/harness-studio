from app.celery_app import celery_app
from app.events import RedisEventPublisher
from app.repositories.iterations import PostgresIterationRepository
from app.runners.local import LocalDeterministicRunner
from app.settings import get_settings


def execute_iteration(
    iteration_id: str,
    repository=None,
    event_publisher=None,
    runner=None,
    worker_id: str | None = None,
    lease_seconds: int | None = None,
) -> dict[str, str]:
    settings = get_settings()
    repository = repository or PostgresIterationRepository()
    event_publisher = event_publisher or RedisEventPublisher()
    runner = runner or LocalDeterministicRunner()
    worker_id = worker_id or settings.worker_id
    lease_seconds = lease_seconds or settings.lease_seconds

    iteration = repository.claim_iteration(iteration_id, worker_id, lease_seconds)
    if iteration is None:
        return {"id": iteration_id, "status": "not_claimed"}

    event_publisher.publish_iteration_event("iteration.started", iteration, {"status": "executing"})
    result = runner.run(iteration)

    for step in result.steps:
        repository.heartbeat(iteration_id, worker_id, lease_seconds)
        event_publisher.publish_iteration_event(
            "iteration.step_added",
            iteration,
            {"message": step.message, **step.payload},
        )

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
