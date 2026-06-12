import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread

import pytest

from app.artifacts.client import ArtifactClient, ArtifactClientError


class UploadHandler(BaseHTTPRequestHandler):
    status_code = 201
    body = {
        "id": "artifact-1",
        "scope": "iterations/i1",
        "artifactType": "timeline",
        "objectKey": "iterations/i1/timeline/action_timeline.json",
        "sizeBytes": 2,
        "contentHash": "hash",
        "metadata": {"filename": "action_timeline.json"},
        "createdAt": "2026-01-01T00:00:00Z",
    }
    last_path = ""
    last_content_type = ""
    last_body = b""

    def do_POST(self):
        UploadHandler.last_path = self.path
        UploadHandler.last_content_type = self.headers["Content-Type"]
        content_length = int(self.headers.get("Content-Length", "0"))
        UploadHandler.last_body = self.rfile.read(content_length) if content_length else b""
        self.send_response(self.status_code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(self.body).encode())

    def log_message(self, *_):
        return


@pytest.fixture
def upload_server():
    server = HTTPServer(("127.0.0.1", 0), UploadHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()


def test_artifact_client_saves_bytes(upload_server):
    UploadHandler.status_code = 201
    client = ArtifactClient(upload_server)

    artifact = client.save_bytes(
        scope="iterations/i1",
        artifact_type="timeline",
        filename="action_timeline.json",
        content=b"{}",
        metadata={"filename": "action_timeline.json"},
        content_type="application/json",
    )

    assert UploadHandler.last_path == "/internal/artifacts"
    assert "multipart/form-data" in UploadHandler.last_content_type
    assert artifact["id"] == "artifact-1"
    assert artifact["artifactType"] == "timeline"
    assert b'name="upsert"' not in UploadHandler.last_body


def test_artifact_client_sends_upsert_field_when_requested(upload_server):
    UploadHandler.status_code = 201
    client = ArtifactClient(upload_server)

    client.save_bytes(
        scope="iterations/i1",
        artifact_type="timeline",
        filename="action_timeline.json",
        content=b"{}",
        metadata={"filename": "action_timeline.json"},
        content_type="application/json",
        upsert=True,
    )

    assert b'name="upsert"' in UploadHandler.last_body
    assert b"true" in UploadHandler.last_body


def test_artifact_client_raises_for_failed_upload(upload_server):
    UploadHandler.status_code = 500
    client = ArtifactClient(upload_server)

    with pytest.raises(ArtifactClientError):
        client.save_bytes("iterations/i1", "log", "execution.log", b"log", {}, "text/plain")
