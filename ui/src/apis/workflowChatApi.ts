/*
 * @Author: ai-business-hql qingli.hql@alibaba-inc.com
 * @Date: 2025-06-24 16:29:05
 * @LastEditors: ai-business-hql ai.bussiness.hql@gmail.com
 * @LastEditTime: 2025-10-15 14:49:15
 * @FilePath: /comfyui_copilot/ui/src/apis/workflowChatApi.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
// Copyright (C) 2025 AIDC-AI
// Licensed under the MIT License.

import { config } from '../config'
import { fetchApi } from "../Api";
import { Message, ChatResponse, OptimizedWorkflowRequest, OptimizedWorkflowResponse, Node, ExtItem, TrackEventRequest } from "../types/types";
import { generateUUID } from '../utils/uuid';
import { encryptWithRsaPublicKey } from '../utils/crypto';
import { app } from '../utils/comfyapp';

const BASE_URL = config.apiBaseUrl

const getApiKey = () => {
    const apiKey = localStorage.getItem('chatApiKey');
    if (!apiKey) {
        // alert('API key is required. Please set your API key first.');
        // throw new Error('API key is required. Please set your API key first.');
    }
    return apiKey;
};

const setApiKey = (apiKey: string) => {
    localStorage.setItem('chatApiKey', apiKey);
};

// Get OpenAI configuration from localStorage
const getOpenAiConfig = () => {
    const openaiApiKey = localStorage.getItem('openaiApiKey');
    const openaiBaseUrl = localStorage.getItem('openaiBaseUrl');
    const rsaPublicKey = localStorage.getItem('rsaPublicKey');
    const workflowLLMApiKey = localStorage.getItem('workflowLLMApiKey');
    const workflowLLMBaseUrl = localStorage.getItem('workflowLLMBaseUrl');
    const workflowLLMModel = localStorage.getItem('workflowLLMModel');
    
    return { 
        openaiApiKey: openaiApiKey || '', 
        openaiBaseUrl: openaiBaseUrl || '', 
        rsaPublicKey,
        workflowLLMApiKey: workflowLLMApiKey || '',
        workflowLLMBaseUrl: workflowLLMBaseUrl || '',
        workflowLLMModel: workflowLLMModel || '',
    };
};

// Get browser language
const getBrowserLanguage = () => {
    return navigator.language || 'zh-CN'; // Default to Chinese if language is not available
};

// Add this helper function after getOpenAiConfig()
const checkAndSaveApiKey = (response: Response) => {
  const apiKeyFromHeader = response.headers.get('User-Api-Key');
  if (apiKeyFromHeader && !localStorage.getItem('chatApiKey')) {
    localStorage.setItem('chatApiKey', apiKeyFromHeader);
  }
};



export namespace WorkflowChatAPI {
  export async function trackEvent(
    request: TrackEventRequest
  ): Promise<void> {
    try {
      // Use non-blocking fetch to avoid interrupting the main flow
      const apiKey = getApiKey();
      const browserLanguage = getBrowserLanguage();
      request.session_id = localStorage.getItem("sessionId") || null;
      fetch(`${BASE_URL}/api/chat/track_event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Authorization': `Bearer ${apiKey}`,
          'trace-id': generateUUID(),
          'Accept-Language': browserLanguage,
        },
        body: JSON.stringify(request),
      }).catch(err => {
        // Silently log errors without throwing exceptions
        console.warn('Track event failed:', err);
      });
    } catch (error) {
      // Catch any synchronous errors but don't interrupt the business flow
      console.warn('Error preparing track event:', error);
    }
    // Return immediately without waiting for the response
    return Promise.resolve();
  }
  
  
  // 把img文件存储到comfyUI本地
  export async function uploadImage(imageFile: File): Promise<{ name: string }> {
    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('type', 'input');

      const response = await fetchApi(`/upload/image`, {
        method: 'POST',
        headers: {
          'Accept': '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Cache-Control': 'max-age=0',
          'Comfy-User': '',
          'Origin': BASE_URL,
          'Referer': `${BASE_URL}/`,
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  }

  export async function* streamInvokeServer(
    sessionId: string, 
    prompt: string, 
    images: {url: string, name: string}[] = [], 
    intent: string | null = null, 
    ext: any | null = null,
    trace_id?: string,
    abortSignal?: AbortSignal,
    historyMessages: Message[] = [],
    userMessageId?: string
  ): AsyncGenerator<ChatResponse> {
    try {
      const apiKey = getApiKey();
      const browserLanguage = app.extensionManager.setting.get('Comfy.Locale');
      const { openaiApiKey, openaiBaseUrl, rsaPublicKey, workflowLLMApiKey, workflowLLMBaseUrl, workflowLLMModel } = getOpenAiConfig();
      // Generate a unique message ID for this chat request
      const messageId = generateUUID();

      trackEvent({
        event_type: 'chat_request',
        message_type: 'chat',
        data: {
          prompt: prompt,
          ext: ext,
          intent: intent,
          messageId: messageId,
        }
      })

      // Convert frontend Message format to OpenAI format
      const openaiMessages = historyMessages.filter(msg => (msg.role !== 'showcase' && msg.role !== 'tool')).map(msg => {
        if (msg.role === 'user') {
          return {
            role: 'user',
            content: msg.content
          };
        } else if (msg.role === 'ai' || msg.role === 'assistant') {
          // For assistant messages, extract text from ChatResponse format if needed
          try {
            const parsed = JSON.parse(msg.content);
            return {
              role: 'assistant', 
              content: parsed.text || msg.content
            };
          } catch {
            return {
              role: 'assistant',
              content: msg.content
            };
          }
        }
        return {
          role: msg.role,
          content: msg.content
        };
      });

      // Create current user message with OpenAI multimodal format
      let currentUserMessage: any = {
        role: 'user',
        content: prompt
      };

      // If there are images, format according to OpenAI multimodal standard
      if (images && images.length > 0) {
        const content: any[] = [
          {
            type: 'input_text',
            text: prompt + ' Current image filenames: ' + images.map(image => image.name).join(', ')
          }
        ];

        // Add each image to the content array
        images.forEach(image => {
          if (image.url) {
            content.push({
              type: 'input_image',
              detail: 'low',
              image_url: 
                image.url
            });
          }
        });

        currentUserMessage.content = content;
      }

      // Add current message to OpenAI messages for the request
      const allOpenaiMessages = [...openaiMessages, currentUserMessage];

      // Handle ext parameter
      let finalExt = ext ? (Array.isArray(ext) ? ext : [ext]) : [];
      
      // Save current workflow checkpoint before invoking if userMessageId is provided
      let workflowCheckpointId: number | null = null;
      if (userMessageId) {
        try {
          console.log('Saving workflow checkpoint before invoke...');
          const workflowPrompt = await app.graphToPrompt();
          const checkpointData = await saveWorkflowCheckpointBeforeInvoke(
            sessionId,
            workflowPrompt.output,  // API format
            workflowPrompt.workflow,  // UI format
            userMessageId
          );
          workflowCheckpointId = checkpointData.checkpoint_id;
          console.log(`Successfully saved workflow checkpoint with ID: ${workflowCheckpointId}`);
        } catch (error) {
          console.error('Failed to save workflow checkpoint before invoke:', error);
          // Continue without checkpoint - the backend will handle missing workflow data appropriately
        }
      }
      
      // Prepare headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'accept': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Authorization': `Bearer ${apiKey}`,
        'trace-id': trace_id || generateUUID(),
        'Accept-Language': browserLanguage,
      };
      
      // Add OpenAI configuration headers if available
      if (openaiApiKey && openaiApiKey.trim() !== '' && rsaPublicKey) {
        try {
          headers['Openai-Base-Url'] = openaiBaseUrl;
        } catch (error) {
          console.error('Error encrypting OpenAI API key:', error);
        }
      }
      // Add Workflow LLM headers if available
      if (workflowLLMBaseUrl) {
        headers['Workflow-LLM-Base-Url'] = workflowLLMBaseUrl;
      }
      if (workflowLLMApiKey) {
        headers['Workflow-LLM-Api-Key'] = workflowLLMApiKey;
      }
      if (workflowLLMModel) {
        headers['Workflow-LLM-Model'] = workflowLLMModel;
      }
      
      // Create controller and combine with external signal if provided
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      
      // If an external abort signal is provided, listen to it
      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          controller.abort();
        });
      }

      let chatUrl = `/api/chat/invoke`
      if(intent && intent !== '') {
        chatUrl = `${BASE_URL}/api/chat/invoke`
      } else {
        headers['Openai-Api-Key'] = openaiApiKey;
      }
      const response = await fetch(chatUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          session_id: sessionId,
          prompt: prompt,
          mock: false,
          intent: intent,
          ext: finalExt,
          messages: allOpenaiMessages,
          images: [],  // 保持向后兼容，但现在图片已经在messages中
          workflow_checkpoint_id: workflowCheckpointId
        }),
        signal: controller.signal
      });
      
      // Clear the timeout since we got a response
      clearTimeout(timeoutId);
      
      checkAndSaveApiKey(response);
      
      const reader = response.body!.getReader();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += new TextDecoder().decode(value);
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            yield {
              ...JSON.parse(line) as ChatResponse,
              message_id: messageId
            };
          }
        }
      }

      if (buffer.trim()) {
        yield {
          ...JSON.parse(buffer) as ChatResponse,
          message_id: messageId
        };
      }
    } catch (error: unknown) {
      console.error('Error in streamInvokeServer:', error);
      if (error instanceof Error && error.name === 'AbortError') {
        // Check if it's a timeout or user-initiated abort
        if (abortSignal?.aborted) {
          // User-initiated abort, just throw silently
          throw error;
        } else {
          // Timeout
          alert('Request timed out after 2 minutes. Please try again.');
        }
      } else {
        alert(error instanceof Error ? error.message : 'An error occurred while streaming, please refresh the page and try again.');
      }
      throw error;
    }
  }

  export async function getOptimizedWorkflow(
    workflowId: number, 
    prompt: string
  ): Promise<OptimizedWorkflowResponse> {
    try {
      const apiKey = getApiKey();
      const browserLanguage = getBrowserLanguage();
      const { openaiApiKey, openaiBaseUrl, rsaPublicKey, workflowLLMApiKey, workflowLLMBaseUrl } = getOpenAiConfig();
      
      // Prepare headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'accept': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Authorization': `Bearer ${apiKey}`,
        'trace-id': generateUUID(),
        'Accept-Language': browserLanguage,
      };
      
      // Add OpenAI configuration headers if available
      if (openaiApiKey && openaiApiKey.trim() !== '' && rsaPublicKey) {
        try {
          const encryptedApiKey = await encryptWithRsaPublicKey(openaiApiKey as string, rsaPublicKey as string);
          headers['Encrypted-Openai-Api-Key'] = encryptedApiKey;
          headers['Openai-Base-Url'] = openaiBaseUrl;
        } catch (error) {
          console.error('Error encrypting OpenAI API key:', error);
        }
      }
      // Add Workflow LLM headers if available
      if (workflowLLMBaseUrl) {
        headers['Workflow-LLM-Base-Url'] = workflowLLMBaseUrl;
      }
      if (workflowLLMApiKey) {
        headers['Workflow-LLM-Api-Key'] = workflowLLMApiKey;
      }
      
      const response = await fetch(`${BASE_URL}/api/chat/get_optimized_workflow`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          workflow_id: workflowId,
          prompt: prompt
        } as OptimizedWorkflowRequest),
      });
      
      checkAndSaveApiKey(response);
      
      const result = await response.json();
      if (!result.success) {
        const message = result.message || 'Failed to get optimized workflow';
        alert(message);
        throw new Error(message);
      }

      return result.data as OptimizedWorkflowResponse;
    } catch (error) {
      console.error('Error getting optimized workflow:', error);
      alert(error instanceof Error ? error.message : 'Failed to get optimized workflow');
      throw error;
    }
  }

  export async function batchGetNodeInfo(nodeTypes: string[]): Promise<any> {
    const apiKey = getApiKey();
    const browserLanguage = getBrowserLanguage();
    const { openaiApiKey, openaiBaseUrl, rsaPublicKey, workflowLLMApiKey, workflowLLMBaseUrl } = getOpenAiConfig();
    
    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'trace-id': generateUUID(),
      'Accept-Language': browserLanguage,
    };
    
    // Add OpenAI configuration headers if available
    if (openaiApiKey && openaiApiKey.trim() !== '' && rsaPublicKey) {
      try {
        const encryptedApiKey = await encryptWithRsaPublicKey(openaiApiKey as string, rsaPublicKey as string);
        headers['Encrypted-Openai-Api-Key'] = encryptedApiKey;
        headers['Openai-Base-Url'] = openaiBaseUrl;
      } catch (error) {
        console.error('Error encrypting OpenAI API key:', error);
      }
    }
    // Add Workflow LLM headers if available
    if (workflowLLMBaseUrl) {
      headers['Workflow-LLM-Base-Url'] = workflowLLMBaseUrl;
    }
    if (workflowLLMApiKey) {
      headers['Workflow-LLM-Api-Key'] = workflowLLMApiKey;
    }
    
    const response = await fetch(`${BASE_URL}/api/chat/get_node_info_by_types`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        node_types: nodeTypes
      }),
    });
    
    checkAndSaveApiKey(response);
    
    const result = await response.json();
    if (!result.success) {
      const message = result.message || 'Failed to get node info by types';
      alert(message);
      throw new Error(message);
    }
    return result.data as Node[];
  }

  export async function fetchMessages(sessionId: string): Promise<Message[]> {
    try {
      // First check if we have cached messages in localStorage
      const cachedMessages = localStorage.getItem(`messages_${sessionId}`);
      if (cachedMessages) {
        console.log('Using cached messages from localStorage');
        return JSON.parse(cachedMessages) as Message[];
      }
      return [];
    } catch (error) {
      console.error('Error fetching messages:', error);
      alert(error instanceof Error ? error.message : 'Failed to fetch messages' + ', please refresh the page and try again.');
      throw error;
    }
  }

  export async function fetchAnnouncement(): Promise<string> {
    try {
      const apiKey = getApiKey();
      const browserLanguage = getBrowserLanguage();
      
      // Prepare headers
      const headers: Record<string, string> = {
        'accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'trace-id': generateUUID(),
        'Accept-Language': browserLanguage,
      };
      
      const response = await fetch(`${BASE_URL}/api/chat/announcement`, {
        method: 'GET',
        headers,
      });
      
      checkAndSaveApiKey(response);
      
      const result = await response.json();
      if (!result.success) {
        const message = result.message || 'Failed to fetch announcement';
        console.error(message);
        return '';
      }

      return result.data as string;
    } catch (error) {
      console.error('Error fetching announcement:', error);
      return '';
    }
  }

  export async function generateSDPrompts(text: string): Promise<string[]> {
    const maxRetries = 3;
    let retryCount = 0;
    let lastError: any;

    while (retryCount < maxRetries) {
      try {
        const apiKey = getApiKey();
        const browserLanguage = getBrowserLanguage();
        
        // Prepare headers
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'accept': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'trace-id': generateUUID(),
          'Accept-Language': browserLanguage,
        };
        
        const response = await fetch(`${BASE_URL}/api/param_debug/generate_sd_prompts`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            text: text
          }),
        });
        
        checkAndSaveApiKey(response);
        
        const result = await response.json();
        if (!result.success) {
          const message = result.message || 'Failed to generate SD prompts';
          throw new Error(message);
        }

        return result.data as string[];
      } catch (error) {
        lastError = error;
        retryCount++;
        
        if (retryCount >= maxRetries) {
          console.error(`Error generating SD prompts after ${maxRetries} attempts:`, error);
          throw error;
        }
        
        console.warn(`Attempt ${retryCount} failed, retrying... Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        // Wait with exponential backoff before retrying (500ms, 1000ms, 2000ms)
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, retryCount - 1)));
      }
    }

    // This should never be reached due to the throw in the loop, but TypeScript needs it
    throw lastError;
  }

  export async function listModels(): Promise<{ models: {label: string; name: string; image_enable: boolean }[] }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'accept': 'application/json',
      'trace-id': generateUUID(),
    };
    
    const openaiApiKey = localStorage.getItem('openaiApiKey');
    if (openaiApiKey) {
      headers['Openai-Api-Key'] = openaiApiKey;
    }
    
    const openaiBaseUrl = localStorage.getItem('openaiBaseUrl');
    if (openaiBaseUrl) {
      headers['Openai-Base-Url'] = openaiBaseUrl;
    }

    const response = await fetch('/api/model_config', {
      method: 'GET',
      headers: headers,
    });
    
    const result = await response.json();
    
    return result as { models: { label: string; name: string; image_enable: boolean }[] };
  }

  // Fetch models directly from an OpenAI-compatible LLM server via its /models endpoint
  export async function listModelsFromLLM(
    baseUrl: string,
    apiKey?: string
  ): Promise<string[]> {
    const headers: Record<string, string> = {
      'accept': 'application/json',
    };

    if (apiKey && apiKey.trim() !== '') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Normalize base URL to avoid double slashes
    const normalizedBase = baseUrl.replace(/\/$/, '');
    const url = `${normalizedBase}/models`;

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models from LLM: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    // Attempt to support multiple possible shapes
    // OpenAI style: { data: [{ id: string }, ...] }
    if (Array.isArray(result?.data)) {
      const ids = result.data
        .map((m: any) => (typeof m === 'string' ? m : (m?.id || m?.name)))
        .filter((v: any) => typeof v === 'string' && v.trim() !== '');
      return Array.from(new Set(ids));
    }

    // Alternate style: { models: [{ id/name }, ...] } or [ ... ]
    const modelsField = result?.models ?? result;
    if (Array.isArray(modelsField)) {
      const ids = modelsField
        .map((m: any) => (typeof m === 'string' ? m : (m?.id || m?.name)))
        .filter((v: any) => typeof v === 'string' && v.trim() !== '');
      return Array.from(new Set(ids));
    }

    // Single object with id/name
    const single = result?.id || result?.name;
    if (typeof single === 'string' && single.trim() !== '') {
      return [single];
    }

    // Fallback to empty list if shape is unrecognized
    return [];
  }

  export async function* streamDebugAgent(
    workflowData: any, 
    abortSignal?: AbortSignal
  ): AsyncGenerator<ChatResponse> {
    try {
      const { openaiApiKey, openaiBaseUrl, workflowLLMApiKey, workflowLLMBaseUrl, workflowLLMModel } = getOpenAiConfig();
      const browserLanguage = app.extensionManager.setting.get('Comfy.Locale');
      const session_id = localStorage.getItem("sessionId") || null;
      const apiKey = getApiKey();
      // Prepare headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'accept': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Authorization': `Bearer ${apiKey}`,
        'trace-id': generateUUID(),
        'Accept-Language': browserLanguage,
      };
      
      // Add OpenAI configuration headers if available
      if (openaiApiKey && openaiApiKey.trim() !== '') {
        headers['Openai-Api-Key'] = openaiApiKey;
        headers['Openai-Base-Url'] = openaiBaseUrl;
      }
      // Add Workflow LLM headers if available
      if (workflowLLMBaseUrl) {
        headers['Workflow-LLM-Base-Url'] = workflowLLMBaseUrl;
      }
      if (workflowLLMApiKey) {
        headers['Workflow-LLM-Api-Key'] = workflowLLMApiKey;
      }
      if (workflowLLMModel) {
        headers['Workflow-LLM-Model'] = workflowLLMModel;
      }
      // Create controller and combine with external signal if provided
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes timeout
      
      // If an external abort signal is provided, listen to it
      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          controller.abort();
        });
      }

      const response = await fetch('/api/debug-agent', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          session_id: session_id,
          workflow_data: workflowData['output']
        }),
        signal: controller.signal
      });
      
      // Clear the timeout since we got a response
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Debug agent request failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      const messageId = generateUUID();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += new TextDecoder().decode(value);
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.trim()) {
              yield {
                ...JSON.parse(line) as ChatResponse,
                message_id: messageId
              };
            }
          }
        }
        
        // Process any remaining buffer content
        if (buffer.trim()) {
          try {
            yield {
              ...JSON.parse(buffer) as ChatResponse,
              message_id: messageId
            };
          } catch (parseError) {
            console.error('Error parsing final debug response data:', parseError);
          }
        }
      } finally {
        reader.releaseLock();
      }

    } catch (error: unknown) {
      console.error('Error in streamDebugAgent:', error);
      if (error instanceof Error && error.name === 'AbortError') {
        // Check if it's a timeout or user-initiated abort
        if (abortSignal?.aborted) {
          // User-initiated abort, just throw silently
          throw error;
        } else {
          // Timeout
          throw new Error('Debug request timed out after 2 minutes. Please try again.');
        }
      } else {
        throw new Error(error instanceof Error ? error.message : 'An error occurred while debugging the workflow.');
      }
    }
  }

  export async function saveWorkflowCheckpoint(
    sessionId: string,
    workflowApi: any,
    workflowUi?: any,
    checkpointType: 'debug_start' | 'debug_complete' = 'debug_start'
  ): Promise<{ version_id: number; checkpoint_type: string }> {
    try {
      const response = await fetch('/api/save-workflow-checkpoint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'trace-id': generateUUID(),
        },
        body: JSON.stringify({
          session_id: sessionId,
          workflow_api: workflowApi,
          workflow_ui: workflowUi,
          checkpoint_type: checkpointType
        }),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to save workflow checkpoint');
      }

      return result.data;
    } catch (error) {
      console.error('Error saving workflow checkpoint:', error);
      throw error;
    }
  }

  export async function restoreWorkflowCheckpoint(
    versionId: number,
    sessionId: string
  ): Promise<{
    version_id: number;
    workflow_data: any;
    workflow_data_ui?: any;
    attributes: any;
    created_at: string;
  }> {
    try {
      const response = await fetch(`/api/restore-workflow-checkpoint?version_id=${versionId}`, {
        method: 'GET',
        headers: {
          'trace-id': generateUUID(),
          'X-Session-ID': sessionId,
        },
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to restore workflow checkpoint');
      }

      return result.data;
    } catch (error) {
      console.error('Error restoring workflow checkpoint:', error);
      throw error;
    }
  }

  export async function saveWorkflowCheckpointBeforeInvoke(
    sessionId: string,
    workflowApi: any,
    workflowUi: any,
    messageId: string
  ): Promise<{ checkpoint_id: number; checkpoint_type: string; message_id: string }> {
    try {
      const response = await fetch('/api/save-workflow-checkpoint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'trace-id': generateUUID(),
        },
        body: JSON.stringify({
          session_id: sessionId,
          workflow_api: workflowApi,
          workflow_ui: workflowUi,
          checkpoint_type: 'user_message_checkpoint',
          message_id: messageId
        }),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to save workflow checkpoint before invoke');
      }

      return result.data;
    } catch (error) {
      console.error('Error saving workflow checkpoint before invoke:', error);
      throw error;
    }
  }
}

  
