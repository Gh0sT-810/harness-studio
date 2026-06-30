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


def test_recover_expired_leases_clears_celery_task_id(monkeypatch):
    # REC-03: recovery must clear celery_task_id so list_dispatchable_iterations
    # (which requires COALESCE(celery_task_id,'')='') can re-dispatch the row.
    cursor = FakeCursor([])
    patch_connect(monkeypatch, cursor)

    PostgresIterationRepository().recover_expired_leases(max_attempts=2)

    sql, _ = cursor.executed[0]
    assert "celery_task_id = ''" in sql
    assert "worker_id = ''" in sql


def test_recovered_retrying_row_is_dispatchable(monkeypatch):
    # REC-04: the dispatchable query selects pending/retrying rows with empty
    # celery_task_id — the cleared row qualifies and is no longer stalled.
    cursor = FakeCursor([("iteration-1", "execution-1", "batch-1")])
    patch_connect(monkeypatch, cursor)

    rows = PostgresIterationRepository().list_dispatchable_iterations("batch-1")

    sql, params = cursor.executed[0]
    assert "status IN ('pending', 'retrying')" in sql
    assert "COALESCE(iterations.celery_task_id, '') = ''" in sql
    assert params == ("batch-1",)
    assert rows == [{"id": "iteration-1", "execution_id": "execution-1", "batch_id": "batch-1"}]


def test_claim_returns_none_when_row_not_claimable(monkeypatch):
    # CLM-04/05/07: the WHERE guard (status IN (pending,retrying) AND
    # cancel_requested=false) excludes executing / cancel-requested / terminal
    # rows, so a second worker's claim matches no row and returns None.
    cursor = FakeCursor([])
    patch_connect(monkeypatch, cursor)

    result = PostgresIterationRepository().claim_iteration("iteration-1", "worker-2", lease_seconds=60)

    sql, _ = cursor.executed[0]
    assert "status IN ('pending', 'retrying')" in sql
    assert "cancel_requested = false" in sql
    assert result is None


def test_heartbeat_returns_false_for_stale_or_reassigned_worker(monkeypatch):
    # HB-02/03: heartbeat is scoped to the owning worker_id AND status=executing,
    # so a delayed heartbeat from a dead replica cannot extend a reassigned
    # iteration's lease — the core N>1 protection.
    cursor = FakeCursor([])
    patch_connect(monkeypatch, cursor)

    refreshed = PostgresIterationRepository().heartbeat("iteration-1", "worker-1", lease_seconds=60)

    sql, _ = cursor.executed[0]
    assert "worker_id = %s" in sql
    assert "status = 'executing'" in sql
    assert refreshed is False


def test_complete_iteration_returns_not_found_for_stale_worker(monkeypatch):
    # CMP-02: complete is worker_id-scoped, so a zombie replica cannot clobber a
    # row that recovery already reassigned to a new owner.
    cursor = FakeCursor([])
    patch_connect(monkeypatch, cursor)

    completed = PostgresIterationRepository().complete_iteration(
        "iteration-1", "worker-1", "passed", {}, {}, "", 0
    )

    sql, _ = cursor.executed[0]
    assert "worker_id = %s" in sql
    assert completed == {"id": "iteration-1", "status": "not_found"}


def test_list_dispatchable_excludes_enqueued_and_cancelled(monkeypatch):
    # DSP-02/03/04: the gate excludes already-enqueued (celery_task_id set) and
    # cancel-requested rows so an in-flight/queued iteration is never re-dispatched.
    cursor = FakeCursor([])
    patch_connect(monkeypatch, cursor)

    rows = PostgresIterationRepository().list_dispatchable_iterations("batch-1")

    sql, _ = cursor.executed[0]
    assert "COALESCE(iterations.celery_task_id, '') = ''" in sql
    assert "COALESCE(iterations.cancel_requested, false) = false" in sql
    assert rows == []


def test_mark_cancelled_returns_not_found_for_unknown_iteration(monkeypatch):
    # CXL-04: cancelling an unknown id returns not_found without raising.
    cursor = FakeCursor([])
    patch_connect(monkeypatch, cursor)

    result = PostgresIterationRepository().mark_cancelled("missing")

    assert result == {"id": "missing", "status": "not_found"}
