/*
 * @Author: 晴知 qingli.hql@alibaba-inc.com
 * @Date: 2024-12-12 21:28:03
 * @LastEditors: ai-business-hql ai.bussiness.hql@gmail.com
 * @LastEditTime: 2025-10-16 11:49:08
 * @FilePath: /comfyui_copilot/ui/src/components/chat/ApiKeyModal.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBK                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                <div className="mb-1"><strong>🔗 For LMStudio:</strong> http://localhost:1234/v1 (leave API key empty)</div>
                                <div className="mb-1"><strong>🌐 For OpenAI:</strong> https://api.openai.com/v1 (requires API key)</div>
                                <div><strong>⚙️ For Custom:</strong> Any OpenAI-compatible server URL</div>
                            </div>koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
// Copyright (C) 2025 AIDC-AI
// Licensed under the MIT License.

import { useEffect, useMemo, useState } from 'react';
import { fetchRsaPublicKey, verifyOpenAiApiKey } from '../../utils/crypto';
import Input from '../ui/Input';
import CollapsibleCard from '../ui/CollapsibleCard';
import { config } from '../../config';
import Modal from '../ui/Modal';
import { debounce } from 'lodash';
import useCountDown from '../../hooks/useCountDown';
import LoadingIcon from '../ui/Loading-icon';
import useLanguage from '../../hooks/useLanguage';
import StartLink from '../ui/StartLink';
import TabButton from '../ui/TabButton';
import { WorkflowChatAPI } from '../../apis/workflowChatApi';
interface ApiKeyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (apiKey: string) => void;
    initialApiKey?: string;
    onConfigurationUpdated?: () => void;
}

const BASE_URL = config.apiBaseUrl
const ATLAS_CLOUD_BASE_URL = 'https://api.atlascloud.ai/v1';
const ATLAS_CLOUD_DEFAULT_MODEL = 'qwen/qwen3.5-flash';

const TAB_LIST = [
    'OpenAI',
    'Atlas Cloud',
    'LMStudio'
]

const TAB_DEFAULTS: Record<string, Record<string, string>> = {
    OpenAI: {
        openaiApiKey: '',
        openaiBaseUrl: '',
    },
    'Atlas Cloud': {
        openaiApiKey: '',
        openaiBaseUrl: ATLAS_CLOUD_BASE_URL,
    },
    LMStudio: {
        openaiApiKey: '',
        openaiBaseUrl: 'http://localhost:1234/v1',
    },
}

const isLocalLLMBaseUrl = (baseUrl: string) => {
    const value = baseUrl.toLowerCase();
    return value.includes('localhost') ||
        value.includes('127.0.0.1') ||
        value.includes(':1234') ||
        value.includes(':1235');
}

export function ApiKeyModal({ isOpen, onClose, onSave, initialApiKey = '', onConfigurationUpdated }: ApiKeyModalProps) {
    const [apiKey, setApiKey] = useState(initialApiKey);
    const [email, setEmail] = useState('');
    const [isEmailValid, setIsEmailValid] = useState(false);
    const [modalOepn, setModalOpen] = useState(false)
    const [modalContent, setModalContent] = useState('');
    const { countDown, start } = useCountDown(60);
    const [loading, setLoading] = useState(false);
    
    // OpenAI configuration
    const [openaiApiKey, setOpenaiApiKey] = useState('');
    const [openaiBaseUrl, setOpenaiBaseUrl] = useState('');
    const [showOpenaiApiKey, setShowOpenaiApiKey] = useState(false);
    const [verifyingKey, setVerifyingKey] = useState(false);
    const [verificationResult, setVerificationResult] = useState<{success: boolean, message: string} | null>(null);
    const [rsaPublicKey, setRsaPublicKey] = useState<string | null>(null);

    // Workflow LLM configuration
    const [workflowLLMApiKey, setWorkflowLLMApiKey] = useState('');
    const [workflowLLMBaseUrl, setWorkflowLLMBaseUrl] = useState('');
    const [showWorkflowLLMApiKey, setShowWorkflowLLMApiKey] = useState(false);
    const [workflowLLMModel, setWorkflowLLMModel] = useState('');
    const [verifyingWorkflowLLM, setVerifyingWorkflowLLM] = useState(false);
    const [workflowVerificationResult, setWorkflowVerificationResult] = useState<{success: boolean, message: string} | null>(null);
    const [workflowLLMModels, setWorkflowLLMModels] = useState<string[]>([]);
    const [workflowLLMModelsLoading, setWorkflowLLMModelsLoading] = useState(false);

    const [activeTab, setActiveTab] = useState<string>(TAB_LIST[0]);
    const [tabStrMap, setTabStrMap] = useState<Record<string, Record<string, string>> | null>(null);

    const { apikeymodel_title } = useLanguage();

    useEffect(() => {
        const map: Record<string, Record<string, string>> = {}
        TAB_LIST?.forEach((tab) => {
            map[tab] = { ...TAB_DEFAULTS[tab] }
        })
        setTabStrMap(map);
    }, [])

    useEffect(() => {
        setApiKey(initialApiKey);
        
        // Load OpenAI configuration from localStorage
        const savedOpenaiApiKey = localStorage.getItem('openaiApiKey');
        const savedOpenaiBaseUrl = localStorage.getItem('openaiBaseUrl');
        const savedWorkflowLLMApiKey = localStorage.getItem('workflowLLMApiKey');
        const savedWorkflowLLMBaseUrl = localStorage.getItem('workflowLLMBaseUrl');
        const savedWorkflowLLMModel = localStorage.getItem('workflowLLMModel');
        
        if (savedOpenaiApiKey) {
            setOpenaiApiKey(savedOpenaiApiKey);
        }
        
        if (savedOpenaiBaseUrl) {
            setOpenaiBaseUrl(savedOpenaiBaseUrl);
        }
        if (savedWorkflowLLMApiKey) {
            setWorkflowLLMApiKey(savedWorkflowLLMApiKey);
        }
        if (savedWorkflowLLMBaseUrl) {
            setWorkflowLLMBaseUrl(savedWorkflowLLMBaseUrl);
        }
        if (savedWorkflowLLMModel) {
            setWorkflowLLMModel(savedWorkflowLLMModel);
        }
        
        // Fetch RSA public key
        const fetchPublicKey = async () => {
            try {
                const savedPublicKey = localStorage.getItem('rsaPublicKey');
                if (savedPublicKey) {
                    setRsaPublicKey(savedPublicKey);
                } else {
                    const publicKey = await fetchRsaPublicKey();
                    setRsaPublicKey(publicKey);
                    localStorage.setItem('rsaPublicKey', publicKey);
                }
            } catch (error) {
                console.error('Failed to fetch RSA public key:', error);
            }
        };
        
        fetchPublicKey();
    }, [initialApiKey]);

    const handleVerifyOpenAiKey = async () => {
        // Check if it looks like LMStudio URL
        const isLMStudio = isLocalLLMBaseUrl(openaiBaseUrl);
        
        if (!openaiApiKey.trim() && !isLMStudio) {
            setVerificationResult({
                success: false,
                message: 'Please enter an API key or use LMStudio URL (localhost:1234)'
            });
            return;
        }
        
        if (!rsaPublicKey && !isLMStudio) {
            setVerificationResult({
                success: false,
                message: 'RSA public key not available. Please try again later.'
            });
            return;
        }
        
        setVerifyingKey(true);
        setVerificationResult(null);
        
        try {
            const isValid = await verifyOpenAiApiKey(openaiApiKey, openaiBaseUrl);
            
            setVerificationResult({
                success: isValid,
                message: isValid ? 
                    (isLMStudio ? 'LMStudio connection successful!' : 'API key is valid!') : 
                    (isLMStudio ? 'LMStudio connection failed. Please check if LMStudio server is running.' : 'Invalid API key. Please check and try again.')
            });
        } catch (error) {
            setVerificationResult({
                success: false,
                message: error instanceof Error ? error.message : 'Failed to verify connection'
            });
        } finally {
            setVerifyingKey(false);
        }
    };

    const handleVerifyWorkflowLLMKey = async () => {
        const isLMStudio = isLocalLLMBaseUrl(workflowLLMBaseUrl);

        if (!workflowLLMApiKey.trim() && !isLMStudio) {
            setWorkflowVerificationResult({
                success: false,
                message: 'Please enter an API key or use LMStudio URL (localhost:1234)'
            });
            return;
        }

        setVerifyingWorkflowLLM(true);
        setWorkflowVerificationResult(null);
        try {
            const isValid = await verifyOpenAiApiKey(workflowLLMApiKey, workflowLLMBaseUrl);
            setWorkflowVerificationResult({
                success: isValid,
                message: isValid ? 
                    (isLMStudio ? 'LMStudio connection successful!' : 'API key is valid!') : 
                    (isLMStudio ? 'LMStudio connection failed. Please check if LMStudio server is running.' : 'Invalid API key. Please check and try again.')
            });
        } catch (error) {
            setWorkflowVerificationResult({
                success: false,
                message: error instanceof Error ? error.message : 'Failed to verify connection'
            });
        } finally {
            setVerifyingWorkflowLLM(false);
        }
        // Trigger fetching models immediately after clicking verify
        handleLoadWorkflowLLMModels();
    };

    const handleLoadWorkflowLLMModels = async () => {
        if (!workflowLLMBaseUrl || workflowLLMBaseUrl.trim() === '') {
            setWorkflowVerificationResult({ success: false, message: 'Please enter Workflow LLM Server URL first' });
            return;
        }
        try {
            setWorkflowLLMModelsLoading(true);
            const ids = await WorkflowChatAPI.listModelsFromLLM(workflowLLMBaseUrl.trim(), workflowLLMApiKey.trim() || undefined);
            setWorkflowLLMModels(ids);
            // Do not auto-select a model; keep input unchanged so datalist shows all
        } catch (e) {
            setWorkflowVerificationResult({ success: false, message: e instanceof Error ? e.message : 'Failed to fetch models' });
        } finally {
            setWorkflowLLMModelsLoading(false);
        }
    };

    const checkEmailValid = useMemo(
        () => debounce((value: string) => {
            console.log('checkEmailValid', value);
            const reg = /^[\w.-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            setIsEmailValid(reg.test(value));
        }, 500), 
        []
    );

    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        const defaults = TAB_DEFAULTS[tab] || {};
        setOpenaiApiKey(tabStrMap?.[tab]?.openaiApiKey || defaults.openaiApiKey || '');
        setOpenaiBaseUrl(tabStrMap?.[tab]?.openaiBaseUrl || defaults.openaiBaseUrl || '');
    }

    const applyAtlasCloudWorkflowDefaults = () => {
        setWorkflowLLMBaseUrl(ATLAS_CLOUD_BASE_URL);
        setWorkflowLLMModel((current) => current || ATLAS_CLOUD_DEFAULT_MODEL);
    }

    const handleSendEmail = async () => {
        if (!email || email === '' || !isEmailValid)
            return;
        setLoading(true);
        const username = email?.split('@')?.[0] || '';
        const response = await fetch(`${BASE_URL}/api/user/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                email
            })
        });
        const data = await response.json();
        setLoading(false);
        setModalOpen(true)
        start();
        if (!!data?.data) {
            setModalContent('Send email successfully, please check your email');
        } else {
            setModalContent(data?.message || 'Send email failed');
        }
    }

    const handleSave = () => {
        // Save the main API key
        onSave(apiKey);
        
        // Check if OpenAI configuration has changed
        const previousOpenaiApiKey = localStorage.getItem('openaiApiKey') || '';
        const previousOpenaiBaseUrl = localStorage.getItem('openaiBaseUrl') || '';
        const hasOpenaiConfigChanged = openaiApiKey.trim() !== previousOpenaiApiKey || openaiBaseUrl.trim() !== previousOpenaiBaseUrl;
        
        // Check if Workflow LLM configuration has changed
        const previousWorkflowLLMApiKey = localStorage.getItem('workflowLLMApiKey') || '';
        const previousWorkflowLLMBaseUrl = localStorage.getItem('workflowLLMBaseUrl') || '';
        const previousWorkflowLLMModel = localStorage.getItem('workflowLLMModel') || '';
        const hasWorkflowConfigChanged = workflowLLMApiKey.trim() !== previousWorkflowLLMApiKey || workflowLLMBaseUrl.trim() !== previousWorkflowLLMBaseUrl || workflowLLMModel.trim() !== previousWorkflowLLMModel;
        
        // Save or clear OpenAI base URL
        if (openaiBaseUrl.trim()) {
            localStorage.setItem('openaiBaseUrl', openaiBaseUrl.trim());
        } else {
            localStorage.removeItem('openaiBaseUrl');
        }
        
        // Save or clear Workflow LLM base URL
        if (workflowLLMBaseUrl.trim()) {
            localStorage.setItem('workflowLLMBaseUrl', workflowLLMBaseUrl.trim());
        } else {
            localStorage.removeItem('workflowLLMBaseUrl');
        }
        // Save or clear Workflow LLM model
        if (workflowLLMModel.trim()) {
            localStorage.setItem('workflowLLMModel', workflowLLMModel.trim());
        } else {
            localStorage.removeItem('workflowLLMModel');
        }
        
        // Save or clear OpenAI API key in localStorage
        if (openaiApiKey.trim()) {
            localStorage.setItem('openaiApiKey', openaiApiKey.trim());
        } else {
            localStorage.removeItem('openaiApiKey');
        }
        
        // Save or clear Workflow LLM API key
        if (workflowLLMApiKey.trim()) {
            localStorage.setItem('workflowLLMApiKey', workflowLLMApiKey);
        } else {
            localStorage.removeItem('workflowLLMApiKey');
        }
        
        // Call configuration updated callback if OpenAI config has changed
        if ((hasOpenaiConfigChanged || hasWorkflowConfigChanged) && onConfigurationUpdated) {
            onConfigurationUpdated();
        }
        
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-8 w-[480px] max-h-[80vh] shadow-2xl overflow-y-auto">
                <h2 className="text-xl text-gray-900 dark:text-white font-semibold mb-6">Set API Key</h2>
                
                <div className="mb-6">
                    <div className='flex flex-row justify-between'>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Email
                        </label>
                        <div className="text-sm text-red-600 dark:text-red-300">
                            <span>{(!!email && email !== ''&& !isEmailValid) ? 'Please enter a valid email' : ''}</span>
                        </div>
                    </div>
                    <div className="relative mb-4 flex flex-row gap-2">
                        <Input
                            value={email}
                            setValue={setEmail}
                            setIsValueValid={checkEmailValid}
                            placeholder="Enter your Email"
                            className='flex-1'
                        />
                        <button
                            onClick={handleSendEmail}
                            disabled={loading || !isEmailValid || countDown > 0}
                            className={`w-28 py-2.5 ${(!loading && isEmailValid && countDown === 0) ? 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white' : 
                                'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'} 
                            rounded-lg font-medium transition-colors flex justify-center items-center`}
                        >
                            {loading ? <LoadingIcon /> : (countDown > 0 ? `Resend in ${countDown}s` : 'Send')}
                        </button>
                    </div>
                    <div className="text-xs text-gray-600">
                        By clicking the "Send" button below and submitting your information to us, you agree to our&nbsp;
                        <a        
                            href="https://cdn.contract.alibaba.com/terms/privacy_policy_full/20250219145958852/20250219145958852.html?lng=en"
                            target="_blank"
                            rel="noopener noreferrer"
                            className='underline underline-offset-2'
                        >
                            Privacy Policy
                        </a> and&nbsp; 
                        <a
                            href="https://cdn.contract.alibaba.com/terms/c_end_product_protocol/20250219150239949/20250219150239949.html?lng=en"
                            target="_blank"
                            rel="noopener noreferrer"
                            className='underline underline-offset-2'
                        >
                            Terms of Use
                        </a>.
                    </div>
                </div>
                {/* Main API Key */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        ComfyUI Copilot API Key
                    </label>
                    <div className="relative mb-4">
                        <Input
                            isPassword={true}
                            value={apiKey}
                            setValue={setApiKey}
                            placeholder="Enter your API key"
                            className='mb-4'
                        />
                    </div>
                    <StartLink className='flex justify-start items-end'>
                        {apikeymodel_title}
                        <svg viewBox="0 0 1024 1024" className="w-4 h-4" fill='currentColor'>
                            <path d="M498.894518 100.608396c-211.824383 0-409.482115 189.041494-409.482115 422.192601 0 186.567139 127.312594 344.783581 295.065226 400.602887 21.13025 3.916193 32.039717-9.17701 32.039717-20.307512 0-10.101055 1.176802-43.343157 1.019213-78.596056-117.448946 25.564235-141.394311-49.835012-141.394311-49.835012-19.225877-48.805566-46.503127-61.793368-46.503127-61.793368-38.293141-26.233478 3.13848-25.611308 3.13848-25.611308 42.361807 2.933819 64.779376 43.443441 64.779376 43.443441 37.669948 64.574714 98.842169 45.865607 122.912377 35.094286 3.815909-27.262924 14.764262-45.918819 26.823925-56.431244-93.796246-10.665921-192.323237-46.90017-192.323237-208.673623 0-46.071292 16.498766-83.747379 43.449581-113.332185-4.379751-10.665921-18.805298-53.544497 4.076852-111.732757 0 0 35.46063-11.336186 116.16265 43.296085 33.653471-9.330506 69.783343-14.022365 105.654318-14.174837 35.869952 0.153496 72.046896 4.844332 105.753579 14.174837 80.606853-54.631248 116.00813-43.296085 116.00813-43.296085 22.935362 58.18826 8.559956 101.120049 4.180206 111.732757 27.052123 29.584806 43.443441 67.260893 43.443441 113.332185 0 162.137751-98.798167 197.850114-192.799074 208.262254 15.151072 13.088086 28.65155 38.804794 28.65155 78.17957 0 56.484456-0.459464 101.94381-0.459464 115.854635 0 11.235902 7.573489 24.381293 29.014824 20.2543C825.753867 867.330798 933.822165 709.10924 933.822165 522.700713c0-233.155201-224.12657-422.192601-434.927647-422.192601L498.894518 100.608396z">
                            </path>
                        </svg>
                    </StartLink>
                </div>
                
                {/* LLM Configuration */}
                <CollapsibleCard 
                    title={<h3 className="text-sm text-gray-900 dark:text-white font-medium">LLM Configuration (OpenAI / Atlas Cloud / LMStudio / Custom)</h3>}
                    className='mb-4'
                >
                    <div>
                        <div className='mb-4'>
                            {
                                TAB_LIST?.map((tab) => <TabButton 
                                    active={activeTab === tab}
                                    onClick={() => handleTabChange(tab)}
                                >
                                    {tab}
                                </TabButton>)
                            }
                        </div>
                        {/* API Key */}
                        {
                            activeTab !== 'LMStudio' && <div className="mb-4">
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mt-2 mb-2">
                                    API Key
                                </label>
                                <div className="relative">
                                    <input
                                        type={showOpenaiApiKey ? "text" : "password"}
                                        value={openaiApiKey}
                                        onChange={(e) => {
                                            setTabStrMap(prev => ({
                                                ...prev,
                                                [activeTab]: {
                                                    ...prev?.[activeTab],
                                                    openaiApiKey: e.target.value
                                                }
                                            }))
                                            setOpenaiApiKey(e.target.value)
                                        }}
                                        placeholder="Enter your OpenAI API key "
                                        className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-lg pr-12 text-xs
                                        bg-gray-50 dark:bg-gray-700
                                        text-gray-900 dark:text-white
                                        placeholder-gray-500 dark:placeholder-gray-400
                                        focus:border-blue-500 dark:focus:border-blue-400 
                                        focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-400/20
                                        focus:outline-none"
                                    />
                                    <button
                                        type="button"
                                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 dark:text-gray-400 
                                        hover:text-gray-700 dark:hover:text-gray-200 transition-colors bg-transparent border-none"
                                        onClick={() => setShowOpenaiApiKey(!showOpenaiApiKey)}
                                    >
                                        {showOpenaiApiKey ? (
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                        ) : (
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                        }
                        
                        {/* Base URL */}
                        <div className="mb-4">
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Server URL
                            </label>
                            <input
                                type="text"
                                value={openaiBaseUrl}
                                onChange={(e) => {
                                    setTabStrMap(prev => ({
                                        ...prev,
                                        [activeTab]: {
                                            ...prev?.[activeTab],
                                            openaiBaseUrl: e.target.value
                                        }
                                    }))
                                    setOpenaiBaseUrl(e.target.value)
                                }}
                                placeholder={`${activeTab === 'OpenAI' ? "https://api.openai.com/v1" : activeTab === 'Atlas Cloud' ? ATLAS_CLOUD_BASE_URL : "http://localhost:1234/v1"}`}
                                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-lg text-xs
                                bg-gray-50 dark:bg-gray-700
                                text-gray-900 dark:text-white
                                placeholder-gray-500 dark:placeholder-gray-400
                                focus:border-blue-500 dark:focus:border-blue-400 
                                focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-400/20
                                focus:outline-none"
                            />
                        </div>
                        
                        <div className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                            {
                                activeTab === 'LMStudio' && <div className="mb-1"><strong>� For LMStudio:</strong> http://localhost:1235/v1</div>
                            }
                            {
                                activeTab === 'Atlas Cloud' && <>
                                    <div className="mb-1"><strong>🌐 For Atlas Cloud:</strong> {ATLAS_CLOUD_BASE_URL} (requires API key)</div>
                                    <div><strong>Model example:</strong> {ATLAS_CLOUD_DEFAULT_MODEL}</div>
                                </>
                            }
                            {
                                activeTab === 'OpenAI' && <>
                                    <div className="mb-1"><strong>🌐 For OpenAI:</strong> https://api.openai.com/v1 (requires API key)</div>
                                    <div><strong>⚙️ For Custom:</strong> Any OpenAI-compatible server URL</div>
                                </>
                            }
                        </div>
                        
                        {/* Verify Button */}
                        <div className="flex items-center mb-2">
                            <button
                                onClick={handleVerifyOpenAiKey}
                                disabled={verifyingKey}
                                className={`px-4 py-2 rounded-lg font-medium text-xs transition-colors ${
                                    verifyingKey
                                        ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                                        : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white'
                                }`}
                            >
                                {verifyingKey ? (
                                    <span className="flex items-center text-xs">
                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Verifying...
                                    </span>
                                ) : 'Verify'}
                            </button>
                        </div>
                        
                        {/* Verification Result */}
                        {verificationResult && (
                            <div className={`text-xs p-2 rounded-md ${
                                verificationResult.success 
                                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' 
                                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                            }`}>
                                {verificationResult.message}
                            </div>
                        )}
                    </div>
                </CollapsibleCard>
                {/* Workflow LLM Configuration (Optional) */}
                <CollapsibleCard 
                    title={<h3 className="text-sm text-gray-900 dark:text-white font-medium">Workflow LLM Configuration (Optional)</h3>}
                    className='mb-4'
                >
                    <div>
                        {/* Workflow LLM API Key */}
                        <div className="mb-4">
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Workflow LLM API Key
                            </label>
                            <div className="relative">
                                <input
                                    type={showWorkflowLLMApiKey ? "text" : "password"}
                                    value={workflowLLMApiKey}
                                    onChange={(e) => setWorkflowLLMApiKey(e.target.value)}
                                    placeholder="Enter workflow LLM API key (if required)"
                                    className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-lg pr-12 text-xs
                                    bg-gray-50 dark:bg-gray-700 
                                    text-gray-900 dark:text-white
                                    placeholder-gray-500 dark:placeholder-gray-400
                                    focus:border-blue-500 dark:focus:border-blue-400 
                                    focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-400/20
                                    focus:outline-none"
                                />
                                <button
                                    type="button"
                                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 dark:text-gray-400 
                                    hover:text-gray-700 dark:hover:text-gray-200 transition-colors bg-transparent border-none"
                                    onClick={() => setShowWorkflowLLMApiKey(!showWorkflowLLMApiKey)}
                                >
                                    {showWorkflowLLMApiKey ? (
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    ) : (
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>
                        {/* Workflow LLM Base URL */}
                        <div className="mb-4">
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Workflow LLM Server URL
                            </label>
                            <input
                                type="text"
                                value={workflowLLMBaseUrl}
                                onChange={(e) => setWorkflowLLMBaseUrl(e.target.value)}
                                placeholder="e.g. https://api.openai.com/v1 or http://localhost:1234/v1"
                                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-lg text-xs
                                bg-gray-50 dark:bg-gray-700 
                                text-gray-900 dark:text-white
                                placeholder-gray-500 dark:placeholder-gray-400
                                focus:border-blue-500 dark:focus:border-blue-400 
                                focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-400/20
                                focus:outline-none"
                            />
                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                <div className="mb-1"><strong>Optional:</strong> If you don't set, the workflow will use the Claude4 model provided by us. If you need to use other models(note: only some very powerful closed-source models can support this, and they require at least 8192 context) for workflow Debug and modification, please set it.</div>
                                <div><strong>Atlas Cloud:</strong> use {ATLAS_CLOUD_BASE_URL} with {ATLAS_CLOUD_DEFAULT_MODEL}.</div>
                            </div>
                            <div className="flex items-center mt-2">
                                <button
                                    onClick={handleVerifyWorkflowLLMKey}
                                    disabled={verifyingWorkflowLLM}
                                    className={`px-4 py-2 rounded-lg font-medium text-xs transition-colors ${
                                        verifyingWorkflowLLM
                                            ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                                            : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white'
                                    }`}
                                >
                                    {verifyingWorkflowLLM ? (
                                        <span className="flex items-center text-xs">
                                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            Verifying...
                                        </span>
                                    ) : 'Verify'}
                                </button>
                                <button
                                    type="button"
                                    onClick={applyAtlasCloudWorkflowDefaults}
                                    className="ml-2 px-4 py-2 rounded-lg font-medium text-xs transition-colors bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
                                >
                                    Use Atlas Cloud
                                </button>
                            </div>
                            {workflowVerificationResult && (
                                <div className={`mt-2 text-xs p-2 rounded-md ${
                                    workflowVerificationResult.success 
                                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' 
                                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                                }`}>
                                    {workflowVerificationResult.message}
                                </div>
                            )}
                        </div>
                        {/* Workflow LLM Model */}
                        <div className="mb-4">
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Workflow LLM Model
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <input
                                        list="workflow-llm-models"
                                        type="text"
                                        value={workflowLLMModel}
                                        onChange={(e) => setWorkflowLLMModel(e.target.value)}
                                        placeholder="e.g. gpt-4o-mini, claude-3-5-sonnet, llama-3.1-70b"
                                        className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-lg text-xs
                                        bg-gray-50 dark:bg-gray-700 
                                        text-gray-900 dark:text-white
                                        placeholder-gray-500 dark:placeholder-gray-400
                                        focus:border-blue-500 dark:focus:border-blue-400 
                                        focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-400/20
                                        focus:outline-none"
                                        disabled={workflowLLMModelsLoading}
                                    />
                                    {workflowLLMModelsLoading && (
                                        <div className="absolute inset-y-0 right-3 flex items-center">
                                            <svg className="animate-spin h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        </div>
                                    )}
                                    {!workflowLLMModelsLoading && (
                                        <datalist id="workflow-llm-models">
                                            {workflowLLMModels.map(m => (
                                                <option value={m} key={m} />
                                            ))}
                                        </datalist>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </CollapsibleCard>
                {/* Action Buttons */}
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-gray-700 bg-white dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 
                        rounded-lg font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 
                        text-white rounded-lg font-medium transition-colors"
                    >
                        Save
                    </button>
                </div>
            </div>
            <Modal open={modalOepn} onClose={() => setModalOpen(false)}>
                <p>{modalContent}</p>
            </Modal>
        </div>
    );
}
