from fastapi import FastAPI, Response, status

from app.docker_client import DockerClient
from app.routes.internal import router as internal_router
from app.settings import get_settings

app = FastAPI(title="Harness Worker Scaler")
app.include_router(internal_router)


def check_docker() -> bool:
    try:
        DockerClient().list_workers(get_settings().worker_label)
        return True
    except Exception:
        return False


@app.get("/internal/health")
def health(response: Response) -> dict[str, object]:
    docker_ok = check_docker()
    if not docker_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "ok" if docker_ok else "degraded",
        "dependencies": {"docker": "ok" if docker_ok else "error"},
    }
