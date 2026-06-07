from fastapi import FastAPI, Response, status

from app.db import check_postgres
from app.routes.internal import router as internal_router
from app.settings import get_settings

app = FastAPI(title="Harness Execution API")
app.include_router(internal_router)


def check_redis() -> bool:
    try:
        from redis import Redis

        return Redis.from_url(get_settings().redis_url).ping()
    except Exception:
        return False


@app.get("/internal/health")
def health(response: Response) -> dict[str, object]:
    postgres_ok = check_postgres()
    redis_ok = check_redis()
    if not postgres_ok or not redis_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ok" if postgres_ok and redis_ok else "degraded",
        "dependencies": {
            "postgres": "ok" if postgres_ok else "error",
            "redis": "ok" if redis_ok else "error",
        },
    }
