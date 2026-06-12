import json
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.routes.internal import get_repository, get_store
from app.store import ARTIFACT_DIRECTORIES, UnsafeArtifactPath


class FakeStore:
    def __init__(self, tmp_path):
        self.tmp_path = tmp_path
        self.saved = []
        self.files = {}

    def save(self, scope, artifact_type, filename, content):
        if scope.startswith("../") or filename.startswith("../") or filename.startswith("/"):
            raise UnsafeArtifactPath(scope)
        self.saved.append((scope, artifact_type, filename, content))
        key = f"{scope}/{ARTIFACT_DIRECTORIES.get(artifact_type, f'{artifact_type}s')}/{filename}"
        path = self.tmp_path / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        self.files[key] = path
        return type("Stored", (), {"object_key": key, "size_bytes": len(content), "content_hash": "hash"})()

    def open_path(self, object_key):
        return self.files[object_key]


class FakeRepository:
    def __init__(self):
        self.created = []
        self.items = []
        self.upserts = []

    def create(self, scope, artifact_type, object_key, size_bytes, content_hash, metadata):
        item = {
            "id": f"artifact-{len(self.items) + 1}",
            "scope": scope,
            "artifactType": artifact_type,
            "objectKey": object_key,
            "sizeBytes": size_bytes,
            "contentHash": content_hash,
            "metadata": metadata,
            "createdAt": "2026-01-01T00:00:00Z",
        }
        self.items.append(item)
        return item

    def upsert(self, scope, artifact_type, object_key, size_bytes, content_hash, metadata):
        self.upserts.append(object_key)
        for item in self.items:
            if item["scope"] == scope and item["artifactType"] == artifact_type and item["objectKey"] == object_key:
                item.update({"sizeBytes": size_bytes, "contentHash": content_hash, "metadata": metadata})
                return item
        return self.create(scope, artifact_type, object_key, size_bytes, content_hash, metadata)

    def list_by_scope(self, scope):
        return [item for item in self.items if item["scope"] == scope]

    def list_by_batch(self, batch_id):
        return [item for item in self.items if item["metadata"].get("batchId") == batch_id]

    def get(self, artifact_id):
        return next(item for item in self.items if item["id"] == artifact_id)


def test_routes_save_list_and_download_artifact(tmp_path):
    store = FakeStore(tmp_path)
    repo = FakeRepository()
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)

    try:
        response = client.post(
            "/internal/artifacts",
            data={
                "scope": "iterations/i1",
                "artifactType": "screenshot",
                "metadata": json.dumps({"filename": "before.png", "contentType": "image/png"}),
            },
            files={"file": ("before.png", b"png-bytes", "image/png")},
        )
        assert response.status_code == 201
        artifact = response.json()

        list_response = client.get("/internal/artifacts", params={"scope": "iterations/i1"})
        assert list_response.status_code == 200
        assert list_response.json() == [artifact]

        download_response = client.get(f"/internal/artifacts/{artifact['id']}")
        assert download_response.status_code == 200
        assert download_response.content == b"png-bytes"
        assert download_response.headers["content-type"] == "image/png"
        assert "before.png" in download_response.headers["content-disposition"]
    finally:
        app.dependency_overrides.clear()


def test_save_artifact_rejects_invalid_metadata_json(tmp_path):
    store = FakeStore(tmp_path)
    repo = FakeRepository()
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)

    try:
        response = client.post(
            "/internal/artifacts",
            data={"scope": "iterations/i1", "artifactType": "log", "metadata": "{invalid"},
            files={"file": ("execution.log", b"log", "text/plain")},
        )
        assert response.status_code == 400
        assert repo.items == []
    finally:
        app.dependency_overrides.clear()


def test_save_artifact_rejects_unsafe_scope(tmp_path):
    store = FakeStore(tmp_path)
    repo = FakeRepository()
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)

    try:
        response = client.post(
            "/internal/artifacts",
            data={"scope": "../outside", "artifactType": "log", "metadata": "{}"},
            files={"file": ("execution.log", b"log", "text/plain")},
        )
        assert response.status_code == 400
        assert repo.items == []
    finally:
        app.dependency_overrides.clear()


def test_download_missing_artifact_file_returns_404(tmp_path):
    store = FakeStore(tmp_path)
    repo = FakeRepository()
    artifact = repo.create(
        scope="iterations/i1",
        artifact_type="log",
        object_key="iterations/i1/logs/missing.log",
        size_bytes=3,
        content_hash="hash",
        metadata={"filename": "missing.log", "contentType": "text/plain"},
    )
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)

    try:
        response = client.get(f"/internal/artifacts/{artifact['id']}")
        assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_routes_archive_scope(tmp_path):
    store = FakeStore(tmp_path)
    repo = FakeRepository()
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)

    try:
        client.post(
            "/internal/artifacts",
            data={"scope": "iterations/i1", "artifactType": "log", "metadata": "{}"},
            files={"file": ("execution.log", b"log", "text/plain")},
        )
        response = client.get("/internal/scopes/iterations/i1/archive")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"
        assert response.content.startswith(b"PK")
        archive_path = tmp_path / "archive.zip"
        archive_path.write_bytes(response.content)
        with zipfile.ZipFile(archive_path) as archive:
            assert archive.namelist() == ["logs/execution.log"]
    finally:
        app.dependency_overrides.clear()


def test_archive_scope_enforces_max_file_limit(tmp_path):
    store = FakeStore(tmp_path)
    repo = FakeRepository()
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)

    try:
        for index in range(2):
            response = client.post(
                "/internal/artifacts",
                data={"scope": "iterations/i1", "artifactType": "log", "metadata": "{}"},
                files={"file": (f"{index}.log", b"log", "text/plain")},
            )
            assert response.status_code == 201
        response = client.get("/internal/scopes/iterations/i1/archive?maxFiles=1")
        assert response.status_code == 413
    finally:
        app.dependency_overrides.clear()


def test_routes_archive_batch_collects_iteration_artifacts_by_metadata(tmp_path):
    store = FakeStore(tmp_path)
    repo = FakeRepository()
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)

    try:
        response = client.post(
            "/internal/artifacts",
            data={
                "scope": "iterations/i1",
                "artifactType": "log",
                "metadata": json.dumps({"batchId": "b1", "filename": "execution.log"}),
            },
            files={"file": ("execution.log", b"log", "text/plain")},
        )
        assert response.status_code == 201

        response = client.get("/internal/batches/b1/archive")
        assert response.status_code == 200
        archive_path = tmp_path / "batch.zip"
        archive_path.write_bytes(response.content)
        with zipfile.ZipFile(archive_path) as archive:
            assert archive.namelist() == ["iterations/i1/logs/execution.log"]
    finally:
        app.dependency_overrides.clear()


def test_save_artifact_with_upsert_keeps_artifact_id_stable(tmp_path):
    store = FakeStore(tmp_path)
    repo = FakeRepository()
    app.dependency_overrides[get_store] = lambda: store
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)

    try:
        first = client.post(
            "/internal/artifacts",
            data={
                "scope": "iterations/i1",
                "artifactType": "timeline",
                "metadata": json.dumps({"filename": "action_timeline.json", "stepCount": 1}),
                "upsert": "true",
            },
            files={"file": ("action_timeline.json", b'{"steps": 1}', "application/json")},
        )
        second = client.post(
            "/internal/artifacts",
            data={
                "scope": "iterations/i1",
                "artifactType": "timeline",
                "metadata": json.dumps({"filename": "action_timeline.json", "stepCount": 2}),
                "upsert": "true",
            },
            files={"file": ("action_timeline.json", b'{"steps": 2}', "application/json")},
        )
        assert first.status_code == 201
        assert second.status_code == 201
        # Same artifact id, updated content and metadata; only one row exists.
        assert second.json()["id"] == first.json()["id"]
        assert second.json()["metadata"]["stepCount"] == 2
        assert len(repo.items) == 1
        download = client.get(f"/internal/artifacts/{first.json()['id']}")
        assert download.content == b'{"steps": 2}'
        # A plain save (no upsert) still creates a new row.
        third = client.post(
            "/internal/artifacts",
            data={
                "scope": "iterations/i1",
                "artifactType": "timeline",
                "metadata": json.dumps({"filename": "action_timeline.json"}),
            },
            files={"file": ("action_timeline.json", b'{"steps": 3}', "application/json")},
        )
        assert third.json()["id"] != first.json()["id"]
        assert len(repo.items) == 2
    finally:
        app.dependency_overrides.clear()
