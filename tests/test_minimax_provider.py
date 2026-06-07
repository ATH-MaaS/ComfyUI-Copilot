# Copyright (C) 2025 AIDC-AI
# Licensed under the MIT License.

"""Unit tests for MiniMax LLM provider integration.

ComfyUI-Copilot runs inside the ComfyUI process which provides ``server``
and ``folder_paths`` modules. We import ``backend.utils.globals`` directly
via importlib to avoid triggering the root __init__.py which requires the
full ComfyUI runtime.
"""

import importlib
import importlib.util
import os
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _load_module(module_name: str, file_path: str, replace_relative=None):
    """Load a Python module from a file path, bypassing package __init__.py.

    ``replace_relative`` is an optional dict that maps dotted import names
    (e.g. '.utils.globals') to already-loaded module references so that
    relative imports can be monkey-patched away.
    """
    abs_path = str(PROJECT_ROOT / file_path)

    if replace_relative:
        # Read the source, rewrite relative imports as absolute imports
        with open(abs_path) as f:
            source = f.read()
        for rel_import, target_mod in replace_relative.items():
            # E.g. "from .utils.globals import ..." -> "from _test_globals import ..."
            source = source.replace(f"from {rel_import} import", f"from {target_mod} import")
        code = compile(source, abs_path, "exec")
        mod = types.ModuleType(module_name)
        mod.__file__ = abs_path
        sys.modules[module_name] = mod
        exec(code, mod.__dict__)
        return mod

    spec = importlib.util.spec_from_file_location(module_name, abs_path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)
    return mod


# Pre-load dotenv so the globals module can import it
# Stub 'agents' module to satisfy agent_factory.py imports
if "agents" not in sys.modules:
    _agents_mod = types.ModuleType("agents")
    _agents_mod.Agent = MagicMock()
    _agents_mod.OpenAIChatCompletionsModel = MagicMock()
    _agents_mod.ModelSettings = MagicMock()
    _agents_mod.Runner = MagicMock()
    _agents_mod.set_tracing_disabled = MagicMock()
    _agents_mod.set_default_openai_api = MagicMock()
    sys.modules["agents"] = _agents_mod

if "agents._config" not in sys.modules:
    _agents_config = types.ModuleType("agents._config")
    _agents_config.set_default_openai_api = MagicMock()
    sys.modules["agents._config"] = _agents_config

if "agents.tracing" not in sys.modules:
    _agents_tracing = types.ModuleType("agents.tracing")
    _agents_tracing.set_tracing_disabled = MagicMock()
    sys.modules["agents.tracing"] = _agents_tracing

# Load the globals module directly
_globals_mod = _load_module("_test_globals", "backend/utils/globals.py")


class TestIsMiniMaxUrl(unittest.TestCase):
    """Tests for is_minimax_url() helper."""

    def test_standard_minimax_url(self):
        self.assertTrue(_globals_mod.is_minimax_url("https://api.minimax.io/v1"))

    def test_minimax_chat_url(self):
        self.assertTrue(_globals_mod.is_minimax_url("https://api.minimax.chat/v1"))

    def test_minimax_url_case_insensitive(self):
        self.assertTrue(_globals_mod.is_minimax_url("https://API.MINIMAX.IO/v1"))

    def test_openai_url_returns_false(self):
        self.assertFalse(_globals_mod.is_minimax_url("https://api.openai.com/v1"))

    def test_localhost_returns_false(self):
        self.assertFalse(_globals_mod.is_minimax_url("http://localhost:1234/v1"))

    def test_empty_string(self):
        self.assertFalse(_globals_mod.is_minimax_url(""))

    def test_none(self):
        self.assertFalse(_globals_mod.is_minimax_url(None))

    def test_minimax_with_path(self):
        self.assertTrue(_globals_mod.is_minimax_url("https://api.minimax.io/v1/chat/completions"))


class TestIsLMStudioUrl(unittest.TestCase):
    """Ensure existing is_lmstudio_url still works."""

    def test_lmstudio_localhost(self):
        self.assertTrue(_globals_mod.is_lmstudio_url("http://localhost:1234/v1"))

    def test_lmstudio_127(self):
        self.assertTrue(_globals_mod.is_lmstudio_url("http://127.0.0.1:1234/v1"))

    def test_not_minimax(self):
        self.assertFalse(_globals_mod.is_lmstudio_url("https://api.minimax.io/v1"))


class TestMiniMaxConstants(unittest.TestCase):
    """Test that MiniMax constants are properly defined."""

    def test_minimax_default_base_url(self):
        self.assertEqual(_globals_mod.MINIMAX_DEFAULT_BASE_URL, "https://api.minimax.io/v1")

    def test_minimax_models_defined(self):
        self.assertIsInstance(_globals_mod.MINIMAX_MODELS, list)
        self.assertTrue(len(_globals_mod.MINIMAX_MODELS) >= 2)

    def test_minimax_models_have_required_keys(self):
        for model in _globals_mod.MINIMAX_MODELS:
            self.assertIn("label", model)
            self.assertIn("name", model)
            self.assertIn("image_enable", model)

    def test_minimax_m3_in_models(self):
        names = [m["name"] for m in _globals_mod.MINIMAX_MODELS]
        self.assertIn("MiniMax-M3", names)

    def test_minimax_m3_is_first(self):
        self.assertEqual(_globals_mod.MINIMAX_MODELS[0]["name"], "MiniMax-M3")

    def test_minimax_m27_in_models(self):
        names = [m["name"] for m in _globals_mod.MINIMAX_MODELS]
        self.assertIn("MiniMax-M2.7", names)

    def test_minimax_m27_highspeed_in_models(self):
        names = [m["name"] for m in _globals_mod.MINIMAX_MODELS]
        self.assertIn("MiniMax-M2.7-highspeed", names)

    def test_minimax_older_models_removed(self):
        names = [m["name"] for m in _globals_mod.MINIMAX_MODELS]
        for older in ("MiniMax-M2.5", "MiniMax-M2.1", "MiniMax-M2", "MiniMax-M1"):
            self.assertNotIn(older, names)


class TestApplyLlmEnvDefaults(unittest.TestCase):
    """Tests for MiniMax-related logic in apply_llm_env_defaults."""

    def test_no_env_returns_empty_config(self):
        with patch.object(_globals_mod, "OPENAI_API_KEY", None), \
             patch.object(_globals_mod, "OPENAI_BASE_URL", None), \
             patch.object(_globals_mod, "MINIMAX_API_KEY", None), \
             patch.object(_globals_mod, "MINIMAX_BASE_URL", None), \
             patch.object(_globals_mod, "WORKFLOW_LLM_API_KEY", None), \
             patch.object(_globals_mod, "WORKFLOW_LLM_BASE_URL", None), \
             patch.object(_globals_mod, "WORKFLOW_LLM_MODEL", None):
            cfg = _globals_mod.apply_llm_env_defaults({})
            self.assertIsNone(cfg.get("openai_api_key"))

    def test_minimax_env_auto_detect(self):
        with patch.object(_globals_mod, "OPENAI_API_KEY", None), \
             patch.object(_globals_mod, "OPENAI_BASE_URL", None), \
             patch.object(_globals_mod, "MINIMAX_API_KEY", "test-minimax-key"), \
             patch.object(_globals_mod, "MINIMAX_BASE_URL", None), \
             patch.object(_globals_mod, "WORKFLOW_LLM_API_KEY", None), \
             patch.object(_globals_mod, "WORKFLOW_LLM_BASE_URL", None), \
             patch.object(_globals_mod, "WORKFLOW_LLM_MODEL", None):
            cfg = _globals_mod.apply_llm_env_defaults({})
            self.assertEqual(cfg["openai_api_key"], "test-minimax-key")
            self.assertEqual(cfg["openai_base_url"], "https://api.minimax.io/v1")

    def test_explicit_config_overrides_minimax_env(self):
        with patch.object(_globals_mod, "OPENAI_API_KEY", None), \
             patch.object(_globals_mod, "OPENAI_BASE_URL", None), \
             patch.object(_globals_mod, "MINIMAX_API_KEY", "minimax-key"), \
             patch.object(_globals_mod, "MINIMAX_BASE_URL", None), \
             patch.object(_globals_mod, "WORKFLOW_LLM_API_KEY", None), \
             patch.object(_globals_mod, "WORKFLOW_LLM_BASE_URL", None), \
             patch.object(_globals_mod, "WORKFLOW_LLM_MODEL", None):
            cfg = _globals_mod.apply_llm_env_defaults({"openai_api_key": "my-openai-key", "openai_base_url": "https://api.openai.com/v1"})
            self.assertEqual(cfg["openai_api_key"], "my-openai-key")
            self.assertEqual(cfg["openai_base_url"], "https://api.openai.com/v1")

    def test_minimax_url_with_env_key(self):
        with patch.object(_globals_mod, "OPENAI_API_KEY", None), \
             patch.object(_globals_mod, "OPENAI_BASE_URL", None), \
             patch.object(_globals_mod, "MINIMAX_API_KEY", "mm-key"), \
             patch.object(_globals_mod, "MINIMAX_BASE_URL", None), \
             patch.object(_globals_mod, "WORKFLOW_LLM_API_KEY", None), \
             patch.object(_globals_mod, "WORKFLOW_LLM_BASE_URL", None), \
             patch.object(_globals_mod, "WORKFLOW_LLM_MODEL", None):
            cfg = _globals_mod.apply_llm_env_defaults({"openai_base_url": "https://api.minimax.io/v1"})
            self.assertEqual(cfg["openai_api_key"], "mm-key")

    def test_openai_key_takes_precedence_over_minimax(self):
        with patch.object(_globals_mod, "OPENAI_API_KEY", "openai-key"), \
             patch.object(_globals_mod, "OPENAI_BASE_URL", None), \
             patch.object(_globals_mod, "MINIMAX_API_KEY", "mm-key"), \
             patch.object(_globals_mod, "MINIMAX_BASE_URL", None), \
             patch.object(_globals_mod, "WORKFLOW_LLM_API_KEY", None), \
             patch.object(_globals_mod, "WORKFLOW_LLM_BASE_URL", None), \
             patch.object(_globals_mod, "WORKFLOW_LLM_MODEL", None):
            cfg = _globals_mod.apply_llm_env_defaults({})
            self.assertEqual(cfg["openai_api_key"], "openai-key")

    def test_does_not_mutate_input(self):
        with patch.object(_globals_mod, "OPENAI_API_KEY", None), \
             patch.object(_globals_mod, "OPENAI_BASE_URL", None), \
             patch.object(_globals_mod, "MINIMAX_API_KEY", "mm-key"), \
             patch.object(_globals_mod, "MINIMAX_BASE_URL", None), \
             patch.object(_globals_mod, "WORKFLOW_LLM_API_KEY", None), \
             patch.object(_globals_mod, "WORKFLOW_LLM_BASE_URL", None), \
             patch.object(_globals_mod, "WORKFLOW_LLM_MODEL", None):
            original = {}
            _globals_mod.apply_llm_env_defaults(original)
            self.assertEqual(original, {})

    def test_custom_minimax_base_url(self):
        with patch.object(_globals_mod, "OPENAI_API_KEY", None), \
             patch.object(_globals_mod, "OPENAI_BASE_URL", None), \
             patch.object(_globals_mod, "MINIMAX_API_KEY", "mm-key"), \
             patch.object(_globals_mod, "MINIMAX_BASE_URL", "https://custom.minimax.io/v1"), \
             patch.object(_globals_mod, "WORKFLOW_LLM_API_KEY", None), \
             patch.object(_globals_mod, "WORKFLOW_LLM_BASE_URL", None), \
             patch.object(_globals_mod, "WORKFLOW_LLM_MODEL", None):
            cfg = _globals_mod.apply_llm_env_defaults({})
            self.assertEqual(cfg["openai_base_url"], "https://custom.minimax.io/v1")


class TestCreateAgentMiniMax(unittest.TestCase):
    """Tests for MiniMax-aware create_agent logic."""

    @classmethod
    def setUpClass(cls):
        # Load agent_factory directly, replacing relative imports with our loaded modules
        cls._agent_mod = _load_module(
            "_test_agent_factory",
            "backend/agent_factory.py",
            replace_relative={
                ".utils.globals": "_test_globals",
            },
        )

    def test_minimax_default_model(self):
        with patch.object(self._agent_mod, "Agent") as mock_agent, \
             patch.object(self._agent_mod, "OpenAIChatCompletionsModel") as mock_model, \
             patch.object(self._agent_mod, "AsyncOpenAI") as mock_client, \
             patch.object(self._agent_mod, "get_comfyui_copilot_api_key", return_value=None):
            mock_agent.return_value = MagicMock()
            mock_model.return_value = MagicMock()
            mock_client.return_value = MagicMock()

            config = {"openai_base_url": "https://api.minimax.io/v1", "openai_api_key": "test-key"}
            self._agent_mod.create_agent(config=config, name="test", instructions="test")
            model_name = mock_model.call_args[0][0]
            self.assertEqual(model_name, "MiniMax-M3")

    def test_openai_default_model(self):
        with patch.object(self._agent_mod, "Agent") as mock_agent, \
             patch.object(self._agent_mod, "OpenAIChatCompletionsModel") as mock_model, \
             patch.object(self._agent_mod, "AsyncOpenAI") as mock_client, \
             patch.object(self._agent_mod, "get_comfyui_copilot_api_key", return_value=None):
            mock_agent.return_value = MagicMock()
            mock_model.return_value = MagicMock()
            mock_client.return_value = MagicMock()

            config = {"openai_base_url": "https://api.openai.com/v1", "openai_api_key": "test-key"}
            self._agent_mod.create_agent(config=config, name="test", instructions="test")
            model_name = mock_model.call_args[0][0]
            self.assertEqual(model_name, "gemini-2.5-flash")

    def test_model_select_overrides_default(self):
        with patch.object(self._agent_mod, "Agent") as mock_agent, \
             patch.object(self._agent_mod, "OpenAIChatCompletionsModel") as mock_model, \
             patch.object(self._agent_mod, "AsyncOpenAI") as mock_client, \
             patch.object(self._agent_mod, "get_comfyui_copilot_api_key", return_value=None):
            mock_agent.return_value = MagicMock()
            mock_model.return_value = MagicMock()
            mock_client.return_value = MagicMock()

            config = {"openai_base_url": "https://api.minimax.io/v1", "openai_api_key": "test-key", "model_select": "MiniMax-M2.7-highspeed"}
            self._agent_mod.create_agent(config=config, name="test", instructions="test")
            model_name = mock_model.call_args[0][0]
            self.assertEqual(model_name, "MiniMax-M2.7-highspeed")

    def test_minimax_client_base_url(self):
        with patch.object(self._agent_mod, "Agent") as mock_agent, \
             patch.object(self._agent_mod, "OpenAIChatCompletionsModel") as mock_model, \
             patch.object(self._agent_mod, "AsyncOpenAI") as mock_client_cls, \
             patch.object(self._agent_mod, "get_comfyui_copilot_api_key", return_value=None):
            mock_agent.return_value = MagicMock()
            mock_model.return_value = MagicMock()
            mock_client_cls.return_value = MagicMock()

            config = {"openai_base_url": "https://api.minimax.io/v1", "openai_api_key": "mm-key"}
            self._agent_mod.create_agent(config=config, name="test", instructions="test")
            call_kwargs = mock_client_cls.call_args[1]
            self.assertEqual(call_kwargs["base_url"], "https://api.minimax.io/v1")
            self.assertEqual(call_kwargs["api_key"], "mm-key")


if __name__ == "__main__":
    unittest.main()
