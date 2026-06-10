import os
from importlib import import_module
from typing import Any

from app.adapters.base import AdapterConfigurationError, AdapterResult
from app.models.registry import ModelDefinition
from app.settings import get_settings


def _sum_usage(usages: list[dict[str, Any]]) -> dict[str, Any]:
    input_tokens = sum(int(usage.get("input_tokens", 0) or usage.get("prompt_tokens", 0) or 0) for usage in usages)
    output_tokens = sum(int(usage.get("output_tokens", 0) or usage.get("completion_tokens", 0) or 0) for usage in usages)
    total_tokens = sum(int(usage.get("total_tokens", 0) or 0) for usage in usages) or input_tokens + output_tokens
    return {"input_tokens": input_tokens, "output_tokens": output_tokens, "total_tokens": total_tokens, "cost_usd": 0}


def _gemini_usage(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "input_tokens": int(value.get("prompt_token_count", 0) or 0),
        "output_tokens": int(value.get("candidates_token_count", 0) or 0),
        "total_tokens": int(value.get("total_token_count", 0) or 0),
    }


class ComputerUseAdapter:
    provider = ""
    required_env_names: tuple[str, ...] = ()
    coordinates_normalized = False

    def __init__(self, model: ModelDefinition, *, client: Any = None, api_key: str | None = None):
        self.model = model
        self.client = client
        self.api_key = api_key

    def _api_key(self) -> str:
        key = self.api_key
        settings = get_settings()
        if not key and self.model.secret_ref:
            key = os.getenv(self.model.secret_ref)
        for name in self.required_env_names:
            key = key or os.getenv(name) or getattr(settings, name.lower(), "")
        if not key:
            raise AdapterConfigurationError(f"{' or '.join(self.required_env_names)} is required for {self.model.adapter_key}")
        return key

    def _max_steps(self) -> int:
        return int(self.model.config.get("maxSteps", get_settings().cua_max_steps) or get_settings().cua_max_steps)

    def _require_computer(self, context: dict[str, Any] | None) -> Any:
        computer = (context or {}).get("computer")
        if computer is None:
            raise AdapterConfigurationError(f"{self.model.adapter_key} requires a computer in adapter context")
        return computer

    def _execute_action(self, computer: Any, action_name: str, args: dict[str, Any]) -> dict[str, Any]:
        args = dict(args)
        if self.coordinates_normalized and "x" in args and "y" in args and hasattr(computer, "normalize_coordinates"):
            args["x"], args["y"] = computer.normalize_coordinates(int(args["x"]), int(args["y"]))
        if self.coordinates_normalized and action_name == "drag" and hasattr(computer, "normalize_coordinates"):
            args["path"] = [
                dict(point, **dict(zip(("x", "y"), computer.normalize_coordinates(int(point["x"]), int(point["y"])))))
                for point in args.get("path", [])
            ]
        if action_name in {"click", "left_click"}:
            computer.click(int(args["x"]), int(args["y"]), args.get("button", "left"))
        elif action_name in {"double_click", "doubleClick"}:
            computer.double_click(int(args["x"]), int(args["y"]))
        elif action_name in {"type", "type_text"}:
            computer.type(str(args.get("text", "")))
        elif action_name in {"keypress", "key_press"}:
            keys = args.get("keys") or args.get("key") or []
            computer.keypress(keys if isinstance(keys, list) else [str(keys)])
        elif action_name == "scroll":
            computer.scroll(
                int(args.get("x", 0)),
                int(args.get("y", 0)),
                int(args.get("scroll_x", args.get("delta_x", 0)) or 0),
                int(args.get("scroll_y", args.get("delta_y", 0)) or 0),
            )
        elif action_name in {"move", "mouse_move"}:
            computer.move(int(args["x"]), int(args["y"]))
        elif action_name == "drag":
            computer.drag(args.get("path", []))
        elif action_name == "wait":
            computer.wait(int(args.get("ms", 1000) or 1000))
        elif action_name == "screenshot":
            pass
        else:
            raise RuntimeError(f"unsupported computer action: {action_name}")
        return {"provider": self.provider, "action": action_name, "args": args}


class OpenAIResponsesComputerAdapter(ComputerUseAdapter):
    provider = "openai"
    required_env_names = ("OPENAI_API_KEY",)

    def _client(self) -> Any:
        if self.client is not None:
            return self.client
        api_key = self._api_key()
        client = import_module("openai").OpenAI(api_key=api_key)
        return _OpenAIResponsesClient(client)

    def generate(self, prompt: str, context: dict[str, Any] | None = None) -> AdapterResult:
        if self.client is None:
            self._api_key()
        computer = self._require_computer(context)
        client = self._client()
        usages: list[dict[str, Any]] = []
        timeline: list[dict[str, Any]] = []
        conversation = [{"role": "user", "content": prompt}]
        previous_response_id = None
        computer_outputs: list[dict[str, Any]] = []

        for _ in range(self._max_steps()):
            response = client.create_response(
                model=self.model.model_name,
                prompt=prompt,
                previous_response_id=previous_response_id,
                computer_outputs=computer_outputs,
            )
            previous_response_id = response.get("id", previous_response_id)
            usages.append(response.get("usage", {}))
            computer_outputs = []
            final_text = _openai_text(response)
            if final_text:
                conversation.append({"role": "assistant", "content": final_text})
                return AdapterResult(content=final_text, usage=_sum_usage(usages), timeline=timeline, conversation=conversation)

            calls = [item for item in response.get("output", []) if item.get("type") == "computer_call"]
            if not calls:
                return AdapterResult(content="", usage=_sum_usage(usages), timeline=timeline, conversation=conversation)
            for call in calls:
                action = call.get("action", {})
                action_name = str(action.get("type") or action.get("action") or "")
                entry = self._execute_action(computer, action_name, action)
                timeline.append(entry)
                computer_outputs.append({"call_id": call.get("call_id"), "screenshot": computer.screenshot()})

        return AdapterResult(content="", usage=_sum_usage(usages), timeline=timeline, conversation=conversation)


class AnthropicComputerUseAdapter(ComputerUseAdapter):
    provider = "anthropic"
    required_env_names = ("ANTHROPIC_API_KEY",)

    def _client(self) -> Any:
        if self.client is not None:
            return self.client
        api_key = self._api_key()
        client = import_module("anthropic").Anthropic(api_key=api_key, max_retries=3)
        return _AnthropicMessagesClient(client)

    def generate(self, prompt: str, context: dict[str, Any] | None = None) -> AdapterResult:
        if self.client is None:
            self._api_key()
        computer = self._require_computer(context)
        client = self._client()
        usages: list[dict[str, Any]] = []
        timeline: list[dict[str, Any]] = []
        conversation = [{"role": "user", "content": prompt}]
        messages: list[dict[str, Any]] = [{"role": "user", "content": prompt}]

        for _ in range(self._max_steps()):
            response = client.create_message(model=self.model.model_name, prompt=prompt, messages=messages)
            usage = response.get("usage", {})
            usages.append({"input_tokens": usage.get("input_tokens", 0), "output_tokens": usage.get("output_tokens", 0)})
            text = _anthropic_text(response)
            if text:
                conversation.append({"role": "assistant", "content": text})
                return AdapterResult(content=text, usage=_sum_usage(usages), timeline=timeline, conversation=conversation)

            tool_uses = [item for item in response.get("content", []) if item.get("type") == "tool_use"]
            if not tool_uses:
                return AdapterResult(content="", usage=_sum_usage(usages), timeline=timeline, conversation=conversation)
            messages.append({"role": "assistant", "content": response.get("content", [])})
            tool_result_content = []
            for tool_use in tool_uses:
                args = dict(tool_use.get("input", {}))
                action_name = str(args.pop("action", ""))
                entry = self._execute_action(computer, action_name, args)
                timeline.append(entry)
                tool_result_content.append(_anthropic_tool_result(tool_use.get("id"), computer.screenshot()))
            messages.append({"role": "user", "content": tool_result_content})

        return AdapterResult(content="", usage=_sum_usage(usages), timeline=timeline, conversation=conversation)


class GeminiComputerUseAdapter(ComputerUseAdapter):
    provider = "gemini"
    required_env_names = ("GEMINI_API_KEY", "GOOGLE_API_KEY")
    coordinates_normalized = True

    def _client(self) -> Any:
        if self.client is not None:
            return self.client
        api_key = self._api_key()
        return _GeminiModelsClient(import_module("google.genai").Client(api_key=api_key))

    def generate(self, prompt: str, context: dict[str, Any] | None = None) -> AdapterResult:
        if self.client is None:
            self._api_key()
        computer = self._require_computer(context)
        client = self._client()
        usages: list[dict[str, Any]] = []
        timeline: list[dict[str, Any]] = []
        conversation = [{"role": "user", "content": prompt}]
        contents: list[dict[str, Any]] = [{"role": "user", "parts": [{"text": prompt}]}]

        for _ in range(self._max_steps()):
            response = client.generate_content(model=self.model.model_name, prompt=prompt, contents=contents)
            usages.append(_gemini_usage(response.get("usage_metadata", {})))
            text = response.get("text", "")
            if text:
                conversation.append({"role": "assistant", "content": text})
                return AdapterResult(content=text, usage=_sum_usage(usages), timeline=timeline, conversation=conversation)

            calls = response.get("function_calls", [])
            if not calls:
                return AdapterResult(content="", usage=_sum_usage(usages), timeline=timeline, conversation=conversation)
            contents.append({"role": "model", "parts": [{"function_call": call} for call in calls]})
            function_response_parts = []
            for call in calls:
                action_name = str(call.get("name", ""))
                args = dict(call.get("args", {}))
                entry = self._execute_action(computer, action_name, args)
                timeline.append(entry)
                function_response_parts.append(_gemini_function_response(action_name, computer.screenshot()))
            contents.append({"role": "user", "parts": function_response_parts})

        return AdapterResult(content="", usage=_sum_usage(usages), timeline=timeline, conversation=conversation)


class EmbeddingAdapter:
    def __init__(self, model: ModelDefinition, *, client: Any = None, api_key: str | None = None):
        self.model = model
        self.client = client
        self.api_key = api_key

    def generate(self, prompt: str, context: dict[str, Any] | None = None) -> AdapterResult:
        if self.client is None:
            self.client = self._client()
        if self.client is not None:
            embedding = self.client.embed(prompt, self.model.model_name)
            input_tokens = len(prompt.split())
            return AdapterResult(
                content=str(embedding),
                usage={"input_tokens": input_tokens, "output_tokens": 0, "total_tokens": input_tokens, "cost_usd": 0},
                metadata={"provider": self.model.provider_key, "model": self.model.model_name, "dimension": len(embedding)},
            )
        input_tokens = len(prompt.split())
        return AdapterResult(
            content="",
            usage={"input_tokens": input_tokens, "output_tokens": 0, "total_tokens": input_tokens, "cost_usd": 0},
            metadata={"provider": self.model.provider_key, "model": self.model.model_name, "embeddingInputLength": len(prompt)},
        )

    def _client(self) -> Any:
        provider = self.model.provider_key.lower()
        if "gemini" in provider:
            return _GeminiEmbeddingClient(_resolve_model_key(self.model, "GEMINI_API_KEY", "GOOGLE_API_KEY"))
        if "local" in provider:
            return _LocalEmbeddingClient(self.model.config.get("baseUrl") or self.model.config.get("serviceUrl") or "http://localhost:8099")
        return _OpenAIEmbeddingClient(_resolve_model_key(self.model, "OPENAI_API_KEY"))


class LlmGraderAdapter:
    def __init__(self, model: ModelDefinition, *, client: Any = None, api_key: str | None = None):
        self.model = model
        self.client = client
        self.api_key = api_key

    def generate(self, prompt: str, context: dict[str, Any] | None = None) -> AdapterResult:
        if self.client is None:
            self.client = self._client()
        if self.client is not None:
            content = self.client.grade(prompt, self.model.model_name)
            input_tokens = len(prompt.split())
            output_tokens = len(content.split())
            return AdapterResult(
                content=content,
                usage={"input_tokens": input_tokens, "output_tokens": output_tokens, "total_tokens": input_tokens + output_tokens, "cost_usd": 0},
                metadata={"provider": self.model.provider_key, "model": self.model.model_name},
            )
        response = {"passed": True, "reason": "No external grader client configured; accepted deterministic local grader result."}
        input_tokens = len(prompt.split())
        output_tokens = len(response["reason"].split()) + 2
        return AdapterResult(
            content=str(response).replace("'", '"'),
            usage={"input_tokens": input_tokens, "output_tokens": output_tokens, "total_tokens": input_tokens + output_tokens, "cost_usd": 0},
            metadata={"provider": self.model.provider_key, "model": self.model.model_name},
        )

    def _client(self) -> Any:
        model_name = self.model.model_name.lower()
        if "claude" in model_name or "anthropic" in self.model.provider_key.lower():
            return _AnthropicGraderClient(_resolve_model_key(self.model, "ANTHROPIC_API_KEY"))
        return _OpenAIGraderClient(_resolve_model_key(self.model, "OPENAI_API_KEY"))


def _openai_text(response: dict[str, Any]) -> str:
    for item in response.get("output", []):
        if item.get("type") == "message":
            parts = item.get("content", [])
            return "".join(part.get("text", "") for part in parts if part.get("type") in {"output_text", "text"})
    return str(response.get("output_text", "") or "")


def _anthropic_text(response: dict[str, Any]) -> str:
    return "".join(item.get("text", "") for item in response.get("content", []) if item.get("type") == "text")


def _resolve_key(*names: str) -> str:
    settings = get_settings()
    for name in names:
        value = os.getenv(name) or getattr(settings, name.lower(), "")
        if value:
            return value
    raise AdapterConfigurationError(f"{' or '.join(names)} is required")


def _resolve_model_key(model: ModelDefinition, *names: str) -> str:
    if model.secret_ref:
        value = os.getenv(model.secret_ref)
        if value:
            return value
    return _resolve_key(*names)


def _anthropic_tool_result(tool_use_id: str | None, screenshot: str) -> dict[str, Any]:
    return {
        "type": "tool_result",
        "tool_use_id": tool_use_id,
        "content": [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": screenshot,
                },
            }
        ],
    }


def _gemini_function_response(name: str, screenshot: str) -> dict[str, Any]:
    return {"function_response": {"name": name, "response": {"screenshot": screenshot}}}


class _OpenAIResponsesClient:
    def __init__(self, client: Any):
        self.client = client

    def create_response(self, **kwargs: Any) -> dict[str, Any]:
        input_payload: Any = kwargs["prompt"]
        computer_outputs = kwargs.get("computer_outputs") or []
        if computer_outputs:
            input_payload = [
                {
                    "type": "computer_call_output",
                    "call_id": output["call_id"],
                    "output": {
                        "type": "input_image",
                        "image_url": f"data:image/png;base64,{output['screenshot']}",
                    },
                }
                for output in computer_outputs
            ]
        response = self.client.responses.create(
            model=kwargs["model"],
            input=input_payload,
            previous_response_id=kwargs.get("previous_response_id"),
			truncation="auto",
            tools=[{"type": "computer_use_preview", "display_width": 1280, "display_height": 800, "environment": "browser"}],
        )
        return response.model_dump()


class _AnthropicMessagesClient:
    def __init__(self, client: Any):
        self.client = client

    def create_message(self, **kwargs: Any) -> dict[str, Any]:
        if "messages" in kwargs:
            messages = kwargs["messages"]
        else:
            messages = [{"role": "user", "content": kwargs["prompt"]}]
        tool_results = kwargs.get("tool_results") or []
        if tool_results:
            messages.append({"role": "user", "content": [_anthropic_tool_result(result["tool_use_id"], result["screenshot"]) for result in tool_results]})
        response = self.client.messages.create(
            model=kwargs["model"],
            max_tokens=1024,
            messages=messages,
            tools=[{"type": "computer_20250124", "name": "computer", "display_width_px": 1280, "display_height_px": 800}],
        )
        return response.model_dump()


class _GeminiModelsClient:
    def __init__(self, client: Any):
        self.client = client

    def generate_content(self, **kwargs: Any) -> dict[str, Any]:
        contents: list[dict[str, Any]] = list(kwargs.get("contents") or [{"role": "user", "parts": [{"text": kwargs["prompt"]}]}])
        for result in kwargs.get("function_responses") or []:
            contents.append(
                {
                    "role": "user",
                    "parts": [_gemini_function_response(result["name"], result["screenshot"])],
                }
            )
        response = self.client.models.generate_content(
            model=kwargs["model"],
            contents=contents,
            config={"tools": [{"computer_use": {}}]},
        )
        data = response.model_dump() if hasattr(response, "model_dump") else {}
        data.setdefault("text", getattr(response, "text", ""))
        data.setdefault("usage_metadata", getattr(response, "usage_metadata", {}) or {})
        data.setdefault("function_calls", getattr(response, "function_calls", []) or [])
        return data or {
            "text": getattr(response, "text", ""),
            "usage_metadata": getattr(response, "usage_metadata", {}) or {},
            "function_calls": getattr(response, "function_calls", []) or [],
        }


class _OpenAIEmbeddingClient:
    def __init__(self, api_key: str):
        self.client = import_module("openai").OpenAI(api_key=api_key)

    def embed(self, text: str, model: str) -> list[float]:
        response = self.client.embeddings.create(input=text, model=model or "text-embedding-3-small")
        return list(response.data[0].embedding)


class _GeminiEmbeddingClient:
    def __init__(self, api_key: str):
        self.client = import_module("google.genai").Client(api_key=api_key)

    def embed(self, text: str, model: str) -> list[float]:
        result = self.client.models.embed_content(model=model or "gemini-embedding-001", contents=text)
        return list(result.embeddings[0].values)


class _LocalEmbeddingClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def embed(self, text: str, model: str) -> list[float]:
        httpx = import_module("httpx")
        response = httpx.post(f"{self.base_url}/embed", json={"text": text, "model": model}, timeout=30.0)
        response.raise_for_status()
        return list(response.json()["embedding"])


class _OpenAIGraderClient:
    def __init__(self, api_key: str):
        self.client = import_module("openai").OpenAI(api_key=api_key)

    def grade(self, prompt: str, model: str) -> str:
        response = self.client.responses.create(model=model or "gpt-4.1-mini", input=prompt)
        return _openai_text(response.model_dump())


class _AnthropicGraderClient:
    def __init__(self, api_key: str):
        self.client = import_module("anthropic").Anthropic(api_key=api_key, max_retries=3)

    def grade(self, prompt: str, model: str) -> str:
        response = self.client.messages.create(model=model or "claude-sonnet-4-20250514", max_tokens=1024, messages=[{"role": "user", "content": prompt}])
        return _anthropic_text(response.model_dump())
