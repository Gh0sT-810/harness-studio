from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True)
class RunnerStep:
    message: str
    payload: dict = field(default_factory=dict)


@dataclass(frozen=True)
class RunnerResult:
    status: str
    result_data: dict
    verification_details: dict
    verification_comments: str
    steps: list[RunnerStep] = field(default_factory=list)
    artifacts: list[dict] = field(default_factory=list)
    timeline_artifact_id: str = ""


class IterationRunner(Protocol):
    def run(self, iteration: dict) -> RunnerResult:
        ...
