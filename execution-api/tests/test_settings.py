import socket

from app.settings import Settings, _default_worker_id


def test_worker_id_derived_from_hostname(monkeypatch):
    # WID-01: default worker_id carries the container hostname so each replica is unique.
    monkeypatch.delenv("WORKER_ID", raising=False)
    monkeypatch.setattr(socket, "gethostname", lambda: "abc123")

    assert Settings().worker_id == "execution-api@abc123"


def test_worker_ids_unique_per_hostname(monkeypatch):
    # WID-02: two replicas (different hostnames) derive different worker_ids.
    monkeypatch.delenv("WORKER_ID", raising=False)
    monkeypatch.setattr(socket, "gethostname", lambda: "host-A")
    first = Settings().worker_id
    monkeypatch.setattr(socket, "gethostname", lambda: "host-B")
    second = Settings().worker_id

    assert first != second


def test_explicit_worker_id_env_overrides(monkeypatch):
    # WID-03: an explicit WORKER_ID env still wins over hostname derivation.
    monkeypatch.setenv("WORKER_ID", "custom-worker")

    assert Settings().worker_id == "custom-worker"


def test_worker_id_falls_back_when_hostname_unavailable(monkeypatch):
    # WID-06: a gethostname failure must not crash settings construction.
    def boom():
        raise OSError("no hostname")

    monkeypatch.delenv("WORKER_ID", raising=False)
    monkeypatch.setattr(socket, "gethostname", boom)

    assert _default_worker_id() == "execution-api"
    assert Settings().worker_id == "execution-api"


def test_new_worker_tuning_defaults():
    # WID-04 / WID-05: new tuning knobs exist with replica-friendly defaults.
    settings = Settings(worker_id="x")

    assert settings.worker_prefetch_multiplier == 1
    assert settings.worker_send_task_events is True
    assert settings.visibility_timeout_seconds == 9000
    assert settings.db_pool_max_size == 10
