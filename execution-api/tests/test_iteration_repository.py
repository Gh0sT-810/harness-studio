from contextlib import contextmanager

from app.repositories import iterations
from app.repositories.iterations import PostgresIterationRepository


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

    def fetchall(self):
        rows = self.rows
        self.rows = []
        return rows


class FakeConnection:
    def __init__(self, cursor):
        self.cursor_instance = cursor

    def cursor(self):
        return self.cursor_instance


@contextmanager
def fake_connect(cursor):
    yield FakeConnection(cursor)


def patch_connect(monkeypatch, cursor):
    monkeypatch.setattr(iterations, "connect", lambda: fake_connect(cursor))


def test_claim_iteration_is_atomic_and_sets_lease(monkeypatch):
    cursor = FakeCursor([("iteration-1", "execution-1", "batch-1", 2)])
    patch_connect(monkeypatch, cursor)

    claimed = PostgresIterationRepository().claim_iteration("iteration-1", "worker-1", lease_seconds=60)

    sql, params = cursor.executed[0]
    assert "UPDATE execution.iterations" in sql
    assert "status IN ('pending', 'retrying')" in sql
    assert "cancel_requested = false" in sql
    assert "lease_expires_at = now() + (%s || ' seconds')::interval" in sql
    assert params == ("worker-1", 60, "iteration-1")
    assert claimed == {
        "id": "iteration-1",
        "execution_id": "execution-1",
        "batch_id": "batch-1",
        "attempt": 2,
    }


def test_get_iteration_hydrates_cancellation_and_verification_fields(monkeypatch):
    cursor = FakeCursor([
        (
            "iteration-1",
            "execution-1",
            "batch-1",
            "executing",
            True,
            "https://example.com",
            "Do the thing",
            "task-1",
            {"forceFail": True},
            {"seed": 1},
            {"expected": {"ok": True}},
            "/tmp/verifier.py",
            "grader_config",
            "model-1",
            "provider-1",
            "text",
            "text_only",
            "local-test-model",
            "Local Test Model",
            {"text": True},
            {},
            {},
            60,
            0,
            "",
        )
    ])
    patch_connect(monkeypatch, cursor)

    iteration = PostgresIterationRepository().get_iteration("iteration-1")

    sql, params = cursor.executed[0]
    assert "iterations.cancel_requested" in sql
    assert "executions.snapshot_grader_config" in sql
    assert params == ("iteration-1",)
    assert iteration["cancel_requested"] is True
    assert iteration["snapshot_verification_strategy"] == "grader_config"
    assert iteration["snapshot_grader_config"] == {"forceFail": True}
    assert iteration["snapshot_simulator_config"] == {"seed": 1}
    assert iteration["snapshot_db_json_validator"] == {"expected": {"ok": True}}
    assert iteration["snapshot_verifier_path"] == "/tmp/verifier.py"
    assert iteration["model_config"]["adapter_key"] == "text_only"


def test_heartbeat_only_updates_claimed_worker(monkeypatch):
    cursor = FakeCursor([(True,)])
    patch_connect(monkeypatch, cursor)

    refreshed = PostgresIterationRepository().heartbeat("iteration-1", "worker-1", lease_seconds=60)

    sql, params = cursor.executed[0]
    assert "worker_id = %s" in sql
    assert "status = 'executing'" in sql
    assert params == (60, "iteration-1", "worker-1")
    assert refreshed is True


def test_complete_iteration_persists_terminal_state(monkeypatch):
    cursor = FakeCursor([("iteration-1", "passed")])
    patch_connect(monkeypatch, cursor)

    completed = PostgresIterationRepository().complete_iteration(
        "iteration-1",
        "worker-1",
        "passed",
        {"score": 1},
        {"strategy": "local"},
        "ok",
        3,
    )

    sql, params = cursor.executed[0]
    assert "completed_at = now()" in sql
    assert "result_data = %s::jsonb" in sql
    assert "verification_details = %s::jsonb" in sql
    assert params[0] == "passed"
    assert params[-2:] == ("iteration-1", "worker-1")
    assert completed == {"id": "iteration-1", "status": "passed"}


def test_recover_expired_leases_marks_retryable_rows(monkeypatch):
    cursor = FakeCursor([
        ("iteration-1", "execution-1", "batch-1", "retrying"),
        ("iteration-2", "execution-2", "batch-1", "crashed"),
    ])
    patch_connect(monkeypatch, cursor)

    recovered = PostgresIterationRepository().recover_expired_leases(max_attempts=2)

    sql, params = cursor.executed[0]
    assert "lease_expires_at < now()" in sql
    assert "attempt = attempt + 1" in sql
    assert params == (2,)
    assert recovered == [
        {"id": "iteration-1", "execution_id": "execution-1", "batch_id": "batch-1", "status": "retrying"},
        {"id": "iteration-2", "execution_id": "execution-2", "batch_id": "batch-1", "status": "crashed"},
    ]
