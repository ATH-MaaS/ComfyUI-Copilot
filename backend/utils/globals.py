'''
Author: ai-business-hql qingli.hql@alibaba-inc.com
Date: 2025-08-08 17:14:52
LastEditors: ai-business-hql ai.bussiness.hql@gmail.com
LastEditTime: 2025-12-15 14:49:18
FilePath: /comfyui_copilot/backend/utils/globals.py
Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
'''

"""
Global utilities for managing application-wide state and configuration.
"""

import os
import threading
from typing import Optional, Dict, Any
from pathlib import Path
from dotenv import load_dotenv

# Load .env file if it exists
env_path = Path(__file__).parent.parent.parent / '.env'
if env_path.exists():
    load_dotenv(env_path)

class GlobalState:
    """Thread-safe global state manager for application-wide configuration."""
    
    def __init__(self):
        self._lock = threading.RLock()
        self._state: Dict[str, Any] = {
            'LANGUAGE': 'en',  # Default language
        }
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get a global state value."""
        with self._lock:
            return self._state.get(key, default)
    
    def set(self, key: str, value: Any) -> None:
        """Set a global state value."""
        with self._lock:
            self._state[key] = value
    
    def get_language(self) -> str:
        """Get the current language setting."""
        return self.get('LANGUAGE', 'en')
    
    def set_language(self, language: str) -> None:
        """Set the current language setting."""
        self.set('LANGUAGE', language)
    
    def update(self, **kwargs) -> None:
        """Update multiple state values at once."""
        with self._lock:
            self._state.update(kwargs)
    
    def get_all(self) -> Dict[str, Any]:
        """Get a copy of all global state."""
        with self._lock:
            return self._state.copy()

# Global instance
_global_state = GlobalState()

# Convenience functions for external access
def get_global(key: str, default: Any = None) -> Any:
    """Get a global state value."""
    return _global_state.get(key, default)

def set_global(key: str, value: Any) -> None:
    """Set a global state value."""
    _global_state.set(key, value)

def get_language() -> str:
    """Get the current language setting."""
    language = _global_state.get_language()
    if not language:
        language = 'en'
    return language

def set_language(language: str) -> None:
    """Set the current language setting."""
    _global_state.set_language(language)

def update_globals(**kwargs) -> None:
    """Update multiple global values at once."""
    _global_state.update(**kwargs)

def get_all_globals() -> Dict[str, Any]:
    """Get a copy of all global state."""
    return _global_state.get_all()

def get_comfyui_copilot_api_key() -> Optional[str]:
    """Get the ComfyUI Copilot API key."""
    return _global_state.get('comfyui_copilot_api_key')

def set_comfyui_copilot_api_key(api_key: str) -> None:
    """Set the ComfyUI Copilot API key."""
    _global_state.set('comfyui_copilot_api_key', api_key)


BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "https://comfyui-copilot-server.onrender.com")
LMSTUDIO_DEFAULT_BASE_URL = "http://localhost:1234/v1"
MINIMAX_DEFAULT_BASE_URL = "https://api.minimax.io/v1"
WORKFLOW_MODEL_NAME = os.getenv("WORKFLOW_MODEL_NAME", "us.anthropic.claude-sonnet-4-20250514-v1:0")
# WORKFLOW_MODEL_NAME = "gpt-5-2025-08-07-GlobalStandard"
LLM_DEFAULT_BASE_URL = "https://comfyui-copilot-server.onrender.com/v1"

# LLM-related env defaults (used as fallback when request config does not provide values)
OPENAI_API_KEY = os.getenv("CC_OPENAI_API_KEY") or None
OPENAI_BASE_URL = os.getenv("CC_OPENAI_BASE_URL") or None
MINIMAX_API_KEY = os.getenv("CC_MINIMAX_API_KEY") or os.getenv("MINIMAX_API_KEY") or None
MINIMAX_BASE_URL = os.getenv("CC_MINIMAX_BASE_URL") or None
WORKFLOW_LLM_API_KEY = os.getenv("WORKFLOW_LLM_API_KEY") or None
WORKFLOW_LLM_BASE_URL = os.getenv("WORKFLOW_LLM_BASE_URL") or None
# If WORKFLOW_LLM_MODEL is not set, fall back to WORKFLOW_MODEL_NAME
WORKFLOW_LLM_MODEL = os.getenv("WORKFLOW_LLM_MODEL") or WORKFLOW_MODEL_NAME
DISABLE_WORKFLOW_GEN = os.getenv("DISABLE_WORKFLOW_GEN") or False

TENANT_ID = os.getenv("TENANT_ID") or None

# MiniMax models (static list since MiniMax does not expose a /v1/models endpoint)
MINIMAX_MODELS = [
    {"label": "MiniMax-M3", "name": "MiniMax-M3", "image_enable": True},
    {"label": "MiniMax-M2.7", "name": "MiniMax-M2.7", "image_enable": True},
    {"label": "MiniMax-M2.7-highspeed", "name": "MiniMax-M2.7-highspeed", "image_enable": True},
]

def apply_llm_env_defaults(config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Apply LLM-related defaults with precedence:
    request config > .env > hard-coded defaults.

    This function does NOT mutate the incoming config.
    """
    cfg: Dict[str, Any] = dict(config or {})

    # Chat LLM (OpenAI-compatible) settings
    if not cfg.get("openai_api_key") and OPENAI_API_KEY:
        cfg["openai_api_key"] = OPENAI_API_KEY
    if not cfg.get("openai_base_url") and OPENAI_BASE_URL:
        cfg["openai_base_url"] = OPENAI_BASE_URL

    # MiniMax: if base_url points to MiniMax but no API key is set, use env var
    base_url = cfg.get("openai_base_url", "")
    if is_minimax_url(base_url) and not cfg.get("openai_api_key") and MINIMAX_API_KEY:
        cfg["openai_api_key"] = MINIMAX_API_KEY

    # Auto-detect MiniMax via env vars when no explicit config is provided
    if not cfg.get("openai_api_key") and not cfg.get("openai_base_url") and MINIMAX_API_KEY:
        cfg["openai_api_key"] = MINIMAX_API_KEY
        cfg["openai_base_url"] = MINIMAX_BASE_URL or MINIMAX_DEFAULT_BASE_URL

    # Workflow LLM settings (tools/agents that might use a different LLM)
    if not cfg.get("workflow_llm_api_key") and WORKFLOW_LLM_API_KEY:
        cfg["workflow_llm_api_key"] = WORKFLOW_LLM_API_KEY
    if not cfg.get("workflow_llm_base_url") and WORKFLOW_LLM_BASE_URL:
        cfg["workflow_llm_base_url"] = WORKFLOW_LLM_BASE_URL
    if not cfg.get("workflow_llm_model") and WORKFLOW_LLM_MODEL:
        cfg["workflow_llm_model"] = WORKFLOW_LLM_MODEL

    return cfg


def is_lmstudio_url(base_url: str) -> bool:
    """Check if the base URL is likely LMStudio based on common patterns."""
    if not base_url:
        return False

    base_url_lower = base_url.lower()
    # Common LMStudio patterns (supporting various ports and configurations)
    lmstudio_patterns = [
        "localhost:1234",        # Standard LMStudio port
        "127.0.0.1:1234",
        "0.0.0.0:1234",
        ":1234/v1",
        "localhost:1235",        # Alternative port some users might use
        "127.0.0.1:1235",
        "0.0.0.0:1235",
        ":1235/v1",
        "localhost/v1",          # Generic localhost patterns
        "127.0.0.1/v1"
    ]

    return any(pattern in base_url_lower for pattern in lmstudio_patterns)


def is_minimax_url(base_url: str) -> bool:
    """Check if the base URL points to MiniMax API."""
    if not base_url:
        return False

    base_url_lower = base_url.lower()
    minimax_patterns = [
        "api.minimax.io",
        "api.minimax.chat",
    ]

    return any(pattern in base_url_lower for pattern in minimax_patterns)
