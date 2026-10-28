// Copyright (C) 2025 AIDC-AI
// Licensed under the MIT License.

import { WorkflowChatAPI } from '../../../apis/workflowChatApi';
import { queuePrompt, getOutputImageByPromptId, getOnlyOneImageNode } from '../../../utils/queuePrompt';
import { generateDynamicParams, PARAMETER_DEBUG_PLACEHOLDER_IMAGE } from './parameterUtils';
import { saveHistoryItem } from './historyUtils';
import { StateKey } from '../ParameterDebugInterfaceNew';

/**
 * 处理启动图像生成过程
 */
export const handleStartGeneration = async (
  paramTestValues: {[nodeId: string]: {[paramName: string]: any[]}},
  task_id: string,
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>,
  pollingSessionIdRef: React.MutableRefObject<string | null>,
  pollingTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>,
  generateParameterCombinations: (paramTestValues: {[nodeId: string]: {[paramName: string]: any[]}}) => any[],
  app: any,
  updateState: (key: StateKey, value: any) => void,
  event?: React.MouseEvent,
  selectedNodeId?: number
) => {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  
  // Clean up any existing polling
  cleanupPolling(pollingTimeoutRef, pollingSessionIdRef);
  
  // Get parameter combinations
  const paramCombinations = generateParameterCombinations(paramTestValues);
  const totalCombinations = paramCombinations.length;
  
  // Check if total runs exceed 100
  if (totalCombinations > 100) {
    setErrorMessage(`Cannot generate more than 100 images at once (currently: ${totalCombinations} images)`);
    return;
  }
  
  setErrorMessage(null);
  updateState(StateKey.IsProcessing, true);
  updateState(StateKey.CompletedCount, 0)
  
  console.log("Generated parameter combinations:", paramCombinations);

  // Get workflow data for history
  let workflowData = null;
  try {
    workflowData = (await app.graphToPrompt()).output;
  } catch (error) {
    console.error("Error capturing workflow data:", error);
  }

  // Send tracking event
  WorkflowChatAPI.trackEvent({
    event_type: 'start_generation',
    message_type: 'parameter_debug',
    message_id: task_id,
    data: {
      workflow: workflowData,
      all_params: paramTestValues,
      count: totalCombinations
    }
  });
  
  // If we have no combinations, show error and return
  if (paramCombinations.length === 0) {
    setErrorMessage("No valid parameter combinations found. Please check your parameter selections.");
    updateState(StateKey.IsProcessing, false);
    return;
  }
  
  // Get node ID to use for showing images - Use provided selectedNodeId if available
  let showNodeId: number | null = selectedNodeId || null;
  // If no selectedNodeId provided, try to get one automatically
  if (showNodeId === null) {
    const nodeId = getOnlyOneImageNode();
    if (nodeId !== null) {
      showNodeId = nodeId;
    }
  }
  
  console.log('showNodeId-->', showNodeId, selectedNodeId)
  // If showNodeId is null, we need user selection (handled in ConfirmConfigurationScreen)
  if (showNodeId === null) {
    setErrorMessage("Please select a SaveImage or PreviewImage node first.");
    updateState(StateKey.IsProcessing, false);
    return;
  }
  
  // Get the actual selected node names for history record
  // This will map node IDs to their actual node types/names
  const selectedNodeInfoMap: {[nodeId: string]: string} = {};
  
  // Get node IDs from paramTestValues keys (these are the nodes user selected for testing)
  Object.keys(paramTestValues).forEach((nodeId) => {
    // Get node type from app.graph
    const node = app.graph._nodes_by_id[nodeId];
    if (node) {
      // Store node type/class as name
      selectedNodeInfoMap[nodeId] = node.type || node.comfyClass || "Unknown Node";
    }
  });
  
  const prompt_ids: string[] = [];
  try {
    // Generate a unique session ID
    const sessionId = Date.now().toString();
    pollingSessionIdRef.current = sessionId;
    
    // Each combination represents all parameters for a single image generation
    for (const combination of paramCombinations) {
      const response = await queuePrompt(combination);
      if (response.prompt_id) {
          prompt_ids.push(response.prompt_id);
      } else {
          console.error("Failed to get prompt_id from response:", response);
          prompt_ids.push("");
      }
    }

    // Create an array to track images and their parameters
    const newImages: any[] = Array(paramCombinations.length).fill(null).map((_, i) => ({
      url: PARAMETER_DEBUG_PLACEHOLDER_IMAGE, // Default placeholder
      params: generateDynamicParams(paramTestValues, i)
    }));
    
    // Set initial images
    updateState(StateKey.GeneratedImages, newImages);
    // Track timeout
    const startTime = Date.now();
    const timeoutDuration = 5 * 60 * 1000; // 5 minutes
    
    // Get primary selected node name for display
    // We use the first node from paramTestValues as the primary node name
    const primaryNodeId = Object.keys(paramTestValues)[0];
    const primaryNodeName = selectedNodeInfoMap[primaryNodeId] || "Unknown Node";

    const finished_ids = {}
    // Start polling for images
    pollForImages(
      prompt_ids,
      showNodeId,
      newImages,
      sessionId,
      startTime,
      timeoutDuration,
      pollingSessionIdRef,
      pollingTimeoutRef,
      updateState,
      finished_ids,
      primaryNodeName,
      paramTestValues,
      totalCombinations,
      workflowData,
      selectedNodeInfoMap
    );
  } catch (error) {
    console.error("Error generating images:", error);
    updateState(StateKey.IsProcessing, false);
  }
};

/**
 * 处理图像轮询逻辑
 */
export const pollForImages = async (
  prompt_ids: string[],
  showNodeId: number,
  newImages: any[],
  sessionId: string,
  startTime: number,
  timeoutDuration: number,
  pollingSessionIdRef: React.MutableRefObject<string | null>,
  pollingTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>,
  updateState: (key: StateKey, value: any) => void,
  finished_ids: Record<string, boolean>,
  nodeName?: string,
  paramTestValues?: {[nodeId: string]: {[paramName: string]: any[]}},
  totalCount?: number,
  workflowData?: any,
  selectedNodeInfoMap?: {[nodeId: string]: string}
) => {
  // Check if this polling session is still active
  if (pollingSessionIdRef.current !== sessionId) {
    console.log("Another polling session has started, stopping this one");
    return;
  }
  // Check if timeout has been reached or has no avaiable promptId
  if (Date.now() - startTime > timeoutDuration) {
    console.log("Timeout reached while waiting for images");
    if (pollingSessionIdRef.current === sessionId) {
      updateState(StateKey.IsProcessing, false);
      updateState(StateKey.IsCompleted, true);
      updateState(StateKey.CurrentPage, 1);
      
      // Save to history even if timeout occurred
      if (newImages.length > 0 && nodeName && paramTestValues) {
        // Use the first image's params which contains nodeParams with full structure
        // This ensures we have the node-parameter relationships
        const params = newImages[0].params;
        
        // If we have selectedNodeInfoMap, add it to params for formatNodeNameWithParams to use
        if (selectedNodeInfoMap) {
          params.selectedNodeInfoMap = selectedNodeInfoMap;
        }
        
        // Save to history with current node name and parameters
        saveHistoryItem(
          nodeName,
          params,
          newImages,
          totalCount || newImages.length,
          workflowData
        );
      }
    }
    return;
  }
  
  let completedImagesCount = Object.keys(finished_ids)?.length || 0;

  // Check each prompt id to see if images are ready
  for (let i = 0; i < prompt_ids.length; i++) {
    const promptId = prompt_ids[i];
    if (!promptId || finished_ids[promptId]) continue;
    
    try {
      // We've already verified showNodeId is not null at this point
      const imageUrl = await getOutputImageByPromptId(promptId, Number(showNodeId));
      
      if (imageUrl) {
        // If we have an image URL, update in our array
        newImages[i] = {
          ...newImages[i],
          url: imageUrl
        };
        finished_ids[promptId] = true
        completedImagesCount++;
      }
    } catch (error) {
      console.error(`Error fetching image for prompt ID ${promptId}:`, error);
    }
  }
  
  // Update state with newest images
  updateState(StateKey.GeneratedImages, [...newImages]);
  updateState(StateKey.CompletedCount, completedImagesCount)
  
  // Check if all images are generated or failed
  if (completedImagesCount === prompt_ids.length) {
    console.log("All images have been generated!");
    if (pollingSessionIdRef.current === sessionId) {
      updateState(StateKey.IsProcessing, false);
      updateState(StateKey.IsCompleted, true);  
      updateState(StateKey.CurrentPage, 1);
      
      // Save to history when all images are completed
      if (newImages.length > 0 && nodeName && paramTestValues) {
        // Use the first image's params which contains nodeParams with full structure
        // This ensures we have the node-parameter relationships
        const params = newImages[0].params;
        
        // If we have selectedNodeInfoMap, add it to params for formatNodeNameWithParams to use
        if (selectedNodeInfoMap) {
          params.selectedNodeInfoMap = selectedNodeInfoMap;
        }
        
        // Save to history with current node name and parameters
        saveHistoryItem(
          nodeName,
          params,
          newImages,
          totalCount || newImages.length,
          workflowData
        );
      }
    }
    return;
  }
  
  // Otherwise continue polling
  if (pollingSessionIdRef.current === sessionId) {
    pollingTimeoutRef.current = setTimeout(() => {
      pollForImages(
        prompt_ids,
        showNodeId,
        newImages,
        sessionId,
        startTime,
        timeoutDuration,
        pollingSessionIdRef,
        pollingTimeoutRef,
        updateState,
        finished_ids,
        nodeName,
        paramTestValues,
        totalCount,
        workflowData,
        selectedNodeInfoMap
      );
    }, 2000); // Poll every 2 seconds
  }
};

/**
 * 清理轮询超时
 */
export const cleanupPolling = (
  pollingTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>,
  pollingSessionIdRef: React.MutableRefObject<string | null>
) => {
  if (pollingTimeoutRef.current) {
    clearTimeout(pollingTimeoutRef.current);
    pollingTimeoutRef.current = null;
  }
  pollingSessionIdRef.current = null;
}; 