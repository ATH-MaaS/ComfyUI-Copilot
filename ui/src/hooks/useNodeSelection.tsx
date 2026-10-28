import { useEffect } from 'react';
import { app } from '../utils/comfyapp';
import { useChatContext } from '../context/ChatContext';

export function useNodeSelection(enabled: boolean = true) {
  const { dispatch } = useChatContext();

  useEffect(() => {
    if (!enabled) return;
    
    const handleNodeSelected = () => {
      const selectedNodes = app?.canvas?.selected_nodes;
      if (!selectedNodes || Object.keys(selectedNodes).length === 0) {
        dispatch({ type: 'SET_SELECTED_NODE', payload: null });
        return;
      }

      // Get the first selected node
      // const selectedNodeId = Object.keys(app.canvas.selected_nodes)[0];
      // const selectedNode = app.canvas.selected_nodes[selectedNodeId];
      
      // if (!selectedNode) return;
      
      // Extract node information
      // const nodeInfo = {
      //   id: selectedNodeId,
      //   title: selectedNode.title,
      //   type: selectedNode.type,
      //   comfyClass: selectedNode.comfyClass || selectedNode.type,
      //   widgets: selectedNode.widgets,
      //   properties: selectedNode.properties,
      //   inputs: selectedNode.inputs,
      //   outputs: selectedNode.outputs
      // };
      
      dispatch({ type: 'SET_SELECTED_NODE', payload: Object.values(selectedNodes) });
    };

    // Listen for selection events
    document.addEventListener('comfy:node_selected', handleNodeSelected);
    return () => {
      document.removeEventListener('comfy:node_selected', handleNodeSelected);
    };
  }, [dispatch, enabled]);
} 