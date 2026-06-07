from app.celery_app import celery_app
from app.events import RedisEventPublisher
from app.repositories.iterations import PostgresIterationRepository
from app.routes.internal import CeleryTaskPublisher
from app.settings import get_settings


def recover_leases(
    repository=None,
    task_publisher=None,
    event_publisher=None,
    max_attempts: int | None = None,
) -> dict[str, int]:
    settings = get_settings()
    repository = repository or PostgresIterationRepository()
    task_publisher = task_publisher or CeleryTaskPublisher()
    event_publisher = event_publisher or RedisEventPublisher()
    max_attempts = max_attempts or settings.max_attempts

    recovered = repository.recover_expired_leases(max_attempts)
    reenqueued = 0
    for iteration in recovered:
        event_publisher.publish_iteration_event(
            "iteration.lease_expired",
            iteration,
            {"status": iteration["status"]},
        )
        if iteration["status"] == "retrying":
            task_publisher.enqueue_iteration(iteration["id"])
            reenqueued += 1

    return {"recovered": len(recovered), "reenqueued": reenqueued}


def _recover_expired_leases() -> dict[str, int]:
    return recover_leases()


if celery_app is not None:
    recover_expired_leases = celery_app.task(name="app.tasks.maintenance.recover_expired_leases")(_recover_expired_leases)
else:
    recover_expired_leases = _recover_expired_leases
