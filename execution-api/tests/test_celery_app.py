from app.celery_app import build_celery_config
from app.settings import Settings


def test_celery_beat_schedules_lease_recovery_on_maintenance_queue():
    config = build_celery_config(Settings(maintenance_interval_seconds=15))
    schedule = config["beat_schedule"]["recover-expired-leases"]
    assert schedule["task"] == "app.tasks.maintenance.recover_expired_leases"
    assert schedule["options"] == {"queue": "maintenance"}
    assert schedule["schedule"] == 15
