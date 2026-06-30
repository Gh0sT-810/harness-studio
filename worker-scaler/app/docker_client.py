"""Thin client over the Docker Engine API, reached through docker-socket-proxy.

Only the container endpoints the scaler needs are used (list/inspect/create/
start/stop/restart/remove); the proxy is configured to 403 everything else, so
this client cannot perform arbitrary host-root Docker operations.
"""
import json

import httpx

from app.settings import get_settings


class DockerError(Exception):
    """Docker Engine API returned a non-success HTTP status."""

    def __init__(self, status_code: int, message: str = ""):
        self.status_code = status_code
        super().__init__(message or f"docker api returned {status_code}")


class DockerUnavailable(Exception):
    """The Docker Engine API / socket-proxy could not be reached at all."""


def _ok(status_code: int) -> bool:
    # 2xx, plus 304 which Docker returns for start-already-started / stop-already-stopped.
    return 200 <= status_code < 300 or status_code == 304


class DockerClient:
    def __init__(self, base_url: str | None = None, timeout: float | None = None):
        settings = get_settings()
        self.base_url = (base_url or settings.docker_api_url).rstrip("/")
        self.timeout = timeout or settings.docker_timeout_seconds

    def _request(self, method: str, path: str, params: dict | None = None, json_body: dict | None = None):
        try:
            response = httpx.request(
                method,
                f"{self.base_url}{path}",
                params=params,
                json=json_body,
                timeout=self.timeout,
            )
        except httpx.HTTPError as exc:
            raise DockerUnavailable(str(exc)) from exc
        if not _ok(response.status_code):
            raise DockerError(response.status_code, response.text)
        return response

    def list_workers(self, label: str, include_stopped: bool = True) -> list[dict]:
        params = {
            "all": "true" if include_stopped else "false",
            "filters": json.dumps({"label": [label]}),
        }
        response = self._request("GET", "/containers/json", params=params)
        return [self._summarize(container) for container in response.json()]

    def inspect(self, container_id: str) -> dict:
        return self._request("GET", f"/containers/{container_id}/json").json()

    def create(self, name: str, config: dict) -> str:
        response = self._request("POST", "/containers/create", params={"name": name}, json_body=config)
        return response.json()["Id"]

    def start(self, container_id: str) -> None:
        self._request("POST", f"/containers/{container_id}/start")

    def stop(self, container_id: str) -> None:
        self._request("POST", f"/containers/{container_id}/stop")

    def restart(self, container_id: str) -> None:
        self._request("POST", f"/containers/{container_id}/restart")

    def remove(self, container_id: str) -> None:
        self._request("DELETE", f"/containers/{container_id}", params={"force": "true"})

    @staticmethod
    def _summarize(container: dict) -> dict:
        names = container.get("Names") or []
        return {
            "id": container.get("Id", ""),
            "name": names[0].lstrip("/") if names else "",
            "state": container.get("State", ""),  # running | exited | restarting | created | ...
            "status": container.get("Status", ""),
            "labels": container.get("Labels") or {},
        }
