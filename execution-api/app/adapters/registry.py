from collections.abc import Callable

from app.adapters.cua import (
    AnthropicComputerUseAdapter,
    EmbeddingAdapter,
    GeminiComputerUseAdapter,
    LlmGraderAdapter,
    OpenAIResponsesComputerAdapter,
)
from app.adapters.base import AdapterConfigurationError, AdapterResult, ModelAdapter
from app.models.registry import ModelDefinition


class TextOnlyAdapter:
    def __init__(self, model: ModelDefinition):
        self.model = model

    def generate(self, prompt: str, context: dict | None = None) -> AdapterResult:
        input_tokens = len(prompt.split())
        output_tokens = input_tokens
        return AdapterResult(
            content=prompt,
            usage={
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": input_tokens + output_tokens,
                "cost_usd": 0,
            },
        )


class StubModelAdapter(TextOnlyAdapter):
    pass


class AdapterRegistry:
    def __init__(self, factories: dict[str, Callable[[ModelDefinition], ModelAdapter]] | None = None):
        self.factories = {
            "local": TextOnlyAdapter,
            "text_only": TextOnlyAdapter,
            "llm_grader": LlmGraderAdapter,
            "embedding": EmbeddingAdapter,
            "openai_responses_computer": OpenAIResponsesComputerAdapter,
            "anthropic_computer_use": AnthropicComputerUseAdapter,
            "gemini_computer_use": GeminiComputerUseAdapter,
            **(factories or {}),
        }

    def resolve(self, model: ModelDefinition) -> ModelAdapter:
        validate_model_contract(model)
        factory = self.factories.get(model.adapter_key)
        if factory is None:
            raise KeyError(f"unknown model adapter: {model.adapter_key}")
        return factory(model)


def validate_model_contract(model: ModelDefinition) -> None:
    if model.adapter_key == "openai_responses_computer":
        tool_mode = str(model.config.get("toolMode") or "computer_use_preview")
        if tool_mode != "computer_use_preview":
            raise AdapterConfigurationError(
                "openai_responses_computer currently supports toolMode computer_use_preview only"
            )
        if model.model_name != "computer-use-preview":
            raise AdapterConfigurationError(
                f"openai_responses_computer with computer_use_preview requires computer-use-preview, got {model.model_name}"
            )
