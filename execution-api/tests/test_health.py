from fastapi.testclient import TestClient

from app.main import app


def test_health_reports_dependency_readiness(monkeypatch):
    monkeypatch.setattr("app.main.check_postgres", lambda: True)
    monkeypatch.setattr("app.main.check_redis", lambda: True)

    response = TestClient(app).get("/internal/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "dependencies": {
            "postgres": "ok",
            "redis": "ok",
        },
    }
