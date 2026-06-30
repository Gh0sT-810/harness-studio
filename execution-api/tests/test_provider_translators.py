from app.models.registry import ModelDefinition


def model(adapter_key: str) -> ModelDefinition:
    return ModelDefinition(
        id="model-1",
        provider_id="provider-1",
        provider_key=adapter_key,
        adapter_key=adapter_key,
        model_name="provider-model",
        display_name="Provider Model",
        capabilities={},
        config={},
        cost_config={},
        timeout_seconds=60,
        secret_ref="",
    )


class FakeComputer:
    def __init__(self):
        self.calls = []

    def screenshot(self):
        self.calls.append(("screenshot",))
        return "base64-screen"

    def click(self, x, y, button="left"):
        self.calls.append(("click", x, y, button))

    def type(self, text):
        self.calls.append(("type", text))

    def scroll(self, x, y, scroll_x, scroll_y):
        self.calls.append(("scroll", x, y, scroll_x, scroll_y))

    def normalize_coordinates(self, x, y, source_width=1000, source_height=1000):
        return round(x * 1280 / source_width), round(y * 800 / source_height)


class FakeOpenAIClient:
    def __init__(self):
        self.calls = []

    def create_response(self, **kwargs):
        self.calls.append(kwargs)
        if len(self.calls) == 1:
            return {
                "id": "response-1",
                "output": [
                    {
                        "type": "computer_call",
                        "call_id": "call-1",
                        "action": {"type": "click", "x": 10, "y": 20, "button": "left"},
                    }
                ],
                "usage": {"input_tokens": 5, "output_tokens": 2, "total_tokens": 7},
            }
        return {
            "id": "response-2",
            "output": [{"type": "message", "content": [{"type": "output_text", "text": "openai done"}]}],
            "usage": {"input_tokens": 3, "output_tokens": 4, "total_tokens": 7},
        }


class FakeOpenAIScreenshotClient:
    def __init__(self):
        self.calls = []

    def create_response(self, **kwargs):
        self.calls.append(kwargs)
        if len(self.calls) == 1:
            return {
                "id": "response-1",
                "output": [
                    {
                        "type": "computer_call",
                        "call_id": "call-1",
                        "action": {"type": "screenshot"},
                    }
                ],
                "usage": {"input_tokens": 5, "output_tokens": 2, "total_tokens": 7},
            }
        return {
            "id": "response-2",
            "output": [{"type": "message", "content": [{"type": "output_text", "text": "openai done"}]}],
            "usage": {"input_tokens": 3, "output_tokens": 4, "total_tokens": 7},
        }


class FakeOpenAIMixedOutputClient:
    def __init__(self):
        self.calls = []

    def create_response(self, **kwargs):
        self.calls.append(kwargs)
        if len(self.calls) == 1:
            return {
                "id": "response-1",
                "output": [
                    {"type": "message", "content": [{"type": "output_text", "text": "I will click the target."}]},
                    {
                        "type": "computer_call",
                        "call_id": "call-1",
                        "action": {"type": "click", "x": 10, "y": 20, "button": "left"},
                    },
                ],
                "usage": {"input_tokens": 5, "output_tokens": 2, "total_tokens": 7},
            }
        return {
            "id": "response-2",
            "output": [{"type": "message", "content": [{"type": "output_text", "text": "openai done"}]}],
            "usage": {"input_tokens": 3, "output_tokens": 4, "total_tokens": 7},
        }


class FakeAnthropicClient:
    def __init__(self):
        self.calls = []

    def create_message(self, **kwargs):
        self.calls.append(kwargs)
        if len(self.calls) == 1:
            return {
                "content": [
                    {"type": "text", "text": "Typing the search query."},
                    {
                        "type": "tool_use",
                        "id": "tool-1",
                        "name": "computer",
                        "input": {"action": "type", "text": "hello"},
                    },
                ],
                "usage": {"input_tokens": 4, "output_tokens": 2},
            }
        return {
            "content": [{"type": "text", "text": "anthropic done"}],
            "usage": {"input_tokens": 3, "output_tokens": 5},
        }


class FakeGeminiClient:
    def __init__(self):
        self.calls = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        if len(self.calls) == 1:
            return {
                "text": "Scrolling down to reveal the results.",
                "function_calls": [
                    {
                        "name": "scroll",
                        "args": {"x": 11, "y": 22, "scroll_x": 0, "scroll_y": 300},
                    }
                ],
                "usage_metadata": {"prompt_token_count": 6, "candidates_token_count": 3, "total_token_count": 9},
            }
        return {
            "text": "gemini done",
            "usage_metadata": {"prompt_token_count": 2, "candidates_token_count": 4, "total_token_count": 6},
        }


def test_openai_responses_adapter_executes_computer_calls_and_returns_final_response():
    from app.adapters.cua import OpenAIResponsesComputerAdapter

    computer = FakeComputer()
    client = FakeOpenAIClient()
    adapter = OpenAIResponsesComputerAdapter(model("openai_responses_computer"), client=client, api_key="test-key")

    result = adapter.generate("Do it", context={"computer": computer})

    assert result.content == "openai done"
    assert result.usage == {"input_tokens": 8, "output_tokens": 6, "total_tokens": 14, "cost_usd": 0}
    assert result.timeline[0]["provider"] == "openai"
    assert result.timeline[0]["action"] == "click"
    # No message text accompanied the computer call, so no reasoning is attached.
    assert "reasoning" not in result.timeline[0]
    assert computer.calls == [("screenshot",), ("click", 10, 20, "left"), ("screenshot",)]
    assert client.calls[1]["previous_response_id"] == "response-1"
    assert client.calls[1]["computer_outputs"][0]["call_id"] == "call-1"


def test_openai_responses_adapter_handles_screenshot_action():
    from app.adapters.cua import OpenAIResponsesComputerAdapter

    computer = FakeComputer()
    client = FakeOpenAIScreenshotClient()
    adapter = OpenAIResponsesComputerAdapter(model("openai_responses_computer"), client=client, api_key="test-key")

    result = adapter.generate("Show the screen", context={"computer": computer})

    assert result.content == "openai done"
    assert result.timeline[0]["provider"] == "openai"
    assert result.timeline[0]["action"] == "screenshot"
    assert computer.calls == [("screenshot",), ("screenshot",)]
    assert client.calls[1]["computer_outputs"][0]["call_id"] == "call-1"


def test_openai_responses_adapter_executes_calls_before_treating_text_as_final():
    from app.adapters.cua import OpenAIResponsesComputerAdapter

    computer = FakeComputer()
    client = FakeOpenAIMixedOutputClient()
    adapter = OpenAIResponsesComputerAdapter(model("openai_responses_computer"), client=client, api_key="test-key")

    result = adapter.generate("Do it", context={"computer": computer})

    assert result.content == "openai done"
    assert result.timeline[0]["action"] == "click"
    # The message text in the same turn as the call is captured as reasoning.
    assert result.timeline[0]["reasoning"] == "I will click the target."
    assert computer.calls == [("screenshot",), ("click", 10, 20, "left"), ("screenshot",)]
    assert client.calls[1]["computer_outputs"][0]["call_id"] == "call-1"


def test_anthropic_adapter_executes_tool_use_and_returns_final_response():
    from app.adapters.cua import AnthropicComputerUseAdapter

    computer = FakeComputer()
    client = FakeAnthropicClient()
    adapter = AnthropicComputerUseAdapter(model("anthropic_computer_use"), client=client, api_key="test-key")

    result = adapter.generate("Do it", context={"computer": computer})

    assert result.content == "anthropic done"
    assert result.usage == {"input_tokens": 7, "output_tokens": 7, "total_tokens": 14, "cost_usd": 0}
    assert result.timeline[0]["provider"] == "anthropic"
    assert result.timeline[0]["action"] == "type"
    # Text emitted alongside the tool_use is captured as reasoning.
    assert result.timeline[0]["reasoning"] == "Typing the search query."
    assert computer.calls == [("screenshot",), ("type", "hello"), ("screenshot",)]
    assert client.calls[1]["messages"][1]["role"] == "assistant"
    assert client.calls[1]["messages"][2]["content"][0]["tool_use_id"] == "tool-1"


def test_gemini_adapter_executes_function_calls_and_returns_final_response():
    from app.adapters.cua import GeminiComputerUseAdapter

    computer = FakeComputer()
    client = FakeGeminiClient()
    adapter = GeminiComputerUseAdapter(model("gemini_computer_use"), client=client, api_key="test-key")

    result = adapter.generate("Do it", context={"computer": computer})

    assert result.content == "gemini done"
    assert result.usage == {"input_tokens": 8, "output_tokens": 7, "total_tokens": 15, "cost_usd": 0}
    assert result.timeline[0]["provider"] == "gemini"
    assert result.timeline[0]["action"] == "scroll"
    # Text emitted alongside the function call is captured as reasoning.
    assert result.timeline[0]["reasoning"] == "Scrolling down to reveal the results."
    assert computer.calls == [("screenshot",), ("scroll", 14, 18, 0, 300), ("screenshot",)]
    assert client.calls[1]["contents"][1]["role"] == "model"
    assert client.calls[1]["contents"][2]["parts"][0]["function_response"]["name"] == "scroll"


class RecordingOpenAIResponses:
    def __init__(self):
        self.kwargs = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        return Dumpable({"id": "response-id", "output": []})


class RecordingAnthropicMessages:
    def __init__(self):
        self.kwargs = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        return Dumpable({"content": []})


class RecordingGeminiModels:
    def __init__(self):
        self.kwargs = None

    def generate_content(self, **kwargs):
        self.kwargs = kwargs
        return Dumpable({"text": "", "usage_metadata": {}, "function_calls": []})


class ConvenienceGeminiModels:
    def generate_content(self, **kwargs):
        return GeminiDumpWithConvenience()


class GeminiDumpWithConvenience:
    text = "done from property"
    usage_metadata = {"prompt_token_count": 1, "candidates_token_count": 2, "total_token_count": 3}
    function_calls = [{"name": "click", "args": {"x": 1, "y": 2}}]

    def model_dump(self):
        return {}


class Dumpable:
    def __init__(self, value):
        self.value = value

    def model_dump(self):
        return self.value


def test_live_openai_wrapper_forwards_computer_tool_and_outputs():
    from app.adapters.cua import _OpenAIResponsesClient

    responses = RecordingOpenAIResponses()
    client = type("Client", (), {"responses": responses})()

    _OpenAIResponsesClient(client).create_response(
        model="computer-model",
        prompt="Do it",
        previous_response_id="previous-id",
        computer_outputs=[{"call_id": "call-1", "screenshot": "screen"}],
    )

    assert responses.kwargs["previous_response_id"] == "previous-id"
    assert responses.kwargs["truncation"] == "auto"
    assert responses.kwargs["tools"][0]["type"] == "computer_use_preview"
    assert "sandboxed browser benchmark" in responses.kwargs["instructions"]
    assert "Do not merely describe" in responses.kwargs["instructions"]
    assert responses.kwargs["input"][0]["type"] == "computer_call_output"
    assert responses.kwargs["input"][0]["call_id"] == "call-1"


def test_live_anthropic_wrapper_forwards_computer_tool_results():
    from app.adapters.cua import _AnthropicMessagesClient

    messages = RecordingAnthropicMessages()
    client = type("Client", (), {"messages": messages})()

    _AnthropicMessagesClient(client).create_message(
        model="claude-model",
        prompt="Do it",
        tool_results=[{"tool_use_id": "tool-1", "screenshot": "screen"}],
    )

    assert messages.kwargs["tools"][0]["type"].startswith("computer_")
    assert messages.kwargs["messages"][1]["content"][0]["type"] == "tool_result"
    assert messages.kwargs["messages"][1]["content"][0]["tool_use_id"] == "tool-1"


def test_live_gemini_wrapper_forwards_function_responses():
    from app.adapters.cua import _GeminiModelsClient

    models = RecordingGeminiModels()
    client = type("Client", (), {"models": models})()

    _GeminiModelsClient(client).generate_content(
        model="gemini-model",
        prompt="Do it",
        function_responses=[{"name": "scroll", "screenshot": "screen"}],
    )

    assert models.kwargs["model"] == "gemini-model"
    assert models.kwargs["contents"][0]["role"] == "user"
    assert models.kwargs["contents"][1]["parts"][0]["function_response"]["name"] == "scroll"


def test_live_gemini_wrapper_preserves_sdk_convenience_fields_with_model_dump():
    from app.adapters.cua import _GeminiModelsClient

    client = type("Client", (), {"models": ConvenienceGeminiModels()})()

    response = _GeminiModelsClient(client).generate_content(model="gemini-model", prompt="Do it")

    assert response["text"] == "done from property"
    assert response["function_calls"] == [{"name": "click", "args": {"x": 1, "y": 2}}]
    assert response["usage_metadata"]["total_token_count"] == 3


class FakeEmbeddingClient:
    def embed(self, text, model):
        return [0.1, 0.2, 0.3]


class FakeGraderClient:
    def grade(self, prompt, model):
        return '{"passed": true, "reason": "looks complete"}'


def test_embedding_adapter_uses_configured_client():
    from app.adapters.cua import EmbeddingAdapter

    adapter = EmbeddingAdapter(model("embedding"), client=FakeEmbeddingClient())

    result = adapter.generate("embed this text")

    assert result.content == "[0.1, 0.2, 0.3]"
    assert result.metadata["dimension"] == 3


def test_llm_grader_adapter_uses_configured_client():
    from app.adapters.cua import LlmGraderAdapter

    adapter = LlmGraderAdapter(model("llm_grader"), client=FakeGraderClient())

    result = adapter.generate("grade this")

    assert result.content == '{"passed": true, "reason": "looks complete"}'
