import json
from urllib import request
from urllib.error import HTTPError, URLError


class ArtifactClientError(RuntimeError):
    pass


class ArtifactClient:
    def __init__(self, base_url: str, timeout_seconds: int = 10):
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    def save_bytes(
        self,
        scope: str,
        artifact_type: str,
        filename: str,
        content: bytes,
        metadata: dict,
        content_type: str,
        upsert: bool = False,
    ) -> dict:
        boundary = "----harness-artifact-boundary"
        body = self._multipart_body(boundary, scope, artifact_type, filename, content, metadata, content_type, upsert)
        req = request.Request(f"{self.base_url}/internal/artifacts", data=body, method="POST")
        req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
        req.add_header("Content-Length", str(len(body)))
        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as response:
                if response.status < 200 or response.status >= 300:
                    raise ArtifactClientError(f"artifact-service returned status {response.status}")
                return json.loads(response.read().decode())
        except (HTTPError, URLError) as exc:
            raise ArtifactClientError(str(exc)) from exc

    def _multipart_body(self, boundary: str, scope: str, artifact_type: str, filename: str, content: bytes, metadata: dict, content_type: str, upsert: bool = False) -> bytes:
        parts: list[bytes] = []
        fields = {
            "scope": scope,
            "artifactType": artifact_type,
            "metadata": json.dumps(metadata),
        }
        if upsert:
            fields["upsert"] = "true"
        for name, value in fields.items():
            parts.append(f"--{boundary}\r\n".encode())
            parts.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
        parts.append(f"--{boundary}\r\n".encode())
        parts.append(
            (
                f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                f"Content-Type: {content_type}\r\n\r\n"
            ).encode()
        )
        parts.append(content)
        parts.append(b"\r\n")
        parts.append(f"--{boundary}--\r\n".encode())
        return b"".join(parts)
