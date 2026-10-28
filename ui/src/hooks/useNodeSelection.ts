/*
 * @Author: ai-business-hql ai.bussiness.hql@gmail.com
 * @Date: 2025-04-11 16:37:05
 * @LastEditors: ai-business-hql ai.bussiness.hql@gmail.com
 * @LastEditTime: 2025-04-24 11:06:48
 * @FilePath: /comfyui_copilot/ui/src/hooks/useNodeSelection.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { useEffect } from 'react';
import { app } from '../utils/comfyapp';
import { useChatContext } from '../context/ChatContext';

export function useNodeSelection(enabled: boolean = true) {
  const { state, dispatch } = useChatContext();
  const { activeTab, screenState } = state;

  useEffect(() => {
    if (!enabled) return;

    const handleNodeSelection = (event: MouseEvent) => {
      // and only when in parameter-debug tab
      const isParameterDebugTab = activeTab === 'parameter-debug';
      const isChatTab = activeTab === 'chat';
      const isAllowedScreenParameterDebug = true;//!screenState || screenState.currentScreen === 0;
      
      if ((isChatTab) || (isAllowedScreenParameterDebug && isParameterDebugTab)) {
        const selectedNodes = app?.canvas?.selected_nodes;
        if (Object.keys(selectedNodes ?? {}).length) {
          dispatch({ type: 'SET_SELECTED_NODE', payload: Object.values(selectedNodes) });
        } else {
          dispatch({ type: 'SET_SELECTED_NODE', payload: null });
        }
      }
    };

    document.addEventListener("click", handleNodeSelection);
    return () => {
      document.removeEventListener("click", handleNodeSelection);
    };
  }, [dispatch, enabled, activeTab, screenState]);
} 