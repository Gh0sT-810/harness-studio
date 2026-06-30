from app.celery_app import build_celery_config
from app.settings import Settings


def test_celery_beat_schedules_lease_recovery_on_maintenance_queue():
    config = build_celery_config(Settings(maintenance_interval_seconds=15))
    schedule = config["beat_schedule"]["recover-expired-leases"]
    assert schedule["task"] == "app.tasks.maintenance.recover_expired_leases"
    assert schedule["options"] == {"queue": "maintenance"}
    assert schedule["schedule"] == 15


def test_celery_config_sets_replica_friendly_worker_options():
    # CFG-01/02/03/05: prefetch=1, late acks, reject-on-lost, task events for Flower.
    config = build_celery_config(Settings(worker_prefetch_multiplier=1))
    assert config["worker_prefetch_multiplier"] == 1
    assert config["task_acks_late"] is True
    assert config["task_reject_on_worker_lost"] is True
    assert config["worker_send_task_events"] is True


def test_celery_config_sets_visibility_timeout_from_settings():
    # CFG-04/06: visibility_timeout is plumbed from settings (not hardcoded).
    config = build_celery_config(Settings(visibility_timeout_seconds=123))
    assert config["broker_transport_options"] == {"visibility_timeout": 123}


def test_celery_config_preserves_core_keys():
    # CFG-07: the new keys are additive — serializers and task routes still present.
    config = build_celery_config(Settings())
    assert config["task_serializer"] == "json"
    assert config["accept_content"] == ["json"]
    assert "app.tasks.execution.run_iteration" in config["task_routes"]
    assert "app.tasks.maintenance.recover_expired_leases" in config["task_routes"]
