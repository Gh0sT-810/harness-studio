from functools import lru_cache
import socket

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_worker_id() -> str:
    """Per-replica worker id derived from the container hostname.

    Under the replica scaling model every ``worker-execution`` container must
    have a distinct ``worker_id`` so heartbeat/complete (which filter on
    ``worker_id``) target the right owner and a stale replica cannot extend a
    reassigned iteration's lease. An explicit ``WORKER_ID`` env still overrides.
    """
    try:
        hostname = socket.gethostname()
    except Exception:
        hostname = ""
    return f"execution-api@{hostname}" if hostname else "execution-api"


class Settings(BaseSettings):
    database_url: str = "postgres://harness:harness_dev_password@localhost:5432/harness?sslmode=disable"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    execution_queue: str = "execution"
    maintenance_queue: str = "maintenance"
    worker_id: str = Field(default_factory=_default_worker_id)
    worker_prefetch_multiplier: int = 1
    worker_send_task_events: bool = True
    visibility_timeout_seconds: int = 9000
    db_pool_min_size: int = 1
    db_pool_max_size: int = 10
    lease_seconds: int = 60
    heartbeat_seconds: int = 5
    maintenance_interval_seconds: int = 30
    max_attempts: int = 2
    artifact_service_base_url: str = "http://localhost:8091"
    artifact_service_timeout_seconds: int = 10
    capture_timeout_seconds: int = 20
    screenshot_format: str = "png"
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    google_api_key: str = ""
    cua_max_steps: int = 20

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
