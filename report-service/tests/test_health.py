from fastapi.testclient import TestClient

from app import main


def test_health_reports_all_dependencies_ready(monkeypatch):
    monkeypatch.setattr(main, "check_postgres", lambda: True)
    monkeypatch.setattr(main, "check_redis", lambda: True)
    monkeypatch.setattr(main, "check_artifact_service", lambda: True)

    response = TestClient(main.app).get("/internal/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "dependencies": {
            "postgres": "ok",
            "redis": "ok",
            "artifactService": "ok",
        },
    }


def test_health_returns_503_when_dependency_is_unavailable(monkeypatch):
    monkeypatch.setattr(main, "check_postgres", lambda: True)
    monkeypatch.setattr(main, "check_redis", lambda: False)
    monkeypatch.setattr(main, "check_artifact_service", lambda: True)

    response = TestClient(main.app).get("/internal/health")

    assert response.status_code == 503
    assert response.json()["status"] == "degraded"
    assert response.json()["dependencies"]["redis"] == "error"
