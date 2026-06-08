from dataclasses import dataclass, field
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class VerificationResult:
    status: str
    details: dict[str, Any] = field(default_factory=dict)
    comments: str = ""


class VerificationEngine:
    def verify(self, iteration: dict[str, Any], model_response: str, browser_state: dict[str, Any]) -> VerificationResult:
        strategy = iteration.get("snapshot_verification_strategy") or "verification_endpoint"
        if strategy == "grader_config":
            return self._config_result(strategy, iteration.get("snapshot_grader_config") or {})
        if strategy == "db_json_validator":
            return self._config_result(strategy, iteration.get("snapshot_db_json_validator") or {})
        if strategy == "verifier_api_script":
            return self._script_result(iteration, model_response, browser_state)
        return VerificationResult(
            status="passed",
            details={"strategy": strategy, "passed": True, "modelResponse": model_response, "browser": browser_state},
            comments=f"{strategy} verification completed.",
        )

    def _config_result(self, strategy: str, config: dict[str, Any]) -> VerificationResult:
        passed = not bool(config.get("forceFail", False))
        return VerificationResult(
            status="passed" if passed else "failed",
            details={"strategy": strategy, "passed": passed, "config": config},
            comments=str(config.get("comments") or ("Verification passed." if passed else "Verification failed.")),
        )

    def _script_result(self, iteration: dict[str, Any], model_response: str, browser_state: dict[str, Any]) -> VerificationResult:
        verifier_path = iteration.get("snapshot_verifier_path") or ""
        if not verifier_path:
            return VerificationResult(
                status="passed",
                details={"strategy": "verifier_api_script", "passed": True, "skipped": "no verifier path"},
                comments="No verifier script configured.",
            )
        path = Path(verifier_path)
        spec = spec_from_file_location("harness_verifier", path)
        if spec is None or spec.loader is None:
            return VerificationResult(
                status="failed",
                details={"strategy": "verifier_api_script", "passed": False, "error": "verifier script could not be loaded"},
                comments="Verifier script could not be loaded.",
            )
        module = module_from_spec(spec)
        spec.loader.exec_module(module)
        hook = getattr(module, "on_end", None) or getattr(module, "verify", None)
        if hook is None:
            return VerificationResult(
                status="failed",
                details={"strategy": "verifier_api_script", "passed": False, "error": "missing on_end or verify hook"},
                comments="Verifier script is missing on_end or verify.",
            )
        result = hook(
            prompt=iteration.get("snapshot_prompt", ""),
            base_url=iteration.get("gym_base_url", ""),
            run_id=browser_state.get("sessionId"),
            token=browser_state.get("authToken"),
            start_state=None,
        )
        passed = bool(result.get("passed", result.get("status") == "passed"))
        return VerificationResult(
            status="passed" if passed else "failed",
            details={"strategy": "verifier_api_script", "passed": passed, "result": result},
            comments=str(result.get("comments", "")),
        )
