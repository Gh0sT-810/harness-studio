from app.settings import get_settings

settings = get_settings()

try:
    from celery import Celery

    celery_app = Celery(
        "harness_execution",
        broker=settings.celery_broker_url,
        backend=settings.celery_result_backend,
        include=["app.tasks.execution", "app.tasks.maintenance"],
    )
    celery_app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="UTC",
        task_routes={
            "app.tasks.execution.run_iteration": {"queue": settings.execution_queue},
            "app.tasks.maintenance.recover_expired_leases": {"queue": settings.maintenance_queue},
        },
    )
except ModuleNotFoundError:
    celery_app = None
