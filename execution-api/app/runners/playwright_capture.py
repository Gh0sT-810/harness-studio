import base64
import json
from datetime import UTC, datetime
from typing import Any

from app.artifacts.client import ArtifactClient
from app.computer import PlaywrightComputer
from app.runners.base import RunnerResult, RunnerStep
from app.settings import get_settings
from app.verification import VerificationEngine

TIMELINE_FILENAME = "action_timeline.json"


def _now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


class PlaywrightCaptureRunner:
    """Runs one iteration in a fresh browser context and persists artifacts.

    Screenshots are viewport-only ("ditto" frames) and every timeline step is
    persisted incrementally: step screenshots are saved as the action happens,
    the timeline artifact is upserted in place (stable artifact id), and an
    optional observer receives `on_artifact(artifact)` / `on_step(step,
    timeline_artifact)` callbacks so the task layer can publish live events
    after its own DB updates.
    """

    def __init__(self, artifact_client=None, playwright_factory=None):
        settings = get_settings()
        self.artifact_client = artifact_client or ArtifactClient(settings.artifact_service_base_url, settings.artifact_service_timeout_seconds)
        self.playwright_factory = playwright_factory

    def run(self, iteration: dict, observer: Any = None) -> RunnerResult:
        scope = f"iterations/{iteration['id']}"
        base_metadata = {
            "iterationId": iteration["id"],
            "executionId": iteration.get("execution_id", ""),
            "batchId": iteration.get("batch_id", ""),
        }
        artifacts: list[dict] = []
        timeline_steps: list[dict] = []
        timeline_state: dict[str, Any] = {"artifact": None}
        log_state: dict[str, Any] = {"artifact": None}
        persisted_entries: set[int] = set()
        step_counter = {"next_index": 2}
        log_lines: list[str] = []

        def log_event(level: str, message: str) -> None:
            # One structured line per event: "<ISO ts> <LEVEL> <message>", which
            # the frontend log parser splits into timestamp/level/message.
            log_lines.append(f"{_now()} {level} {message}")

        def notify_artifact(artifact: dict) -> None:
            if observer is not None and hasattr(observer, "on_artifact"):
                try:
                    observer.on_artifact(artifact)
                except Exception:
                    pass

        def notify_step(step: dict) -> None:
            if observer is not None and hasattr(observer, "on_step"):
                try:
                    observer.on_step(step, timeline_state["artifact"])
                except Exception:
                    pass

        def save_artifact(artifact_type: str, filename: str, content: bytes, metadata: dict, content_type: str) -> dict:
            artifact = self.artifact_client.save_bytes(scope, artifact_type, filename, content, {**base_metadata, **metadata}, content_type)
            artifacts.append(artifact)
            notify_artifact(artifact)
            return artifact

        def save_timeline() -> dict:
            timeline_doc = {"version": "v1", "iterationId": iteration["id"], "steps": timeline_steps}
            content = json.dumps(timeline_doc).encode()
            metadata = {**base_metadata, "filename": TIMELINE_FILENAME, "stepCount": len(timeline_steps)}
            artifact = self.artifact_client.save_bytes(scope, "timeline", TIMELINE_FILENAME, content, metadata, "application/json", upsert=True)
            if timeline_state["artifact"] is None:
                artifacts.append(artifact)
                timeline_state["artifact"] = artifact
                notify_artifact(artifact)
            else:
                timeline_state["artifact"] = artifact
            return artifact

        def save_log() -> dict:
            # Upsert the execution log in place (stable artifact id) so a running
            # iteration's log accumulates live, mirroring save_timeline. Announced
            # to the observer once, on its first write.
            content = ("\n".join(log_lines) + "\n").encode() if log_lines else b""
            metadata = {**base_metadata, "filename": "execution.log", "lineCount": len(log_lines)}
            artifact = self.artifact_client.save_bytes(scope, "log", "execution.log", content, metadata, "text/plain", upsert=True)
            if log_state["artifact"] is None:
                artifacts.append(artifact)
                log_state["artifact"] = artifact
                notify_artifact(artifact)
            else:
                log_state["artifact"] = artifact
            return artifact

        def persist_adapter_entry(entry: dict) -> None:
            if id(entry) in persisted_entries:
                return
            persisted_entries.add(id(entry))
            index = step_counter["next_index"]
            step_counter["next_index"] = index + 1
            step_entry = dict(entry)
            before_action = step_entry.pop("_screenshotBeforeBase64", "")
            after_action = step_entry.pop("_screenshotAfterBase64", "")
            action_before_capture = step_entry.pop("_captureBefore", step_entry.get("capture", initial_capture["before"]))
            action_after_capture = step_entry.pop("_captureAfter", action_before_capture)
            step_entry["capture"] = action_before_capture
            step_entry["captureAfter"] = action_after_capture
            action = str(step_entry.get("action", "action"))
            if before_action:
                action_before_artifact = save_artifact(
                    "screenshot",
                    f"step-{index}-before.png",
                    base64.b64decode(before_action),
                    {
                        "filename": f"step-{index}-before.png",
                        "timelineKind": "before",
                        "timelineStepIndex": index,
                        "action": action,
                        "capture": action_before_capture,
                    },
                    "image/png",
                )
                step_entry["beforeArtifactId"] = action_before_artifact["id"]
            if after_action:
                action_after_artifact = save_artifact(
                    "screenshot",
                    f"step-{index}-after.png",
                    base64.b64decode(after_action),
                    {
                        "filename": f"step-{index}-after.png",
                        "timelineKind": "after",
                        "timelineStepIndex": index,
                        "action": action,
                        "capture": action_after_capture,
                    },
                    "image/png",
                )
                step_entry["afterArtifactId"] = action_after_artifact["id"]
            step = {
                "id": f"step-{index}",
                "index": index,
                "type": "model_action",
                "message": f"{step_entry.get('provider', 'adapter')} {step_entry.get('action', 'action')}",
                "occurredAt": _now(),
                **step_entry,
            }
            args = step_entry.get("args")
            log_event("INFO", f"action {index}: {step['message']}" + (f" args={json.dumps(args)}" if args else ""))
            if step.get("reasoning"):
                log_event("DEBUG", f"action {index} reasoning: {step['reasoning']}")
            if step.get("url"):
                log_event("DEBUG", f"action {index} url: {step['url']}")
            if before_action:
                log_event("DEBUG", f"action {index} before-screenshot {step_entry.get('beforeArtifactId', '')}")
            if after_action:
                log_event("DEBUG", f"action {index} after-screenshot {step_entry.get('afterArtifactId', '')}")
            timeline_steps.append(step)
            save_timeline()
            notify_step(step)
            # Flush the log per action so it streams live alongside the timeline.
            save_log()

        initial_capture: dict[str, Any] = {"before": {}}
        log_event("INFO", f"iteration {iteration['id']} started on {iteration.get('gym_base_url', 'about:blank')}")
        playwright = self._playwright()
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        try:
            page = context.new_page()
            page.goto(iteration.get("gym_base_url", "about:blank"), wait_until="load", timeout=get_settings().capture_timeout_seconds * 1000)
            computer = PlaywrightComputer(page)
            before_capture = computer.get_capture_metadata(full_page=False)
            initial_capture["before"] = before_capture
            before = page.screenshot(full_page=False)
            title = page.title()
            before_artifact = save_artifact(
                "screenshot",
                "before.png",
                before,
                {"filename": "before.png", "timelineKind": "before", "capture": before_capture},
                "image/png",
            )
            # The navigate step is self-complete: its "after" is the loaded
            # page itself, so live viewers never see a frame from the future.
            navigate_step = {
                "id": "step-1",
                "index": 1,
                "type": "navigate",
                "message": "Captured browser state",
                "url": iteration.get("gym_base_url", ""),
                "title": title,
                "beforeArtifactId": before_artifact["id"],
                "afterArtifactId": before_artifact["id"],
                "capture": before_capture,
                "captureAfter": before_capture,
                "occurredAt": _now(),
            }
            timeline_steps.append(navigate_step)
            save_timeline()
            notify_step(navigate_step)
            log_event("INFO", f"navigated to {iteration.get('gym_base_url', '')} (title={title!r})")
            prompt = iteration.get("snapshot_prompt", "")
            adapter = iteration.get("model_adapter")
            browser_state = {"url": page.url, "title": title, "computer": computer, "on_step": persist_adapter_entry}
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
            # Persist any entries the adapter did not stream through on_step.
            for entry in adapter_timeline:
                persist_adapter_entry(entry)
            log_event("INFO", f"model run produced {len(timeline_steps) - 1} action step(s)")
            if token_usage:
                log_event("INFO", f"tokens: {token_usage.get('input_tokens', 0)} in / {token_usage.get('output_tokens', 0)} out")
            if model_response:
                log_event("DEBUG", f"model response: {model_response[:200]}")
            after_capture = computer.get_capture_metadata(full_page=False)
            after = page.screenshot(full_page=False)
            browser_state = {"url": page.url, "title": title, "adapter": adapter_metadata}
        finally:
            context.close()
            browser.close()
            stop = getattr(playwright, "stop", None)
            if callable(stop):
                stop()

        verification = VerificationEngine().verify(iteration, model_response, browser_state)
        log_event(
            "INFO" if verification.status == "passed" else "WARN",
            f"verification {verification.status}: {verification.comments or 'no comments'}",
        )

        after_artifact = save_artifact(
            "screenshot",
            "after.png",
            after,
            {"filename": "after.png", "timelineKind": "after", "capture": after_capture},
            "image/png",
        )
        # Terminal step: the end-of-run frame (with the final cursor position)
        # is its own selectable step instead of masquerading as step-1's after.
        final_step = {
            "id": "step-final",
            "index": step_counter["next_index"],
            "type": "final",
            "message": "Final state",
            "url": browser_state.get("url", ""),
            "title": title,
            "afterArtifactId": after_artifact["id"],
            "capture": after_capture,
            "captureAfter": after_capture,
            "occurredAt": _now(),
        }
        # Surface the model's final answer on the terminal step so the timeline
        # UI can show it (the conversation/task_response artifacts keep the
        # canonical copy).
        if model_response:
            final_step["response"] = model_response
        step_counter["next_index"] += 1
        timeline_steps.append(final_step)
        timeline_artifact = save_timeline()
        notify_step(final_step)
        log_event("INFO", "playwright capture completed")
        save_log()
        save_artifact(
            "conversation",
            "conversation.json",
            json.dumps({"messages": conversation or [{"role": "user", "content": prompt}, {"role": "assistant", "content": model_response}]}).encode(),
            {"filename": "conversation.json"},
            "application/json",
        )
        save_artifact(
            "task_response",
            "response.json",
            json.dumps({"prompt": prompt, "response": model_response}).encode(),
            {"filename": "response.json"},
            "application/json",
        )
        save_artifact("verification", "verification.json", json.dumps(verification.details).encode(), {"filename": "verification.json"}, "application/json")

        return RunnerResult(
            status=verification.status,
            result_data={"runner": "playwright_capture", "title": title, "url": iteration.get("gym_base_url", ""), "modelResponse": model_response},
            verification_details=verification.details,
            verification_comments=verification.comments,
            steps=[RunnerStep(step["message"], step) for step in timeline_steps],
            artifacts=artifacts,
            timeline_artifact_id=timeline_artifact["id"],
            token_usage=token_usage,
        )

    def _playwright(self):
        if self.playwright_factory:
            return self.playwright_factory()
        from playwright.sync_api import sync_playwright

        return sync_playwright().start()
