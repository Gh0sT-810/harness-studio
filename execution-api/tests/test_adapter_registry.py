import pytest

import app.adapters.base as adapter_base
from app.adapters.registry import AdapterRegistry, StubModelAdapter, TextOnlyAdapter
from app.adapters.cua import OpenAIResponsesComputerAdapter
from app.models.registry import ModelDefinition


def test_adapter_registry_resolves_text_only_adapter():
    model = ModelDefinition(
        id="model-1",
        provider_id="provider-1",
        provider_key="text",
        adapter_key="text_only",
        model_name="local-test-model",
        display_name="Local Test Model",
        capabilities={"tool_calling": False},
        config={},
        cost_config={},
        timeout_seconds=60,
        secret_ref="",
    )

    adapter = AdapterRegistry().resolve(model)

    assert isinstance(adapter, TextOnlyAdapter)
    assert adapter.model == model
    result = adapter.generate("hello world")
    assert result.usage["input_tokens"] == 2
    assert result.usage["output_tokens"] == 2
    assert result.usage["total_tokens"] == 4


def test_adapter_registry_resolves_local_adapter_alias():
    model = ModelDefinition(
        id="model-1",
        provider_id="provider-1",
        provider_key="local",
        adapter_key="local",
        model_name="local-test-model",
        display_name="Local Test Model",
        capabilities={"tool_calling": False},
        config={},
        cost_config={},
        timeout_seconds=60,
        secret_ref="",
    )

    adapter = AdapterRegistry().resolve(model)

    assert isinstance(adapter, TextOnlyAdapter)
    assert adapter.model == model


def test_adapter_registry_raises_for_unknown_adapter():
    model = ModelDefinition(
        id="model-1",
        provider_id="provider-1",
        provider_key="unknown",
        adapter_key="unknown_adapter",
        model_name="model",
        display_name="Model",
        capabilities={},
        config={},
        cost_config={},
        timeout_seconds=60,
        secret_ref="",
    )

    try:
        AdapterRegistry().resolve(model)
    except KeyError as exc:
        assert "unknown_adapter" in str(exc)
    else:
        raise AssertionError("expected unknown adapter to raise KeyError")


def test_adapter_configuration_error_contract_exists():
    assert hasattr(adapter_base, "AdapterConfigurationError")


@pytest.mark.parametrize(
    "adapter_key",
    [
        "llm_grader",
        "embedding",
        "openai_responses_computer",
        "anthropic_computer_use",
        "gemini_computer_use",
    ],
)
def test_adapter_registry_resolves_provider_backed_adapters_to_concrete_implementations(adapter_key):
    model = ModelDefinition(
        id="model-1",
        provider_id="provider-1",
        provider_key=adapter_key,
        adapter_key=adapter_key,
		model_name="computer-use-preview" if adapter_key == "openai_responses_computer" else "provider-model",
        display_name="Provider Model",
        capabilities={},
        config={},
        cost_config={},
        timeout_seconds=60,
        secret_ref="",
    )

    adapter = AdapterRegistry().resolve(model)

    assert not isinstance(adapter, StubModelAdapter)
    assert adapter.model == model


def test_adapter_registry_rejects_gpt41_for_openai_computer_preview():
    model = ModelDefinition(
        id="model-1",
        provider_id="provider-1",
        provider_key="openai",
        adapter_key="openai_responses_computer",
        model_name="gpt-4.1",
        display_name="GPT 4.1",
        capabilities={},
        config={},
        cost_config={},
        timeout_seconds=60,
        secret_ref="OPENAI_API_KEY",
    )
    error_type = getattr(adapter_base, "AdapterConfigurationError", RuntimeError)

    with pytest.raises(error_type, match="computer-use-preview"):
        AdapterRegistry().resolve(model)


def test_adapter_registry_accepts_openai_computer_preview_model():
    model = ModelDefinition(
        id="model-1",
        provider_id="provider-1",
        provider_key="openai",
        adapter_key="openai_responses_computer",
        model_name="computer-use-preview",
        display_name="OpenAI Computer Use Preview",
        capabilities={},
        config={},
        cost_config={},
        timeout_seconds=60,
        secret_ref="OPENAI_API_KEY",
    )

    adapter = AdapterRegistry().resolve(model)

    assert isinstance(adapter, OpenAIResponsesComputerAdapter)


@pytest.mark.parametrize(
    "adapter_key, expected_message",
    [
        ("openai_responses_computer", "OPENAI_API_KEY"),
        ("anthropic_computer_use", "ANTHROPIC_API_KEY"),
        ("gemini_computer_use", "GEMINI_API_KEY"),
    ],
)
def test_provider_backed_computer_adapters_report_missing_credentials(adapter_key, expected_message, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

    model = ModelDefinition(
        id="model-1",
        provider_id="provider-1",
        provider_key=adapter_key,
        adapter_key=adapter_key,
		model_name="computer-use-preview" if adapter_key == "openai_responses_computer" else "provider-model",
        display_name="Provider Model",
        capabilities={},
        config={},
        cost_config={},
        timeout_seconds=60,
        secret_ref="",
    )
    adapter = AdapterRegistry().resolve(model)
    error_type = getattr(adapter_base, "AdapterConfigurationError", RuntimeError)

    with pytest.raises(error_type, match=expected_message):
        adapter.generate("complete the task", context={})


def test_provider_backed_adapters_resolve_secret_ref_as_environment_variable(monkeypatch):
    monkeypatch.setenv("CUSTOM_OPENAI_KEY", "resolved-key")
    adapter = OpenAIResponsesComputerAdapter(
        ModelDefinition(
            id="model-1",
            provider_id="provider-1",
            provider_key="openai",
            adapter_key="openai_responses_computer",
            model_name="provider-model",
            display_name="Provider Model",
            capabilities={},
            config={},
            cost_config={},
            timeout_seconds=60,
            secret_ref="CUSTOM_OPENAI_KEY",
        )
    )

    assert adapter._api_key() == "resolved-key"
