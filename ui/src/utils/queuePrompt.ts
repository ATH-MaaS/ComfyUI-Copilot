import { getHistory, runPrompt } from "../apis/comfyApiCustom";
import { api, app } from "../utils/comfyapp";

export type WidgetParamConf = {
    nodeId: number;
    paramName: string;
    paramValue: string;
}

function updatePrompt(prompt_output: any, paramConfigs: WidgetParamConf[]): any {
    try {
        if (!prompt_output) {
            console.error("Invalid prompt_output: ", prompt_output);
            return prompt_output;
        }
        
        // Apply each parameter configuration
        for (const config of paramConfigs) {
            if (!prompt_output[config.nodeId]) {
                console.error(`Node with ID ${config.nodeId} not found`);
                continue;
            }
            
            if (!prompt_output[config.nodeId]["inputs"]) {
                console.error(`Inputs not found for node with ID ${config.nodeId}`);
                continue;
            }
            
            // Update each parameter for this node
            prompt_output[config.nodeId]["inputs"][config.paramName] = config.paramValue;
            
        }
        
        return prompt_output;
    } catch (error) {
        console.error("Error updating prompt:", error);
        return prompt_output;
    }
}

export async function queuePrompt(paramConfigs: WidgetParamConf[]): Promise<any> {
    const prompt = await app.graphToPrompt()
    const updated_prompt = updatePrompt(prompt.output, paramConfigs)
    console.log("queuePrompt updated_prompt:", updated_prompt);
    const request_body = {
        prompt: updated_prompt,
        client_id: app.api.clientId,
        extra_data: {
            extra_pageinfo: {
                workflow: prompt.workflow,
            }
        }
    }
    console.debug("queuePrompt request_body.prompt:", updated_prompt);
    const response = await runPrompt(request_body);
    console.debug("queuePrompt response:", response);
    return response;
}

function createErrorImage(errorMessage: string): string {
  // Create a data URL for an error image with the provided error message
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Set canvas dimensions
  canvas.width = 512;
  canvas.height = 512;
  
  if (ctx) {
    // Fill background
    ctx.fillStyle = '#f8d7da';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw border
    ctx.strokeStyle = '#dc3545';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    
    // Draw error icon
    ctx.fillStyle = '#dc3545';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, 150, 50, 0, 2 * Math.PI);
    ctx.fill();
    
    // Draw exclamation mark
    ctx.fillStyle = 'white';
    ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', canvas.width / 2, 150);
    
    // Draw error text
    ctx.fillStyle = '#721c24';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Handle multi-line text
    const maxWidth = canvas.width - 60;
    const lineHeight = 30;
    const words = errorMessage.split(' ');
    let line = '';
    let y = 250;
    
    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      
      if (testWidth > maxWidth && i > 0) {
        ctx.fillText(line, canvas.width / 2, y);
        line = words[i] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, canvas.width / 2, y);
  }
  
  return canvas.toDataURL('image/png');
}

export async function getOutputImagesByPromptId(promptId: string): Promise<{[nodeId: string]: string[]}> {
    try {
      if(!promptId || promptId === "") {
        console.log("No prompt ID provided");
        return { "1": [createErrorImage("Fail to generate prompt ID")] };
      }
  
      // Get the history for the prompt
      const history = await getHistory(promptId);
      
      if (!history || !history[promptId]) {
        console.log("Not finished for prompt ID:", promptId);
        return {};
      }

      const promptHistory = history[promptId];
      if(promptHistory.status && promptHistory.status.status_str === "error") {
        console.error("Error for prompt ID:", promptId);
        const messages = promptHistory.status.messages;
        if(messages && messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if(lastMessage && lastMessage.length > 0) {
                const errorMessage = lastMessage[0];
                // Return an error image with the error message
                const errorImage = createErrorImage(errorMessage);
                return { "1": [errorImage] }; // Return with default nodeId of 1
            }
        }
      }
      
      const outputImages: {[nodeId: string]: string[]} = {};
      
      // Process all outputs in the history
      if (promptHistory.outputs) {
        for (const nodeId in promptHistory.outputs) {
          const nodeOutput = promptHistory.outputs[nodeId];
          if (nodeOutput && nodeOutput.images) {
            outputImages[nodeId] = [];
            
            // Process each image for this node
            for (const img of nodeOutput.images) {
              if (img && img.filename && img.type) {
                const viewUrl = api?.apiURL?.("/view");
                if (!viewUrl) continue;

                const query = new URLSearchParams({
                  filename: img.filename,
                  type: img.type,
                });
                if (img.subfolder) query.set("subfolder", img.subfolder);
                outputImages[nodeId].push(`${viewUrl}?${query.toString()}`);
              }
            }
            
            console.log("outputImages for nodeId:", nodeId, outputImages[nodeId]);
          }
        }
      }
      
      return outputImages;
    } catch (error) {
      console.error("Error getting output images from prompt:", error);
      throw error;
    }
  }

// Define node interface for type safety
interface ComfyNode {
  id: number;
  type: string;
  [key: string]: any;
}

export function getOnlyOneImageNode() {
  const nodes = Object.values(app.graph._nodes_by_id) as ComfyNode[];
  const saveNodeIds = [];
  const previewNodeIds = [];
  
  for(const node of nodes) {
    if(node.type === "SaveImage") {
      saveNodeIds.push(node.id);
    } else if(node.type === "PreviewImage") {
      previewNodeIds.push(node.id);
    }
  }
  console.log("saveNodeIds:", saveNodeIds);
  console.log("previewNodeIds:", previewNodeIds);
  if(saveNodeIds.length === 0 && previewNodeIds.length === 0) {
    throw new Error("No SaveImage or PreviewImage node found, please add one to the graph");
  }
  if(saveNodeIds.length === 1) {
    return saveNodeIds[0];
  } else if(saveNodeIds.length == 0 && previewNodeIds.length === 1) {
    return previewNodeIds[0];
  } else {
    // Return all node IDs as an array so the UI can handle selection
    return null;
  }
}

export async function getOutputImageByPromptId(promptId: string, nodeId: Number): Promise<string | null> {
    const outputImages = await getOutputImagesByPromptId(promptId);
    // If no images were found, return an empty array
    if (Object.keys(outputImages).length === 0) {
        return null;
    }
    
    // Find the maximum nodeId
    // const nodeIds = Object.keys(outputImages).map(id => parseInt(id));
    // const maxNodeId = Math.max(...nodeIds).toString();
    
    if (outputImages[nodeId.toString()] && outputImages[nodeId.toString()].length > 0) {
      return outputImages[nodeId.toString()][0];
    }
    
    return null;
}