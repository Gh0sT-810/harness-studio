from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ModelDefinition:
    id: str
    provider_id: str
    provider_key: str
    adapter_key: str
    model_name: str
    display_name: str
    capabilities: dict[str, Any] = field(default_factory=dict)
    config: dict[str, Any] = field(default_factory=dict)
    cost_config: dict[str, Any] = field(default_factory=dict)
    timeout_seconds: int = 60
    max_output_tokens: int = 0
    secret_ref: str = ""

    @classmethod
    def from_mapping(cls, value: dict[str, Any]) -> "ModelDefinition":
        return cls(
            id=str(value.get("id", "")),
            provider_id=str(value.get("provider_id", value.get("providerId", ""))),
            provider_key=str(value.get("provider_key", value.get("providerKey", ""))),
            adapter_key=str(value.get("adapter_key", value.get("adapterKey", ""))),
            model_name=str(value.get("model_name", value.get("modelName", ""))),
            display_name=str(value.get("display_name", value.get("displayName", ""))),
            capabilities=dict(value.get("capabilities") or {}),
            config=dict(value.get("config") or {}),
            cost_config=dict(value.get("cost_config", value.get("costConfig", {})) or {}),
            timeout_seconds=int(value.get("timeout_seconds", value.get("timeoutSeconds", 60)) or 60),
            max_output_tokens=int(value.get("max_output_tokens", value.get("maxOutputTokens", 0)) or 0),
            secret_ref=str(value.get("secret_ref", value.get("secretRef", ""))),
        )
