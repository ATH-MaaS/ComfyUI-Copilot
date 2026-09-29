'''
Author: ai-business-hql qingli.hql@alibaba-inc.com
Date: 2025-07-31 19:38:08
LastEditors: ai-business-hql ai.bussiness.hql@gmail.com
LastEditTime: 2026-01-12 11:11:53
FilePath: /comfyui_copilot/backend/agent_factory.py
Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
'''

try:
    from agents import Agent, OpenAIChatCompletionsModel, ModelSettings, Runner, set_tracing_disabled, set_default_openai_api
    if not hasattr(__import__('agents'), 'Agent'):
        raise ImportError
except Exception:
    # Give actionable guidance without crashing obscurely
    raise ImportError(
        "Detected incorrect or missing 'agents' package. "
        "Please uninstall legacy RL 'agents' (and tensorflow/gym if pulled transitively) and install openai-agents. "
        "Commands:\n"
        "  python -m pip uninstall -y agents gym tensorflow\n"
        "  python -m pip install -U openai-agents\n\n"
        "Alternatively, keep both by setting COMFYUI_COPILOT_PREFER_OPENAI_AGENTS=1 so this plugin prefers openai-agents."
    )
from dotenv import dotenv_values
from .utils.globals import LLM_DEFAULT_BASE_URL, LMSTUDIO_DEFAULT_BASE_URL, MINIMAX_DEFAULT_BASE_URL, get_comfyui_copilot_api_key, is_lmstudio_url, is_minimax_url
from openai import AsyncOpenAI


from agents._config import set_default_openai_api
from agents.tracing import set_tracing_disabled
import asyncio
# from .utils.logger import log

# def load_env_config():
#     """Load environment variables from .env.llm file"""
#     from dotenv import load_dotenv

#     env_file_path = os.path.join(os.path.dirname(__file__), '.env.llm')
#     if os.path.exists(env_file_path):
#         load_dotenv(env_file_path)
#         log.info(f"Loaded environment variables from {env_file_path}")
#     else:
#         log.warning(f"Warning: .env.llm not found at {env_file_path}")


# # Load environment configuration
# load_env_config()

set_default_openai_api("chat_completions")
set_tracing_disabled(False)


def create_agent(**kwargs) -> Agent:
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

    # Check if this is MiniMax
    is_minimax = is_minimax_url(base_url)

    client = AsyncOpenAI(
        api_key=api_key,
        base_url=base_url,
        default_headers=default_headers,
    )

    # Determine model with proper precedence:
    # 1) Explicit selection from config (model_select from frontend)
    # 2) Explicit kwarg 'model' (call-site override)
    # 3) Provider-specific default
    model_from_config = (config or {}).get("model_select")
    model_from_kwargs = kwargs.pop("model", None)

    default_model = "MiniMax-M3" if is_minimax else "gemini-2.5-flash"
    model_name = model_from_config or model_from_kwargs or default_model
    model = OpenAIChatCompletionsModel(model_name, openai_client=client)

    # Safety: ensure no stray 'model' remains in kwargs to avoid duplicate kwarg errors
    kwargs.pop("model", None)

    if config.get("max_tokens"):
        return Agent(model=model, model_settings=ModelSettings(max_tokens=config.get("max_tokens") or 8192), **kwargs)
    return Agent(model=model, **kwargs)