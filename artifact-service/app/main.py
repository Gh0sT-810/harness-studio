from fastapi import FastAPI, Response, status

from app.db import check_postgres
from app.routes.internal import router as internal_router
from app.settings import get_settings

app = FastAPI(title="Harness Artifact Service")
app.include_router(internal_router)


def check_artifact_root() -> bool:
    try:
        root = get_settings().artifact_root
        root.mkdir(parents=True, exist_ok=True)
        probe = root / ".healthcheck"
        probe.write_text("ok")
        probe.unlink(missing_ok=True)
        return True
    except Exception:
        return False


@app.get("/internal/health")
def health(response: Response) -> dict[str, object]:
    postgres_ok = check_postgres()
    artifact_root_ok = check_artifact_root()
    if not postgres_ok or not artifact_root_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "ok" if postgres_ok and artifact_root_ok else "degraded",
        "dependencies": {
            "postgres": "ok" if postgres_ok else "error",
            "artifactRoot": "ok" if artifact_root_ok else "error",
        },
    }
