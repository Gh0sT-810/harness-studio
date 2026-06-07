import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.routes.internal import get_repository, get_store


class FakeStore:
    def __init__(self, tmp_path):
        self.tmp_path = tmp_path
        self.saved = []
        self.files = {}

    def save(self, scope, artifact_type, filename, content):
        self.saved.append((scope, artifact_type, filename, content))
        key = f"{scope}/screenshots/{filename}" if artifact_type == "screenshot" else f"{scope}/{artifact_type}/{filename}"
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

    def create(self, scope, artifact_type, object_key, size_bytes, content_hash, metadata):
        item = {
            "id": "artifact-1",
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

    def list_by_scope(self, scope):
        return [item for item in self.items if item["scope"] == scope]

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
    finally:
        app.dependency_overrides.clear()
