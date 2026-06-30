from app.settings import get_settings

settings = get_settings()


def build_celery_config(settings):
    return {
        "task_serializer": "json",
        "accept_content": ["json"],
        "result_serializer": "json",
        "timezone": "UTC",
        # Replica scaling model: each worker runs --concurrency=1, so reserve only
        # the single task in flight (prefetch=1) and ack on completion so a backlog
        # spreads evenly across replicas instead of one worker hoarding it.
        "worker_prefetch_multiplier": settings.worker_prefetch_multiplier,
        "task_acks_late": True,
        "task_reject_on_worker_lost": True,
        # Emit task events so Flower can report per-worker busy/idle/processed state.
        "worker_send_task_events": settings.worker_send_task_events,
        # Keep Redis from redelivering a long-running iteration to a second worker
        # before it finishes (must exceed the longest expected task runtime).
        "broker_transport_options": {"visibility_timeout": settings.visibility_timeout_seconds},
        "task_routes": {
            "app.tasks.execution.run_iteration": {"queue": settings.execution_queue},
            "app.tasks.maintenance.recover_expired_leases": {"queue": settings.maintenance_queue},
        },
        "beat_schedule": {
            "recover-expired-leases": {
                "task": "app.tasks.maintenance.recover_expired_leases",
                "schedule": settings.maintenance_interval_seconds,
                "options": {"queue": settings.maintenance_queue},
            },
        },
    }


try:
    from celery import Celery

    celery_app = Celery(
        "harness_execution",
        broker=settings.celery_broker_url,
        backend=settings.celery_result_backend,
        include=["app.tasks.execution", "app.tasks.maintenance"],
    )
    celery_app.conf.update(**build_celery_config(settings))
except ModuleNotFoundError:
    celery_app = None
