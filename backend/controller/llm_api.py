'''
Author: ai-business-hql qingli.hql@alibaba-inc.com
Date: 2025-07-14 16:46:20
LastEditors: ai-business-hql ai.bussiness.hql@gmail.com
LastEditTime: 2025-12-15 15:03:28
FilePath: /comfyui_copilot/backend/controller/llm_api.py
Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
'''
# Copyright (C) 2025 AIDC-AI
# Licensed under the MIT License.

import json
from typing import List, Dict, Any
from aiohttp import web
from ..utils.globals import LLM_DEFAULT_BASE_URL, LMSTUDIO_DEFAULT_BASE_URL, OPENAI_API_KEY, OPENAI_BASE_URL, MINIMAX_API_KEY, MINIMAX_BASE_URL, MINIMAX_DEFAULT_BASE_URL, MINIMAX_MODELS, TENANT_ID, is_lmstudio_url, is_minimax_url
import server
import requests
from ..utils.logger import log


@server.PromptServer.instance.routes.get("/api/model_config")
async def list_models(request):
    """
    List available LLM models
    
    Returns:
        JSON response with models list in the format expected by frontend:
        {
            "models": [
                {"name": "model_name", "image_enable": boolean},
                ...
            ]
        }
    """
    try:
        log.info("Received list_models request")
        if TENANT_ID:
            model_list = [ "gemini-2.5-flash", "gpt-5-nano", "gpt-5-mini", "gpt-5" ]
            llm_config = []
            for model in model_list:
                llm_config.append({
                    "label": model,
                    "name": model,
                    "image_enable": True
                })
            return web.json_response({
                "models": llm_config
            })
        
        openai_api_key = request.headers.get('Openai-Api-Key') or OPENAI_API_KEY or ""
        openai_base_url = request.headers.get('Openai-Base-Url') or OPENAI_BASE_URL or LLM_DEFAULT_BASE_URL

        # Check if this is MiniMax - return static model list
        # (MiniMax does not expose a /v1/models endpoint)
        if is_minimax_url(openai_base_url):
            return web.json_response({
                "models": [dict(m) for m in MINIMAX_MODELS]
            })

        request_url = f"{openai_base_url}/models"

        # Check if this is LMStudio and adjust headers accordingly
        is_lmstudio = is_lmstudio_url(openai_base_url)

        headers = {}
        if not is_lmstudio or (is_lmstudio and openai_api_key):
            # Include Authorization header for OpenAI API or LMStudio with API key
            headers["Authorization"] = f"Bearer {openai_api_key}"

        response = requests.get(request_url, headers=headers)
        llm_config = []
        if response.status_code == 200:
            models = response.json()
            for model in models['data']:
                llm_config.append({
                    "label": model['id'],
                    "name": model['id'],
                    "image_enable": True
                })

        return web.json_response({
                "models": llm_config
            }
        )
        
    except Exception as e:
        log.error(f"Error in list_models: {str(e)}")
        return web.json_response({
            "error": f"Failed to list models: {str(e)}"
        }, status=500)


@server.PromptServer.instance.routes.get("/verify_openai_key")
async def verify_openai_key(req):
    """
    Verify if an OpenAI API key is valid by calling the OpenAI models endpoint
    Also supports LMStudio verification (which may not require an API key)
    
    Returns:
        JSON response with success status and message
    """
    try:
        openai_api_key = req.headers.get('Openai-Api-Key')
        openai_base_url = req.headers.get('Openai-Base-Url', 'https://api.openai.com/v1')

        # Check if this is LMStudio or MiniMax
        is_lmstudio = is_lmstudio_url(openai_base_url)
        is_minimax = is_minimax_url(openai_base_url)

        # For LMStudio, API key might not be required
        if not openai_api_key and not is_lmstudio:
            return web.json_response({
                "success": False,
                "message": "No API key provided"
            })

        # MiniMax does not expose /v1/models; verify via chat completions
        if is_minimax:
            try:
                verify_resp = requests.post(
                    f"{openai_base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {openai_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "MiniMax-M3",
                        "messages": [{"role": "user", "content": "hi"}],
                        "max_tokens": 1,
                    },
                    timeout=15,
                )
                if verify_resp.status_code == 200:
                    return web.json_response({
                        "success": True,
                        "data": True,
                        "message": "MiniMax API key is valid",
                    })
                else:
                    return web.json_response({
                        "success": False,
                        "data": False,
                        "message": f"MiniMax API validation failed: HTTP {verify_resp.status_code}",
                    })
            except Exception as minimax_err:
                return web.json_response({
                    "success": False,
                    "data": False,
                    "message": f"MiniMax connection error: {str(minimax_err)}",
                })

        # Use a direct HTTP request instead of the OpenAI client
        # This gives us more control over the request method and error handling
        headers = {}
        if not is_lmstudio or (is_lmstudio and openai_api_key):
            # Include Authorization header for OpenAI API or LMStudio with API key
            headers["Authorization"] = f"Bearer {openai_api_key}"

        # Make a simple GET request to the models endpoint
        response = requests.get(f"{openai_base_url}/models", headers=headers)

        # Check if the request was successful
        if response.status_code == 200:
            success_message = "API key is valid" if not is_lmstudio else "LMStudio connection successful"
            return web.json_response({
                "success": True,
                "data": True,
                "message": success_message
            })
        else:
            log.error(f"API validation failed with status code: {response.status_code}")
            error_message = f"Invalid API key: HTTP {response.status_code} - {response.text}"
            if is_lmstudio:
                error_message = f"LMStudio connection failed: HTTP {response.status_code} - {response.text}"
            return web.json_response({
                "success": False,
                "data": False,
                "message": error_message
            })
            
    except Exception as e:
        log.error(f"Error verifying API key/connection: {str(e)}")
        error_message = f"Invalid API key: {str(e)}"
        if 'base_url' in locals() and is_lmstudio_url(locals().get('openai_base_url', '')):
            error_message = f"LMStudio connection error: {str(e)}"
        return web.json_response({
            "success": False, 
            "data": False, 
            "message": error_message
        })