#!/usr/bin/env python3
"""Import catalog data from a Turing AWS harness instance into Harness Studio.

Imports gyms and all tasks (paginated). Gyms are matched by name on re-run.

Example:
  set TURING_HARNESS_TOKEN=eyJ...
  python3 scripts/import_turing_gyms.py
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ApiClient:
    base_url: str
    token: str = ""

    def request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        data = json.dumps(payload).encode() if payload is not None else None
        url = self.base_url.rstrip("/") + path
        request = urllib.request.Request(url, data=data, method=method)
        request.add_header("Content-Type", "application/json")
        request.add_header("Accept", "application/json")
        if self.token:
            request.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                body = response.read().decode()
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as exc:
            body = exc.read().decode()
            raise RuntimeError(f"{method} {path} failed: {exc.code} {body}") from exc


@dataclass
class ImportStats:
    gyms_created: int = 0
    gyms_skipped: int = 0
    tasks_created: int = 0
    tasks_skipped: int = 0
    tasks_failed: int = 0


def data(envelope: dict[str, Any]) -> Any:
    if isinstance(envelope, dict) and "success" in envelope and not envelope.get("success", True):
        raise RuntimeError(f"API returned unsuccessful envelope: {envelope}")
    if isinstance(envelope, dict) and "data" in envelope:
        return envelope["data"]
    return envelope


def login(client: ApiClient, email: str, password: str) -> None:
    response = data(client.request("POST", "/api/auth/login", {"email": email, "password": password}))
    client.token = response["accessToken"]


def fetch_source_gyms(client: ApiClient) -> list[dict[str, Any]]:
    response = client.request("GET", "/api/v1/gyms?limit=500")
    gyms = response.get("gyms", [])
    if not isinstance(gyms, list):
        raise RuntimeError(f"unexpected gyms response: {response}")
    return gyms


def fetch_all_source_tasks(client: ApiClient, page_size: int = 200) -> list[dict[str, Any]]:
    skip = 0
    items: list[dict[str, Any]] = []
    total = None
    while total is None or skip < total:
        query = urllib.parse.urlencode({"skip": skip, "limit": page_size})
        response = client.request("GET", f"/api/v1/tasks?{query}")
        batch = response.get("tasks", [])
        if not isinstance(batch, list):
            raise RuntimeError(f"unexpected tasks response at skip={skip}: {response}")
        total = int(response.get("total", len(batch)))
        if not batch:
            break
        items.extend(batch)
        skip += len(batch)
        print(f"  fetched tasks {len(items)}/{total}")
    return items


def map_gym_payload(source: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": source["name"],
        "baseUrl": source["base_url"],
        "description": source.get("description") or "",
        "verificationStrategy": source.get("verification_strategy") or "verification_endpoint",
        "flowCount": int(source.get("flow_count") or 0),
        "similarityEnabled": bool(source.get("similarity_check_enabled", False)),
        "similarityThreshold": float(source.get("similarity_threshold") or 0.85),
    }


def map_task_payload(gym_id: str, source: dict[str, Any]) -> dict[str, Any]:
    return {
        "gymId": gym_id,
        "taskId": source["task_id"],
        "prompt": source.get("prompt") or "",
        "graderConfig": source.get("grader_config") or {},
        "simulatorConfig": source.get("simulator_config") or {},
        "dbJsonValidator": source.get("db_json_validator") or {},
        "verifierPath": source.get("verifier_path") or "",
    }


def import_catalog(source: ApiClient, target: ApiClient, *, dry_run: bool) -> ImportStats:
    stats = ImportStats()
    source_gyms = fetch_source_gyms(source)
    print(f"source gyms: {len(source_gyms)}")

    gym_uuid_to_target_id: dict[str, str] = {}
    known_names: set[str] = set()

    if not dry_run:
        existing = data(target.request("GET", "/api/gyms"))
        known_names = {gym["name"].lower() for gym in existing}

    for source_gym in source_gyms:
        payload = map_gym_payload(source_gym)
        name_key = payload["name"].lower()
        source_uuid = source_gym["uuid"]

        if name_key in known_names:
            stats.gyms_skipped += 1
            if not dry_run:
                gyms = data(target.request("GET", "/api/gyms"))
                match = next(g for g in gyms if g["name"].lower() == name_key)
                gym_uuid_to_target_id[source_uuid] = match["id"]
            continue

        if dry_run:
            print(f"would create gym: {payload['name']}")
            stats.gyms_created += 1
            continue

        created = data(target.request("POST", "/api/gyms", payload))
        gym_uuid_to_target_id[source_uuid] = created["id"]
        known_names.add(name_key)
        stats.gyms_created += 1
        print(f"created gym: {payload['name']} -> {created['id']}")

    if dry_run:
        print("would import all source tasks after gym sync")
        return stats

    if not gym_uuid_to_target_id:
        gyms = data(target.request("GET", "/api/gyms"))
        source_by_name = {g["name"].lower(): g["uuid"] for g in source_gyms}
        for gym in gyms:
            source_uuid = source_by_name.get(gym["name"].lower())
            if source_uuid:
                gym_uuid_to_target_id[source_uuid] = gym["id"]

    existing_tasks = data(target.request("GET", "/api/tasks"))
    known_task_keys = {(task["gymId"], task["taskId"].lower()) for task in existing_tasks}

    print("fetching source tasks...")
    source_tasks = fetch_all_source_tasks(source)
    print(f"source tasks: {len(source_tasks)}")

    for source_task in source_tasks:
        source_gym_uuid = source_task.get("gym_id", "")
        target_gym_id = gym_uuid_to_target_id.get(source_gym_uuid, "")
        if not target_gym_id:
            stats.tasks_failed += 1
            print(f"  skip task (unknown gym): {source_task.get('task_id')} gym_id={source_gym_uuid}")
            continue

        task_key = (target_gym_id, source_task["task_id"].lower())
        if task_key in known_task_keys:
            stats.tasks_skipped += 1
            continue

        task_payload = map_task_payload(target_gym_id, source_task)
        try:
            data(target.request("POST", "/api/tasks", task_payload))
        except RuntimeError as exc:
            stats.tasks_failed += 1
            print(f"  failed task {source_task.get('task_id')}: {exc}")
            continue

        known_task_keys.add(task_key)
        stats.tasks_created += 1
        if stats.tasks_created % 50 == 0:
            print(f"  created tasks: {stats.tasks_created}")

    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description="Import gyms and tasks from a Turing AWS harness instance.")
    parser.add_argument("--source-url", default=os.getenv("TURING_HARNESS_BASE_URL", "https://aws-harness.turing.com"))
    parser.add_argument("--target-url", default=os.getenv("HARNESS_STUDIO_BASE_URL", "http://localhost:8080"))
    parser.add_argument("--source-token", default=os.getenv("TURING_HARNESS_TOKEN", ""))
    parser.add_argument("--email", default=os.getenv("HARNESS_ADMIN_EMAIL", "test@example.com"))
    parser.add_argument("--password", default=os.getenv("HARNESS_ADMIN_PASSWORD", "Test@$1234"))
    parser.add_argument("--dry-run", action="store_true", help="Print actions without writing to harness-studio")
    args = parser.parse_args()

    if not args.source_token:
        print("error: set TURING_HARNESS_TOKEN or pass --source-token", file=sys.stderr)
        return 1

    source = ApiClient(args.source_url, args.source_token)
    target = ApiClient(args.target_url)

    if not args.dry_run:
        login(target, args.email, args.password)
        print(f"target login ok: {args.target_url}")

    stats = import_catalog(source, target, dry_run=args.dry_run)
    print(
        "done: "
        f"gyms created={stats.gyms_created}, gyms skipped={stats.gyms_skipped}, "
        f"tasks created={stats.tasks_created}, tasks skipped={stats.tasks_skipped}, "
        f"tasks failed={stats.tasks_failed}"
    )
    return 0 if stats.tasks_failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
