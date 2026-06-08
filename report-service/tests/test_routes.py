from fastapi.testclient import TestClient

from app.main import app
from app.routes.internal import get_generator, get_repository


class FakeRepository:
    def __init__(self):
        self.jobs = {}
        self.created = []

    def create(self, job_type, scope_type, scope_id, output_format, payload, requested_by):
        job = {
            "id": "report-1",
            "jobType": job_type,
            "scopeType": scope_type,
            "scopeId": scope_id,
            "format": output_format,
            "payload": payload,
            "status": "pending",
            "error": "",
            "generatedArtifactId": "",
            "requestedBy": requested_by,
            "createdAt": "2026-01-01T00:00:00Z",
            "startedAt": "",
            "completedAt": "",
        }
        self.jobs[job["id"]] = job
        self.created.append(job)
        return job

    def get(self, job_id):
        if job_id not in self.jobs:
            raise KeyError(job_id)
        return self.jobs[job_id]

    def latest_by_scope(self, scope_type, scope_id):
        for job in reversed(list(self.jobs.values())):
            if job["scopeType"] == scope_type and job["scopeId"] == scope_id:
                return job
        raise KeyError(scope_id)

    def mark_running(self, job_id):
        job = self.get(job_id)
        job["status"] = "running"
        job["startedAt"] = "2026-01-01T00:01:00Z"
        return job

    def mark_failed(self, job_id, error):
        job = self.get(job_id)
        job["status"] = "failed"
        job["error"] = error
        return job


class FakeGenerator:
    def generate(self, job):
        return {**job, "status": "completed", "generatedArtifactId": "artifact-1"}


def test_create_and_get_report_job():
    repo = FakeRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)

    try:
        response = client.post(
            "/internal/reports",
            json={
                "jobType": "batch_report",
                "scopeType": "batch",
                "scopeId": "batch-1",
                "format": "json",
                "payload": {"includeArtifacts": True},
                "requestedBy": "user-1",
            },
        )
        assert response.status_code == 201
        assert response.json()["id"] == "report-1"
        assert response.json()["status"] == "pending"

        get_response = client.get("/internal/reports/report-1")
        assert get_response.status_code == 200
        assert get_response.json()["scopeId"] == "batch-1"
    finally:
        app.dependency_overrides.clear()


def test_get_report_job_returns_404_for_missing_job():
    repo = FakeRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)

    try:
        response = client.get("/internal/reports/missing")
        assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_run_report_job_marks_job_running():
    repo = FakeRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    app.dependency_overrides[get_generator] = lambda: FakeGenerator()
    client = TestClient(app)

    try:
        client.post(
            "/internal/reports",
            json={"jobType": "batch_report", "scopeType": "batch", "scopeId": "batch-1", "format": "json"},
        )
        response = client.post("/internal/reports/report-1/run")
        assert response.status_code == 202
        assert response.json()["status"] == "completed"
        assert response.json()["generatedArtifactId"] == "artifact-1"
    finally:
        app.dependency_overrides.clear()


def test_get_latest_batch_report():
    repo = FakeRepository()
    repo.create("batch_report", "batch", "batch-1", "json", {}, "")
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)

    try:
        response = client.get("/internal/batches/batch-1/report")
        assert response.status_code == 200
        assert response.json()["id"] == "report-1"
    finally:
        app.dependency_overrides.clear()
