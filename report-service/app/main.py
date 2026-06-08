from fastapi import FastAPI, Response, status

from app.db import check_postgres
from app.routes.internal import router as internal_router
from app.settings import get_settings

app = FastAPI(title="Harness Report Service")
app.include_router(internal_router)


def check_redis() -> bool:
    try:
        import redis

        client = redis.Redis.from_url(get_settings().redis_url, socket_connect_timeout=1, socket_timeout=1)
        return bool(client.ping())
    except Exception:
        return False


def check_artifact_service() -> bool:
    try:
        import httpx

        url = f"{get_settings().artifact_service_base_url.rstrip('/')}/internal/health"
        response = httpx.get(url, timeout=get_settings().artifact_service_timeout_seconds)
        return response.status_code == 200
    except Exception:
        return False


@app.get("/internal/health")
def health(response: Response) -> dict[str, object]:
    postgres_ok = check_postgres()
    redis_ok = check_redis()
    artifact_ok = check_artifact_service()
    if not postgres_ok or not redis_ok or not artifact_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "ok" if postgres_ok and redis_ok and artifact_ok else "degraded",
        "dependencies": {
            "postgres": "ok" if postgres_ok else "error",
            "redis": "ok" if redis_ok else "error",
            "artifactService": "ok" if artifact_ok else "error",
        },
    }
