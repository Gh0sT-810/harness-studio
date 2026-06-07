from app.runners.playwright_capture import PlaywrightCaptureRunner


class FakePage:
    url = "https://example.com/task"

    def goto(self, url, wait_until="load", timeout=0):
        self.url = url

    def title(self):
        return "Demo Gym"

    def screenshot(self, full_page=True):
        return b"png"


class FakeContext:
    def __init__(self):
        self.page = FakePage()

    def new_page(self):
        return self.page

    def close(self):
        pass


class FakeBrowser:
    def __init__(self):
        self.context = FakeContext()

    def new_context(self, viewport=None):
        return self.context

    def close(self):
        pass


class FakeChromium:
    def launch(self, headless=True):
        return FakeBrowser()


class FakePlaywright:
    chromium = FakeChromium()


class FakeArtifactClient:
    def __init__(self):
        self.saved = []

    def save_bytes(self, scope, artifact_type, filename, content, metadata, content_type):
        artifact = {
            "id": f"artifact-{len(self.saved) + 1}",
            "scope": scope,
            "artifactType": artifact_type,
            "objectKey": f"{scope}/{artifact_type}/{filename}",
            "sizeBytes": len(content),
            "contentHash": "hash",
            "metadata": metadata,
            "createdAt": "2026-01-01T00:00:00Z",
        }
        self.saved.append((artifact_type, filename, metadata, content_type, artifact))
        return artifact


def test_playwright_capture_runner_saves_screenshots_and_timeline():
    client = FakeArtifactClient()
    runner = PlaywrightCaptureRunner(artifact_client=client, playwright_factory=lambda: FakePlaywright())

    result = runner.run({
        "id": "iteration-1",
        "execution_id": "execution-1",
        "batch_id": "batch-1",
        "gym_base_url": "https://example.com/task",
        "snapshot_prompt": "Do the thing",
    })

    saved_types = [item[0] for item in client.saved]
    assert saved_types == ["screenshot", "screenshot", "timeline", "log", "conversation", "task_response", "verification"]
    assert result.status == "passed"
    assert result.timeline_artifact_id == "artifact-3"
    assert result.steps[0].payload["beforeArtifactId"] == "artifact-1"
    assert result.steps[0].payload["afterArtifactId"] == "artifact-2"
