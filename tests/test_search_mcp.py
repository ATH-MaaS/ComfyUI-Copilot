"""Protocol fixtures run the real Agents SDK; model responses are scripted, not inferred."""
import asyncio
import importlib
import json
import logging
import sys
import types
from pathlib import Path

import httpx
try:
    import httpx2
except ImportError:
    httpx2 = None
import pytest
from agents import Agent, function_tool
try:
    from mcp import MCPError
except ImportError:
    from mcp import McpError as MCPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.service import search_mcp
from backend.utils import globals as settings
from backend.utils.request_context import clear_request_context, set_request_context


def tool_failed(result):
    return result.is_error if hasattr(result, "is_error") else result.isError


@pytest.fixture(autouse=True)
def isolated_settings(monkeypatch):
    for key in ("BACKEND_BASE_URL", "CC_WEB_SEARCH_PROVIDER", "PARALLEL_API_KEY", "OPENAI_API_KEY",
                "CC_OPENAI_API_KEY", "CC_OPENAI_BASE_URL", "WORKFLOW_LLM_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    settings.set_comfyui_copilot_api_key(None)
    clear_request_context()
    yield
    clear_request_context()
    settings.set_comfyui_copilot_api_key(None)


class ProtocolFixture:
    def __init__(self):
        self.requests = []
        self.model_inputs = []
        self.failure = None
        self.call_started = asyncio.Event()
        self.calls = 0

    async def handle(self, request):
        response_type = httpx2.Response if httpx2 and isinstance(request, httpx2.Request) else httpx.Response
        body = json.loads(request.content) if request.content else {}
        self.requests.append((request, body))
        if request.url.host == "model.test":
            return self.model_response(body, response_type)
        assert str(request.url) == search_mcp.PARALLEL_MCP_URL, request.url
        assert request.headers["user-agent"] == search_mcp.PROJECT_USER_AGENT
        assert "authorization" not in request.headers
        assert "x-session-id" not in request.headers
        if request.method != "POST":
            return response_type(405)
        if "id" not in body:
            return response_type(202)
        method = body["method"]
        if self.failure == "discovery":
            return response_type(503, text="fixture service unavailable")
        if method == "server/discover":
            # Match the live endpoint: MCP v2 clients negotiate its v1 protocol.
            return response_type(400, json={"jsonrpc": "2.0", "id": body["id"],
                "error": {"code": -32601, "message": "Use MCP initialize"}})
        if method == "initialize":
            result = {"protocolVersion": body["params"]["protocolVersion"], "capabilities": {"tools": {}},
                      "serverInfo": {"name": "parallel-fixture", "version": "1"}}
        elif method == "tools/list":
            result = {"tools": [
                {"name": "web_search", "description": "Search current web sources", "inputSchema": {
                    "type": "object", "properties": {"objective": {"type": "string"},
                    "search_queries": {"type": "array", "items": {"type": "string"}}},
                    "required": ["objective", "search_queries"]}},
                {"name": "web_fetch", "description": "Read web pages", "inputSchema": {
                    "type": "object", "properties": {"urls": {"type": "array", "items": {"type": "string"}}},
                    "required": ["urls"]}},
            ]}
        elif method == "tools/call":
            self.calls += 1
            self.call_started.set()
            if self.failure == "wait":
                await asyncio.Event().wait()
            if self.failure == "rpc":
                return response_type(200, json={"jsonrpc": "2.0", "id": body["id"],
                    "error": {"code": -32000, "message": "fixture service unavailable"}})
            if self.failure == "tool":
                result = {"content": [{"type": "text", "text": "fixture search failed"}], "isError": True}
            elif body["params"]["name"] == "web_search":
                assert body["params"]["arguments"]["search_queries"] == ["ComfyUI custom nodes documentation"]
                result = {"content": [{"type": "text", "text": json.dumps({"results": [{
                    "url": "https://docs.comfy.org/custom-nodes/overview", "title": "Custom nodes",
                    "excerpts": ["Custom nodes extend ComfyUI."]}]})}], "isError": False}
            else:
                urls = body["params"]["arguments"]["urls"]
                if not all(u.startswith(("https://", "http://")) for u in urls):
                    result = {"content": [{"type": "text", "text": "URLs must use HTTP or HTTPS"}], "isError": True}
                else:
                    assert urls == ["https://docs.comfy.org/custom-nodes/overview"]
                    result = {"content": [{"type": "text", "text": "Custom nodes declare INPUT_TYPES and RETURN_TYPES."}], "isError": False}
        else:
            raise AssertionError(body)
        return response_type(200, json={"jsonrpc": "2.0", "id": body["id"], "result": result})

    def model_response(self, body, response_type=httpx.Response):
        self.model_inputs.append(body)
        messages = body["messages"]
        tools = [t["function"]["name"] for t in body.get("tools", [])]
        assert "web_search" in tools and "web_fetch" in tools
        assert "get_current_workflow" in tools
        assert "Hosted node search, workflow recall and generation tools are unavailable" in messages[0]["content"]
        assert "bing_search" not in messages[0]["content"]
        step = len(self.model_inputs)
        if step == 1:
            name, args = "web_search", {"objective": "Find ComfyUI custom node documentation",
                                       "search_queries": ["ComfyUI custom nodes documentation"]}
        elif step == 2:
            assert "https://docs.comfy.org/custom-nodes/overview" in json.dumps(messages)
            name, args = "web_fetch", {"urls": ["https://docs.comfy.org/custom-nodes/overview"]}
        else:
            assert "INPUT_TYPES and RETURN_TYPES" in json.dumps(messages)
            name = None
        delta = {"role": "assistant"}
        if name:
            delta["tool_calls"] = [{"index": 0, "id": f"call_{step}", "type": "function",
                                    "function": {"name": name, "arguments": json.dumps(args)}}]
        else:
            delta["content"] = "Custom nodes declare INPUT_TYPES and RETURN_TYPES. Source: https://docs.comfy.org/custom-nodes/overview"
        chunks = []
        for d, finish in [(delta, None), ({}, "tool_calls" if name else "stop")]:
            chunks.append("data: " + json.dumps({"id": f"fixture_{step}", "object": "chat.completion.chunk",
                "created": 0, "model": "fixture", "choices": [{"index": 0, "delta": d, "finish_reason": finish}]}))
        return response_type(200, headers={"content-type": "text/event-stream"},
                              content="\n\n".join(chunks) + "\n\ndata: [DONE]\n\n")


@pytest.fixture
def protocol(monkeypatch):
    fixture = ProtocolFixture()
    transport = httpx.MockTransport(fixture.handle)
    monkeypatch.setattr(httpx.AsyncClient, "_transport_for_url", lambda self, url: transport)
    if httpx2:
        transport2 = httpx2.MockTransport(fixture.handle)
        monkeypatch.setattr(httpx2.AsyncClient, "_transport_for_url", lambda self, url: transport2)
    return fixture


@pytest.fixture
def runtime(monkeypatch):
    """Stub ComfyUI storage/canvas edges, retaining factory, resolver, MCP and Runner."""
    @function_tool
    def get_current_workflow() -> str:
        """Read the local canvas."""
        return "{}"

    stubs = {
        "backend.core": {},
        "backend.service.workflow_rewrite_tools": {"get_current_workflow": get_current_workflow},
        "backend.service.workflow_rewrite_agent": {"create_workflow_rewrite_agent": lambda: Agent(
            name="Workflow Rewrite Agent", instructions="Rewrite local workflows.", model="fixture")},
        "backend.service.message_memory": {"message_memory_optimize": lambda session, messages: messages},
        "backend.utils.logger": {"log": logging.getLogger("search-test")},
    }
    for name, attrs in stubs.items():
        module = types.ModuleType(name)
        module.__dict__.update(attrs)
        monkeypatch.setitem(sys.modules, name, module)
    sys.modules.pop("backend.service.mcp_client", None)
    module = importlib.import_module("backend.service.mcp_client")
    # The existing caller enables tracing; keep fixtures completely offline.
    import agents
    disable = agents.set_tracing_disabled
    disable(True)
    monkeypatch.setattr(agents, "set_tracing_disabled", lambda value: disable(True))
    return module


@pytest.mark.asyncio
async def test_chat_dispatches_search_and_fetch_and_consumes_results(protocol, runtime, monkeypatch):
    monkeypatch.setenv("PARALLEL_API_KEY", "unused-ambient-search-key")
    settings.set_comfyui_copilot_api_key("previous-request-key")
    config = {"openai_api_key": "fixture-model-key", "openai_base_url": "https://model.test/v1",
              "model_select": "fixture", **search_mcp.search_config_from_headers({"Authorization": "Bearer null"})}
    set_request_context("fixture-session", config=config)
    outputs = [item async for item in runtime.comfyui_agent_invoke([
        {"role": "user", "content": "Explain current ComfyUI custom nodes with sources."}])]
    assert "INPUT_TYPES and RETURN_TYPES" in outputs[-1][0]
    assert "https://docs.comfy.org/custom-nodes/overview" in outputs[-1][0]
    assert outputs[-1][1]["finished"] is True
    assert len(protocol.model_inputs) == 3
    assert protocol.calls == 2
    assert all(r.url.host in ("search.parallel.ai", "model.test") for r, _ in protocol.requests)
    rpc_methods = [b.get("method") for r, b in protocol.requests if r.url.host == "search.parallel.ai"]
    assert "initialize" in rpc_methods and "tools/list" in rpc_methods and rpc_methods.count("tools/call") == 2


@pytest.mark.parametrize("value", [None, "", "null", "undefined", "None", " null "])
def test_missing_browser_credentials(value):
    assert search_mcp.normalize_copilot_key(value) is None


def test_request_credentials_do_not_inherit_global():
    settings.set_comfyui_copilot_api_key("prior-key")
    assert search_mcp.search_config_from_headers({})["copilot_api_key"] is None
    assert search_mcp.search_config_from_headers({"Authorization": "Bearer saved-key"})["copilot_api_key"] == "saved-key"


def test_provider_precedence_and_invalid_choice(monkeypatch):
    assert search_mcp.resolve_search({}, None) == "parallel"
    assert search_mcp.resolve_search({}, "saved-key") == "bing"
    monkeypatch.setenv("BACKEND_BASE_URL", "https://custom-backend.test")
    assert search_mcp.resolve_search({}, None) == "bing"
    monkeypatch.setenv("CC_WEB_SEARCH_PROVIDER", "none")
    assert search_mcp.resolve_search({}, "saved-key") == "none"
    assert search_mcp.resolve_search({"web_search_provider": "parallel"}, "saved-key") == "parallel"
    with pytest.raises(ValueError, match="provider must be"):
        search_mcp.resolve_search({"web_search_provider": "unsupported"}, None)


def test_model_choice_and_request_credential_isolation():
    from backend.agent_factory import create_agent
    settings.set_comfyui_copilot_api_key("prior-request-key")
    agent = create_agent(name="local", config={"copilot_api_key": None,
        "openai_base_url": "http://localhost:1234/v1", "model_select": "saved-local-model"})
    assert agent.model.model == "saved-local-model"
    assert agent.model._client.api_key == "lmstudio-local"
    assert str(agent.model._client.base_url) == "http://localhost:1234/v1/"


@pytest.mark.asyncio
async def test_disabled_search_makes_no_connection(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Disabled search must not construct a remote server")
    monkeypatch.setattr(search_mcp, "MCPServerSse", forbidden)
    monkeypatch.setattr(search_mcp, "MCPServerStreamableHttp", forbidden)
    async with search_mcp.agent_mcp_servers({"web_search_provider": "none", "copilot_api_key": None},
                                           "session", "old-global-key", settings.BACKEND_BASE_URL) as result:
        assert result == ([], False, "none")
        assert "disabled" in search_mcp.search_instructions(result[2])


@pytest.mark.asyncio
@pytest.mark.parametrize("key,custom,provider,expected", [
    ("saved-key", False, None, ["core", "bing"]),
    (None, True, None, ["core", "bing"]),
    ("saved-key", False, "none", ["core"]),
    (None, False, "bing", ["bing"]),
])
async def test_preserves_hosted_services_and_explicit_choices(monkeypatch, key, custom, provider, expected):
    observed = []
    if custom:
        monkeypatch.setenv("BACKEND_BASE_URL", "https://custom-backend.test")
    class Server:
        def __init__(self, **kwargs):
            self.params = kwargs["params"]
        async def __aenter__(self):
            observed.append(self.params)
            return self
        async def __aexit__(self, *args):
            pass
    monkeypatch.setattr(search_mcp, "MCPServerSse", Server)
    async with search_mcp.agent_mcp_servers({"copilot_api_key": key, "web_search_provider": provider},
                                           "session", "old-key", "https://custom-backend.test") as (_, core, selected):
        assert core == bool(key or custom)
    assert ["bing" if x["url"] == search_mcp.BING_MCP_URL else "core" for x in observed] == expected
    assert all(x["headers"]["X-Session-Id"] == "session" for x in observed)
    assert all(x["headers"].get("Authorization") == (f"Bearer {key}" if key else None) for x in observed)


@pytest.mark.asyncio
async def test_explicit_parallel_keeps_hosted_credentials_private(protocol, monkeypatch):
    hosted = []
    class HostedServer:
        def __init__(self, **kwargs):
            hosted.append(kwargs["params"])
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
    monkeypatch.setattr(search_mcp, "MCPServerSse", HostedServer)
    async with search_mcp.agent_mcp_servers({"copilot_api_key": "saved-key", "web_search_provider": "parallel"},
                                           "session", None, settings.BACKEND_BASE_URL) as (servers, core, provider):
        assert core and provider == "parallel"
        assert len(servers) == 2
        result = await servers[1].call_tool("web_fetch", {"urls": ["https://docs.comfy.org/custom-nodes/overview"]})
        assert not tool_failed(result) and "INPUT_TYPES" in result.content[0].text
    assert hosted[0]["headers"]["Authorization"] == "Bearer saved-key"
    assert protocol.calls == 1  # The protocol fixture also rejects credentials on every Parallel request.


@pytest.mark.asyncio
async def test_errors_urls_and_no_fallback(protocol):
    async with search_mcp.agent_mcp_servers({"copilot_api_key": None, "web_search_provider": "parallel"},
                                           "session", None, settings.BACKEND_BASE_URL) as (servers, _, _):
        server = servers[0]
        invalid = await server.call_tool("web_fetch", {"urls": ["file:///etc/passwd"]})
        assert tool_failed(invalid) and "HTTP or HTTPS" in invalid.content[0].text
        protocol.failure = "tool"
        error = await server.call_tool("web_search", {"objective": "x", "search_queries": ["x"]})
        assert tool_failed(error) and "fixture search failed" in error.content[0].text
        protocol.failure = "rpc"
        with pytest.raises(MCPError, match="fixture service unavailable"):
            await server.call_tool("web_search", {"objective": "x", "search_queries": ["x"]})
    assert all(str(r.url) == search_mcp.PARALLEL_MCP_URL for r, _ in protocol.requests)
    assert protocol.calls == 3


@pytest.mark.asyncio
async def test_chat_reports_discovery_error_without_fallback(protocol, runtime):
    protocol.failure = "discovery"
    set_request_context("fixture-session", config={"copilot_api_key": None, "web_search_provider": "parallel"})
    outputs = [item async for item in runtime.comfyui_agent_invoke([{"role": "user", "content": "Search docs"}])]
    assert "error occurred" in outputs[-1][0]
    assert outputs[-1][1]["finished"] is True
    assert not protocol.model_inputs
    assert all(str(r.url) == search_mcp.PARALLEL_MCP_URL for r, _ in protocol.requests)


@pytest.mark.asyncio
async def test_timeout_and_cancellation(protocol):
    async with search_mcp.agent_mcp_servers({"copilot_api_key": None}, "session", None,
                                           settings.BACKEND_BASE_URL) as (servers, _, _):
        protocol.failure = "wait"
        server = servers[0]
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(server.call_tool("web_fetch", {"urls": ["https://docs.comfy.org"]}), timeout=0.05)
        protocol.call_started.clear()
        task = asyncio.create_task(server.call_tool("web_fetch", {"urls": ["https://docs.comfy.org"]}))
        await asyncio.wait_for(protocol.call_started.wait(), timeout=1)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    assert protocol.calls == 2


@pytest.mark.asyncio
async def test_sdk_call_deadline(protocol, monkeypatch):
    real_server = search_mcp.MCPServerStreamableHttp
    def short_deadline(**kwargs):
        assert kwargs["client_session_timeout_seconds"] == 30.0
        assert kwargs["params"]["timeout"] == 30.0
        kwargs["client_session_timeout_seconds"] = 0.5
        return real_server(**kwargs)
    monkeypatch.setattr(search_mcp, "MCPServerStreamableHttp", short_deadline)
    async with search_mcp.agent_mcp_servers({"copilot_api_key": None}, "session", None,
                                           settings.BACKEND_BASE_URL) as (servers, _, _):
        protocol.failure = "wait"
        with pytest.raises(MCPError, match="[Tt]imed out"):
            await servers[0].call_tool("web_fetch", {"urls": ["https://docs.comfy.org"]})
    assert protocol.calls == 1


@pytest.mark.asyncio
async def test_chat_cancellation_stops_runner(protocol, runtime, monkeypatch):
    from agents import Runner
    runs = []
    real_run = Runner.run_streamed
    def capture(*args, **kwargs):
        result = real_run(*args, **kwargs)
        runs.append(result)
        return result
    monkeypatch.setattr(Runner, "run_streamed", capture)
    protocol.failure = "wait"
    set_request_context("fixture-session", config={"copilot_api_key": None,
        "openai_api_key": "fixture-model-key", "openai_base_url": "https://model.test/v1"})
    async def consume():
        return [item async for item in runtime.comfyui_agent_invoke([{"role": "user", "content": "Search docs"}])]
    task = asyncio.create_task(consume())
    await asyncio.wait_for(protocol.call_started.wait(), timeout=2)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert runs[0].is_complete
    assert protocol.calls == 1
