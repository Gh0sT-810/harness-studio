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
    def __init__(self):
        self.chromium = FakeChromium()
        self.stopped = False

    def stop(self):
        self.stopped = True


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
            "content": content,
            "createdAt": "2026-01-01T00:00:00Z",
        }
        self.saved.append((artifact_type, filename, metadata, content_type, artifact))
        return artifact


class FakeAdapterResult:
    content = "adapter answered"
    usage = {"input_tokens": 11, "output_tokens": 7, "cost_usd": 0.12}
    timeline = []
    conversation = []
    metadata = {}


class FakeAdapter:
    def __init__(self):
        self.calls = []

    def generate(self, prompt, context=None):
        self.calls.append((prompt, context))
        return FakeAdapterResult()


def test_playwright_capture_runner_saves_screenshots_and_timeline():
    client = FakeArtifactClient()
    playwright = FakePlaywright()
    runner = PlaywrightCaptureRunner(artifact_client=client, playwright_factory=lambda: playwright)

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
    assert playwright.stopped is True


def test_playwright_capture_runner_uses_adapter_output_and_verification_result():
    client = FakeArtifactClient()
    adapter = FakeAdapter()
    runner = PlaywrightCaptureRunner(artifact_client=client, playwright_factory=lambda: FakePlaywright())

    result = runner.run({
        "id": "iteration-1",
        "execution_id": "execution-1",
        "batch_id": "batch-1",
        "gym_base_url": "https://example.com/task",
        "snapshot_prompt": "Do the thing",
        "snapshot_verification_strategy": "grader_config",
        "snapshot_grader_config": {"forceFail": True, "comments": "grader rejected output"},
        "model_adapter": adapter,
    })

    assert adapter.calls[0][0] == "Do the thing"
    assert adapter.calls[0][1]["url"] == "https://example.com/task"
    assert result.status == "failed"
    assert result.result_data["modelResponse"] == "adapter answered"
    assert result.verification_details["strategy"] == "grader_config"
    assert result.verification_comments == "grader rejected output"
    assert result.token_usage == {"input_tokens": 11, "output_tokens": 7, "cost_usd": 0.12}


class RichFakeAdapterResult:
    content = "adapter completed"
    usage = {"input_tokens": 2, "output_tokens": 3, "total_tokens": 5, "cost_usd": 0}
    timeline = [{"provider": "openai", "action": "click", "args": {"x": 1, "y": 2}}]
    conversation = [
        {"role": "user", "content": "Do the thing"},
        {"role": "assistant", "content": "adapter completed"},
    ]
    metadata = {"provider": "openai"}


class RichFakeAdapter(FakeAdapter):
    def generate(self, prompt, context=None):
        self.calls.append((prompt, context))
        assert context["computer"].get_environment() == "browser"
        return RichFakeAdapterResult()


def test_playwright_capture_runner_persists_adapter_timeline_and_conversation():
    client = FakeArtifactClient()
    adapter = RichFakeAdapter()
    runner = PlaywrightCaptureRunner(artifact_client=client, playwright_factory=lambda: FakePlaywright())

    result = runner.run({
        "id": "iteration-1",
        "execution_id": "execution-1",
        "batch_id": "batch-1",
        "gym_base_url": "https://example.com/task",
        "snapshot_prompt": "Do the thing",
        "model_adapter": adapter,
    })

    timeline_artifact = client.saved[2][4]
    conversation_artifact = client.saved[4][4]
    assert b'"action": "click"' in timeline_artifact["content"]
    assert b'"provider": "openai"' in timeline_artifact["content"]
    assert b"adapter completed" in conversation_artifact["content"]
    assert result.steps[1].payload["action"] == "click"
