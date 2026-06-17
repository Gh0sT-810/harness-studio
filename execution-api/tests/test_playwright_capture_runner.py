import base64
import json

from app.runners.playwright_capture import PlaywrightCaptureRunner


class FakePage:
    url = "https://example.com/task"
    viewport_size = {"width": 1280, "height": 800}
    scroll_x = 12
    scroll_y = 144
    device_scale_factor = 1

    def __init__(self):
        self.screenshot_calls = []

    def goto(self, url, wait_until="load", timeout=0):
        self.url = url

    def title(self):
        return "Demo Gym"

    def screenshot(self, full_page=True):
        self.screenshot_calls.append(full_page)
        return b"png"

    def evaluate(self, script):
        if "scrollX" in script:
            return self.scroll_x
        if "scrollY" in script:
            return self.scroll_y
        if "devicePixelRatio" in script:
            return self.device_scale_factor
        return None


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
        self.viewport = None

    def new_context(self, viewport=None):
        self.viewport = viewport
        if viewport:
            self.context.page.viewport_size = viewport
        return self.context

    def close(self):
        pass


class FakeChromium:
    def __init__(self):
        self.browser = None

    def launch(self, headless=True):
        self.browser = FakeBrowser()
        return self.browser


class FakePlaywright:
    def __init__(self):
        self.chromium = FakeChromium()
        self.stopped = False

    def stop(self):
        self.stopped = True


class FakeArtifactClient:
    """Records every write; honors upsert by reusing the artifact id for the same object."""

    def __init__(self):
        self.saved = []
        self._by_key = {}
        self._next_id = 0

    def save_bytes(self, scope, artifact_type, filename, content, metadata, content_type, upsert=False):
        key = (scope, artifact_type, filename)
        artifact = self._by_key.get(key) if upsert else None
        if artifact is None:
            self._next_id += 1
            artifact = {
                "id": f"artifact-{self._next_id}",
                "scope": scope,
                "artifactType": artifact_type,
                "objectKey": f"{scope}/{artifact_type}/{filename}",
                "createdAt": "2026-01-01T00:00:00Z",
            }
            self._by_key[key] = artifact
        artifact["sizeBytes"] = len(content)
        artifact["contentHash"] = "hash"
        artifact["metadata"] = metadata
        artifact["content"] = content
        self.saved.append((artifact_type, filename, metadata, content_type, artifact))
        return artifact


class RecordingObserver:
    def __init__(self):
        self.artifacts = []
        self.steps = []

    def on_artifact(self, artifact):
        self.artifacts.append(artifact)

    def on_step(self, step, timeline_artifact):
        self.steps.append((dict(step), timeline_artifact["id"] if timeline_artifact else None))


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


def run_iteration(runner, observer=None, extra=None):
    iteration = {
        "id": "iteration-1",
        "execution_id": "execution-1",
        "batch_id": "batch-1",
        "gym_base_url": "https://example.com/task",
        "snapshot_prompt": "Do the thing",
    }
    if extra:
        iteration.update(extra)
    return runner.run(iteration, observer=observer)


def test_playwright_capture_runner_saves_screenshots_and_timeline_incrementally():
    client = FakeArtifactClient()
    playwright = FakePlaywright()
    runner = PlaywrightCaptureRunner(artifact_client=client, playwright_factory=lambda: playwright)

    result = run_iteration(runner)

    write_types = [item[0] for item in client.saved]
    assert write_types == ["screenshot", "timeline", "screenshot", "timeline", "log", "conversation", "task_response", "verification"]
    assert result.status == "passed"
    # Timeline artifact id is stable across upserts and assigned before the run ends.
    assert result.timeline_artifact_id == "artifact-2"
    timeline_writes = [item[4]["id"] for item in client.saved if item[0] == "timeline"]
    assert timeline_writes == ["artifact-2", "artifact-2"]
    assert result.steps[0].payload["beforeArtifactId"] == "artifact-1"
    # The navigate step is self-complete: its after frame is the loaded page.
    assert result.steps[0].payload["afterArtifactId"] == "artifact-1"
    # The end-of-run frame lives on the terminal step instead.
    assert result.steps[-1].payload["id"] == "step-final"
    assert result.steps[-1].payload["afterArtifactId"] == "artifact-3"
    assert playwright.chromium.browser.viewport == {"width": 1280, "height": 800}
    assert playwright.stopped is True
    # Ditto frames: every screenshot is viewport-only.
    assert playwright.chromium.browser.context.page.screenshot_calls == [False, False]


def test_playwright_capture_runner_persists_capture_metadata_on_timeline_and_screenshots():
    client = FakeArtifactClient()
    runner = PlaywrightCaptureRunner(artifact_client=client, playwright_factory=lambda: FakePlaywright())

    runner.run({
        "id": "iteration-1",
        "execution_id": "execution-1",
        "batch_id": "batch-1",
        "gym_base_url": "https://example.com/task",
        "snapshot_prompt": "Do the thing",
    })

    timeline_artifact = next(item[4] for item in client.saved if item[0] == "timeline")
    screenshot_metadata = [item[2] for item in client.saved if item[0] == "screenshot"]
    timeline = json.loads(timeline_artifact["content"].decode())
    step = timeline["steps"][0]

    expected_capture = {
        "viewport": {"width": 1280, "height": 800},
        "screenshot": {"fullPage": False, "scrollX": 12, "scrollY": 144, "deviceScaleFactor": 1},
        "cursor": {"coordinateBasis": "viewport", "visible": False},
    }
    assert step["capture"] == expected_capture
    assert step["captureAfter"] == expected_capture
    assert all(metadata["capture"] == expected_capture for metadata in screenshot_metadata)


def test_playwright_capture_runner_uses_adapter_output_and_verification_result():
    client = FakeArtifactClient()
    adapter = FakeAdapter()
    runner = PlaywrightCaptureRunner(artifact_client=client, playwright_factory=lambda: FakePlaywright())

    result = run_iteration(runner, extra={
        "snapshot_verification_strategy": "grader_config",
        "snapshot_grader_config": {"forceFail": True, "comments": "grader rejected output"},
        "model_adapter": adapter,
    })

    assert adapter.calls[0][0] == "Do the thing"
    assert adapter.calls[0][1]["url"] == "https://example.com/task"
    assert callable(adapter.calls[0][1]["on_step"])
    assert result.status == "failed"
    assert result.result_data["modelResponse"] == "adapter answered"
    assert result.verification_details["strategy"] == "grader_config"
    assert result.verification_comments == "grader rejected output"
    assert result.token_usage == {"input_tokens": 11, "output_tokens": 7, "cost_usd": 0.12}


class RichFakeAdapterResult:
    content = "adapter completed"
    usage = {"input_tokens": 2, "output_tokens": 3, "total_tokens": 5, "cost_usd": 0}
    timeline = [
        {
            "provider": "openai",
            "action": "click",
            "args": {"x": 1, "y": 2},
            "_screenshotBeforeBase64": base64.b64encode(b"before-action").decode("ascii"),
            "_screenshotAfterBase64": base64.b64encode(b"after-action").decode("ascii"),
        }
    ]
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


class StreamingFakeAdapter(FakeAdapter):
    """Streams its single timeline entry through on_step before returning."""

    def __init__(self):
        super().__init__()
        self.entry = {
            "provider": "openai",
            "action": "click",
            "args": {"x": 1, "y": 2},
            "_screenshotBeforeBase64": base64.b64encode(b"before-action").decode("ascii"),
            "_screenshotAfterBase64": base64.b64encode(b"after-action").decode("ascii"),
        }

    def generate(self, prompt, context=None):
        self.calls.append((prompt, context))
        context["on_step"](self.entry)
        result = RichFakeAdapterResult()
        result.timeline = [self.entry]
        return result


def test_playwright_capture_runner_persists_adapter_timeline_and_conversation():
    client = FakeArtifactClient()
    adapter = RichFakeAdapter()
    runner = PlaywrightCaptureRunner(artifact_client=client, playwright_factory=lambda: FakePlaywright())

    result = run_iteration(runner, extra={"model_adapter": adapter})

    timeline_artifact = next(item[4] for item in client.saved if item[0] == "timeline")
    conversation_artifact = next(item[4] for item in client.saved if item[0] == "conversation")
    action_screenshots = [
        item
        for item in client.saved
        if item[0] == "screenshot" and item[2].get("timelineStepIndex") == 2
    ]
    timeline = json.loads(timeline_artifact["content"].decode())
    action_step = timeline["steps"][1]

    assert len(action_screenshots) == 2
    assert {item[1] for item in action_screenshots} == {"step-2-before.png", "step-2-after.png"}
    assert {item[2]["timelineKind"] for item in action_screenshots} == {"before", "after"}
    assert all(item[2]["action"] == "click" for item in action_screenshots)
    assert all(item[2]["iterationId"] == "iteration-1" for item in action_screenshots)
    assert all(item[2]["executionId"] == "execution-1" for item in action_screenshots)
    assert all(item[2]["batchId"] == "batch-1" for item in action_screenshots)
    assert "beforeArtifactId" in action_step
    assert "afterArtifactId" in action_step
    assert "_screenshotBeforeBase64" not in action_step
    assert "_screenshotAfterBase64" not in action_step
    assert b'"action": "click"' in timeline_artifact["content"]
    assert b'"provider": "openai"' in timeline_artifact["content"]
    assert b"adapter completed" in conversation_artifact["content"]
    assert result.steps[1].payload["action"] == "click"
    assert result.steps[1].payload["beforeArtifactId"] == action_step["beforeArtifactId"]
    assert result.steps[1].payload["afterArtifactId"] == action_step["afterArtifactId"]


def test_playwright_capture_runner_streams_steps_to_observer_without_duplicates():
    client = FakeArtifactClient()
    adapter = StreamingFakeAdapter()
    observer = RecordingObserver()
    runner = PlaywrightCaptureRunner(artifact_client=client, playwright_factory=lambda: FakePlaywright())

    result = run_iteration(runner, observer=observer, extra={"model_adapter": adapter})

    # Streamed entry must not be persisted again after the adapter returns.
    step_screenshot_writes = [item for item in client.saved if item[1].startswith("step-")]
    assert len(step_screenshot_writes) == 2
    assert len([step for step in result.steps if step.payload.get("type") == "model_action"]) == 1

    # Observer saw navigate, action, and terminal steps, with a stable timeline artifact id.
    step_ids = [step["id"] for step, _ in observer.steps]
    assert step_ids == ["step-1", "step-2", "step-final"]
    timeline_ids = {timeline_id for _, timeline_id in observer.steps}
    assert timeline_ids == {result.timeline_artifact_id}

    # Observer saw each distinct artifact exactly once (timeline announced once despite upserts).
    observed_ids = [artifact["id"] for artifact in observer.artifacts]
    assert len(observed_ids) == len(set(observed_ids))
    assert set(observed_ids) == {artifact["id"] for artifact in result.artifacts}

    # The action step carries before and after captures for the cursor layer.
    action_step = next(step for step, _ in observer.steps if step["id"] == "step-2")
    assert "capture" in action_step
    assert "captureAfter" in action_step


def test_playwright_capture_runner_self_completes_navigate_and_appends_final_step():
    client = FakeArtifactClient()
    runner = PlaywrightCaptureRunner(artifact_client=client, playwright_factory=lambda: FakePlaywright())

    result = run_iteration(runner)

    timeline_artifact = next(item[4] for item in client.saved if item[0] == "timeline")
    timeline = json.loads(timeline_artifact["content"].decode())
    navigate = timeline["steps"][0]
    final = timeline["steps"][-1]

    assert navigate["afterArtifactId"] == navigate["beforeArtifactId"] == "artifact-1"
    assert navigate["captureAfter"] == navigate["capture"]
    assert final["id"] == "step-final"
    assert final["type"] == "final"
    assert final["index"] == 2
    assert final["message"] == "Final state"
    assert final["afterArtifactId"] == "artifact-3"
    assert "beforeArtifactId" not in final
    assert final["captureAfter"] == final["capture"]
    assert final["captureAfter"]["cursor"] == {"coordinateBasis": "viewport", "visible": False}
    # total_steps now counts the terminal step too.
    assert len(result.steps) == 2


def test_playwright_capture_runner_swallows_observer_failures():
    class ExplodingObserver:
        def on_artifact(self, artifact):
            raise RuntimeError("redis down")

        def on_step(self, step, timeline_artifact):
            raise RuntimeError("redis down")

    client = FakeArtifactClient()
    runner = PlaywrightCaptureRunner(artifact_client=client, playwright_factory=lambda: FakePlaywright())

    result = run_iteration(runner, observer=ExplodingObserver())

    assert result.status == "passed"
    assert result.timeline_artifact_id == "artifact-2"
