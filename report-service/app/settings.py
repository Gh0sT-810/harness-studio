from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgres://harness:harness_dev_password@localhost:5432/harness?sslmode=disable"
    redis_url: str = "redis://localhost:6379/0"
    artifact_service_base_url: str = "http://localhost:8091"
    artifact_service_timeout_seconds: int = 10
    report_service_port: int = 8092
    default_report_format: str = "json"
    frontend_base_url: str = "http://localhost:3000"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
