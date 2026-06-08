import json
from datetime import UTC, datetime

from app.artifacts.client import ArtifactClient
from app.computer import PlaywrightComputer
from app.runners.base import RunnerResult, RunnerStep
from app.settings import get_settings
from app.verification import VerificationEngine


class PlaywrightCaptureRunner:
    def __init__(self, artifact_client=None, playwright_factory=None):
        settings = get_settings()
        self.artifact_client = artifact_client or ArtifactClient(settings.artifact_service_base_url, settings.artifact_service_timeout_seconds)
        self.playwright_factory = playwright_factory

    def run(self, iteration: dict) -> RunnerResult:
        playwright = self._playwright()
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        try:
            page = context.new_page()
            page.goto(iteration.get("gym_base_url", "about:blank"), wait_until="load", timeout=get_settings().capture_timeout_seconds * 1000)
            before = page.screenshot(full_page=True)
            title = page.title()
            prompt = iteration.get("snapshot_prompt", "")
            adapter = iteration.get("model_adapter")
            browser_state = {"url": page.url, "title": title, "computer": PlaywrightComputer(page)}
            if adapter is not None:
                adapter_result = adapter.generate(prompt, context=browser_state)
                model_response = adapter_result.content
                token_usage = dict(adapter_result.usage)
                adapter_timeline = list(adapter_result.timeline)
                conversation = list(adapter_result.conversation)
                adapter_metadata = dict(adapter_result.metadata)
            else:
                model_response = prompt
                token_usage = {}
                adapter_timeline = []
                conversation = []
                adapter_metadata = {}
            after = page.screenshot(full_page=True)
            browser_state = {"url": page.url, "title": title, "adapter": adapter_metadata}
        finally:
            context.close()
            browser.close()
            stop = getattr(playwright, "stop", None)
            if callable(stop):
                stop()

        verification = VerificationEngine().verify(iteration, model_response, browser_state)

        scope = f"iterations/{iteration['id']}"
        base_metadata = {
            "iterationId": iteration["id"],
            "executionId": iteration.get("execution_id", ""),
            "batchId": iteration.get("batch_id", ""),
        }
        before_artifact = self.artifact_client.save_bytes(scope, "screenshot", "before.png", before, {**base_metadata, "filename": "before.png", "timelineKind": "before"}, "image/png")
        after_artifact = self.artifact_client.save_bytes(scope, "screenshot", "after.png", after, {**base_metadata, "filename": "after.png", "timelineKind": "after"}, "image/png")
        timeline_steps = [
            {
                "id": "step-1",
                "index": 1,
                "type": "navigate",
                "message": "Captured browser state",
                "url": iteration.get("gym_base_url", ""),
                "title": title,
                "beforeArtifactId": before_artifact["id"],
                "afterArtifactId": after_artifact["id"],
                "occurredAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            }
        ]
        for index, entry in enumerate(adapter_timeline, start=2):
            timeline_steps.append(
                {
                    "id": f"step-{index}",
                    "index": index,
                    "type": "model_action",
                    "message": f"{entry.get('provider', 'adapter')} {entry.get('action', 'action')}",
                    "occurredAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
                    **entry,
                }
            )
        timeline = {
            "version": "v1",
            "iterationId": iteration["id"],
            "steps": timeline_steps,
        }
        timeline_artifact = self.artifact_client.save_bytes(scope, "timeline", "action_timeline.json", json.dumps(timeline).encode(), {**base_metadata, "filename": "action_timeline.json"}, "application/json")
        log_artifact = self.artifact_client.save_bytes(scope, "log", "execution.log", b"Playwright capture completed\n", {**base_metadata, "filename": "execution.log"}, "text/plain")
        conversation_artifact = self.artifact_client.save_bytes(
            scope,
            "conversation",
            "conversation.json",
            json.dumps({"messages": conversation or [{"role": "user", "content": prompt}, {"role": "assistant", "content": model_response}]}).encode(),
            {**base_metadata, "filename": "conversation.json"},
            "application/json",
        )
        response_artifact = self.artifact_client.save_bytes(
            scope,
            "task_response",
            "response.json",
            json.dumps({"prompt": prompt, "response": model_response}).encode(),
            {**base_metadata, "filename": "response.json"},
            "application/json",
        )
        verification_artifact = self.artifact_client.save_bytes(scope, "verification", "verification.json", json.dumps(verification.details).encode(), {**base_metadata, "filename": "verification.json"}, "application/json")

        artifacts = [before_artifact, after_artifact, timeline_artifact, log_artifact, conversation_artifact, response_artifact, verification_artifact]
        return RunnerResult(
            status=verification.status,
            result_data={"runner": "playwright_capture", "title": title, "url": iteration.get("gym_base_url", ""), "modelResponse": model_response},
            verification_details=verification.details,
            verification_comments=verification.comments,
            steps=[RunnerStep(step["message"], step) for step in timeline["steps"]],
            artifacts=artifacts,
            timeline_artifact_id=timeline_artifact["id"],
            token_usage=token_usage,
        )

    def _playwright(self):
        if self.playwright_factory:
            return self.playwright_factory()
        from playwright.sync_api import sync_playwright

        return sync_playwright().start()
