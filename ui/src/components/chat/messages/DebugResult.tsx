import { BaseMessage } from './BaseMessage';
import RestoreCheckpoint from '../../ui/RestoreCheckpoint';
import DebugCollapsibleCard from '../../ui/DebugCollapsibleCard';
import Markdown from '../../ui/Markdown';
import ModelOption from './ModelOption';
import { Portal } from '../Portal';
import { useRef } from 'react';

interface DebugResultProps {
    content: string;
    name?: string;
    avatar: string;
    format?: string;
}

export function DebugResult({ content, name = 'Assistant', avatar, format = 'markdown' }: DebugResultProps) {
    const ref = useRef<HTMLDivElement>(null)
    
    const renderContent = () => {
        let checkPointId = null
        let isWorkflowUpdate = false
        let response
        let modelSuggests = []
        try {
            response = JSON.parse(content);
            // Check for different types of checkpoints
            if (response.ext) {
                // Look for workflow_rewrite_checkpoint (from workflow updates - 修改前的版本)
                let checkpointExt = response.ext.find((item: any) => 
                    item.type === 'workflow_rewrite_checkpoint' || 
                    (item.type === 'debug_checkpoint' && item.data?.checkpoint_type === 'workflow_rewrite_start')
                );
                
                if (checkpointExt && checkpointExt.data && checkpointExt.data.checkpoint_id) {
                    checkPointId = checkpointExt.data.checkpoint_id;
                    isWorkflowUpdate = true;
                } else {
                    // Look for workflow_rewrite_complete (from workflow updates - 修改后的版本)
                    checkpointExt = response.ext.find((item: any) => 
                        item.type === 'workflow_rewrite_complete'
                    );
                    
                    if (checkpointExt && checkpointExt.data && checkpointExt.data.version_id) {
                        checkPointId = checkpointExt.data.version_id;
                        isWorkflowUpdate = true;
                    } else {
                        // Look for debug_checkpoint (from debug operations)
                        checkpointExt = response.ext.find((item: any) => item.type === 'debug_checkpoint');
                        if (checkpointExt && checkpointExt.data && checkpointExt.data.checkpoint_id) {
                            checkPointId = checkpointExt.data.checkpoint_id;
                            isWorkflowUpdate = false;
                        }
                    }
                }
                
                // Check if this is a workflow update message
                const workflowUpdateExt = response.ext.find((item: any) => item.type === 'workflow_update');
                if (workflowUpdateExt) {
                    isWorkflowUpdate = true;
                }

                modelSuggests = response.ext.find((item: any) => item.type === 'param_update')?.data?.model_suggest || []
            }
        } catch (error) {
            console.error('Failed to parse DebugResult content:', error);
            return null;
        }

        const title = isWorkflowUpdate ? (
            <div className="flex items-center text-green-500">
                <svg 
                    className="w-5 h-5 mr-2" 
                    fill="currentColor" 
                    viewBox="0 0 20 20"
                >
                    <path 
                        fillRule="evenodd" 
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" 
                        clipRule="evenodd" 
                    />
                </svg>
                <h4 className="font-bold text-xl">Workflow Updated Successfully</h4>
            </div>
        ) : <div className="flex items-center text-gray-900">
            <svg 
                className="w-5 h-5 mr-2" 
                viewBox="0 0 1024 1024" 
                version="1.1" 
                xmlns="http://www.w3.org/2000/svg" 
                p-id="28108" 
                fill='currentColor'
            >
                <path d="M401.048025 844.855924c0 20.341281 16.643052 36.984333 36.984333 36.984333l147.936307 0c20.341281 0 36.984333-16.643052 36.984333-36.984333L622.952998 807.872614 401.048025 807.872614 401.048025 844.855924zM512 142.159744c-142.943596 0-258.888282 115.944686-258.888282 258.888282 0 88.021729 44.011376 165.503405 110.951975 212.288964l0 83.58365c0 20.341281 16.643052 36.984333 36.984333 36.984333l221.903949 0c20.341281 0 36.984333-16.643052 36.984333-36.984333l0-83.58365c66.941622-46.784536 110.951975-124.266212 110.951975-212.288964C770.888282 258.104429 654.943596 142.159744 512 142.159744zM617.588827 552.682561l-31.621185 22.005176 0 85.248569L438.031335 659.936307l0-85.063351L406.41015 552.866756c-49.743938-34.764781-79.33079-91.350544-79.33079-151.634536 0-101.890598 83.029018-184.92064 184.92064-184.92064s184.92064 83.029018 184.92064 184.92064C696.919617 461.332017 667.332764 517.91778 617.588827 552.682561z" p-id="28277"></path>
            </svg>
            <h4 className="font-bold text-xl">Workflow Update Finished</h4>
        </div>

        const helpText = isWorkflowUpdate ? (
            <div className="mt-3 text-xs text-gray-700">
                💡 If you're not satisfied with the changes, click the restore button to revert to the previous version.
            </div>
        ) : null

        return <div ref={ref} className="sticky top-0 left-0 w-full bg-gray-100 p-4 rounded-lg overflow-hidden">
            <DebugCollapsibleCard 
                title={title} 
                isWorkflowUpdate={isWorkflowUpdate} 
                className='p-4'
            >
                <div className="prose prose-sm max-w-none">
                    {/* {title} */}
                    
                    {format === 'markdown' ? (
                        <Markdown response={response || {}} />
                    ) : (
                        <pre className='whitespace-pre-wrap text-gray-700 text-sm leading-relaxed h-full'>
                            {response?.text || ''}
                        </pre>
                    )}
                    
                    {helpText}
                </div>
            </DebugCollapsibleCard> 
            {
                modelSuggests?.length > 0 && (
                    <ModelOption modelList={modelSuggests} showPagination={false} />
                )
            }
            <div className="flex justify-end mt-2"> 
                {/* Restore checkpoint icon */}
                {!!checkPointId && (
                    <div className="ml-2 flex-shrink-0">
                        <RestoreCheckpoint 
                            checkpointId={checkPointId} 
                            onRestore={() => {
                                console.log(`Workflow restored from ${isWorkflowUpdate ? 'workflow update' : 'debug'} checkpoint`);
                            }}
                            title={isWorkflowUpdate ? `Restore to this version (Version ${checkPointId})` : `Restore checkpoint ${checkPointId}`}
                        />
                    </div>
                )}
            </div>  
        </div>
    }   

    return (
        <BaseMessage name={name}>
            {
                renderContent()
            }
        </BaseMessage>
    );
} 