// Copyright (C) 2025 AIDC-AI
// Licensed under the MIT License.

import React, { useState, useEffect, useRef } from 'react';
import { app } from '../../utils/comfyapp';
import { useChatContext } from '../../context/ChatContext';
import { InitialScreen } from './screens/InitialScreen';
import { ConfigureParameterScreen } from './screens/ConfigureParameterScreen';
import { ComfyNode, ConfirmConfigurationScreen } from './screens/ConfirmConfigurationScreen';
import { ProcessingScreen } from './screens/ProcessingScreen';
import { ResultGalleryScreen } from './screens/ResultGalleryScreen';
import { AIWritingModal } from './modals/AIWritingModal';
import { ImageModal } from './modals/ImageModal';
import { generateDynamicParams, generateParameterCombinations, PARAMETER_DEBUG_PLACEHOLDER_IMAGE } from './utils/parameterUtils';
import { generateUUID } from '../../utils/uuid';
// Import history components
import { HistoryScreen } from './screens/HistoryScreen';
import { HistoryItemScreen } from './screens/HistoryItemScreen';

// Import types from the extracted types file
import { 
  GeneratedImage, 
  ParameterDebugInterfaceProps
} from './types/parameterDebugTypes';

// Import styles from the extracted styles file
import { highlightPulseStyle } from './styles/highlightPulseStyle';

// Import localStorage utilities from the extracted utils file
import {
  PARAM_DEBUG_STORAGE_KEY,
  saveStateToLocalStorage
} from './utils/localStorageUtils';

// Import history utilities
import {
  HistoryItem,
  loadHistoryItems
} from './utils/historyUtils';

// Import text input utilities from the extracted utils file
import {
  handleTextInputChange as utilsHandleTextInputChange,
  handleAddTextInput as utilsHandleAddTextInput,
  handleRemoveTextInput as utilsHandleRemoveTextInput
} from './utils/textInputUtils';

// Import interface utilities from the extracted utils file
import {
  toggleDropdown as utilsToggleDropdown,
  updateParamTestValues as utilsUpdateParamTestValues,
  handleTestValueSelect as utilsHandleTestValueSelect
} from './utils/interfaceUtils';

// Import search utilities from the extracted utils file
import {
  handleSearch as utilsHandleSearch,
  handleSelectAll as utilsHandleSelectAll,
  handleParamSelect as utilsHandleParamSelect
} from './utils/searchUtils';

// Import modal utilities from the extracted utils file
import {
  openImageModal as utilsOpenImageModal,
  closeImageModal as utilsCloseImageModal
} from './utils/modalUtils';

// Import navigation utilities from the extracted utils file
import {
  handleNext as utilsHandleNext,
  handlePrevious as utilsHandlePrevious,
  handlePageChange as utilsHandlePageChange
} from './utils/navigationUtils';

// Import image generation utilities
import {
  handleStartGeneration as utilsHandleStartGeneration,
  cleanupPolling as utilsCleanupPolling
} from './utils/imageGenerationUtils';

// Import AI text utilities
import {
  handleAiWriting as utilsHandleAiWriting,
  toggleTextSelection as utilsToggleTextSelection,
  addSelectedTexts as utilsAddSelectedTexts,
  openAiWritingModal as utilsOpenAiWritingModal
} from './utils/aiTextUtils';

// Import state management utilities
import {
  resetAllStates as utilsResetAllStates,
  handleSelectImage as utilsHandleSelectImage,
  handleApplySelected as utilsHandleApplySelected,
  handleClose as utilsHandleClose
} from './utils/stateManagementUtils';
import { isObj } from '../../utils/tools';
import { isEqual } from 'lodash'

// Note: Removed duplicate interface definitions to use imported types instead
export const enum StateKey {
  CurrentScreen = 'currentScreen',
  SelectedParams = 'selectedParams',
  TaskId = 'task_id',
  IsProcessing = 'isProcessing',
  IsCompleted = 'isCompleted',
  CompletedCount = 'completedCount',
  TotalCount = 'totalCount',
  SelectedImageIndex = 'selectedImageIndex',
  GeneratedImages = 'generatedImages',
  ParamTestValues = 'paramTestValues',
  SearchTerms = 'searchTerms',  
  InputValues = 'inputValues',
  CurrentPage = 'currentPage',
  TextInputs = 'textInputs',
}

export const ParameterDebugInterface: React.FC<ParameterDebugInterfaceProps> = ({
  selectedNodes,
  visible,
  onClose
}) => {
  const currentSelectedNodes = useRef<any>([])
  const [currentScreen, setCurrentScreen] = useState(0);
  const [selectedParams, setSelectedParams] = useState<{[key: string]: boolean}>({
    Steps: true,
    CFG: true,
    sampler_name: true,
    threshold: false,
    prompt: false
  });
  const [task_id, setTask_id] = useState(generateUUID());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(12);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>(() => {
    // Create an array of placeholder image URLs
    return Array(12).fill(null).map((_, i) => ({
      url: PARAMETER_DEBUG_PLACEHOLDER_IMAGE,
      params: {
        step: i % 3 === 0 ? 5 : i % 3 === 1 ? 10 : 15,
        sampler_name: 'euler',
        cfg: 1
      }
    }));
  });

  // Modify parameter test values structure, use nested objects, group by node ID
  const [paramTestValues, setParamTestValues] = useState<{[nodeId: string]: {[paramName: string]: any[]}}>({}); 
  // Add a state to store dropdown open status
  const [openDropdowns, setOpenDropdowns] = useState<{[key: string]: boolean | {isOpen: boolean, x: number, y: number}}>({});

  // Add new state to store search terms
  const [searchTerms, setSearchTerms] = useState<{[key: string]: string}>({});

  // Add state to track input values - Update to use nodeId_paramName as key
  const [inputValues, setInputValues] = useState<{[nodeId_paramName: string]: {min?: string, max?: string, step?: string}}>({});

  // Add a state to store current page
  const [currentPage, setCurrentPage] = useState(1);
  const imagesPerPage = 6;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Add state to store notification visibility
  const [notificationVisible, setNotificationVisible] = useState(false);

  // Add new state for modal
  const [modalVisible, setModalVisible] = useState(false);
  const [modalImageUrl, setModalImageUrl] = useState('');
  const [modalImageParams, setModalImageParams] = useState<{ [key: string]: any } | null>(null);

  // Add state for text inputs and AI writing modal
  const [textInputs, setTextInputs] = useState<{[nodeId_paramName: string]: string[]}>({});
  const [aiWritingModalVisible, setAiWritingModalVisible] = useState(false);
  const [aiWritingModalText, setAiWritingModalText] = useState('');
  const [aiGeneratedTexts, setAiGeneratedTexts] = useState<string[]>([]);
  const [aiWritingLoading, setAiWritingLoading] = useState(false);
  const [aiWritingNodeId, setAiWritingNodeId] = useState<string>('');
  const [aiWritingParamName, setAiWritingParamName] = useState<string>('');
  const [aiWritingError, setAiWritingError] = useState<string | null>(null);
  const [aiSelectedTexts, setAiSelectedTexts] = useState<{[key: string]: boolean}>({});

  // Add state for history screen
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);

  // Get dispatch from context to update screen state
  const { dispatch } = useChatContext();

  // Add a ref to store the polling timeout
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Add a ref to track the current polling session ID
  const pollingSessionIdRef = useRef<string | null>(null);
  const isInitial = useRef<boolean>(true)
  
  // Add loading state after other state declarations
  const [isLoading, setIsLoading] = useState(() => visible); // Initialize loading based on visibility
  const [isGetLocalstorage, setIsGetLocalstorage] = useState(false);

  // Load history items when component loads or when isHistoryVisible changes
  useEffect(() => {
    if (isHistoryVisible) {
      const items = loadHistoryItems();
      setHistoryItems(items);
    }
  }, [isHistoryVisible]);

  // Add function to handle AI text generation
  const handleAiWriting = async () => {
    utilsHandleAiWriting(
      aiWritingModalText,
      task_id,
      setAiWritingLoading,
      setAiWritingError,
      setAiGeneratedTexts,
      setAiSelectedTexts
    );
  };
  
  // Add function to handle text input changes - Use imported utility
  const handleTextInputChange = (nodeId: string, paramName: string, index: number, value: string) => {
    const currentTexts = utilsHandleTextInputChange(nodeId, paramName, index, value, textInputs, updateState);
    // Also update paramTestValues with the new value directly
    updateParamTestValues(nodeId, paramName, currentTexts);
  };
  
  // Add function to add a new text input - Use imported utility
  const handleAddTextInput = (nodeId: string, paramName: string) => {
    const updatedTexts = utilsHandleAddTextInput(nodeId, paramName, textInputs, updateState);
    // Also update paramTestValues
    updateParamTestValues(nodeId, paramName, updatedTexts);
  };
  
  // Add function to remove a text input - Use imported utility
  const handleRemoveTextInput = (nodeId: string, paramName: string, index: number) => {
    const updatedTexts = utilsHandleRemoveTextInput(nodeId, paramName, index, textInputs, updateState);
    // Also update paramTestValues
    updateParamTestValues(nodeId, paramName, updatedTexts);
  };
  
  // Add function to toggle text selection in AI writing modal
  const toggleTextSelection = (textKey: string) => {
    utilsToggleTextSelection(textKey, setAiSelectedTexts);
  };
  
  // Add function to add selected texts from AI modal
  const addSelectedTexts = () => {
    utilsAddSelectedTexts(
      aiWritingNodeId,
      aiWritingParamName,
      aiSelectedTexts,
      aiGeneratedTexts,
      aiWritingModalText,
      task_id,
      textInputs,
      updateState,
      updateParamTestValues,
      setAiWritingModalVisible
    );
  };
  
  // Add function to open AI writing modal
  const openAiWritingModal = (nodeId: string, paramName: string) => {
    utilsOpenAiWritingModal(
      nodeId,
      paramName,
      setAiWritingModalVisible,
      setAiWritingNodeId,
      setAiWritingParamName,
      setAiWritingModalText,
      setAiGeneratedTexts,
      setAiSelectedTexts,
      setAiWritingLoading,
      setAiWritingError
    );
  };

  // Add function to toggle history screen visibility
  const toggleHistoryScreen = (event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setIsHistoryVisible(prev => !prev);
  };

  // Add function to view a history item
  const handleViewHistoryItem = (historyItem: HistoryItem) => {
    setSelectedHistoryItem(historyItem);
    setIsHistoryVisible(false);
    
    // Set generated images from history item
    updateState(StateKey.GeneratedImages, historyItem.generatedImages || []);
    
    // Reset selected image index
    updateState(StateKey.SelectedImageIndex, null);
    
    // Set current page to 1
    updateState(StateKey.CurrentPage, 1);
  };

  // Add function to close history item view
  const handleCloseHistoryItem = (event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    setSelectedHistoryItem(null);
  };

  const doSaveState = (key: StateKey, value: any) => {
    const stateToSave = {
      currentScreen,
      selectedParams,
      task_id,
      isProcessing,
      isCompleted,
      completedCount,
      totalCount,
      selectedImageIndex,
      generatedImages,
      paramTestValues,
      searchTerms,
      inputValues,
      currentPage,
      textInputs
    };
    const prev = (stateToSave as any)[key as any];
    const nextForKey = isObj(prev) && isObj(value) ? { ...prev, ...value } : value;
    saveStateToLocalStorage({
      ...stateToSave,
      [key]: nextForKey
    });
  }

  const updateState = (key: StateKey, value: any) => {
    switch(key) {
      case StateKey.CurrentScreen:
        setCurrentScreen(value)
        break;
      case StateKey.SelectedParams:
        setSelectedParams(prev => isObj(prev) && isObj(value) ? { ...prev, ...value } : value)
        break;
      case StateKey.TaskId:   
        setTask_id(value);
        break;
      case StateKey.IsProcessing:
        setIsProcessing(value);
        break;
      case StateKey.IsCompleted:  
        setIsCompleted(value);
        break;
      case StateKey.CompletedCount:
        setCompletedCount(value);
        break;
      case StateKey.TotalCount:
        setTotalCount(value);
        break;
      case StateKey.SelectedImageIndex:
        setSelectedImageIndex(value);
        break;
      case StateKey.GeneratedImages:  
        setGeneratedImages(value);  
        break;
      case StateKey.ParamTestValues:
        setParamTestValues(prev => isObj(prev) && isObj(value) ? { ...prev, ...value } : value);
        break;
      case StateKey.SearchTerms:
        setSearchTerms(prev => isObj(prev) && isObj(value) ? { ...prev, ...value } : value);
        break;
      case StateKey.InputValues:
        setInputValues(value);
        break;
      case StateKey.CurrentPage:
        setCurrentPage(value);
        break;
      case StateKey.TextInputs:
        setTextInputs(value);
        break;
    }
    // Save state to localStorage after each update
    doSaveState(key, value);
  }

  // Add useEffect to initialize parameter test values when selectedNodes change
  useEffect(() => {
    if (!isGetLocalstorage || !selectedNodes || selectedNodes.length === 0) return;

    // Initialize empty parameter test values for any newly selected nodes
    const updatedParamTestValues = { ...paramTestValues };
    
    // Clean up any nodes that are no longer selected
    const selectedNodeIds = selectedNodes.map((node: any) => node.id.toString());
    const currentNodeIds = Object.keys(updatedParamTestValues);
    
    // Remove test values for nodes that are no longer selected
    currentNodeIds.forEach(nodeId => {
      if (!selectedNodeIds.includes(nodeId)) {
        delete updatedParamTestValues[nodeId];
      }
    });
    
    // Add empty entries for newly selected nodes
    selectedNodes.forEach((node: any) => {
      const nodeId = node.id.toString();
      if (!updatedParamTestValues[nodeId]) {
        updatedParamTestValues[nodeId] = {};
      }
    });
    
    // Update state if changes were made
    if (JSON.stringify(updatedParamTestValues) !== JSON.stringify(paramTestValues)) {
      updateState(StateKey.ParamTestValues, updatedParamTestValues);
    }
  }, [selectedNodes, paramTestValues, isGetLocalstorage]);

  // Add useEffect to update screen state in context when screen changes
  useEffect(() => {
    dispatch({ 
      type: 'SET_SCREEN_STATE', 
      payload: {
        currentScreen,
        isProcessing,
        isCompleted
      } 
    });
  }, [currentScreen, isProcessing, isCompleted, dispatch]);

  // Add style to document head
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = highlightPulseStyle;
    document.head.appendChild(styleElement);
    
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  // Add a useEffect to handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Only process if there are open dropdowns
      if (Object.values(openDropdowns).some(isOpen => isOpen)) {
        // Check if clicked element is inside dropdown-menu or its trigger
        const target = event.target as Element;
        
        // Check if the click was inside any dropdown menu
        const isInsideDropdown = !!target.closest('.dropdown-menu');
        
        // Check if the click was on a dropdown trigger button
        const isOnTrigger = !!target.closest('[data-dropdown]');
        
        // If click was outside both dropdown and trigger, close all dropdowns
        if (!isInsideDropdown && !isOnTrigger) {
          setOpenDropdowns({});
        }
      }
    };
    
    // Add listener to document once
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openDropdowns]);

  // Modify useEffect that uses localStorage key to use imported constant
  useEffect(() => {
    if (visible) {
      // Only generate a new task_id if we don't have one in localStorage
      const savedState = JSON.parse(localStorage.getItem(PARAM_DEBUG_STORAGE_KEY) || '{}');
      if (!savedState.task_id) {
        updateState(StateKey.TaskId, generateUUID());
      }
    }
  }, [visible]);

  useEffect(() => {
    if (!!isInitial.current) {
      isInitial.current = false;
      if (!!isProcessing) {
        let selectedImageNodeId: number | undefined = 0;
        const nodes = Object.values(app.graph._nodes_by_id) as ComfyNode[];
        const saveNodeIds: number[] = [];
        const previewNodeIds: number[] = [];
        
        for(const node of nodes) {
          if(node.type === "SaveImage") {
            saveNodeIds.push(node.id);
          } else if(node.type === "PreviewImage") {
            previewNodeIds.push(node.id);
          }
        }
        
        // Combine and set state
        const allImageNodeIds = [...saveNodeIds, ...previewNodeIds];      
        // If there's exactly one node, set it as selected
        if(allImageNodeIds.length === 1) {
          selectedImageNodeId = allImageNodeIds[0];
        } else if(allImageNodeIds.length > 1) {
          // If multiple nodes, enable selection warning
          selectedImageNodeId = undefined
        }
        console.log('isProcessing-->', selectedImageNodeId)
        handleStartGeneration(undefined, selectedImageNodeId)
      }
    }
  }, [isProcessing])
  // Modify the useEffect that loads state to handle loading state
  useEffect(() => {
    // Load state from localStorage when component becomes visible
    if (visible) {
      setIsLoading(true); // Set loading to true while we load state
      
      try {
        const savedState = localStorage.getItem(PARAM_DEBUG_STORAGE_KEY);
        if (savedState) {
          const parsedState = JSON.parse(savedState);
          console.log('parsedState-->', parsedState)
          // Only restore state if we have selected nodes
          if (!selectedNodes || selectedNodes.length === 0) {
            console.log("Not restoring parameter debug state: no nodes selected");
            setIsLoading(false);
            return;
          }
          
          // Restore all states
          if (parsedState.currentScreen !== undefined) {
            // if selectedNodes is changed, reset currentScreen to 0
            setCurrentScreen(isEqual(selectedNodes, currentSelectedNodes.current) ? parsedState.currentScreen : 0);
          }
          if (parsedState.selectedParams) setSelectedParams(parsedState.selectedParams);
          if (parsedState.task_id) setTask_id(parsedState.task_id);
          
          setIsProcessing(parsedState?.isProcessing);

          // Don't restore processing state if it was interrupted (e.g., by page refresh)
          // Only restore isCompleted if we have generated images
          const hasImages = parsedState.generatedImages && parsedState.generatedImages.length > 0;
          // if (parsedState.isProcessing !== undefined && !parsedState.isProcessing) {
          //   setIsProcessing(false);
          // }
          if (parsedState.isCompleted !== undefined && hasImages) {
            setIsCompleted(parsedState.isCompleted);
          }
          
          if (parsedState.completedCount !== undefined) setCompletedCount(parsedState.completedCount);
          if (parsedState.totalCount !== undefined) setTotalCount(parsedState.totalCount);
          if (parsedState.selectedImageIndex !== undefined) setSelectedImageIndex(parsedState.selectedImageIndex);
          if (parsedState.generatedImages) setGeneratedImages(parsedState.generatedImages);
          if (parsedState.paramTestValues) setParamTestValues(parsedState.paramTestValues);
          if (parsedState.searchTerms) setSearchTerms(parsedState.searchTerms);
          if (parsedState.inputValues) setInputValues(parsedState.inputValues);
          if (parsedState.currentPage !== undefined) setCurrentPage(parsedState.currentPage);
          if (parsedState.textInputs) setTextInputs(parsedState.textInputs);
          if (!isGetLocalstorage) setIsGetLocalstorage(true)
        }
      } catch (error) {
        console.error('Error loading parameter debug state:', error);
      } finally {
        currentSelectedNodes.current = selectedNodes
        // Set loading to false after loading (with a small delay to ensure all state is updated)
        setTimeout(() => {
          setIsLoading(false);
        }, 50);
      }
    } else {
      // Reset loading state when component becomes invisible
      setIsLoading(true);
    }

    // Save current state when component becomes invisible but don't clear it
    // return () => {
    //   if (!visible) return; // Don't do anything if already invisible
      
    //   const stateToSave = {
    //     currentScreen,
    //     selectedParams,
    //     task_id,
    //     isProcessing,
    //     isCompleted,
    //     completedCount,
    //     totalCount,
    //     selectedImageIndex,
    //     generatedImages,
    //     paramTestValues,
    //     searchTerms,
    //     inputValues,
    //     currentPage,
    //     textInputs
    //   };
    //   console.log('saveStateToLocalStorage-->', stateToSave)
    //   saveStateToLocalStorage(stateToSave);
    // };
  }, [visible, selectedNodes]);

  // Helper function to reset all state variables - Use imported localStorage utility
  const resetAllStates = (clearStorage = false) => {
    utilsResetAllStates(
      setCurrentScreen,
      setSelectedParams,
      setTask_id,
      cleanupPolling,
      setIsProcessing,
      setIsCompleted,
      setCompletedCount,
      setTotalCount,
      setSelectedImageIndex,
      setGeneratedImages,
      setParamTestValues,
      setOpenDropdowns,
      setSearchTerms,
      setInputValues,
      setCurrentPage,
      setErrorMessage,
      setNotificationVisible,
      setModalVisible,
      setModalImageUrl,
      setModalImageParams,
      setTextInputs,
      setAiWritingModalVisible,
      setAiWritingModalText,
      setAiGeneratedTexts,
      setAiWritingLoading,
      setAiWritingNodeId,
      setAiWritingParamName,
      setAiWritingError,
      setAiSelectedTexts,
      clearStorage
    );
    
    // Reset history states
    setIsHistoryVisible(false);
    setSelectedHistoryItem(null);
  };

  // Add useEffect to save state when relevant states change - Use imported localStorage utility
  // useEffect(() => {
  //   // if (!visible || !selectedNodes || selectedNodes?.length === 0) return;
    
  //   // Use a timeout to debounce saves (only save after 500ms of no changes)
  //   // const saveTimeout = setTimeout(() => {
  //     if (!visible || !selectedNodes || selectedNodes?.length === 0) return;

  //     const stateToSave = {
  //       currentScreen,
  //       selectedParams,
  //       task_id,
  //       isProcessing,
  //       isCompleted,
  //       completedCount,
  //       totalCount,
  //       selectedImageIndex,
  //       generatedImages,
  //       paramTestValues,
  //       searchTerms,
  //       inputValues,
  //       currentPage,
  //       textInputs
  //     };
  //     console.log('saveStateToLocalStorage-->', stateToSave)
  //     // saveStateToLocalStorage(stateToSave);
  //   // }, 500);
    
  //   // Clear timeout if state changes again before it fires
  //   // return () => clearTimeout(saveTimeout);
  // }, [
  //   visible,
  //   selectedNodes,
  //   currentScreen,
  //   selectedParams,
  //   task_id,
  //   isProcessing,
  //   isCompleted,
  //   completedCount,
  //   totalCount,
  //   selectedImageIndex,
  //   generatedImages,
  //   paramTestValues,
  //   searchTerms,
  //   inputValues,
  //   currentPage,
  //   textInputs
  // ]);

  // Navigate to next screen
  const handleNext = (event?: React.MouseEvent) => {
    utilsHandleNext(
      currentScreen,
      selectedParams,
      paramTestValues,
      textInputs,
      selectedNodes,
      setErrorMessage,
      generateParameterCombinations,
      updateState,
      event
    );
  };

  // Navigate to previous screen
  const handlePrevious = (event?: React.MouseEvent) => {
    utilsHandlePrevious(
      currentScreen,
      selectedNodes,
      paramTestValues,
      textInputs,
      isCompleted,
      setErrorMessage,
      updateState,
      event
    );
  };

  // Handle parameter selection
  const handleParamSelect = (param: string, event?: React.MouseEvent) => {
    utilsHandleParamSelect(param, selectedParams, paramTestValues, updateState, event);
  };
  
  // Toggle dropdown open status - Use nodeId_paramName as key
  const toggleDropdown = (nodeId: string, paramName: string, event: React.MouseEvent) => {
    utilsToggleDropdown(nodeId, paramName, event, openDropdowns, setOpenDropdowns);
  };
  
  // Update parameter test values - Modify to support new parameter structure
  const updateParamTestValues = (nodeId: string, paramName: string, values: any[]) => {
    utilsUpdateParamTestValues(nodeId, paramName, values, paramTestValues, updateState);
  };
  
  // Handle selecting specific test values - Modify to support new parameter structure
  const handleTestValueSelect = (nodeId: string, paramName: string, value: any, event?: React.MouseEvent) => {
    utilsHandleTestValueSelect(nodeId, paramName, value, paramTestValues, updateState, event);
  };

  // Add processing search - Use nodeId_paramName as key
  const handleSearch = (nodeId: string, paramName: string, term: string) => {
    utilsHandleSearch(nodeId, paramName, term, searchTerms, updateState);
  };

  // Add select all - Modify to support new parameter structure
  const handleSelectAll = (nodeId: string, paramName: string, values: any[]) => {
    utilsHandleSelectAll(nodeId, paramName, values, paramTestValues, updateParamTestValues);
  };

  // Handle page change
  const handlePageChange = (newPage: number, event?: React.MouseEvent) => {
    utilsHandlePageChange(
      newPage,
      imagesPerPage,
      generatedImages,
      updateState,
      event
    );
  };

  // Handle polling cleanup function
  const cleanupPolling = () => {
    utilsCleanupPolling(pollingTimeoutRef, pollingSessionIdRef);
  };

  // Add useEffect cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupPolling();
    };
  }, []);

  // Handle start generation - Modified to clean up before starting
  const handleStartGeneration = async (event?: React.MouseEvent, selectedNodeId?: number) => {
    console.log('handleStartGeneration-->', selectedNodeId)
    utilsHandleStartGeneration(
      paramTestValues,
      task_id,
      setErrorMessage,
      pollingSessionIdRef,
      pollingTimeoutRef,
      generateParameterCombinations,
      app,
      updateState,
      event,
      selectedNodeId
    );
  };

  // Handle selecting an image
  const handleSelectImage = (index: number, event?: React.MouseEvent) => {
    // utilsHandleSelectImage(index, setSelectedImageIndex, event);
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    updateState(StateKey.SelectedImageIndex, index);
  };

  // Add new function to open image modal
  const openImageModal = (imageUrl: string, params: { [key: string]: any }, event: React.MouseEvent) => {
    utilsOpenImageModal(
      imageUrl,
      params,
      selectedNodes,
      setModalImageUrl,
      setModalImageParams,
      setModalVisible,
      event
    );
  };

  // Add new function to close image modal
  const closeImageModal = (event?: React.MouseEvent) => {
    utilsCloseImageModal(
      setModalVisible,
      event
    );
  };

  // Handle applying selected image
  const handleApplySelected = async (event?: React.MouseEvent) => {
    utilsHandleApplySelected(
      selectedImageIndex,
      generatedImages,
      app,
      task_id,
      paramTestValues,
      setNotificationVisible,
      event
    );
  };

  // Modified handle close to implement different behaviors based on current screen
  const handleClose = (event?: React.MouseEvent, nodeIndex?: number) => {
    utilsHandleClose(
      currentScreen,
      selectedNodes,
      nodeIndex,
      dispatch,
      onClose,
      resetAllStates,
      event
    );
  };

  // Add a wrapper component for common modal display
  const CommonModals = () => (
    <>
      <ImageModal
        visible={modalVisible}
        imageUrl={modalImageUrl}
        params={modalImageParams || {}}
        onClose={closeImageModal}
      />
    </>
  );

  // If showing a history item
  if (selectedHistoryItem) {
    return (
      <div 
        className="flex-1 overflow-y-auto bg-gray-50 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <HistoryItemScreen 
          historyItem={selectedHistoryItem}
          selectedImageIndex={selectedImageIndex}
          handleSelectImage={handleSelectImage}
          handleClose={handleCloseHistoryItem}
          currentPage={currentPage}
          handlePageChange={handlePageChange}
          imagesPerPage={imagesPerPage}
          modalVisible={modalVisible}
          modalImageUrl={modalImageUrl}
          modalImageParams={modalImageParams}
          openImageModal={openImageModal}
          closeImageModal={closeImageModal}
        />
      </div>
    );
  }

  // If showing history screen
  if (isHistoryVisible) {
    return (
      <div 
        className="flex-1 overflow-y-auto bg-gray-50 p-4 flex flex-col h-full max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <HistoryScreen 
          historyItems={historyItems}
          onViewHistoryItem={handleViewHistoryItem}
          onClose={toggleHistoryScreen}
        />
      </div>
    );
  }

  // Conditionally render based on whether nodes are selected
  // First check if loading
  if (isLoading && visible && selectedNodes.length > 0) {
    return (
      <div 
        className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 rounded-lg shadow-sm relative flex flex-col items-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="mt-4 text-gray-600 text-sm">Loading interface...</div>
        </div>
        
        <ImageModal
          visible={modalVisible}
          imageUrl={modalImageUrl}
          params={modalImageParams || {}}
          onClose={closeImageModal}
        />
      </div>
    );
  }

  // Screen original - Only stop propagation, don't prevent default
  if (!visible || selectedNodes.length === 0) {
    return (
      <div 
        className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-w-lg p-8 rounded-lg shadow-sm border border-blue-100 relative">
          <div className="absolute top-3 right-3 flex">
            {/* Show History Icon */}
            <button 
              className="text-blue-500 hover:text-blue-700 mr-2"
              onClick={toggleHistoryScreen}
              title="Show History"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
            </button>
            <button 
              className="text-gray-400 hover:text-gray-600"
              onClick={handleClose}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mb-6 text-center">
            <h3 className="text-base font-bold text-blue-600 mb-2">GenLab</h3>
            <div className="h-1 w-16 bg-blue-500 mx-auto rounded-full mb-4"></div>
          </div>
          
          <div className="space-y-4">
            <div className="text-left mb-4">
              <h3 className="text-sm font-medium text-gray-800 mb-3">Batch-test parameters & find the best combo in one click.</h3>
              <div className="h-px w-full bg-gray-200 my-4"></div>
            </div>

            <div className="text-left">
              <h4 className="text-base font-medium text-gray-800 mb-4">How to use</h4>
              
              <div className="space-y-2 mb-4">
                <p className="text-sm text-gray-700">
                  <span className="font-bold">1 - </span>Click any node(hold Shift to select multiple nodes)
                </p>
                <p className="text-sm text-gray-700">
                  <span className="font-bold">2 - </span>Set parameter ranges and start batch generation.
                </p>
              </div>
              
              <div className="h-px w-full bg-gray-200 my-4"></div>
              
              <p className="text-sm text-blue-600 mt-6">Let's select a node to begin!</p>
            </div>
          </div>
        </div>
        
        <ImageModal
          visible={modalVisible}
          imageUrl={modalImageUrl}
          params={modalImageParams || {}}
          onClose={closeImageModal}
        />
      </div>
    );
  }

  // Screen 5: If we're in completed state, show the results gallery
  if (isCompleted) {
    return (
      <div 
        className="flex-1 overflow-y-auto bg-gray-50 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <ResultGalleryScreen 
          generatedImages={generatedImages}
          selectedImageIndex={selectedImageIndex}
          handleSelectImage={handleSelectImage}
          handleApplySelected={handleApplySelected}
          handlePrevious={handlePrevious}
          handleClose={handleClose}
          currentPage={currentPage}
          handlePageChange={handlePageChange}
          imagesPerPage={imagesPerPage}
          notificationVisible={notificationVisible}
          modalVisible={modalVisible}
          modalImageUrl={modalImageUrl}
          modalImageParams={modalImageParams}
          openImageModal={openImageModal}
          closeImageModal={closeImageModal}
        />
      </div>
    );
  }

  // Screen 4: If processing, show the loading overlay
  if (isProcessing) {
    return (
      <div 
        className="flex-1 overflow-y-auto bg-gray-50 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <ProcessingScreen 
          selectedNodes={selectedNodes}
          paramTestValues={paramTestValues}
          selectedParams={selectedParams}
          totalCount={totalCount}
          completedCount={completedCount}
          errorMessage={errorMessage}
          handleClose={handleClose}
          updateState={updateState}
          cleanupPolling={cleanupPolling}
        />
        
        <CommonModals />
      </div>
    );
  }

  // Screen 1: Select parameters
  if (currentScreen === 0) {
    return (
      <div 
        className="flex-1 overflow-y-auto bg-gray-50 p-4 flex flex-col h-full max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <InitialScreen 
          selectedNodes={selectedNodes}
          handleParamSelect={handleParamSelect}
          selectedParams={selectedParams}
          handleNext={handleNext}
          handleClose={handleClose}
        />
        
        <CommonModals />
      </div>
    );
  }

  // Screen 2: Configure parameter options
  if (currentScreen === 1) {
    return (
      <div 
        className="flex-1 overflow-y-auto bg-gray-50 p-4 flex flex-col h-full max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <ConfigureParameterScreen 
          selectedNodes={selectedNodes}
          paramTestValues={paramTestValues}
          selectedParams={selectedParams}
          updateParamTestValues={updateParamTestValues}
          toggleDropdown={toggleDropdown}
          openDropdowns={openDropdowns}
          handleTestValueSelect={handleTestValueSelect}
          searchTerms={searchTerms}
          handleSearch={handleSearch}
          handleSelectAll={handleSelectAll}
          handleNext={handleNext}
          handlePrevious={handlePrevious}
          handleClose={handleClose}
          inputValues={inputValues}
          updateState={updateState}
          textInputs={textInputs}
          handleTextInputChange={handleTextInputChange}
          handleAddTextInput={handleAddTextInput}
          handleRemoveTextInput={handleRemoveTextInput}
          openAiWritingModal={openAiWritingModal}
        />
        
        {/* AI Writing Modal */}
        <AIWritingModal 
          visible={aiWritingModalVisible}
          aiWritingModalText={aiWritingModalText}
          setAiWritingModalText={setAiWritingModalText}
          aiGeneratedTexts={aiGeneratedTexts}
          aiSelectedTexts={aiSelectedTexts}
          aiWritingLoading={aiWritingLoading}
          aiWritingError={aiWritingError}
          handleAiWriting={handleAiWriting}
          toggleTextSelection={toggleTextSelection}
          addSelectedTexts={addSelectedTexts}
          onClose={() => setAiWritingModalVisible(false)}
        />
        
        <CommonModals />
      </div>
    );
  }

  // Screen 3: Final configuration
  return (
    <div 
      className="flex-1 overflow-y-auto bg-gray-50 p-4 flex flex-col h-full max-h-[80vh]"
      onClick={(e) => e.stopPropagation()}
    >
      <ConfirmConfigurationScreen 
        selectedNodes={selectedNodes}
        paramTestValues={paramTestValues}
        selectedParams={selectedParams}
        totalCount={totalCount}
        errorMessage={errorMessage}
        handlePrevious={handlePrevious}
        handleStartGeneration={handleStartGeneration}
        handleClose={handleClose}
      />
      
      <CommonModals />
    </div>
  );
}; 