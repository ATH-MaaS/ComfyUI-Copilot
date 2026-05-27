# Copyright (C) 2025 AIDC-AI
# Licensed under the MIT License.

import json
import asyncio
import time
from typing import Optional, TypedDict, List, Union
import threading
from collections import defaultdict

from sqlalchemy.orm import identity

from ..utils.globals import set_language, apply_llm_env_defaults
from ..utils.auth_utils import extract_and_store_api_key
import server
from aiohttp import web
import base64

# Import the MCP client function
import os
import shutil

from ..service.debug_agent import debug_workflow_errors
from ..dao.workflow_table import (
    save_workflow_data,
    get_workflow_data_by_id_and_session,
    update_workflow_ui_by_id_and_session,
)
from ..service.mcp_client import comfyui_agent_invoke
from ..utils.request_context import set_request_context, get_session_id
from ..utils.logger import log
from ..utils.modelscope_gateway import ModelScopeGateway
import folder_paths


def get_llm_config_from_headers(request):
    """Extract LLM-related configuration from request headers."""
    return {
        "openai_api_key": request.headers.get('Openai-Api-Key'),
        "openai_base_url": request.headers.get('Openai-Base-Url'),
        # Workflow LLM settings (optional, used by tools/agents that need a different LLM)
        "workflow_llm_api_key": request.headers.get('Workflow-LLM-Api-Key'),
        "workflow_llm_base_url": request.headers.get('Workflow-LLM-Base-Url'),
        "workflow_llm_model": request.headers.get('Workflow-LLM-Model'),
    }


# 全局下载进度存储
download_progress = {}
download_lock = threading.Lock()

# 不再使用内存存储会话消息，改为从前端传递历史消息

# 在文件开头添加
STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public")

# Define types using TypedDict
class Node(TypedDict):
    name: str  # 节点名称
    description: str  # 节点描述
    image: str  # 节点图片url，可为空
    github_url: str  # 节点github地址
    from_index: int  # 节点在列表中的位置
    to_index: int  # 节点在列表中的位置

class NodeInfo(TypedDict):
    existing_nodes: List[Node]  # 已安装的节点
    missing_nodes: List[Node]  # 未安装的节点

class Workflow(TypedDict, total=False):
    id: Optional[int]  # 工作流id
    name: Optional[str]  # 工作流名称
    description: Optional[str]  # 工作流描述
    image: Optional[str]  # 工作流图片
    workflow: Optional[str]  # 工作流

class ExtItem(TypedDict):
    type: str  # 扩展类型
    data: Union[dict, list]  # 扩展数据

class ChatResponse(TypedDict):
    session_id: str  # 会话id
    text: Optional[str]  # 返回文本
    finished: bool  # 是否结束
    type: str  # 返回的类型
    format: str  # 返回的格式
    ext: Optional[List[ExtItem]]  # 扩展信息

# 下载进度回调类
class DownloadProgressCallback:
    def __init__(self, id: str, filename: str, file_size: int, download_id: str):
        self.id = id
        self.filename = filename
        self.file_size = file_size
        self.download_id = download_id
        self.progress = 0
        self.status = "downloading"  # downloading, completed, failed
        self.error_message = None
        self.start_time = time.time()
        
        # 初始化进度记录
        with download_lock:
            download_progress[download_id] = {
                "id": id,
                "filename": filename,
                "file_size": file_size,
                "progress": 0,
                "percentage": 0.0,
                "status": "downloading",
                "start_time": self.start_time,
                "estimated_time": None,
                "speed": 0.0,
                "error_message": None
            }

    def update(self, size: int):
        """更新下载进度"""
        self.progress += size
        current_time = time.time()
        elapsed_time = current_time - self.start_time
        
        # 计算下载速度和预估时间
        if elapsed_time > 0:
            speed = self.progress / elapsed_time  # bytes per second
            if speed > 0 and self.progress < self.file_size:
                remaining_bytes = self.file_size - self.progress
                estimated_time = remaining_bytes / speed
            else:
                estimated_time = None
        else:
            speed = 0.0
            estimated_time = None
        
        percentage = (self.progress / self.file_size) * 100 if self.file_size > 0 else 0
        
        # 更新全局进度
        with download_lock:
            if self.download_id in download_progress:
                # 直接更新字典的值，而不是调用update方法
                progress_dict = download_progress[self.download_id]
                progress_dict["progress"] = self.progress
                progress_dict["percentage"] = round(percentage, 2)
                progress_dict["speed"] = round(speed, 2)
                progress_dict["estimated_time"] = round(estimated_time, 2) if estimated_time else None

    def end(self, success: bool = True, error_message: str = None):
        """下载结束回调"""
        current_time = time.time()
        total_time = current_time - self.start_time
        
        if success:
            self.status = "completed"
            # 验证下载完整性
            assert self.progress == self.file_size, f"Download incomplete: {self.progress}/{self.file_size}"
        else:
            self.status = "failed"
            self.error_message = error_message
        
        # 更新最终状态
        with download_lock:
            if self.download_id in download_progress:
                # 直接更新字典的值，而不是调用update方法
                progress_dict = download_progress[self.download_id]
                progress_dict["status"] = self.status
                progress_dict["progress"] = self.file_size if success else self.progress
                if self.file_size > 0:
                    progress_dict["percentage"] = 100.0 if success else (self.progress / self.file_size) * 100
                else:
                    progress_dict["percentage"] = 0.0
                progress_dict["total_time"] = round(total_time, 2)
                progress_dict["error_message"] = self.error_message

    def fail(self, error_message: str):
        """下载失败回调"""
        self.end(success=False, error_message=error_message)

# 生成唯一下载ID
def generate_download_id() -> str:
    import uuid
    return str(uuid.uuid4())

async def upload_to_oss(file_data: bytes, filename: str) -> str:
    # TODO: Implement your OSS upload logic here
    # For now, save locally and return a placeholder URL
    
    try:
        # Create uploads directory if it doesn't exist
        uploads_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'uploads')
        os.makedirs(uploads_dir, exist_ok=True)
        
        # Generate unique filename to avoid conflicts
        import uuid
        unique_filename = f"{uuid.uuid4().hex}_{filename}"
        file_path = os.path.join(uploads_dir, unique_filename)
        
        # Save file locally
        with open(file_path, 'wb') as f:
            f.write(file_data)
        
        # Return a local URL or base64 data URL for now
        # In production, replace this with actual OSS URL
        base64_data = base64.b64encode(file_data).decode('utf-8')
        # Determine MIME type based on file extension
        if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
            mime_type = f"image/{filename.split('.')[-1].lower()}"
            if mime_type == "image/jpg":
                mime_type = "image/jpeg"
        else:
            mime_type = "image/jpeg"  # Default
            
        return f"data:{mime_type};base64,{base64_data}"
        
    except Exception as e:
        log.error(f"Error uploading file {filename}: {str(e)}")
        # Return original base64 data if upload fails
        base64_data = base64.b64encode(file_data).decode('utf-8')
        return f"data:image/jpeg;base64,{base64_data}"

# 关联用户消息和AI响应的checkpoint信息
def processMessagesWithCheckpoints(messages):
    # ... existing code ...
    pass

@server.PromptServer.instance.routes.post("/api/chat/invoke")
async def invoke_chat(request):
    log.info("Received invoke_chat request")
    
    # Extract and store API key from Authorization header
    extract_and_store_api_key(request)
    
    req_json = await request.json()
    log.info("Request JSON:", req_json)

    response = web.StreamResponse(
        status=200,
        reason='OK',
        headers={
            'Content-Type': 'application/json',
            'X-Content-Type-Options': 'nosniff'
        }
    )
    await response.prepare(request)

    session_id = req_json.get('session_id')
    prompt = req_json.get('prompt')
    images = req_json.get('images', [])
    intent = req_json.get('intent')
    ext = req_json.get('ext')
    historical_messages = req_json.get('messages', [])
    workflow_checkpoint_id = req_json.get('workflow_checkpoint_id')
    
    # 获取当前语言
    language = request.headers.get('Accept-Language', 'en')
    set_language(language)
    
    # 构建配置信息
    config = {
        "session_id": session_id,
        "workflow_checkpoint_id": workflow_checkpoint_id,
        **get_llm_config_from_headers(request),
        "model_select": next((x['data'][0] for x in ext if x['type'] == 'model_select' and x.get('data')), None)
    }
    # Apply .env-based defaults for LLM-related fields (config > .env > code defaults)
    config = apply_llm_env_defaults(config)
    
    # 设置请求上下文 - 这里建立context隔离
    set_request_context(session_id, workflow_checkpoint_id, config)

    # 图片处理已移至前端，图片信息现在包含在历史消息的OpenAI格式中
    # 保留空的处理逻辑以向后兼容，但实际不再使用
    processed_images = []
    if images and len(images) > 0:
        log.info(f"Note: Received {len(images)} images in legacy format, but using OpenAI message format instead")

    # 历史消息已经从前端传递过来，格式为OpenAI格式，直接使用
    log.info(f"-- Received {len(historical_messages)} historical messages")
    
    # Log workflow checkpoint ID if provided (workflow is now pre-saved before invoke)
    if workflow_checkpoint_id:
        log.info(f"Using workflow checkpoint ID: {workflow_checkpoint_id} for session {session_id}")
    else:
        log.info(f"No workflow checkpoint ID provided for session {session_id}")

    # 历史消息已经从前端传递过来，包含了正确格式的OpenAI消息（包括图片）
    # 直接使用前端传递的历史消息，无需重新构建当前消息
    openai_messages = historical_messages
    
    # 不再需要创建用户消息存储到后端，前端负责消息存储

    try:
        # Call the MCP client to get streaming response with historical messages and image support
        # Pass OpenAI-formatted messages and processed images to comfyui_agent_invoke
        accumulated_text = ""
        ext_data = None
        finished = True  # Default to True
        has_sent_response = False
        previous_text_length = 0
        
        log.info(f"config: {config}")
        
        # Pass messages in OpenAI format (images are now included in messages)
        # Config is now available through request context
        async for result in comfyui_agent_invoke(openai_messages, None):
            # The MCP client now returns tuples (text, ext_with_finished) where ext_with_finished includes finished status
            if isinstance(result, tuple) and len(result) == 2:
                text, ext_with_finished = result
                if text:
                    accumulated_text = text  # text from MCP is already accumulated
                    
                if ext_with_finished:
                    # Extract ext data and finished status from the structured response
                    ext_data = ext_with_finished.get("data")
                    finished = ext_with_finished.get("finished", True)
                    log.info(f"-- Received ext data: {ext_data}, finished: {finished}")
            else:
                # Handle single text chunk (backward compatibility)
                text_chunk = result
                if text_chunk:
                    accumulated_text += text_chunk
                    log.info(f"-- Received text chunk: '{text_chunk}', total length: {len(accumulated_text)}")
            
            # Send streaming response if we have new text content
            # Only send intermediate responses during streaming (not the final one)
            if accumulated_text and len(accumulated_text) > previous_text_length:
                chat_response = ChatResponse(
                    session_id=session_id,
                    text=accumulated_text,
                    finished=False,  # Always false during streaming
                    type="message",
                    format="markdown",
                    ext=None  # ext is only sent in final response
                )
                
                await response.write(json.dumps(chat_response).encode() + b"\n")
                previous_text_length = len(accumulated_text)
                await asyncio.sleep(0.01)  # Small delay for streaming effect

        # Send final response with proper finished logic from MCP client
        log.info(f"-- Sending final response: {len(accumulated_text)} chars, ext: {bool(ext_data)}, finished: {finished}")
        
        final_response = ChatResponse(
            session_id=session_id,
            text=accumulated_text,
            finished=finished,  # Use finished status from MCP client
            type="message",
            format="markdown",
            ext=ext_data
        )
        
        await response.write(json.dumps(final_response).encode() + b"\n")

        # AI响应不再存储到后端，前端负责消息存储

    except Exception as e:
        log.error(f"Error in invoke_chat: {str(e)}")
        error_response = ChatResponse(
            session_id=session_id,
            text=f"I apologize, but an error occurred: {str(e)}",
            finished=True,  # Always finish on error
            type="message",
            format="text",
            ext=None
        )
        await response.write(json.dumps(error_response).encode() + b"\n")

    await response.write_eof()
    return response


@server.PromptServer.instance.routes.post("/api/save-workflow-checkpoint")
async def save_workflow_checkpoint(request):
    """
    Save workflow checkpoint for restore functionality
    """
    log.info("Received save-workflow-checkpoint request")
    req_json = await request.json()
    
    try:
        session_id = req_json.get('session_id')
        workflow_api = req_json.get('workflow_api')  # API format workflow
        workflow_ui = req_json.get('workflow_ui')    # UI format workflow  
        checkpoint_type = req_json.get('checkpoint_type', 'debug_start')  # debug_start, debug_complete, user_message_checkpoint
        message_id = req_json.get('message_id')      # User message ID for linking (optional)
        
        if not session_id or not workflow_api:
            return web.json_response({
                "success": False,
                "message": "Missing required parameters: session_id and workflow_api"
            })
        
        # Save workflow with checkpoint type in attributes
        attributes = {
            "checkpoint_type": checkpoint_type,
            "timestamp": time.time()
        }
        
        # Set description and additional attributes based on checkpoint type
        if checkpoint_type == "user_message_checkpoint" and message_id:
            attributes.update({
                "description": f"Workflow checkpoint before user message {message_id}",
                "message_id": message_id,
                "source": "user_message_pre_invoke"
            })
        else:
            attributes["description"] = f"Workflow checkpoint: {checkpoint_type}"
        
        version_id = save_workflow_data(
            session_id=session_id,
            workflow_data=workflow_api,
            workflow_data_ui=workflow_ui,
            attributes=attributes
        )
        
        log.info(f"Workflow checkpoint saved with version ID: {version_id}")
        
        # Return response format based on checkpoint type
        response_data = {
            "version_id": version_id,
            "checkpoint_type": checkpoint_type
        }
        
        if checkpoint_type == "user_message_checkpoint" and message_id:
            response_data.update({
                "checkpoint_id": version_id,  # Add checkpoint_id alias for user message checkpoints
                "message_id": message_id
            })
        
        return web.json_response({
            "success": True,
            "data": response_data,
            "message": f"Workflow checkpoint saved successfully"
        })
        
    except Exception as e:
        log.error(f"Error saving workflow checkpoint: {str(e)}")
        return web.json_response({
            "success": False,
            "message": f"Failed to save workflow checkpoint: {str(e)}"
        })



@server.PromptServer.instance.routes.get("/api/restore-workflow-checkpoint")
async def restore_workflow_checkpoint(request):
    """
    Restore workflow checkpoint by version ID
    """
    log.info("Received restore-workflow-checkpoint request")
    
    try:
        version_id = request.query.get('version_id')
        session_id = request.query.get('session_id') or request.headers.get('X-Session-ID')
        
        if not version_id or not session_id:
            return web.json_response({
                "success": False,
                "message": "Missing required parameters: version_id and session_id"
            })
        
        try:
            version_id = int(version_id)
        except ValueError:
            return web.json_response({
                "success": False,
                "message": "Invalid version_id format"
            })
        
        # Get workflow data only if the checkpoint belongs to the current session.
        workflow_version = get_workflow_data_by_id_and_session(version_id, session_id)
        
        if not workflow_version:
            return web.json_response({
                "success": False,
                "message": f"Workflow version {version_id} not found"
            })
        
        log.info(f"Restored workflow checkpoint version ID: {version_id}")
        
        return web.json_response({
            "success": True,
            "data": {
                "version_id": version_id,
                "workflow_data": workflow_version.get('workflow_data'),
                "workflow_data_ui": workflow_version.get('workflow_data_ui'),
                "attributes": workflow_version.get('attributes'),
                "created_at": workflow_version.get('created_at')
            },
            "message": f"Workflow checkpoint restored successfully"
        })
        
    except Exception as e:
        log.error(f"Error restoring workflow checkpoint: {str(e)}")
        return web.json_response({
            "success": False,
            "message": f"Failed to restore workflow checkpoint: {str(e)}"
        })


@server.PromptServer.instance.routes.post("/api/debug-agent")
async def invoke_debug(request):
    """
    Debug agent endpoint for analyzing ComfyUI workflow errors
    """
    log.info("Received debug-agent request")
    
    # Extract and store API key from Authorization header
    extract_and_store_api_key(request)
    
    req_json = await request.json()
    
    response = web.StreamResponse(
        status=200,
        reason='OK',
        headers={
            'Content-Type': 'application/json',
            'X-Content-Type-Options': 'nosniff'
        }
    )
    await response.prepare(request)

    session_id = req_json.get('session_id')
    workflow_data = req_json.get('workflow_data')
    
    # Get configuration from headers (OpenAI settings)
    config = {
        "session_id": session_id,
        "model": "gemini-2.5-flash",  # Default model for debug agents
        **get_llm_config_from_headers(request),
    }
    # Apply .env-based defaults for LLM-related fields (config > .env > code defaults)
    config = apply_llm_env_defaults(config)

    # 获取当前语言
    language = request.headers.get('Accept-Language', 'en')
    set_language(language)
    
    # 设置请求上下文 - 为debug请求建立context隔离
    set_request_context(session_id, None, config)
    
    log.info(f"Debug agent config: {config}")
    log.info(f"Session ID: {session_id}")
    log.info(f"Workflow nodes: {list(workflow_data.keys()) if workflow_data else 'None'}")

    try:
        # Call the debug agent with streaming response
        accumulated_text = ""
        final_ext_data = None
        finished = False
        
        async for result in debug_workflow_errors(workflow_data):
            # Stream the response
            if isinstance(result, tuple) and len(result) == 2:
                text, ext = result
                if text:
                    accumulated_text = text  # text is already accumulated from debug agent
                
                # Handle new ext format from debug_agent matching mcp-client
                if ext:
                    if isinstance(ext, dict) and "data" in ext and "finished" in ext:
                        # New format: {"data": ext, "finished": finished}
                        final_ext_data = ext["data"]
                        finished = ext["finished"]
                        
                        # 检查是否包含需要实时发送的workflow_update或param_update
                        has_realtime_ext = False
                        if final_ext_data:
                            for ext_item in final_ext_data:
                                if ext_item.get("type") in ["workflow_update", "param_update"]:
                                    has_realtime_ext = True
                                    break
                        
                        # 如果包含实时ext数据或者已完成，则发送响应
                        if has_realtime_ext or finished:
                            chat_response = ChatResponse(
                                session_id=session_id,
                                text=accumulated_text,
                                finished=finished,
                                type="message",
                                format="markdown",
                                ext=final_ext_data  # 发送ext数据
                            )
                            await response.write(json.dumps(chat_response).encode() + b"\n")
                        elif not finished:
                            # 只有文本更新，不发送ext数据
                            chat_response = ChatResponse(
                                session_id=session_id,
                                text=accumulated_text,
                                finished=False,
                                type="message",
                                format="markdown",
                                ext=None
                            )
                            await response.write(json.dumps(chat_response).encode() + b"\n")
                    else:
                        # Legacy format: direct ext data (for backward compatibility)
                        final_ext_data = ext
                        finished = False
                        
                        # Create streaming response
                        chat_response = ChatResponse(
                            session_id=session_id,
                            text=accumulated_text,
                            finished=False,
                            type="message",
                            format="markdown",
                            ext=ext
                        )
                        await response.write(json.dumps(chat_response).encode() + b"\n")
                else:
                    # No ext data, just text streaming
                    chat_response = ChatResponse(
                        session_id=session_id,
                        text=accumulated_text,
                        finished=False,
                        type="message",
                        format="markdown",
                        ext=None
                    )
                    await response.write(json.dumps(chat_response).encode() + b"\n")
                
                await asyncio.sleep(0.01)  # Small delay for streaming effect

        # Send final response
        final_response = ChatResponse(
            session_id=session_id,
            text=accumulated_text,
            finished=True,
            type="message",
            format="markdown",
            ext=final_ext_data if final_ext_data else [{"type": "debug_complete", "data": {"status": "completed"}}]
        )
        
        # Save workflow checkpoint after debug completion if we have workflow_data
        if workflow_data and accumulated_text:
            try:
                current_session_id = get_session_id()
                checkpoint_id = save_workflow_data(
                    session_id=current_session_id,
                    workflow_data=workflow_data,
                    workflow_data_ui=None,  # UI format not available in debug agent
                    attributes={
                        "checkpoint_type": "debug_complete",
                        "description": "Workflow state after debug completion",
                        "timestamp": time.time()
                    }
                )
                
                # Add checkpoint info to ext data
                if final_response["ext"]:
                    final_response["ext"].append({
                        "type": "debug_checkpoint",
                        "data": {
                            "checkpoint_id": checkpoint_id,
                            "checkpoint_type": "debug_complete"
                        }
                    })
                else:
                    final_response["ext"] = [{
                        "type": "debug_checkpoint",
                        "data": {
                            "checkpoint_id": checkpoint_id,
                            "checkpoint_type": "debug_complete"
                        }
                    }]
                
                log.info(f"Debug completion checkpoint saved with ID: {checkpoint_id}")
            except Exception as checkpoint_error:
                log.error(f"Failed to save debug completion checkpoint: {checkpoint_error}")
        
        await response.write(json.dumps(final_response).encode() + b"\n")
        log.info("Debug agent processing complete")

    except Exception as e:
        log.error(f"Error in debug agent: {str(e)}")
        import traceback
        traceback.print_exc()
        
        error_response = ChatResponse(
            session_id=session_id,
            text=f"❌ Debug agent error: {str(e)}",
            finished=True,
            type="message",
            format="text",
            ext=[{"type": "error", "data": {"error": str(e)}}]
        )
        await response.write(json.dumps(error_response).encode() + b"\n")

    await response.write_eof()
    return response


@server.PromptServer.instance.routes.post("/api/update-workflow-ui")
async def update_workflow_ui(request):
    """
    Update workflow_data_ui field for a specific checkpoint without affecting other fields
    """
    log.info("Received update-workflow-ui request")
    req_json = await request.json()
    
    try:
        checkpoint_id = req_json.get('checkpoint_id')
        session_id = req_json.get('session_id') or request.headers.get('X-Session-ID')
        workflow_data_ui = req_json.get('workflow_data_ui')
        
        if not checkpoint_id or not session_id or not workflow_data_ui:
            return web.json_response({
                "success": False,
                "message": "Missing required parameters: checkpoint_id, session_id and workflow_data_ui"
            })
        
        try:
            checkpoint_id = int(checkpoint_id)
        except ValueError:
            return web.json_response({
                "success": False,
                "message": "Invalid checkpoint_id format"
            })
        
        # Update only checkpoints owned by the current session.
        success = update_workflow_ui_by_id_and_session(checkpoint_id, session_id, workflow_data_ui)
        
        if success:
            log.info(f"Successfully updated workflow_data_ui for checkpoint ID: {checkpoint_id}")
            return web.json_response({
                "success": True,
                "message": f"Workflow UI data updated successfully for checkpoint {checkpoint_id}"
            })
        else:
            return web.json_response({
                "success": False,
                "message": f"Checkpoint {checkpoint_id} not found"
            })
        
    except Exception as e:
        log.error(f"Error updating workflow UI data: {str(e)}")
        return web.json_response({
            "success": False,
            "message": f"Failed to update workflow UI data: {str(e)}"
        })

@server.PromptServer.instance.routes.post("/api/download-model")
async def download_model(request):
    """
    Download model from ModelScope using SDK
    """
    log.info("Received download-model request")
    req_json = await request.json()
    
    try:
        id = req_json.get('id')
        model_id = req_json.get('model_id')
        model_type = req_json.get('model_type')
        dest_dir = req_json.get('dest_dir')
        
        # 验证必需参数
        if not id:
            return web.json_response({
                "success": False,
                "message": "Missing required parameter: id"
            })

        if not model_id:
            return web.json_response({
                "success": False,
                "message": "Missing required parameter: model_id"
            })
            
        if not model_type:
            return web.json_response({
                "success": False,
                "message": "Missing required parameter: model_type"
            })
        
        log.info(f"Downloading model: {model_id} (type: {model_type})")
        
        # 生成下载ID
        download_id = generate_download_id()
        
        # 计算目标目录：优先使用传入的dest_dir，否则使用ComfyUI的models目录下对应类型
        resolved_dest_dir = None
        if dest_dir:
            resolved_dest_dir = os.path.abspath(os.path.expanduser(f"models/{dest_dir}"))
        else:
            try:
                model_type_paths = folder_paths.get_folder_paths(model_type)
                resolved_dest_dir = model_type_paths[0] if model_type_paths else os.path.join(folder_paths.models_dir, model_type)
            except Exception:
                resolved_dest_dir = os.path.join(folder_paths.models_dir, model_type)

        # 创建进度回调
        progress_callback = DownloadProgressCallback(
            id=id,
            filename=f"{model_id}.{model_type}",
            file_size=0,  # 实际大小会在下载过程中获取
            download_id=download_id
        )

        # 启动下载任务（异步执行）
        async def download_task():
            try:
                # 调用下载方法 - 使用snapshot_download
                from modelscope import snapshot_download
                
                # 创建进度回调包装器 - 实现ModelScope期望的接口
                class ProgressWrapper:
                    """Factory that returns a per-file progress object with update/end."""
                    def __init__(self, download_id: str):
                        self.download_id = download_id

                    def __call__(self, file_name: str, file_size: int):
                        # Create a per-file progress tracker expected by ModelScope
                        download_id = self.download_id

                        class _PerFileProgress:
                            def __init__(self, fname: str, fsize: int):
                                self.file_name = fname
                                self.file_size = max(int(fsize or 0), 0)
                                self.progress = 0
                                self.last_update_time = time.time()
                                self.last_downloaded = 0
                                with download_lock:
                                    if download_id in download_progress:
                                        # If unknown size, keep 0 to avoid div-by-zero
                                        download_progress[download_id]["file_size"] = self.file_size

                            def update(self, size: int):
                                try:
                                    self.progress += int(size or 0)
                                    now = time.time()
                                    # Update global progress
                                    with download_lock:
                                        if download_id in download_progress:
                                            dp = download_progress[download_id]
                                            dp["progress"] = self.progress
                                            if self.file_size > 0:
                                                dp["percentage"] = round(self.progress * 100.0 / self.file_size, 2)
                                            # speed
                                            elapsed = max(now - self.last_update_time, 1e-6)
                                            speed = (self.progress - self.last_downloaded) / elapsed
                                            dp["speed"] = round(speed, 2)
                                    self.last_update_time = now
                                    self.last_downloaded = self.progress
                                except Exception as e:
                                    log.error(f"Error in progress update: {e}")

                            def end(self):
                                # Called by modelscope when a file finishes
                                with download_lock:
                                    if download_id in download_progress:
                                        dp = download_progress[download_id]
                                        if self.file_size > 0:
                                            dp["progress"] = self.file_size
                                            dp["percentage"] = 100.0
                        
                        return _PerFileProgress(file_name, file_size)
 
                progress_wrapper = ProgressWrapper(download_id)
                
                # 添加调试日志
                log.info(f"Starting download with progress wrapper: {download_id}")
                
                # 在线程中执行阻塞的下载，避免阻塞事件循环
                from functools import partial
                local_dir = await asyncio.to_thread(
                    partial(
                        snapshot_download,
                        model_id=model_id,
                        cache_dir=resolved_dest_dir,
                        progress_callbacks=[progress_wrapper]
                    )
                )
                
                # 下载完成
                progress_callback.end(success=True)
                log.info(f"Model downloaded successfully to: {local_dir}")

                # 下载后遍历目录，将所有重要权重/资源文件移动到最外层（与目录同级，即 resolved_dest_dir）
                try:
                    moved_count = 0
                    allowed_exts = {
                        ".safetensors", ".ckpt", ".pt", ".pth", ".bin"
                        # ".msgpack", ".json", ".yaml", ".yml", ".toml", ".png", ".onnx"
                    }
                    for root, dirs, files in os.walk(local_dir):
                        for name in files:
                            ext = os.path.splitext(name)[1].lower()
                            if ext in allowed_exts:
                                src_path = os.path.join(root, name)
                                target_dir = resolved_dest_dir
                                os.makedirs(target_dir, exist_ok=True)
                                target_path = os.path.join(target_dir, name)
                                # 如果已经在目标目录则跳过
                                if os.path.abspath(os.path.dirname(src_path)) == os.path.abspath(target_dir):
                                    continue
                                # 处理重名情况：自动追加 _1, _2 ...
                                if os.path.exists(target_path):
                                    base, ext_real = os.path.splitext(name)
                                    idx = 1
                                    while True:
                                        candidate = f"{base}_{idx}{ext_real}"
                                        candidate_path = os.path.join(target_dir, candidate)
                                        if not os.path.exists(candidate_path):
                                            target_path = candidate_path
                                            break
                                        idx += 1
                                shutil.move(src_path, target_path)
                                moved_count += 1
                    log.info(f"Moved {moved_count} files with extensions {sorted(list(allowed_exts))} to: {resolved_dest_dir}")
                except Exception as move_err:
                    log.error(f"Post-download move failed: {move_err}")
                
            except Exception as e:
                progress_callback.fail(str(e))
                log.error(f"Download failed: {str(e)}")

        # 启动异步下载任务
        asyncio.create_task(download_task())
        
        return web.json_response({
            "success": True,
            "data": {
                "download_id": download_id,
                "id": id,
                "model_id": model_id,
                "model_type": model_type,
                "dest_dir": resolved_dest_dir,
                "status": "started"
            },
            "message": f"Download started for model '{model_id}'"
        })
        
    except ImportError as e:
        log.error(f"ModelScope SDK not installed: {str(e)}")
        return web.json_response({
            "success": False,
            "message": "ModelScope SDK not installed. Please install with: pip install modelscope"
        })
        
    except Exception as e:
        log.error(f"Error starting download: {str(e)}")
        import traceback
        traceback.print_exc()
        return web.json_response({
            "success": False,
            "message": f"Failed to start download: {str(e)}"
        })

@server.PromptServer.instance.routes.get("/api/download-progress/{download_id}")
async def get_download_progress(request):
    """
    Get download progress by download ID
    """
    download_id = request.match_info.get('download_id')
    
    if not download_id:
        return web.json_response({
            "success": False,
            "message": "Missing download_id parameter"
        })
    
    with download_lock:
        progress_info = download_progress.get(download_id)
    
    if not progress_info:
        return web.json_response({
            "success": False,
            "message": f"Download ID {download_id} not found"
        })
    
    return web.json_response({
        "success": True,
        "data": progress_info,
        "message": "Download progress retrieved successfully"
    })

@server.PromptServer.instance.routes.get("/api/download-progress")
async def list_downloads(request):
    """
    List all active downloads
    """
    with download_lock:
        downloads = list(download_progress.keys())
    
    return web.json_response({
        "success": True,
        "data": {
            "downloads": downloads,
            "count": len(downloads)
        },
        "message": "Download list retrieved successfully"
    })

@server.PromptServer.instance.routes.delete("/api/download-progress/{download_id}")
async def clear_download_progress(request):
    """
    Clear download progress record (for cleanup)
    """
    download_id = request.match_info.get('download_id')
    
    if not download_id:
        return web.json_response({
            "success": False,
            "message": "Missing download_id parameter"
        })
    
    with download_lock:
        if download_id in download_progress:
            del download_progress[download_id]
            return web.json_response({
                "success": True,
                "message": f"Download progress {download_id} cleared successfully"
            })
        else:
            return web.json_response({
                "success": False,
                "message": f"Download ID {download_id} not found"
            })

@server.PromptServer.instance.routes.get("/api/model-searchs")
async def model_suggests(request):
    """
    Get model search list by keyword
    """
    log.info("Received model-search request")
    try:
        keyword = request.query.get('keyword')

        if not keyword:
            return web.json_response({
                "success": False,
                "message": "Missing required parameter: keyword"
            })

        # 创建ModelScope网关实例
        gateway = ModelScopeGateway()

        suggests = gateway.search(name=keyword)

        list = suggests["data"] if suggests.get("data") else []

        return web.json_response({
            "success": True,
            "data": {
                "searchs": list,
                "total": len(list)
            },
            "message": f"Get searchs successfully"
        })
        
    except ImportError as e:
        log.error(f"ModelScope SDK not installed: {str(e)}")
        return web.json_response({
            "success": False,
            "message": "ModelScope SDK not installed. Please install with: pip install modelscope"
        })  

    except Exception as e:
        log.error(f"Error get model searchs: {str(e)}")
        import traceback
        traceback.print_exc()
        return web.json_response({
            "success": False,
            "message": f"Get model searchs failed: {str(e)}"
        })
        
@server.PromptServer.instance.routes.get("/api/model-paths")
async def model_paths(request):
    """
    Get model paths by type
    """
    log.info("Received model-paths request")
    try:
        model_paths = list(folder_paths.folder_names_and_paths.keys())
        return web.json_response({
            "success": True,
            "data": {
                "paths": model_paths,
            },
            "message": f"Get paths successfully"
        })
        
    except Exception as e:
        log.error(f"Error get model path: {str(e)}")
        import traceback
        traceback.print_exc()
        return web.json_response({
            "success": False,
            "message": f"Get model failed: {str(e)}"
        })
