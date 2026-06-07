from typing import Protocol

from fastapi import APIRouter, Depends, status


class IterationRepository(Protocol):
    def get_iteration(self, iteration_id: str) -> dict:
        ...

    def list_dispatchable_iterations(self, batch_id: str) -> list[dict]:
        ...

    def mark_enqueued(self, iteration_id: str, celery_task_id: str) -> None:
        ...

    def mark_cancelled(self, iteration_id: str) -> dict:
        ...


class TaskPublisher(Protocol):
    def enqueue_iteration(self, iteration_id: str) -> str:
        ...


class EventPublisher(Protocol):
    def publish_iteration_event(self, event_type: str, iteration: dict, payload: dict) -> str:
        ...


class CeleryTaskPublisher:
    def enqueue_iteration(self, iteration_id: str) -> str:
        from app.tasks.execution import run_iteration

        result = run_iteration.apply_async(args=[iteration_id])
        return result.id


def get_iteration_repository() -> IterationRepository:
    from app.repositories.iterations import PostgresIterationRepository

    return PostgresIterationRepository()


def get_task_publisher() -> TaskPublisher:
    return CeleryTaskPublisher()


def get_event_publisher() -> EventPublisher:
    from app.events import RedisEventPublisher

    return RedisEventPublisher()


router = APIRouter(prefix="/internal", tags=["internal"])


@router.post("/batches/{batch_id}/dispatch", status_code=status.HTTP_202_ACCEPTED)
def dispatch_batch(
    batch_id: str,
    repository: IterationRepository = Depends(get_iteration_repository),
    publisher: TaskPublisher = Depends(get_task_publisher),
    events: EventPublisher = Depends(get_event_publisher),
) -> dict[str, object]:
    enqueued = []
    for iteration in repository.list_dispatchable_iterations(batch_id):
        iteration_id = iteration["id"]
        celery_task_id = publisher.enqueue_iteration(iteration_id)
        repository.mark_enqueued(iteration_id, celery_task_id)
        events.publish_iteration_event(
            "iteration.enqueued",
            iteration,
            {"status": "pending", "sub_status": "queued"},
        )
        enqueued.append({"iteration_id": iteration_id, "celery_task_id": celery_task_id})

    return {"batch_id": batch_id, "enqueued": enqueued}


@router.post("/iterations/{iteration_id}/enqueue", status_code=status.HTTP_202_ACCEPTED)
def enqueue_iteration(
    iteration_id: str,
    repository: IterationRepository = Depends(get_iteration_repository),
    publisher: TaskPublisher = Depends(get_task_publisher),
    events: EventPublisher = Depends(get_event_publisher),
) -> dict[str, str]:
    iteration = repository.get_iteration(iteration_id)
    celery_task_id = publisher.enqueue_iteration(iteration_id)
    repository.mark_enqueued(iteration_id, celery_task_id)
    events.publish_iteration_event(
        "iteration.enqueued",
        iteration,
        {"status": "pending", "sub_status": "queued"},
    )
    return {"iteration_id": iteration_id, "celery_task_id": celery_task_id}


@router.post("/iterations/{iteration_id}/cancel", status_code=status.HTTP_202_ACCEPTED)
def cancel_iteration(
    iteration_id: str,
    repository: IterationRepository = Depends(get_iteration_repository),
    events: EventPublisher = Depends(get_event_publisher),
) -> dict:
    iteration = repository.get_iteration(iteration_id)
    result = repository.mark_cancelled(iteration_id)
    events.publish_iteration_event("iteration.cancelled", iteration, {"status": result["status"]})
    return result
