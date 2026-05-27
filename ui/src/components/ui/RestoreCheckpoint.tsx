/*
 * @Author: ai-business-hql qingli.hql@alibaba-inc.com
 * @Date: 2025-07-30 16:30:22
 * @LastEditors: ai-business-hql qingli.hql@alibaba-inc.com
 * @LastEditTime: 2025-08-06 11:30:42
 * @FilePath: /comfyui_copilot/ui/src/components/ui/RestoreCheckpoint.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { Undo2 } from "lucide-react";
import { useState } from "react";
import { WorkflowChatAPI } from "../../apis/workflowChatApi";
import { app } from "../../utils/comfyapp";
import { loadApiWorkflowWithMissingNodes } from "../../utils/comfyuiWorkflowApi2Ui";

const RestoreCheckpoint = ({ checkpointId, onRestore, title }: { checkpointId: number; onRestore: () => void; title?: string }) => {
  const [isRestoring, setIsRestoring] = useState(false);

  const handleRestore = async () => {
      if (isRestoring) return;
      
      setIsRestoring(true);
      try {
          // track restore event before actual restore
          WorkflowChatAPI.trackEvent({
              event_type: 'restore_checkpoint',
              message_type: 'ui',
              data: {
                  checkpoint_id: checkpointId
              }
          });

          const sessionId = localStorage.getItem("sessionId") || "";
          if (!sessionId) {
              throw new Error("Missing current session.");
          }

          const checkpointData = await WorkflowChatAPI.restoreWorkflowCheckpoint(checkpointId, sessionId);
          
          // Use UI format if available, otherwise use API format
          const workflowToLoad = checkpointData.workflow_data_ui || checkpointData.workflow_data;
          
          if (workflowToLoad) {
              // Load workflow to canvas
              if (checkpointData.workflow_data_ui) {
                  // UI format - use loadGraphData
                  app.loadGraphData(workflowToLoad);
              } else {
                  // API format - use loadApiJson
                //   app.loadApiJson(workflowToLoad);
                  loadApiWorkflowWithMissingNodes(workflowToLoad);
              }
              
              console.log(`Restored workflow checkpoint ${checkpointId}`);
              onRestore();
          } else {
              console.error('No workflow data found in checkpoint');
              alert('No workflow data found in checkpoint.');
          }
      } catch (error) {
          console.error('Failed to restore checkpoint:', error);
          alert('Failed to restore workflow checkpoint. Please try again.');
      } finally {
          setIsRestoring(false);
      }
  };

  return (
      <button
          onClick={handleRestore}
          disabled={isRestoring}
          className={`flex flex-row items-center gap-1 p-1 rounded transition-colors ${
              isRestoring 
                  ? 'text-gray-400 cursor-not-allowed' 
                  : 'text-gray-500 hover:!bg-gray-100 hover:!text-gray-600'
          }`}
          title={title || `Restore checkpoint ${checkpointId}`}
      >
          <Undo2 size={12} />
          <span className="text-xs">Restore checkpoint</span>
      </button>
  );
};

export default RestoreCheckpoint;
