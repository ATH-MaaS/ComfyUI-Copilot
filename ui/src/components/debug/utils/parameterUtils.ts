// Copyright (C) 2025 AIDC-AI
// Licensed under the MIT License.

// Local SVG placeholder keeps pending/failed generations independent of external image hosts.
const placeholderSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
    <rect width="100%" height="100%" fill="#f3f4f6" />
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#6b7280" font-family="sans-serif" font-size="16">Image pending</text>
  </svg>`;
export const PARAMETER_DEBUG_PLACEHOLDER_IMAGE = `data:image/svg+xml,${encodeURIComponent(placeholderSvg)}`;

// 生成数值类型的测试参数
export const generateNumericTestValues = (
  min: number, 
  max: number, 
  step: number, 
  precision: number = 0
): number[] => {
  // Ensure all parameters have valid values
  min = isNaN(min) ? 0 : min;
  max = isNaN(max) ? 100 : max;
  step = isNaN(step) || step <= 0 ? 1 : step;
  
  // Add minimum step check
  if (step < 0.1) {
    step = 0.1;
  }
  
  // Ensure max >= min
  if (max < min) {
    max = min;
  }
  
  // Calculate count based on the actual step
  const count = Math.floor((max - min) / step) + 1;
  if (count <= 1) return [min];
  
  // Generate values based on the actual step
  const values = [];
  let current = min;
  if (count <= 10){
    while (current <= max && values.length <= 10) {
      // Apply precision based on the parameter
      const factor = Math.pow(10, precision);
      const roundedValue = Math.round(current * factor) / factor;
      
      values.push(roundedValue);
      current += step;
    }
  }
  else{
    // For large ranges, generate evenly distributed values
    const range = max - min;
    const step = range / 9; // 9 steps to get 10 values
    
    for (let i = 0; i <= 9; i++) {
      // Calculate the value at this position
      const value = min + (step * i);
      
      // Apply precision
      const factor = Math.pow(10, precision);
      const roundedValue = Math.round(value * factor) / factor;
      
      values.push(roundedValue);
    }
  }
  
  return values;
};

// WidgetParamConf接口定义
export interface WidgetParamConf {
  nodeId: number;
  paramName: string;
  paramValue: string;
}

// 生成所有参数组合
export const generateParameterCombinations = (
  paramTestValues: {[nodeId: string]: {[paramName: string]: any[]}}
): WidgetParamConf[][] => {
  // First, we need to get all the different parameter combinations
  const result: WidgetParamConf[][] = [];
  
  // Create a list of all parameter combinations for each node
  const nodeParamCombinations: {[nodeId: string]: Array<WidgetParamConf[]>} = {};
  
  // For each node, generate all combinations of its parameters
  Object.keys(paramTestValues).forEach(nodeIdStr => {
    const nodeId = parseInt(nodeIdStr);
    const nodeParams = paramTestValues[nodeIdStr] || {};
    
    // Get all parameter names that have values
    const paramNames = Object.keys(nodeParams).filter(
      paramName => nodeParams[paramName] && nodeParams[paramName].length > 0
    );
    
    if (paramNames.length === 0) return;
    
    // Create all possible combinations of parameter values for this node
    const combinations: WidgetParamConf[][] = [[]];
    
    // For each parameter, create combinations with all its values
    paramNames.forEach(paramName => {
      const values = nodeParams[paramName];
      const newCombinations: WidgetParamConf[][] = [];
      
      // For each existing combination
      combinations.forEach(combo => {
        // For each value of the current parameter
        values.forEach(value => {
          // Create a new combination by adding this parameter value
          const newCombo = [...combo, {
            nodeId,
            paramName,
            paramValue: String(value)
          }];
          newCombinations.push(newCombo);
        });
      });
      
      // Replace combinations with the new ones
      combinations.length = 0;
      combinations.push(...newCombinations);
    });
    
    // Store all combinations for this node
    nodeParamCombinations[nodeIdStr] = combinations;
  });
  
  // If no nodes have parameters, return empty result
  if (Object.keys(nodeParamCombinations).length === 0) {
    return result;
  }
  
  // If there's only one node, return its combinations directly
  if (Object.keys(nodeParamCombinations).length === 1) {
    const nodeId = Object.keys(nodeParamCombinations)[0];
    return nodeParamCombinations[nodeId];
  }
  
  // For multiple nodes, we need to create combinations across nodes
  const nodeIds = Object.keys(nodeParamCombinations);
  
  // Start with combinations from the first node
  let allCombinations = nodeParamCombinations[nodeIds[0]];
  
  // For each additional node, create combinations with all previous nodes
  for (let i = 1; i < nodeIds.length; i++) {
    const nodeCombinations = nodeParamCombinations[nodeIds[i]];
    const newCombinations: WidgetParamConf[][] = [];
    
    // For each existing combination across previous nodes
    allCombinations.forEach(existingCombo => {
      // For each combination from the current node
      nodeCombinations.forEach(nodeCombo => {
        // Combine them
        newCombinations.push([...existingCombo, ...nodeCombo]);
      });
    });
    
    // Update all combinations
    allCombinations = newCombinations;
  }
  
  return allCombinations;
};

// Generate dynamic parameters for a specific combination index
export const generateDynamicParams = (
  paramTestValues: {[nodeId: string]: {[paramName: string]: any[]}}, 
  index: number
) => {
  // Create object to store dynamic parameters
  const dynamicParams: { 
    [key: string]: any,
    nodeParams?: {[nodeId: string]: {[paramName: string]: any}}
  } = {};
  
  // Initialize nodeParams structure
  dynamicParams.nodeParams = {};
  
  // Get all parameter combinations
  const allCombinations = generateParameterCombinations(paramTestValues);
  
  // Use the index to select a specific combination
  if (index < allCombinations.length) {
    const selectedCombination = allCombinations[index];
    
    // Process each parameter in the combination
    selectedCombination.forEach(param => {
      const nodeId = param.nodeId.toString();
      const paramName = param.paramName;
      const paramValue = param.paramValue;
      
      // Initialize node if needed
      if (!dynamicParams.nodeParams![nodeId]) {
        dynamicParams.nodeParams![nodeId] = {};
      }
      
      // Add to nodeParams structure
      dynamicParams.nodeParams![nodeId][paramName] = paramValue;
      
      // Also add to flat structure for backwards compatibility and display
      dynamicParams[paramName] = paramValue;
    });
  }
  
  return dynamicParams;
}; 