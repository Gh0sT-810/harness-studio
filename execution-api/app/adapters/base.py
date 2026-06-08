from dataclasses import dataclass, field
from typing import Any, Protocol

from app.models.registry import ModelDefinition


@dataclass(frozen=True)
class AdapterResult:
    content: str = ""
    usage: dict[str, Any] = field(default_factory=dict)
    timeline: list[dict[str, Any]] = field(default_factory=list)
    conversation: list[dict[str, Any]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


class AdapterConfigurationError(RuntimeError):
    """Raised when an adapter cannot run because required runtime config is missing."""


class ModelAdapter(Protocol):
    model: ModelDefinition

    def generate(self, prompt: str, context: dict[str, Any] | None = None) -> AdapterResult:
        ...
