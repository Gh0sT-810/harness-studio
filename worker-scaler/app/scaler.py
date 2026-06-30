"""Worker-execution pool lifecycle: scale / stop-idle / restart / stop / start.

Operates only on containers carrying the worker label, via an injectable Docker
client (so the logic is unit-testable without a real daemon). New containers are
cloned from an existing worker's config so the spec never drifts from compose.
"""
import uuid

from app.docker_client import DockerError
from app.flower_client import FlowerClient
from app.docker_client import DockerClient
from app.settings import get_settings


class ScalerError(Exception):
    """A scaler-level precondition failed (bounds, missing container, no template)."""

    def __init__(self, message: str, status_code: int = 400):
        self.status_code = status_code
        super().__init__(message)


class Scaler:
    def __init__(self, docker=None, flower=None, settings=None):
        self.settings = settings or get_settings()
        self.docker = docker or DockerClient()
        self.flower = flower or FlowerClient()
        self._template = None  # cached create config for scale-up-from-zero

    # ---------- queries ----------

    def list_workers(self) -> list[dict]:
        return self.docker.list_workers(self.settings.worker_label, include_stopped=True)

    @staticmethod
    def _running(workers: list[dict]) -> list[dict]:
        return [w for w in workers if w["state"] == "running"]

    def status(self, desired: int | None = None) -> dict:
        workers = self.list_workers()
        running = self._running(workers)
        idle_ids: set[str] = set()
        flower_ok = True
        try:
            active = self.flower.active_counts()
            idle_ids = {w["id"] for w in running if self._container_idle(w, active)}
        except Exception:
            flower_ok = False
        view = []
        for w in workers:
            entry = {"id": w["id"], "name": w["name"], "state": w["state"]}
            if w["state"] == "running" and flower_ok:
                entry["activity"] = "idle" if w["id"] in idle_ids else "busy"
            else:
                entry["activity"] = "unknown"
            view.append(entry)
        return {
            "desired": desired,
            "actual": len(running),
            "total": len(workers),
            "flowerAvailable": flower_ok,
            "workers": view,
        }

    # ---------- mutations ----------

    def scale(self, replicas: int) -> dict:
        self._check_bounds(replicas)
        workers = self.list_workers()
        running = self._running(workers)
        stopped = [w for w in workers if w["state"] != "running"]
        changed = {"created": [], "started": [], "removed": [], "failed": []}

        if replicas > len(running):
            need = replicas - len(running)
            for w in stopped:
                if need <= 0:
                    break
                try:
                    self.docker.start(w["id"])
                    changed["started"].append(w["id"])
                    need -= 1
                except DockerError as exc:
                    changed["failed"].append({"id": w["id"], "error": str(exc)})
            while need > 0:
                try:
                    changed["created"].append(self._create_worker(workers))
                except DockerError as exc:
                    changed["failed"].append({"id": "", "error": str(exc)})
                    break
                need -= 1
        elif replicas < len(running):
            for w in running[: len(running) - replicas]:
                try:
                    self.docker.remove(w["id"])
                    changed["removed"].append(w["id"])
                except DockerError as exc:
                    changed["failed"].append({"id": w["id"], "error": str(exc)})

        actual = len(self._running(self.list_workers()))
        return {"desired": replicas, "actual": actual, "changed": changed}

    def stop_idle(self, count: int | None = None) -> dict:
        workers = self.list_workers()
        running = self._running(workers)
        active = self.flower.active_counts()  # FlowerUnavailable -> caller maps to 502
        idle = [w for w in running if self._container_idle(w, active)]
        max_stoppable = max(len(running) - self.settings.min_replicas, 0)
        target = len(idle) if count is None else min(int(count), len(idle))
        target = min(target, max_stoppable)
        stopped, failed = [], []
        for w in idle[:target]:
            try:
                self.docker.stop(w["id"])
                stopped.append(w["id"])
            except DockerError as exc:
                failed.append({"id": w["id"], "error": str(exc)})
        return {"stopped": stopped, "failed": failed, "idleFound": len(idle)}

    def restart_worker(self, container_id: str) -> dict:
        self._require_worker(container_id)
        self.docker.restart(container_id)
        return {"id": container_id, "action": "restart"}

    def stop_worker(self, container_id: str) -> dict:
        workers = self.list_workers()
        self._require_worker(container_id, workers)
        running = self._running(workers)
        is_running = any(w["id"] == container_id and w["state"] == "running" for w in workers)
        if is_running and len(running) <= self.settings.min_replicas:
            raise ScalerError("stopping this worker would drop the pool below min_replicas", status_code=409)
        self.docker.stop(container_id)
        return {"id": container_id, "action": "stop"}

    def start_worker(self) -> dict:
        workers = self.list_workers()
        running = self._running(workers)
        if len(running) >= self.settings.max_replicas:
            raise ScalerError("worker pool already at max_replicas", status_code=409)
        stopped = [w for w in workers if w["state"] != "running"]
        if stopped:
            self.docker.start(stopped[0]["id"])
            return {"id": stopped[0]["id"], "action": "start"}
        return {"id": self._create_worker(workers), "action": "create"}

    # ---------- helpers ----------

    def _check_bounds(self, replicas: int) -> None:
        low, high = self.settings.min_replicas, self.settings.max_replicas
        if isinstance(replicas, bool) or not isinstance(replicas, int) or replicas < low or replicas > high:
            raise ScalerError(f"replicas must be an integer in [{low}, {high}]", status_code=400)

    def _require_worker(self, container_id: str, workers: list[dict] | None = None) -> None:
        workers = workers if workers is not None else self.list_workers()
        if not any(w["id"] == container_id or w["name"] == container_id for w in workers):
            raise ScalerError(f"no worker-execution container with id {container_id}", status_code=404)

    def _create_worker(self, workers: list[dict]) -> str:
        config = self._build_create_config(workers)
        name = f"{self.settings.worker_name_prefix}-{uuid.uuid4().hex[:12]}"
        container_id = self.docker.create(name, config)
        self.docker.start(container_id)
        return container_id

    def _build_create_config(self, workers: list[dict]) -> dict:
        if workers:
            config = self._config_from_inspect(self.docker.inspect(workers[0]["id"]))
            self._template = config
            return config
        if self._template is not None:
            return self._template
        raise ScalerError(
            "no worker template available; start at least one worker-execution via compose first",
            status_code=409,
        )

    @staticmethod
    def _config_from_inspect(inspected: dict) -> dict:
        config = inspected.get("Config", {})
        host = inspected.get("HostConfig", {})
        # Omit Hostname so Docker assigns a unique one per container, keeping each
        # worker's hostname-derived worker_id unique.
        return {
            "Image": config.get("Image"),
            "Cmd": config.get("Cmd"),
            "Env": config.get("Env"),
            "Labels": config.get("Labels"),
            "HostConfig": {
                "NetworkMode": host.get("NetworkMode"),
                "RestartPolicy": host.get("RestartPolicy"),
                "Memory": host.get("Memory"),
            },
        }

    def _container_idle(self, container: dict, active_counts: dict[str, int]) -> bool:
        short_id = container["id"][:12]
        name = container["name"]
        matched = [
            count
            for key, count in active_counts.items()
            if (short_id and short_id in key) or (name and name in key)
        ]
        if not matched:
            return False  # cannot confirm idle -> treat as busy (fail-safe)
        return all(count == 0 for count in matched)
