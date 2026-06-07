import io
import json
import zipfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, Response

from app.repository import ArtifactMetadataRepository
from app.settings import get_settings
from app.store import LocalArtifactStore

router = APIRouter(prefix="/internal", tags=["internal"])


def get_store() -> LocalArtifactStore:
    return LocalArtifactStore(get_settings().artifact_root)


def get_repository() -> ArtifactMetadataRepository:
    return ArtifactMetadataRepository()


@router.post("/artifacts", status_code=status.HTTP_201_CREATED)
async def save_artifact(
    scope: str = Form(...),
    artifactType: str = Form(...),
    metadata: str = Form("{}"),
    file: UploadFile = File(...),
    store: LocalArtifactStore = Depends(get_store),
    repository: ArtifactMetadataRepository = Depends(get_repository),
) -> dict:
    parsed_metadata = json.loads(metadata or "{}")
    parsed_metadata.setdefault("filename", file.filename)
    parsed_metadata.setdefault("contentType", file.content_type or "application/octet-stream")
    content = await file.read()
    stored = store.save(scope, artifactType, file.filename or "artifact.bin", content)
    return repository.create(
        scope=scope,
        artifact_type=artifactType,
        object_key=stored.object_key,
        size_bytes=stored.size_bytes,
        content_hash=stored.content_hash,
        metadata=parsed_metadata,
    )


@router.get("/artifacts")
def list_artifacts(scope: str, repository: ArtifactMetadataRepository = Depends(get_repository)) -> list[dict]:
    return repository.list_by_scope(scope)


@router.get("/artifacts/{artifact_id}/metadata")
def get_artifact_metadata(artifact_id: str, repository: ArtifactMetadataRepository = Depends(get_repository)) -> dict:
    try:
        return repository.get(artifact_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="artifact not found") from exc


@router.get("/artifacts/{artifact_id}")
def download_artifact(
    artifact_id: str,
    store: LocalArtifactStore = Depends(get_store),
    repository: ArtifactMetadataRepository = Depends(get_repository),
) -> FileResponse:
    artifact = get_artifact_metadata(artifact_id, repository)
    metadata = artifact.get("metadata", {})
    path = store.open_path(artifact["objectKey"])
    return FileResponse(
        path,
        media_type=metadata.get("contentType", "application/octet-stream"),
        filename=metadata.get("filename", path.name),
    )


@router.get("/scopes/{scope:path}/archive")
def archive_scope(
    scope: str,
    store: LocalArtifactStore = Depends(get_store),
    repository: ArtifactMetadataRepository = Depends(get_repository),
) -> Response:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for artifact in repository.list_by_scope(scope):
            path = store.open_path(artifact["objectKey"])
            archive.write(path, arcname=artifact["objectKey"].removeprefix(f"{scope}/"))
    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{scope.replace("/", "_")}.zip"'},
    )
