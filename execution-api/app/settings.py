from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgres://harness:harness_dev_password@localhost:5432/harness?sslmode=disable"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    execution_queue: str = "execution"
    maintenance_queue: str = "maintenance"
    worker_id: str = "execution-api"
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
