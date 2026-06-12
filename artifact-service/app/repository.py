import json

from app.db import connect


def artifact_from_row(row) -> dict:
    metadata = row[6]
    if isinstance(metadata, (bytes, bytearray)):
        metadata = json.loads(metadata.decode())
    elif isinstance(metadata, str):
        metadata = json.loads(metadata)
    elif metadata is None:
        metadata = {}
    return {
        "id": row[0],
        "scope": row[1],
        "artifactType": row[2],
        "objectKey": row[3],
        "sizeBytes": row[4],
        "contentHash": row[5],
        "metadata": metadata,
        "createdAt": str(row[7]),
    }


class ArtifactMetadataRepository:
    def create(self, scope: str, artifact_type: str, object_key: str, size_bytes: int, content_hash: str, metadata: dict) -> dict:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO artifacts.artifacts (scope, artifact_type, object_key, size_bytes, content_hash, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                    RETURNING id::text, scope, artifact_type, object_key, size_bytes, content_hash, metadata, created_at
                    """,
                    (scope, artifact_type, object_key, size_bytes, content_hash, json.dumps(metadata)),
                )
                return artifact_from_row(cursor.fetchone())

    def upsert(self, scope: str, artifact_type: str, object_key: str, size_bytes: int, content_hash: str, metadata: dict) -> dict:
        """Update the artifact row for (scope, object_key) in place, keeping its id stable.

        Falls back to a regular insert when no row exists yet. Used for living
        documents such as the per-iteration action timeline, which is rewritten
        after every step while the iteration is executing.
        """
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE artifacts.artifacts
                    SET size_bytes = %s, content_hash = %s, metadata = %s::jsonb
                    WHERE scope = %s AND artifact_type = %s AND object_key = %s
                    RETURNING id::text, scope, artifact_type, object_key, size_bytes, content_hash, metadata, created_at
                    """,
                    (size_bytes, content_hash, json.dumps(metadata), scope, artifact_type, object_key),
                )
                row = cursor.fetchone()
                if row is not None:
                    return artifact_from_row(row)
        return self.create(scope, artifact_type, object_key, size_bytes, content_hash, metadata)

    def list_by_scope(self, scope: str) -> list[dict]:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id::text, scope, artifact_type, object_key, size_bytes, content_hash, metadata, created_at
                    FROM artifacts.artifacts
                    WHERE scope = %s
                    ORDER BY created_at
                    """,
                    (scope,),
                )
                return [artifact_from_row(row) for row in cursor.fetchall()]

    def list_by_batch(self, batch_id: str) -> list[dict]:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id::text, scope, artifact_type, object_key, size_bytes, content_hash, metadata, created_at
                    FROM artifacts.artifacts
                    WHERE metadata->>'batchId' = %s
                    ORDER BY scope, created_at
                    """,
                    (batch_id,),
                )
                return [artifact_from_row(row) for row in cursor.fetchall()]

    def get(self, artifact_id: str) -> dict:
        with connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id::text, scope, artifact_type, object_key, size_bytes, content_hash, metadata, created_at
                    FROM artifacts.artifacts
                    WHERE id = %s
                    """,
                    (artifact_id,),
                )
                row = cursor.fetchone()
                if row is None:
                    raise KeyError(artifact_id)
                return artifact_from_row(row)
