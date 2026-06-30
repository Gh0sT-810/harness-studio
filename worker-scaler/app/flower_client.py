"""Idle detection via Flower's REST API.

Used only to decide which workers are idle (no active task) for stop-idle. It is
deliberately fail-safe: any worker whose active count cannot be confirmed as 0 is
treated as busy, so stop-idle never stops a container it cannot prove is idle.
"""
import httpx

from app.settings import get_settings


class FlowerUnavailable(Exception):
    """Flower could not be reached or returned an error / unparseable body."""


class FlowerClient:
    def __init__(
        self,
        base_url: str | None = None,
        url_prefix: str | None = None,
        timeout: float | None = None,
    ):
        settings = get_settings()
        self.base_url = (base_url or settings.flower_base_url).rstrip("/")
        prefix = settings.flower_url_prefix if url_prefix is None else url_prefix
        self.url_prefix = prefix.strip("/")
        self.timeout = timeout or settings.flower_timeout_seconds

    def _url(self, path: str) -> str:
        prefix = f"/{self.url_prefix}" if self.url_prefix else ""
        return f"{self.base_url}{prefix}{path}"

    def workers(self) -> dict:
        try:
            response = httpx.get(self._url("/api/workers"), params={"refresh": "1"}, timeout=self.timeout)
        except httpx.HTTPError as exc:
            raise FlowerUnavailable(str(exc)) from exc
        if response.status_code < 200 or response.status_code >= 300:
            raise FlowerUnavailable(f"flower returned {response.status_code}")
        try:
            data = response.json()
        except ValueError as exc:
            raise FlowerUnavailable(f"flower returned non-JSON body: {exc}") from exc
        if not isinstance(data, dict):
            raise FlowerUnavailable("flower /api/workers did not return an object")
        return data

    def active_counts(self) -> dict[str, int]:
        """Worker name -> number of active (executing) tasks.

        An unrecognised/missing shape is reported as 1 (busy) so the caller never
        treats an unconfirmed worker as idle.
        """
        counts: dict[str, int] = {}
        for name, info in self.workers().items():
            if isinstance(info, dict):
                active = info.get("active")
            else:
                active = None
            if isinstance(active, list):
                counts[name] = len(active)
            elif isinstance(active, bool):
                counts[name] = 1  # 'active: true/false' is a liveness flag, not a task count
            elif isinstance(active, int):
                counts[name] = active
            else:
                counts[name] = 1
        return counts
