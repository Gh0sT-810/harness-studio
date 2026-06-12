from contextlib import contextmanager

from app import repository
from app.repository import ArtifactMetadataRepository


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


def test_repository_creates_artifact_metadata(monkeypatch):
    cursor = FakeCursor([
        ("artifact-1", "iterations/i1", "screenshot", "iterations/i1/screenshots/before.png", 4, "hash", b'{"filename":"before.png"}', "2026-01-01T00:00:00Z")
    ])
    monkeypatch.setattr(repository, "connect", lambda: fake_connect(cursor))

    item = ArtifactMetadataRepository().create(
        scope="iterations/i1",
        artifact_type="screenshot",
        object_key="iterations/i1/screenshots/before.png",
        size_bytes=4,
        content_hash="hash",
        metadata={"filename": "before.png"},
    )

    sql, params = cursor.executed[0]
    assert "INSERT INTO artifacts.artifacts" in sql
    assert params[:5] == ("iterations/i1", "screenshot", "iterations/i1/screenshots/before.png", 4, "hash")
    assert item["id"] == "artifact-1"
    assert item["metadata"] == {"filename": "before.png"}


def test_repository_upsert_updates_existing_row_in_place(monkeypatch):
    cursor = FakeCursor([
        ("artifact-1", "iterations/i1", "timeline", "iterations/i1/timeline/action_timeline.json", 9, "hash-2", b'{"stepCount":2}', "2026-01-01T00:00:00Z")
    ])
    monkeypatch.setattr(repository, "connect", lambda: fake_connect(cursor))

    item = ArtifactMetadataRepository().upsert(
        scope="iterations/i1",
        artifact_type="timeline",
        object_key="iterations/i1/timeline/action_timeline.json",
        size_bytes=9,
        content_hash="hash-2",
        metadata={"stepCount": 2},
    )

    sql, params = cursor.executed[0]
    assert "UPDATE artifacts.artifacts" in sql
    assert "WHERE scope = %s AND artifact_type = %s AND object_key = %s" in sql
    assert params[3:] == ("iterations/i1", "timeline", "iterations/i1/timeline/action_timeline.json")
    # Id is stable: the existing row is updated, not replaced.
    assert item["id"] == "artifact-1"
    assert item["metadata"] == {"stepCount": 2}


def test_repository_upsert_falls_back_to_insert_when_no_row_exists(monkeypatch):
    update_cursor = FakeCursor([])
    insert_cursor = FakeCursor([
        ("artifact-9", "iterations/i1", "timeline", "iterations/i1/timeline/action_timeline.json", 2, "hash", b'{}', "2026-01-01T00:00:00Z")
    ])
    cursors = [update_cursor, insert_cursor]
    monkeypatch.setattr(repository, "connect", lambda: fake_connect(cursors.pop(0)))

    item = ArtifactMetadataRepository().upsert(
        scope="iterations/i1",
        artifact_type="timeline",
        object_key="iterations/i1/timeline/action_timeline.json",
        size_bytes=2,
        content_hash="hash",
        metadata={},
    )

    assert "UPDATE artifacts.artifacts" in update_cursor.executed[0][0]
    assert "INSERT INTO artifacts.artifacts" in insert_cursor.executed[0][0]
    assert item["id"] == "artifact-9"


def test_repository_lists_scope(monkeypatch):
    cursor = FakeCursor([
        ("artifact-1", "iterations/i1", "timeline", "iterations/i1/timeline/action_timeline.json", 2, "hash", b'{}', "2026-01-01T00:00:00Z")
    ])
    monkeypatch.setattr(repository, "connect", lambda: fake_connect(cursor))

    items = ArtifactMetadataRepository().list_by_scope("iterations/i1")

    assert items[0]["artifactType"] == "timeline"
    assert cursor.executed[0][1] == ("iterations/i1",)


def test_repository_lists_batch_artifacts_by_metadata(monkeypatch):
    cursor = FakeCursor([
        ("artifact-1", "iterations/i1", "timeline", "iterations/i1/timeline/action_timeline.json", 2, "hash", b'{"batchId":"b1"}', "2026-01-01T00:00:00Z")
    ])
    monkeypatch.setattr(repository, "connect", lambda: fake_connect(cursor))

    items = ArtifactMetadataRepository().list_by_batch("b1")

    sql, params = cursor.executed[0]
    assert "metadata->>'batchId' = %s" in sql
    assert params == ("b1",)
    assert items[0]["scope"] == "iterations/i1"
