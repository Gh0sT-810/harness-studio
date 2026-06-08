from collections.abc import Callable

from app.adapters.base import AdapterResult, ModelAdapter
from app.models.registry import ModelDefinition


class TextOnlyAdapter:
    def __init__(self, model: ModelDefinition):
        self.model = model

    def generate(self, prompt: str, context: dict | None = None) -> AdapterResult:
        return AdapterResult(content=prompt, usage={})


class StubModelAdapter(TextOnlyAdapter):
    pass


class AdapterRegistry:
    def __init__(self, factories: dict[str, Callable[[ModelDefinition], ModelAdapter]] | None = None):
        self.factories = {
            "text_only": TextOnlyAdapter,
            "llm_grader": StubModelAdapter,
            "embedding": StubModelAdapter,
            "openai_responses_computer": StubModelAdapter,
            "anthropic_computer_use": StubModelAdapter,
            "gemini_computer_use": StubModelAdapter,
            **(factories or {}),
        }

    def resolve(self, model: ModelDefinition) -> ModelAdapter:
        factory = self.factories.get(model.adapter_key)
        if factory is None:
            raise KeyError(f"unknown model adapter: {model.adapter_key}")
        return factory(model)
