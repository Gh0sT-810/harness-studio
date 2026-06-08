from dataclasses import dataclass, field
from typing import Any, Protocol

from app.models.registry import ModelDefinition


@dataclass(frozen=True)
class AdapterResult:
    content: str = ""
    usage: dict[str, Any] = field(default_factory=dict)


class ModelAdapter(Protocol):
    model: ModelDefinition

    def generate(self, prompt: str, context: dict[str, Any] | None = None) -> AdapterResult:
        ...
