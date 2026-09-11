# Workflow Rewrite Agent for ComfyUI Workflow Structure Fixes

import json
import time
import copy
from typing import Dict, Any, Optional

try:
    from agents import RunContextWrapper
    from agents.tool import function_tool
    if not hasattr(__import__('agents'), 'Agent'):
        # Ensure we are not importing RL agents
        raise ImportError
except Exception:
    raise ImportError(
        "Detected incorrect or missing 'agents' package while loading tools. "
        "Please install 'openai-agents' and ensure this plugin prefers it. Commands:\n"
        "  python -m pip uninstall -y agents gym tensorflow\n"
        "  python -m pip install -U openai-agents\n"
    )
from .workflow_rewrite_agent_simple import rewrite_workflow_simple

from ..dao.workflow_table import (
    get_workflow_data,
    save_workflow_data,
    get_workflow_data_ui,
    get_workflow_data_by_id_and_session,
)
from ..utils.comfy_gateway import get_object_info, get_object_info_by_class
from ..utils.request_context import get_rewrite_context, get_session_id
from ..utils.logger import log

def get_workflow_data_from_config(config: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """获取工作流数据，优先使用checkpoint_id，如果没有则使用session_id"""
    workflow_checkpoint_id = config.get('workflow_checkpoint_id')
    session_id = config.get('session_id')
    
    if workflow_checkpoint_id and session_id:
        try:
            checkpoint_data = get_workflow_data_by_id_and_session(workflow_checkpoint_id, session_id)
            if checkpoint_data and checkpoint_data.get('workflow_data'):
                return checkpoint_data['workflow_data']
        except Exception as e:
            log.error(f"Failed to get workflow data from checkpoint {workflow_checkpoint_id}: {str(e)}")
    
    if session_id:
        return get_workflow_data(session_id)
    
    return None

def get_workflow_data_ui_from_config(config: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """获取工作流UI数据，优先使用checkpoint_id，如果没有则使用session_id"""
    workflow_checkpoint_id = config.get('workflow_checkpoint_id')
    session_id = config.get('session_id')
    
    if workflow_checkpoint_id and session_id:
        try:
            checkpoint_data = get_workflow_data_by_id_and_session(workflow_checkpoint_id, session_id)
            if checkpoint_data and checkpoint_data.get('workflow_data_ui'):
                return checkpoint_data['workflow_data_ui']
        except Exception as e:
            log.error(f"Failed to get workflow UI data from checkpoint {workflow_checkpoint_id}: {str(e)}")
    
    if session_id:
        return get_workflow_data_ui(session_id)
    
    return None

@function_tool
def get_current_workflow() -> str:
    """获取当前session的工作流数据"""
    session_id = get_session_id()
    if not session_id:
        return json.dumps({"error": "No session_id found in context"})
    
    workflow_data = get_workflow_data(session_id)
    if not workflow_data:
        return json.dumps({"error": "No workflow data found for this session"})
    
    workflow_data_str = json.dumps(workflow_data, ensure_ascii=False)
    get_rewrite_context().current_workflow = workflow_data_str
    return workflow_data_str

@function_tool
async def get_node_info(node_class: str) -> str:
    """获取节点的详细信息，包括输入输出参数"""
    try:
        object_info = await get_object_info()
        if node_class in object_info:
            node_info_str = json.dumps(object_info[node_class], ensure_ascii=False)
            get_rewrite_context().node_infos[node_class] = node_info_str
            return node_info_str
        else:
            # 搜索类似的节点类
            similar_nodes = [k for k in object_info.keys() if node_class.lower() in k.lower()]
            if similar_nodes:
                return json.dumps({
                    "error": f"Node class '{node_class}' not found",
                    "suggestions": similar_nodes[:5]
                })
            return json.dumps({"error": f"Node class '{node_class}' not found"})
    except Exception as e:
        return json.dumps({"error": f"Failed to get node info: {str(e)}"})

@function_tool
async def get_node_infos(node_class_list: list[str]) -> str:
    """获取多个节点的详细信息，包括输入输出参数。只做最小化有必要的查询，不要查询很常见的LLM已知用法的节点。尽量不要超过5个"""
    try:
        object_info = await get_object_info()
        node_infos = {}
        for node_class in node_class_list:
            if node_class in object_info:
                # Deep copy to avoid modifying the original cached object info
                node_data = copy.deepcopy(object_info[node_class])
                
                # Truncate long lists in input parameters to save context
                input_data = node_data.get("input", {})
                for req_opt in ["required", "optional"]:
                    params = input_data.get(req_opt, {})
                    for param_name, param_config in params.items():
                        # param_config is typically [type_or_list, config_dict]
                        if isinstance(param_config, list) and len(param_config) > 0:
                            # Check if the first element is a list (which means it's a selection list)
                            if isinstance(param_config[0], list):
                                if len(param_config[0]) > 3:
                                    param_config[0] = param_config[0][:3]
                
                node_infos[node_class] = node_data
        return json.dumps(node_infos)
    except Exception as e:
        return json.dumps({"error": f"Failed to get node infos of {','.join(node_class_list)}: {str(e)}"})

@function_tool
async def search_node_local(node_class: str = "", keywords: list[str] = None, limit: int = 10) -> str:
    """
    节点的搜索工具（node_class + keywords 联合检索）：
    1. 优先使用 node_class 按节点类名精确查询。
    2. 如果没有命中，则在全部节点中使用 node_class 和 keywords 做联合模糊搜索：
       - 关键词会在节点类名、名称、显示名、分类、描述以及输入参数名中匹配。
       - 关键词是英文。
       - 关键词应该尽量具体（例如 "brightness"、"contrast"、"saturation"、"sharpness"），
         避免使用过于宽泛的词（例如 "image" 等），以减少噪声结果。
    """
    try:
        node_class_str = (node_class or "").strip()
        # 过滤空字符串和过于宽泛的关键词
        raw_keywords = keywords or []
        banned_keywords = {"image", "图像", "图片"}
        keyword_list: list[str] = []
        for kw in raw_keywords:
            if not kw:
                continue
            kw_str = str(kw).strip()
            if not kw_str:
                continue
            if kw_str.lower() in banned_keywords:
                continue
            keyword_list.append(kw_str)

        # 1) 如果提供了 node_class，则先尝试精确按类名查询
        if node_class_str:
            try:
                exact_info = await get_object_info_by_class(node_class_str)
            except TypeError:
                # 兼容旧版本导入方式异常的情况
                exact_info = {}

            if exact_info:
                # exact_info 形如：{"LayerColor: BrightnessContrastV2": { ... }}
                # 写入 rewrite_context 以便后续复用
                rewrite_ctx = get_rewrite_context()
                for cls_name, meta in exact_info.items():
                    try:
                        rewrite_ctx.node_infos[cls_name] = json.dumps(meta, ensure_ascii=False)
                    except Exception:
                        # 不因为缓存失败而影响主流程
                        pass

                return json.dumps(
                    {
                        "node_class": node_class_str,
                        "keywords": keyword_list,
                        "match_type": "exact_class",
                        "results": exact_info,
                    },
                    ensure_ascii=False,
                )

        # 2) 精确类名未命中：在全部节点中按 node_class + keywords 联合搜索
        if not node_class_str and not keyword_list:
            return json.dumps({"error": "both node_class and keywords are empty"})

        object_info = await get_object_info()
        if not object_info:
            return json.dumps({"error": "Failed to fetch object info from ComfyUI"})

        # 组合所有搜索 token：node_class + keywords
        tokens: list[str] = []
        if node_class_str:
            tokens.append(node_class_str.lower())
        tokens.extend([kw.lower() for kw in keyword_list])

        candidates = []

        for cls_name, meta in object_info.items():
            cls_str = str(cls_name)
            cls_lower = cls_str.lower()

            name = str(meta.get("name", "") or "")
            display_name = str(meta.get("display_name", "") or "")
            category = str(meta.get("category", "") or "")
            description = str(meta.get("description", "") or "")

            text_blocks = [
                cls_lower,
                name.lower(),
                display_name.lower(),
                category.lower(),
                description.lower(),
            ]
            joined_text = " ".join(text_blocks)

            score = 0
            hit_params: list[str] = []

            # 输入参数信息，用于参数名匹配
            input_meta = meta.get("input") or {}
            required_inputs = {}
            optional_inputs = {}
            if isinstance(input_meta, dict):
                required_inputs = input_meta.get("required") or {}
                optional_inputs = input_meta.get("optional") or {}

            # 针对每个 token 进行匹配和评分计算
            for token in tokens:
                if not token:
                    continue

                # 方案1：按类名 / 名称 / 分类 / 描述做关键字匹配
                if token in joined_text:
                    score += joined_text.count(token)
                    if token in cls_lower:
                        score += 2

                # 方案2：按输入参数名搜索（brightness、contrast、saturation 等）
                for section in (required_inputs, optional_inputs):
                    if isinstance(section, dict):
                        for param_name in section.keys():
                            p_str = str(param_name)
                            if token in p_str.lower():
                                if p_str not in hit_params:
                                    hit_params.append(p_str)

                # 方案3：输出名称作为弱信号
                output_names = meta.get("output_name") or []
                if isinstance(output_names, list):
                    for out_name in output_names:
                        if token in str(out_name).lower():
                            score += 1

            if hit_params:
                # 参数命中整体提高权重
                score += len(hit_params) * 3

            if score <= 0:
                continue

            candidates.append(
                {
                    "class_name": cls_str,
                    "score": score,
                    "hit_params": hit_params,
                    "name": name,
                    "display_name": display_name,
                    "category": category,
                }
            )

        if not candidates:
            return json.dumps(
                {
                    "node_class": node_class_str,
                    "keywords": keyword_list,
                    "match_type": "search",
                    "results": [],
                    "message": "No nodes matched the query",
                },
                ensure_ascii=False,
            )

        # 按得分排序，并限制返回数量
        candidates.sort(key=lambda x: x["score"], reverse=True)
        limit = max(1, min(int(limit), 50))  # 给一个合理的上限
        results = candidates[:limit]

        return json.dumps(
            {
                "node_class": node_class_str,
                "keywords": keyword_list,
                "match_type": "search",
                "results": results,
            },
            ensure_ascii=False,
        )
    except Exception as e:
        return json.dumps({"error": f"Failed to search node info: {str(e)}"})

def save_checkpoint_before_modification(session_id: str, action_description: str) -> Optional[int]:
    """在修改工作流前保存checkpoint，返回checkpoint_id"""
    try:
        current_workflow = get_workflow_data(session_id)
        if not current_workflow:
            return None
            
        checkpoint_id = save_workflow_data(
            session_id,
            current_workflow,
            workflow_data_ui=get_workflow_data_ui(session_id),
            attributes={
                "checkpoint_type": "workflow_rewrite_start",
                "description": f"Checkpoint before {action_description}",
                "action": "workflow_rewrite_checkpoint",
                "timestamp": time.time()
            }
        )
        log.info(f"Saved workflow rewrite checkpoint with ID: {checkpoint_id}")
        return checkpoint_id
    except Exception as e:
        log.error(f"Failed to save checkpoint before modification: {str(e)}")
        return None

def tool_error_function(ctx: RunContextWrapper[Any], error: Exception) -> str:
    """The default tool error function, which just returns a generic error message."""
    # return f"An error occurred while running the tool. Please try again. Error: {str(error)}"
    return json.dumps({"error": str(error)}, ensure_ascii= False)

# def update_workflow(session_id: str, workflow_data: Union[Dict[str, Any], str]) -> str:
@function_tool
def update_workflow(workflow_data: str = "") -> str:
    """
    更新当前session的工作流数据

    Args:
        workflow_data: 工作流数据，必须是严格的json格式字符串

    Returns:
        str: 更新后的工作流数据
    """
    try:
        session_id = get_session_id()
        if not session_id:
            return json.dumps({"error": "No session_id found in context"})
        
        if not workflow_data or not isinstance(workflow_data, str) or not workflow_data.strip():
            rewrite_context = get_rewrite_context()
            log.info(f"[update_workflow] workflow_data: {workflow_data}, trigger simple rewrite, context: {rewrite_context}")
            workflow_data = rewrite_workflow_simple(rewrite_context)
            
        
        log.info(f"[update_workflow] workflow_data: {workflow_data}")
        # 在修改前保存checkpoint
        checkpoint_id = save_checkpoint_before_modification(session_id, "workflow update")
        
        # 解析JSON字符串
        workflow_dict = json.loads(workflow_data) if isinstance(workflow_data, str) else workflow_data
        
        version_id = save_workflow_data(
            session_id,
            workflow_dict,
            attributes={"action": "workflow_rewrite", "description": "Workflow structure fixed by rewrite agent"}
        )
        
        # 构建返回数据，包含checkpoint信息
        ext_data = [{
            "type": "workflow_update",
            "data": {
                "workflow_data": workflow_dict
            }
        }]
        
        # 如果成功保存了checkpoint，添加修改前的checkpoint信息（给用户消息）
        if checkpoint_id:
            ext_data.append({
                "type": "workflow_rewrite_checkpoint",
                "data": {
                    "checkpoint_id": checkpoint_id,
                    "checkpoint_type": "workflow_rewrite_start"
                }
            })
        
        if version_id:
            ext_data.append({
                "type": "workflow_rewrite_complete",
                "data": {
                    "version_id": version_id,
                    "checkpoint_type": "workflow_rewrite_complete"
                }
            })
        
        return json.dumps({
            "success": True,
            "version_id": version_id,
            "message": f"Workflow updated successfully with version ID: {version_id}",
            "ext": ext_data
        })
    except Exception as e:
        log.error(f"Failed to update workflow: {str(e)}")
        return json.dumps({"error": f"Failed to update workflow: {str(e)}. Please try regenerating the workflow and then update again."})

@function_tool
def remove_node(node_id: str) -> str:
    """从工作流中移除节点"""
    try:
        session_id = get_session_id()
        if not session_id:
            return json.dumps({"error": "No session_id found in context"})
        
        # 在修改前保存checkpoint
        checkpoint_id = save_checkpoint_before_modification(session_id, f"remove node {node_id}")
        
        workflow_data = get_workflow_data(session_id)
        if not workflow_data:
            return json.dumps({"error": "No workflow data found"})
        
        if node_id not in workflow_data:
            return json.dumps({"error": f"Node {node_id} not found"})
        
        # 移除节点
        removed_node = workflow_data.pop(node_id)
        
        # 移除所有指向该节点的连接
        for other_node_id, node_data in workflow_data.items():
            inputs = node_data.get("inputs", {})
            for input_name, input_value in list(inputs.items()):
                if isinstance(input_value, list) and len(input_value) == 2:
                    if str(input_value[0]) == node_id:
                        # 移除这个连接
                        del inputs[input_name]
        
        # 保存更新
        version_id = save_workflow_data(
            session_id,
            workflow_data,
            attributes={
                "action": "remove_node",
                "description": f"Removed node {node_id}",
                "changes": {
                    "node_id": node_id,
                    "removed_node": removed_node
                }
            }
        )
        
        # 构建返回数据，包含checkpoint信息
        ext_data = [{
            "type": "workflow_update",
            "data": {
                "workflow_data": workflow_data,
                "changes": {
                    "action": "remove_node",
                    "node_id": node_id,
                    "removed_node": removed_node
                }
            }
        }]
        
        # 如果成功保存了checkpoint，添加修改前的checkpoint信息（给用户消息）
        if checkpoint_id:
            ext_data.append({
                "type": "workflow_rewrite_checkpoint",
                "data": {
                    "checkpoint_id": checkpoint_id,
                    "checkpoint_type": "workflow_rewrite_start"
                }
            })
        
        # 添加修改后的版本信息（给AI响应）
        ext_data.append({
            "type": "workflow_rewrite_complete",
            "data": {
                "version_id": version_id,
                "checkpoint_type": "workflow_rewrite_complete"
            }
        })
        
        return json.dumps({
            "success": True,
            "version_id": version_id,
            "message": f"Removed node {node_id} and cleaned up connections",
            "ext": ext_data
        })
        
    except Exception as e:
        return json.dumps({"error": f"Failed to remove node: {str(e)}"})
