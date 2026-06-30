import httpx
import pytest

from app.docker_client import DockerClient, DockerError, DockerUnavailable


def _response(status_code, json_body=None, text=""):
    request = httpx.Request("GET", "http://docker/")
    if json_body is not None:
        return httpx.Response(status_code, json=json_body, request=request)
    return httpx.Response(status_code, text=text, request=request)


def test_summarize_extracts_fields():
    summary = DockerClient._summarize(
        {
            "Id": "abc",
            "Names": ["/harness-worker-1"],
            "State": "running",
            "Status": "Up 3 minutes",
            "Labels": {"com.harness.role": "worker-execution"},
        }
    )
    assert summary == {
        "id": "abc",
        "name": "harness-worker-1",
        "state": "running",
        "status": "Up 3 minutes",
        "labels": {"com.harness.role": "worker-execution"},
    }


def test_start_treats_304_as_success(monkeypatch):
    # Docker returns 304 for start-already-started / stop-already-stopped.
    monkeypatch.setattr(httpx, "request", lambda *a, **k: _response(304))
    DockerClient(base_url="http://docker").start("c1")  # must not raise


def test_non_success_status_raises_docker_error(monkeypatch):
    monkeypatch.setattr(httpx, "request", lambda *a, **k: _response(500, text="boom"))
    with pytest.raises(DockerError) as exc:
        DockerClient(base_url="http://docker").stop("c1")
    assert exc.value.status_code == 500


def test_connection_failure_raises_unavailable(monkeypatch):
    def boom(*a, **k):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(httpx, "request", boom)
    with pytest.raises(DockerUnavailable):
        DockerClient(base_url="http://docker").list_workers("com.harness.role=worker-execution")
