import hashlib

import pytest

from app.store import LocalArtifactStore, UnsafeArtifactPath


def test_store_saves_artifact_under_scope_with_hash_and_size(tmp_path):
    store = LocalArtifactStore(tmp_path)

    saved = store.save(
        scope="iterations/iteration-1",
        artifact_type="screenshot",
        filename="before.png",
        content=b"image-bytes",
    )

    expected_hash = hashlib.sha256(b"image-bytes").hexdigest()
    assert saved.object_key == "iterations/iteration-1/screenshots/before.png"
    assert saved.size_bytes == len(b"image-bytes")
    assert saved.content_hash == expected_hash
    assert (tmp_path / saved.object_key).read_bytes() == b"image-bytes"


@pytest.mark.parametrize(
    ("scope", "filename"),
    [
        ("../outside", "file.txt"),
        ("iterations/iteration-1", "../file.txt"),
        ("iterations/iteration-1", "/tmp/file.txt"),
        ("iterations/iteration-1", "nested/file.txt"),
    ],
)
def test_store_rejects_unsafe_paths(tmp_path, scope, filename):
    store = LocalArtifactStore(tmp_path)

    with pytest.raises(UnsafeArtifactPath):
        store.save(scope=scope, artifact_type="log", filename=filename, content=b"nope")
