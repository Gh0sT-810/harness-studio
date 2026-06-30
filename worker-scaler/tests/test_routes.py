from fastapi.testclient import TestClient

from app.docker_client import DockerUnavailable
from app.flower_client import FlowerUnavailable
from app.main import app
from app.routes.internal import get_scaler
from app.scaler import ScalerError


class FakeScaler:
    def __init__(self, **behaviors):
        self.behaviors = behaviors
        self.calls = []

    def _result(self, name, default):
        behavior = self.behaviors.get(name)
        if isinstance(behavior, Exception):
            raise behavior
        return behavior if behavior is not None else default

    def status(self, desired=None):
        self.calls.append(("status", desired))
        return self._result("status", {"desired": desired, "actual": 1, "total": 1, "flowerAvailable": True, "workers": []})

    def scale(self, replicas):
        self.calls.append(("scale", replicas))
        return self._result("scale", {"desired": replicas, "actual": replicas, "changed": {}})

    def stop_idle(self, count=None):
        self.calls.append(("stop_idle", count))
        return self._result("stop_idle", {"stopped": [], "failed": [], "idleFound": 0})

    def restart_worker(self, container_id):
        self.calls.append(("restart", container_id))
        return self._result("restart_worker", {"id": container_id, "action": "restart"})

    def stop_worker(self, container_id):
        self.calls.append(("stop", container_id))
        return self._result("stop_worker", {"id": container_id, "action": "stop"})

    def start_worker(self):
        self.calls.append(("start", None))
        return self._result("start_worker", {"id": "new", "action": "create"})


def _client(scaler):
    app.dependency_overrides[get_scaler] = lambda: scaler
    return TestClient(app)


def teardown_function():
    app.dependency_overrides.clear()


def test_scale_requires_replicas():
    assert _client(FakeScaler()).post("/internal/scale", json={}).status_code == 400


def test_scale_rejects_non_integer():
    assert _client(FakeScaler()).post("/internal/scale", json={"replicas": "x"}).status_code == 400


def test_scale_rejects_boolean_replicas():
    assert _client(FakeScaler()).post("/internal/scale", json={"replicas": True}).status_code == 400


def test_scale_happy_calls_scaler():
    scaler = FakeScaler()
    response = _client(scaler).post("/internal/scale", json={"replicas": 5})
    assert response.status_code == 200
    assert response.json()["desired"] == 5
    assert ("scale", 5) in scaler.calls


def test_scale_bounds_error_maps_to_400():
    scaler = FakeScaler(scale=ScalerError("out of range", status_code=400))
    assert _client(scaler).post("/internal/scale", json={"replicas": 999}).status_code == 400


def test_scale_docker_unavailable_maps_to_502():
    scaler = FakeScaler(scale=DockerUnavailable("down"))
    assert _client(scaler).post("/internal/scale", json={"replicas": 3}).status_code == 502


def test_get_workers_happy():
    response = _client(FakeScaler()).get("/internal/workers")
    assert response.status_code == 200
    assert "workers" in response.json()


def test_stop_idle_flower_unavailable_maps_to_502():
    scaler = FakeScaler(stop_idle=FlowerUnavailable("flower down"))
    assert _client(scaler).post("/internal/workers/stop-idle", json={}).status_code == 502


def test_stop_idle_rejects_non_positive_count():
    assert _client(FakeScaler()).post("/internal/workers/stop-idle", json={"count": -1}).status_code == 400


def test_stop_idle_happy_passes_count():
    scaler = FakeScaler()
    response = _client(scaler).post("/internal/workers/stop-idle", json={"count": 2})
    assert response.status_code == 200
    assert ("stop_idle", 2) in scaler.calls


def test_restart_unknown_worker_maps_to_404():
    scaler = FakeScaler(restart_worker=ScalerError("missing", status_code=404))
    assert _client(scaler).post("/internal/workers/abc/restart").status_code == 404


def test_restart_happy_passes_id():
    scaler = FakeScaler()
    response = _client(scaler).post("/internal/workers/c1/restart")
    assert response.status_code == 200
    assert ("restart", "c1") in scaler.calls


def test_start_worker_happy():
    assert _client(FakeScaler()).post("/internal/workers").status_code == 200
