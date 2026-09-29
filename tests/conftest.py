# Copyright (C) 2025 AIDC-AI
# Licensed under the MIT License.

"""
Conftest for running tests outside the ComfyUI process.

ComfyUI-Copilot is a ComfyUI plugin that depends on ComfyUI-specific modules
(``server``, ``folder_paths``) at import time. We stub these before any project
code is imported so that tests can run standalone.
"""

import sys
import types
from unittest.mock import MagicMock

# --- Stub ComfyUI-only modules ------------------------------------------------
_server_mod = types.ModuleType("server")
_prompt_server = MagicMock()
_prompt_server.instance.routes = MagicMock()
_prompt_server.instance.app = MagicMock()
_server_mod.PromptServer = _prompt_server
sys.modules["server"] = _server_mod

_fp_mod = types.ModuleType("folder_paths")
_fp_mod.__file__ = "/tmp/fake_folder_paths.py"
_fp_mod.folder_names_and_paths = {}
_fp_mod.get_folder_paths = MagicMock(return_value=[])
_fp_mod.models_dir = "/tmp/models"
sys.modules["folder_paths"] = _fp_mod

_ms_mod = types.ModuleType("modelscope")
_ms_mod.snapshot_download = MagicMock()
sys.modules["modelscope"] = _ms_mod
