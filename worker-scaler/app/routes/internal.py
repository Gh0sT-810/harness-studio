from fastapi import APIRouter, Body, Depends, HTTPException, status

from app.docker_client import DockerError, DockerUnavailable
from app.flower_client import FlowerUnavailable
from app.scaler import Scaler, ScalerError

router = APIRouter(prefix="/internal", tags=["scaler"])


def get_scaler() -> Scaler:
    return Scaler()


def _run(action):
    try:
        return action()
    except ScalerError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except (DockerUnavailable, FlowerUnavailable, DockerError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.get("/workers")
def get_workers(scaler: Scaler = Depends(get_scaler)) -> dict:
    return _run(scaler.status)


@router.post("/scale")
def scale(payload: dict | None = Body(default=None), scaler: Scaler = Depends(get_scaler)) -> dict:
    if not isinstance(payload, dict) or "replicas" not in payload:
        raise HTTPException(status_code=400, detail="replicas is required")
    replicas = payload["replicas"]
    if isinstance(replicas, bool) or not isinstance(replicas, int):
        raise HTTPException(status_code=400, detail="replicas must be an integer")
    return _run(lambda: scaler.scale(replicas))


@router.post("/workers/stop-idle")
def stop_idle(payload: dict | None = Body(default=None), scaler: Scaler = Depends(get_scaler)) -> dict:
    count = (payload or {}).get("count")
    if count is not None and (isinstance(count, bool) or not isinstance(count, int) or count <= 0):
        raise HTTPException(status_code=400, detail="count must be a positive integer")
    return _run(lambda: scaler.stop_idle(count))


@router.post("/workers/{container_id}/restart")
def restart_worker(container_id: str, scaler: Scaler = Depends(get_scaler)) -> dict:
    return _run(lambda: scaler.restart_worker(container_id))


@router.post("/workers/{container_id}/stop")
def stop_worker(container_id: str, scaler: Scaler = Depends(get_scaler)) -> dict:
    return _run(lambda: scaler.stop_worker(container_id))


@router.post("/workers")
def start_worker(scaler: Scaler = Depends(get_scaler)) -> dict:
    return _run(scaler.start_worker)
