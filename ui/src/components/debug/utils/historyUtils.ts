// Copyright (C) 2025 AIDC-AI
// Licensed under the MIT License.

import { GeneratedImage } from '../types/parameterDebugTypes';
import { generateUUID } from '../../../utils/uuid';

// Constants
export const PARAM_DEBUG_HISTORY_KEY = 'parameter_debug_history';
export const MAX_HISTORY_ITEMS = 30;

// Interface for history item
export interface HistoryItem {
  id: string;
  timestamp: number;
  title: string;
  nodeName: string;
  params: {[key: string]: any};
  generatedImages: GeneratedImage[];
  totalCount: number;
  workflow?: any; // Optional workflow data
}

/**
 * Save a new history item to localStorage
 */
export const saveHistoryItem = async (
  nodeName: string,
  params: {[key: string]: any},
  generatedImages: GeneratedImage[],
  totalCount: number,
  workflow?: any
) => {
  try {
    // Get existing history
    const history = loadHistoryItems();
    
    // Create new history item
    const newItem: HistoryItem = {
      id: generateUUID(),
      timestamp: Date.now(),
      title: formatNodeNameWithParams(nodeName, params),
      nodeName,
      params: {
        ...params,
        nodeNames: { 
          ...(params.nodeNames || {}),
          [nodeName.split('<')[0]]: nodeName.split('<')[0]
        }
      },
      generatedImages,
      totalCount,
      workflow
    };
    
    // Add new item to the beginning of the array (newest first)
    history.unshift(newItem);
    
    // Keep only the most recent MAX_HISTORY_ITEMS
    if (history.length > MAX_HISTORY_ITEMS) {
      history.splice(MAX_HISTORY_ITEMS);
    }
    
    // Save back to localStorage
    localStorage.setItem(PARAM_DEBUG_HISTORY_KEY, JSON.stringify(history));
    
    return newItem;
  } catch (error) {
    console.error('Error saving parameter debug history:', error);
    return null;
  }
};

/**
 * Load all history items from localStorage
 */
export const loadHistoryItems = (): HistoryItem[] => {
  try {
    const savedHistory = localStorage.getItem(PARAM_DEBUG_HISTORY_KEY);
    if (savedHistory) {
      return JSON.parse(savedHistory);
    }
  } catch (error) {
    console.error('Error loading parameter debug history:', error);
  }
  return [];
};

/**
 * Get a specific history item by ID
 */
export const getHistoryItemById = (id: string): HistoryItem | null => {
  try {
    const history = loadHistoryItems();
    return history.find(item => item.id === id) || null;
  } catch (error) {
    console.error('Error getting history item:', error);
    return null;
  }
};

/**
 * Clear all history items
 */
export const clearHistory = () => {
  try {
    localStorage.removeItem(PARAM_DEBUG_HISTORY_KEY);
  } catch (error) {
    console.error('Error clearing parameter debug history:', error);
  }
};

/**
 * Format date for display
 */
export const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

/**
 * Format node name and parameters for display
 */
export const formatNodeNameWithParams = (
  nodeName: string,
  params: {[key: string]: any} | null | undefined
): string => {
  params = params || {};

  // Check if we have nodeParams structure which contains node-to-params mapping
  if (params.nodeParams) {
    const nodeParamsEntries = Object.entries(params.nodeParams);
    
    // Format each node with its parameters
    const nodeStrings = nodeParamsEntries.map(([nodeId, nodeParams]) => {
      // Get node name from selectedNodeInfoMap if available
      let displayNodeName = nodeName;
      if (params.selectedNodeInfoMap && params.selectedNodeInfoMap[nodeId]) {
        displayNodeName = params.selectedNodeInfoMap[nodeId];
      }
      
      // Get parameter names for this node (up to 3)
      const paramNames = Object.keys(nodeParams as object).slice(0, 3);
      
      // Format as node_name<param1,param2,param3>
      return `${displayNodeName}<${paramNames.join(',')}>`;
    });
    
    // Join all nodes with semicolons
    return nodeStrings.join(';');
  }
  
  // Fallback to basic format if nodeParams not available
  // Get up to 3 parameter names (not values)
  const paramKeys = Object.keys(params).filter(key => key !== 'nodeParams' && key !== 'selectedNodeInfoMap').slice(0, 3);
  
  // Format as node_name<param1,param2,param3>
  return `${nodeName}<${paramKeys.join(',')}>`;
}; 