from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Docker Engine API, reached only through the least-privilege docker-socket-proxy
    # (the raw /var/run/docker.sock is mounted into the proxy, never into this service).
    docker_api_url: str = "http://docker-socket-proxy:2375"
    docker_timeout_seconds: float = 10.0

    # Flower, used solely for idle detection (active task counts per worker).
    flower_base_url: str = "http://flower:5555"
    flower_url_prefix: str = "flower"
    flower_timeout_seconds: float = 5.0

    # The worker-execution pool this service manages. Only containers carrying this
    # label are ever started/stopped/restarted/removed — never postgres/redis/etc.
    worker_label_key: str = "com.harness.role"
    worker_label_value: str = "worker-execution"
    worker_name_prefix: str = "harness-worker-execution"

    # Scaling bounds (inclusive). min_replicas == 0 allows scaling fully off.
    min_replicas: int = 0
    max_replicas: int = 200

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def worker_label(self) -> str:
        return f"{self.worker_label_key}={self.worker_label_value}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
