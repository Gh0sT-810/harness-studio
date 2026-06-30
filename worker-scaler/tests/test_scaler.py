import pytest

from app.flower_client import FlowerUnavailable
from app.docker_client import DockerError
from app.scaler import Scaler, ScalerError
from app.settings import Settings


class FakeDocker:
    """In-memory stand-in for the Docker Engine API (label-filtered worker pool)."""

    def __init__(self, containers=None):
        self.containers = [dict(c) for c in (containers or [])]
        self.calls = []
        self._seq = 0

    def list_workers(self, label, include_stopped=True):
        items = self.containers if include_stopped else [c for c in self.containers if c["state"] == "running"]
        return [dict(c) for c in items]

    def inspect(self, container_id):
        return {
            "Config": {"Image": "img", "Cmd": ["celery"], "Env": ["A=1"], "Labels": {"com.harness.role": "worker-execution"}},
            "HostConfig": {"NetworkMode": "harness", "RestartPolicy": {"Name": "unless-stopped"}, "Memory": 1},
        }

    def create(self, name, config):
        self._seq += 1
        cid = f"new-{self._seq}"
        self.containers.append({"id": cid, "name": name, "state": "created", "labels": config.get("Labels", {})})
        self.calls.append(("create", cid))
        return cid

    def start(self, container_id):
        self.calls.append(("start", container_id))
        for c in self.containers:
            if c["id"] == container_id:
                c["state"] = "running"

    def stop(self, container_id):
        self.calls.append(("stop", container_id))
        for c in self.containers:
            if c["id"] == container_id:
                c["state"] = "exited"

    def restart(self, container_id):
        self.calls.append(("restart", container_id))

    def remove(self, container_id):
        self.calls.append(("remove", container_id))
        self.containers = [c for c in self.containers if c["id"] != container_id]


class FakeFlower:
    def __init__(self, counts=None, fail=False):
        self.counts = counts or {}
        self.fail = fail

    def active_counts(self):
        if self.fail:
            raise FlowerUnavailable("flower down")
        return self.counts


def _running(state="running", *ids):
    return [{"id": i, "name": i, "state": state, "labels": {}} for i in ids]


def _scaler(docker, flower=None, **settings_kwargs):
    return Scaler(docker=docker, flower=flower or FakeFlower(), settings=Settings(**settings_kwargs))


# ---------------- scale ----------------

def test_scale_up_creates_new_workers():
    docker = FakeDocker(_running("running", "w1", "w2"))
    result = _scaler(docker).scale(4)
    assert result["actual"] == 4
    assert len(result["changed"]["created"]) == 2
    assert result["changed"]["removed"] == []


def test_scale_up_starts_stopped_before_creating():
    docker = FakeDocker(
        [{"id": "w1", "name": "w1", "state": "running", "labels": {}},
         {"id": "w2", "name": "w2", "state": "exited", "labels": {}}]
    )
    result = _scaler(docker).scale(3)
    assert "w2" in result["changed"]["started"]
    assert len(result["changed"]["created"]) == 1
    assert result["actual"] == 3


def test_scale_down_removes_surplus():
    docker = FakeDocker(_running("running", "w1", "w2", "w3", "w4"))
    result = _scaler(docker).scale(2)
    assert len(result["changed"]["removed"]) == 2
    assert result["actual"] == 2


def test_scale_to_zero_when_min_is_zero():
    docker = FakeDocker(_running("running", "w1", "w2", "w3"))
    result = _scaler(docker, min_replicas=0).scale(0)
    assert result["actual"] == 0
    assert len(result["changed"]["removed"]) == 3


def test_scale_above_max_is_rejected():
    docker = FakeDocker(_running("running", "w1"))
    with pytest.raises(ScalerError) as exc:
        _scaler(docker, max_replicas=200).scale(201)
    assert exc.value.status_code == 400


def test_scale_below_min_is_rejected():
    docker = FakeDocker(_running("running", "w1", "w2"))
    with pytest.raises(ScalerError) as exc:
        _scaler(docker, min_replicas=2).scale(1)
    assert exc.value.status_code == 400


def test_scale_to_zero_rejected_when_min_positive():
    docker = FakeDocker(_running("running", "w1"))
    with pytest.raises(ScalerError):
        _scaler(docker, min_replicas=1).scale(0)


def test_scale_bounds_are_inclusive():
    docker = FakeDocker(_running("running", "w1"))
    result = _scaler(docker, min_replicas=0, max_replicas=3).scale(3)
    assert result["desired"] == 3


# ---------------- stop-idle ----------------

def _flower_idle_busy():
    # w1, w3 idle (0 active); w2 busy (1 active); keyed like celery@<short id>.
    return FakeFlower({"celery@w1": 0, "celery@w2": 1, "celery@w3": 0})


def test_stop_idle_stops_only_idle_workers():
    docker = FakeDocker(_running("running", "w1", "w2", "w3"))
    result = _scaler(docker, _flower_idle_busy()).stop_idle()
    assert set(result["stopped"]) == {"w1", "w3"}
    assert ("stop", "w2") not in docker.calls


def test_stop_idle_respects_count():
    docker = FakeDocker(_running("running", "w1", "w2", "w3"))
    flower = FakeFlower({"celery@w1": 0, "celery@w2": 0, "celery@w3": 0})
    result = _scaler(docker, flower).stop_idle(count=2)
    assert len(result["stopped"]) == 2


def test_stop_idle_honors_floor():
    docker = FakeDocker(_running("running", "w1", "w2", "w3"))
    flower = FakeFlower({"celery@w1": 0, "celery@w2": 0, "celery@w3": 0})
    result = _scaler(docker, flower, min_replicas=2).stop_idle()
    assert len(result["stopped"]) == 1  # 3 running - floor 2


def test_stop_idle_no_idle_is_noop():
    docker = FakeDocker(_running("running", "w1", "w2"))
    flower = FakeFlower({"celery@w1": 1, "celery@w2": 2})
    result = _scaler(docker, flower).stop_idle()
    assert result["stopped"] == []
    assert result["idleFound"] == 0


def test_stop_idle_unconfirmed_worker_is_not_stopped():
    # No matching Flower entry -> cannot confirm idle -> left running (fail-safe).
    docker = FakeDocker(_running("running", "w1"))
    flower = FakeFlower({})
    result = _scaler(docker, flower).stop_idle()
    assert result["stopped"] == []


def test_stop_idle_raises_when_flower_unavailable():
    docker = FakeDocker(_running("running", "w1"))
    with pytest.raises(FlowerUnavailable):
        _scaler(docker, FakeFlower(fail=True)).stop_idle()


# ---------------- restart / stop / start ----------------

def test_restart_worker_restarts_container():
    docker = FakeDocker(_running("running", "w1"))
    _scaler(docker).restart_worker("w1")
    assert ("restart", "w1") in docker.calls


def test_restart_unknown_worker_is_404():
    docker = FakeDocker(_running("running", "w1"))
    with pytest.raises(ScalerError) as exc:
        _scaler(docker).restart_worker("does-not-exist")
    assert exc.value.status_code == 404


def test_stop_worker_refused_at_floor():
    docker = FakeDocker(_running("running", "w1"))
    with pytest.raises(ScalerError) as exc:
        _scaler(docker, min_replicas=1).stop_worker("w1")
    assert exc.value.status_code == 409


def test_start_worker_starts_stopped_first():
    docker = FakeDocker(
        [{"id": "w1", "name": "w1", "state": "exited", "labels": {}}]
    )
    result = _scaler(docker).start_worker()
    assert result == {"id": "w1", "action": "start"}


def test_start_worker_rejected_at_max():
    docker = FakeDocker(_running("running", "w1", "w2"))
    with pytest.raises(ScalerError) as exc:
        _scaler(docker, max_replicas=2).start_worker()
    assert exc.value.status_code == 409


# ---------------- status ----------------

def test_status_marks_idle_and_busy_when_flower_up():
    docker = FakeDocker(_running("running", "w1", "w2"))
    flower = FakeFlower({"celery@w1": 0, "celery@w2": 1})
    status = _scaler(docker, flower).status(desired=2)
    by_id = {w["id"]: w["activity"] for w in status["workers"]}
    assert status["flowerAvailable"] is True
    assert by_id == {"w1": "idle", "w2": "busy"}
    assert status["actual"] == 2 and status["desired"] == 2


def test_status_degrades_when_flower_down():
    docker = FakeDocker(_running("running", "w1"))
    status = _scaler(docker, FakeFlower(fail=True)).status()
    assert status["flowerAvailable"] is False
    assert status["workers"][0]["activity"] == "unknown"


def test_scale_reports_partial_failure_on_remove_error():
    class FlakyDocker(FakeDocker):
        def remove(self, container_id):
            if container_id == "w2":
                raise DockerError(500, "boom")
            super().remove(container_id)

    docker = FlakyDocker(_running("running", "w1", "w2", "w3"))
    result = _scaler(docker).scale(0)
    assert any(f["id"] == "w2" for f in result["changed"]["failed"])
    assert "w1" in result["changed"]["removed"]
