#!/usr/bin/env python3
"""End-to-end smoke checks for Phase 1-7 harness completion.

The script intentionally uses only the Python standard library so it can run
from a fresh developer machine or CI job without extra dependencies.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


@dataclass
class SmokeClient:
    base_url: str
    token: str = ""

    def request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        data = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(self.base_url + path, data=data, method=method)
        request.add_header("Content-Type", "application/json")
        if self.token:
            request.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                body = response.read().decode()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as exc:
            body = exc.read().decode()
            raise RuntimeError(f"{method} {path} failed: {exc.code} {body}") from exc

    def raw(self, path: str) -> tuple[bytes, str]:
        request = urllib.request.Request(self.base_url + path, method="GET")
        if self.token:
            request.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return response.read(), response.headers.get("Content-Type", "")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode()
            raise RuntimeError(f"GET {path} failed: {exc.code} {body}") from exc


def data(envelope: dict[str, Any]) -> Any:
    if not envelope.get("success", True):
        raise RuntimeError(f"API returned unsuccessful envelope: {envelope}")
    return envelope.get("data")


def login(client: SmokeClient, email: str, password: str) -> None:
    response = data(client.request("POST", "/api/auth/login", {"email": email, "password": password}))
    client.token = response["accessToken"]
    print("auth: login ok")


def phase1_3(client: SmokeClient) -> dict[str, str]:
    suffix = str(int(time.time()))
    health = data(client.request("GET", "/health"))
    assert health["status"] == "ok", health
    print("phase1: api health ok")

    gym = data(
        client.request(
            "POST",
            "/api/gyms",
            {
                "name": f"Smoke Gym {suffix}",
                "baseUrl": "about:blank",
                "description": "Phase 1-7 smoke gym",
                "verificationStrategy": "verification_endpoint",
                "flowCount": 1,
                "similarityEnabled": False,
                "similarityThreshold": 0,
            },
        )
    )
    task = data(
        client.request(
            "POST",
            "/api/tasks",
            {
                "gymId": gym["id"],
                "taskId": f"smoke-task-{suffix}",
                "prompt": "Open the page and capture the browser state.",
                "graderConfig": {},
                "simulatorConfig": {},
                "dbJsonValidator": {},
                "verifierPath": "",
            },
        )
    )
    models = data(client.request("GET", "/api/models"))
    if not models:
        raise RuntimeError("no model definitions available for smoke batch")
    model_id = models[0]["id"]
    batch = data(
        client.request(
            "POST",
            "/api/batches",
            {
                "name": f"Smoke Batch {suffix}",
                "gymId": gym["id"],
                "taskIds": [task["id"]],
                "modelIds": [model_id],
                "iterationCount": 1,
                "rerunEnabled": False,
            },
        )
    )
    snapshot = data(client.request("GET", f"/api/batches/{batch['id']}/snapshot"))
    assert snapshot["batch"]["id"] == batch["id"], snapshot
    assert len(snapshot["executions"]) == 1, snapshot
    assert len(snapshot["iterations"]) == 1, snapshot
    assert snapshot["counts"]["total"] == 1, snapshot
    print("phase2: auth/catalog/batch/snapshot ok")

    # SSE is long-lived; open it long enough to prove headers and event framing.
    url = f"{client.base_url}/api/batches/{batch['id']}/events?{urllib.parse.urlencode({'access_token': client.token})}"
    with urllib.request.urlopen(url, timeout=5) as response:
        first_chunk = response.read(256).decode(errors="ignore")
    if "event:" not in first_chunk and ": heartbeat" not in first_chunk:
        raise RuntimeError(f"SSE stream did not produce event framing: {first_chunk!r}")
    print("phase3: sse stream framing ok")
    return {"gymId": gym["id"], "taskId": task["id"], "modelId": model_id, "batchId": batch["id"]}


def wait_for_iteration(client: SmokeClient, batch_id: str, timeout_seconds: int = 90) -> dict[str, Any]:
    deadline = time.time() + timeout_seconds
    last_snapshot: dict[str, Any] | None = None
    while time.time() < deadline:
        last_snapshot = data(client.request("GET", f"/api/batches/{batch_id}/snapshot"))
        iterations = last_snapshot.get("iterations", [])
        if iterations and iterations[0]["status"] in {"passed", "failed", "cancelled", "crashed"}:
            return last_snapshot
        time.sleep(2)
    raise RuntimeError(f"iteration did not finish before timeout; last snapshot={last_snapshot}")


def phase5_artifacts(client: SmokeClient, ids: dict[str, str]) -> None:
    snapshot = wait_for_iteration(client, ids["batchId"])
    iteration = snapshot["iterations"][0]
    iteration_id = iteration["id"]
    files = client.request("GET", f"/api/iterations/{iteration_id}/files")
    if not isinstance(files, list):
        raise RuntimeError(f"iteration files endpoint returned unexpected body: {files}")
    artifact_types = {artifact["artifactType"] for artifact in files}
    required = {"screenshot", "timeline", "log", "conversation", "task_response", "verification"}
    missing = required - artifact_types
    if missing:
        raise RuntimeError(f"missing required artifacts: {sorted(missing)}; files={files}")
    timeline_body, timeline_type = client.raw(f"/api/iterations/{iteration_id}/timeline")
    timeline = json.loads(timeline_body.decode())
    assert timeline["iterationId"] == iteration_id, timeline
    assert timeline["steps"], timeline
    assert "application/json" in timeline_type, timeline_type
    screenshot_body, screenshot_type = client.raw(f"/api/iterations/{iteration_id}/screenshot?kind=after")
    assert screenshot_body, "empty screenshot response"
    assert "image/" in screenshot_type, screenshot_type
    archive_body, archive_type = client.raw(f"/api/batches/{ids['batchId']}/archive")
    assert archive_body, "empty batch archive"
    assert "zip" in archive_type or "octet-stream" in archive_type, archive_type
    print("phase5: artifacts, timeline, screenshot, and archive ok")


def phase6_analytics(client: SmokeClient, ids: dict[str, str]) -> None:
    usage = data(client.request("GET", f"/api/usage/summary?batchId={urllib.parse.quote(ids['batchId'])}"))
    assert usage["runs"] >= 1, usage
    assert usage["totalTokens"] > 0, usage
    csv_body, csv_type = client.raw(f"/api/usage/export/csv?batchId={urllib.parse.quote(ids['batchId'])}")
    assert b"model" in csv_body.lower() or b"model_id" in csv_body.lower(), csv_body[:200]
    assert "text/csv" in csv_type, csv_type
    leaderboard = data(client.request("GET", f"/api/leaderboard?batchId={urllib.parse.quote(ids['batchId'])}"))
    assert leaderboard, "leaderboard returned no rows"
    assert leaderboard[0]["totalTokens"] > 0, leaderboard

    report = data(client.request("POST", f"/api/batches/{ids['batchId']}/report"))
    assert report["status"] == "completed", report
    artifact_map = report.get("payload", {}).get("artifacts", {})
    for key, expected_type in {
        "json": "application/json",
        "csv": "text/csv",
        "xlsx": "spreadsheetml",
    }.items():
        artifact = artifact_map.get(key)
        if not artifact:
            raise RuntimeError(f"report missing {key} artifact: {report}")
        body, content_type = client.raw(f"/api/artifacts/{artifact['id']}")
        assert body, f"empty {key} report artifact"
        assert expected_type in content_type, f"{key} artifact content-type mismatch: {content_type}"
    latest = data(client.request("GET", f"/api/batches/{ids['batchId']}/report"))
    assert latest["id"] == report["id"], latest
    print("phase6: reports, token usage, CSV export, and leaderboard ok")


def phase7_registry(client: SmokeClient, ids: dict[str, str]) -> None:
    suffix = str(int(time.time()))
    provider = data(
        client.request(
            "POST",
            "/api/model-providers",
            {
                "key": f"smoke-local-{suffix}",
                "name": f"Smoke Local {suffix}",
                "displayName": f"Smoke Local {suffix}",
                "adapterKey": "local",
                "baseUrl": "",
                "secretRef": "",
                "enabled": True,
                "config": {"mockConnectivity": True},
            },
        )
    )
    model = data(
        client.request(
            "POST",
            "/api/models",
            {
                "providerId": provider["id"],
                "modelName": f"smoke-local-model-{suffix}",
                "displayName": f"Smoke Local Model {suffix}",
                "capabilities": {"text": True},
                "config": {"deterministic": True},
                "costConfig": {"inputPer1k": 0, "outputPer1k": 0},
                "timeoutSeconds": 30,
                "maxOutputTokens": 128,
                "enabled": True,
                "isDefault": True,
            },
        )
    )
    runtime = data(client.request("PUT", "/api/admin/runtime-config", {"defaultModelId": model["id"], "modelCallTimeoutSeconds": 30}))
    assert runtime["value"]["defaultModelId"] == model["id"], runtime

    provider_test = data(client.request("POST", f"/api/model-providers/{provider['id']}/test"))
    assert provider_test["status"] == "ok", provider_test
    model_test = data(client.request("POST", f"/api/models/{model['id']}/test"))
    assert model_test["status"] == "ok", model_test

    batch = data(
        client.request(
            "POST",
            "/api/batches",
            {
                "name": f"Smoke Default Model Batch {int(time.time())}",
                "gymId": ids["gymId"],
                "taskIds": [ids["taskId"]],
                "iterationCount": 1,
                "rerunEnabled": False,
            },
        )
    )
    snapshot = data(client.request("GET", f"/api/batches/{batch['id']}/snapshot"))
    assert snapshot["executions"][0]["modelId"] == model["id"], snapshot
    print("phase7: runtime default, provider/model tests, and default model batch ok")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:8080")
    parser.add_argument("--email", default="test@example.com")
    parser.add_argument("--password", default="Test@$1234")
    args = parser.parse_args()

    client = SmokeClient(args.base_url.rstrip("/"))
    login(client, args.email, args.password)
    ids = phase1_3(client)
    phase5_artifacts(client, ids)
    phase6_analytics(client, ids)
    phase7_registry(client, ids)
    print(json.dumps({"ok": True, **ids}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
