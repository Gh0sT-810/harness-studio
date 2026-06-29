"""Report data model and runner constants.

Ported from the reference harness (turing-aws-ui-gym-harness-1
``backend/app/services/reports/execution_report.py``) so the generated batch
report matches it. ``IterationRecord`` is the single unit the summary, snapshot
and workbook builders all consume.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


KNOWN_RUNNERS = {
    "anthropic": "Claude Sonnet 4",
    "anthropic_opus": "Claude Opus 4.5",
    "openai": "OpenAI Computer Use Preview",
    "gemini": "Google Gemini Computer Use",
}

RUNNER_MODELS = dict(KNOWN_RUNNERS)

MODEL_ORDER = [
    ("anthropic", RUNNER_MODELS["anthropic"]),
    ("anthropic_opus", RUNNER_MODELS["anthropic_opus"]),
    ("openai", RUNNER_MODELS["openai"]),
    ("gemini", RUNNER_MODELS["gemini"]),
]


@dataclass
class IterationRecord:
    task_id: str
    iteration: int
    runner: str
    status: str
    status_reason: Optional[str]
    completion_reason: Optional[str]
    duration_seconds: Optional[float]
    timelapse: Optional[str]
    file_timelapse_seconds: Optional[float]
    tool_calls_total: int
    tool_calls_by_tool: Dict[str, int] = field(default_factory=dict)
    unique_tools: List[str] = field(default_factory=list)
    prompt: Optional[str] = None
    prompt_id: Optional[str] = None
    model: Optional[str] = None
    run_id: Optional[str] = None
    start_timestamp: Optional[str] = None
    end_timestamp: Optional[str] = None
    iteration_directory: Optional[str] = None
    execution_uuid: Optional[str] = None
    iteration_uuid: Optional[str] = None
    verification_comments: Optional[str] = None
    last_model_response: Optional[str] = None
    eval_insights: Optional[str] = None
    total_steps: Optional[int] = None
    extra: Dict[str, object] = field(default_factory=dict)

    @property
    def runner_label(self) -> str:
        return KNOWN_RUNNERS.get(self.runner, self.runner.title())
