import io
import json
import zipfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response

from app.repository import ArtifactMetadataRepository
from app.settings import get_settings
from app.store import LocalArtifactStore, UnsafeArtifactPath

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
    try:
        parsed_metadata = json.loads(metadata or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="metadata must be valid JSON") from exc
    if not isinstance(parsed_metadata, dict):
        raise HTTPException(status_code=400, detail="metadata must be a JSON object")
    parsed_metadata.setdefault("filename", file.filename)
    parsed_metadata.setdefault("contentType", file.content_type or "application/octet-stream")
    content = await file.read()
    try:
        stored = store.save(scope, artifactType, file.filename or "artifact.bin", content)
    except UnsafeArtifactPath as exc:
        raise HTTPException(status_code=400, detail="unsafe artifact path") from exc
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
    try:
        path = store.open_path(artifact["objectKey"])
    except (UnsafeArtifactPath, KeyError) as exc:
        raise HTTPException(status_code=404, detail="artifact file not found") from exc
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="artifact file not found")
    return FileResponse(
        path,
        media_type=metadata.get("contentType", "application/octet-stream"),
        filename=metadata.get("filename", path.name),
    )


@router.get("/scopes/{scope:path}/archive")
def archive_scope(
    scope: str,
    maxFiles: int | None = Query(default=None, ge=1),
    store: LocalArtifactStore = Depends(get_store),
    repository: ArtifactMetadataRepository = Depends(get_repository),
) -> Response:
    artifacts = repository.list_by_scope(scope)
    return build_archive_response(artifacts, scope, maxFiles, store, strip_prefix=f"{scope}/")


@router.get("/batches/{batch_id}/archive")
def archive_batch(
    batch_id: str,
    maxFiles: int | None = Query(default=None, ge=1),
    store: LocalArtifactStore = Depends(get_store),
    repository: ArtifactMetadataRepository = Depends(get_repository),
) -> Response:
    artifacts = repository.list_by_batch(batch_id)
    return build_archive_response(artifacts, f"batches/{batch_id}", maxFiles, store, strip_prefix="")


def build_archive_response(
    artifacts: list[dict],
    filename_scope: str,
    max_files: int | None,
    store: LocalArtifactStore,
    strip_prefix: str,
) -> Response:
    limit = max_files or get_settings().archive_max_files
    if len(artifacts) > limit:
        raise HTTPException(status_code=413, detail="archive file limit exceeded")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for artifact in artifacts:
            try:
                path = store.open_path(artifact["objectKey"])
            except (UnsafeArtifactPath, KeyError) as exc:
                raise HTTPException(status_code=404, detail="artifact file not found") from exc
            if not path.exists() or not path.is_file():
                raise HTTPException(status_code=404, detail="artifact file not found")
            archive.write(path, arcname=artifact["objectKey"].removeprefix(strip_prefix))
    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename_scope.replace("/", "_")}.zip"'},
    )
