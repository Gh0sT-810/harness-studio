from contextlib import contextmanager

from app import repository
from app.repository import ReportJobRepository


class FakeCursor:
    def __init__(self, rows):
        self.rows = list(rows)
        self.executed = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def execute(self, sql, params=()):
        self.executed.append((sql, params))

    def fetchone(self):
        return self.rows.pop(0) if self.rows else None


class FakeConnection:
    def __init__(self, cursor):
        self.cursor_instance = cursor

    def cursor(self):
        return self.cursor_instance


@contextmanager
def fake_connect(cursor):
    yield FakeConnection(cursor)


def test_repository_creates_report_job(monkeypatch):
    cursor = FakeCursor([
        (
            "report-1",
            "batch_report",
            "batch",
            "batch-1",
            "json",
            b'{"includeArtifacts":true}',
            "pending",
            "",
            None,
            "user-1",
            "2026-01-01T00:00:00Z",
            None,
            None,
        )
    ])
    monkeypatch.setattr(repository, "connect", lambda: fake_connect(cursor))

    job = ReportJobRepository().create(
        job_type="batch_report",
        scope_type="batch",
        scope_id="batch-1",
        output_format="json",
        payload={"includeArtifacts": True},
        requested_by="user-1",
    )

    sql, params = cursor.executed[0]
    assert "INSERT INTO reports.report_jobs" in sql
    assert params[:6] == ("batch/batch-1", "batch_report", "batch", "batch-1", "json", '{"includeArtifacts": true}')
    assert job["id"] == "report-1"
    assert job["status"] == "pending"
    assert job["payload"] == {"includeArtifacts": True}


def test_repository_gets_report_job(monkeypatch):
    cursor = FakeCursor([
        ("report-1", "batch_report", "batch", "batch-1", "json", b"{}", "completed", "", "artifact-1", "user-1", "created", "started", "completed")
    ])
    monkeypatch.setattr(repository, "connect", lambda: fake_connect(cursor))

    job = ReportJobRepository().get("report-1")

    assert cursor.executed[0][1] == ("report-1",)
    assert job["generatedArtifactId"] == "artifact-1"
    assert job["completedAt"] == "completed"


def test_repository_updates_report_lifecycle(monkeypatch):
    cursor = FakeCursor([
        ("report-1", "batch_report", "batch", "batch-1", "json", b"{}", "running", "", None, "user-1", "created", "started", None),
        ("report-1", "batch_report", "batch", "batch-1", "json", b"{}", "completed", "", "artifact-1", "user-1", "created", "started", "completed"),
        ("report-1", "batch_report", "batch", "batch-1", "json", b"{}", "failed", "boom", None, "user-1", "created", "started", "completed"),
    ])
    monkeypatch.setattr(repository, "connect", lambda: fake_connect(cursor))
    repo = ReportJobRepository()

    running = repo.mark_running("report-1")
    completed = repo.mark_completed("report-1", "artifact-1")
    failed = repo.mark_failed("report-1", "boom")

    assert running["status"] == "running"
    assert completed["generatedArtifactId"] == "artifact-1"
    assert failed["status"] == "failed"
    assert failed["error"] == "boom"
