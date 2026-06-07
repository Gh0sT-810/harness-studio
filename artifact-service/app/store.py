from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path


class UnsafeArtifactPath(ValueError):
    pass


ARTIFACT_DIRECTORIES = {
    "screenshot": "screenshots",
    "log": "logs",
    "conversation": "conversation",
    "task_response": "task_responses",
    "verification": "verification",
    "timeline": "timeline",
    "db_snapshot": "db",
    "video": "videos",
}


@dataclass(frozen=True)
class StoredArtifact:
    object_key: str
    size_bytes: int
    content_hash: str


class LocalArtifactStore:
    def __init__(self, root: str | Path):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, scope: str, artifact_type: str, filename: str, content: bytes) -> StoredArtifact:
        safe_scope = self._safe_scope(scope)
        safe_filename = self._safe_filename(filename)
        directory = ARTIFACT_DIRECTORIES.get(artifact_type, f"{artifact_type}s")
        object_key = f"{safe_scope}/{directory}/{safe_filename}"
        target = (self.root / object_key).resolve()
        if not target.is_relative_to(self.root):
            raise UnsafeArtifactPath(object_key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        return StoredArtifact(
            object_key=object_key,
            size_bytes=len(content),
            content_hash=sha256(content).hexdigest(),
        )

    def open_path(self, object_key: str) -> Path:
        target = (self.root / self._safe_object_key(object_key)).resolve()
        if not target.is_relative_to(self.root):
            raise UnsafeArtifactPath(object_key)
        return target

    def _safe_scope(self, scope: str) -> str:
        return self._safe_object_key(scope)

    def _safe_object_key(self, value: str) -> str:
        if value.startswith("/") or ".." in Path(value).parts:
            raise UnsafeArtifactPath(value)
        parts = [part for part in Path(value).parts if part not in ("", ".")]
        if not parts:
            raise UnsafeArtifactPath(value)
        return "/".join(parts)

    def _safe_filename(self, filename: str) -> str:
        path = Path(filename)
        if path.is_absolute() or len(path.parts) != 1 or ".." in path.parts:
            raise UnsafeArtifactPath(filename)
        return filename
