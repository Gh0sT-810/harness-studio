from app.adapters.registry import AdapterRegistry, TextOnlyAdapter
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
