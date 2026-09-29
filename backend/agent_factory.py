'''
Author: ai-business-hql qingli.hql@alibaba-inc.com
Date: 2025-07-31 19:38:08
LastEditors: ai-business-hql ai.bussiness.hql@gmail.com
LastEditTime: 2026-01-12 11:11:53
FilePath: /comfyui_copilot/backend/agent_factory.py
Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
'''

_AGENTS_AVAILABLE = False
_AGENTS_IMPORT_ERROR = (
    "Detected incorrect or missing 'agents' package. "
    "Please uninstall legacy RL 'agents' (and tensorflow/gym if pulled transitively) and install openai-agents. "
    "Commands:\n"
    "  python -m pip uninstall -y agents gym tensorflow\n"
    "  python -m pip install -U openai-agents\n\n"
    "Alternatively, keep both by setting COMFYUI_COPILOT_PREFER_OPENAI_AGENTS=1 so this plugin prefers openai-agents."
)

try:
    from agents import Agent, OpenAIChatCompletionsModel, ModelSettings, Runner, set_tracing_disabled, set_default_openai_api
    if not hasattr(__import__('agents'), 'Agent'):
        raise ImportError("agents package missing Agent class")
    _AGENTS_AVAILABLE = True
except Exception:
    pass

from dotenv import dotenv_values
from .utils.globals import LLM_DEFAULT_BASE_URL, LMSTUDIO_DEFAULT_BASE_URL, get_comfyui_copilot_api_key, is_lmstudio_url
from openai import AsyncOpenAI
import asyncio

if _AGENTS_AVAILABLE:
    set_default_openai_api("chat_completions")
    set_tracing_disabled(False)


def create_agent(**kwargs):
    if not _AGENTS_AVAILABLE:
        raise ImportError(_AGENTS_IMPORT_ERROR)
    # 通过用户配置拿/环境变量
    config = kwargs.pop("config") if "config" in kwargs else {}
    # 避免将 None 写入 headers
    session_id = (config or {}).get("session_id")
    default_headers = {}
    if session_id:
        default_headers["X-Session-ID"] = session_id

    # Determine base URL and API key
    base_url = LLM_DEFAULT_BASE_URL
    api_key = get_comfyui_copilot_api_key() or ""

    if config:
        if config.get("openai_base_url") and config.get("openai_base_url") != "":
            base_url = config.get("openai_base_url")
        if config.get("openai_api_key") and config.get("openai_api_key") != "":
            api_key = config.get("openai_api_key")

    # Check if this is LMStudio and adjust API key handling
    is_lmstudio = is_lmstudio_url(base_url)
    if is_lmstudio and not api_key:
        # LMStudio typically doesn't require an API key, use a placeholder
        api_key = "lmstudio-local"

    client = AsyncOpenAI(
        api_key=api_key,
        base_url=base_url,
        default_headers=default_headers,
    )

    # Determine model with proper precedence:
    # 1) Explicit selection from config (model_select from frontend)
    # 2) Explicit kwarg 'model' (call-site override)
    model_from_config = (config or {}).get("model_select")
    model_from_kwargs = kwargs.pop("model", None)

    model_name = model_from_config or model_from_kwargs or "gemini-2.5-flash"
    model = OpenAIChatCompletionsModel(model_name, openai_client=client)

    # Safety: ensure no stray 'model' remains in kwargs to avoid duplicate kwarg errors
    kwargs.pop("model", None)

    if config.get("max_tokens"):
        return Agent(model=model, model_settings=ModelSettings(max_tokens=config.get("max_tokens") or 8192), **kwargs)
    return Agent(model=model, **kwargs)