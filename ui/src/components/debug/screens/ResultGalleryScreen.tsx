// Copyright (C) 2025 AIDC-AI
// Licensed under the MIT License.

import React from 'react';
import { ImageModal } from '../modals/ImageModal';

import VirtualGrid from '../../virtualGrid';

interface GeneratedImage {
  url: string;
  params: { [key: string]: any };
  index?: number;
}
interface ResultGalleryScreenProps {
  generatedImages: GeneratedImage[];
  selectedImageIndex: number | null;
  handleSelectImage: (index: number, event?: React.MouseEvent) => void;
  handleApplySelected: (event?: React.MouseEvent) => void;
  handlePrevious: (event?: React.MouseEvent) => void;
  handleClose: (event?: React.MouseEvent) => void;
  currentPage: number;
  handlePageChange: (newPage: number, event?: React.MouseEvent) => void;
  imagesPerPage: number;
  notificationVisible: boolean;
  modalVisible: boolean;
  modalImageUrl: string;
  modalImageParams: { [key: string]: any } | null;
  openImageModal: (imageUrl: string, params: { [key: string]: any }, event: React.MouseEvent) => void;
  closeImageModal: (event?: React.MouseEvent) => void;
}

export const ResultGalleryScreen: React.FC<ResultGalleryScreenProps> = ({
  generatedImages,
  selectedImageIndex,
  handleSelectImage,
  handleApplySelected,
  handleClose,
  notificationVisible,
  modalVisible,
  modalImageUrl,
  modalImageParams,
  openImageModal,
  closeImageModal
}) => {
  const renderItem = (image: GeneratedImage, index: number) => (
    <div 
      key={index.toString()} 
      className={`relative flex flex-col rounded-lg overflow-hidden border ${selectedImageIndex === index ? 'border-2 border-green-400' : 'border-gray-200'}`}
      style={{
        boxShadow: selectedImageIndex === index ? 'inset 0 -16px 24px 0 rgba(255, 255, 255, 0.25)' : ''
      }}
      onClick={(e) => handleSelectImage(index, e)}
    >
      {/* Zoom icon */}
      <button 
        className="absolute top-2 right-2 bg-white bg-opacity-75 rounded-full p-0.5 text-gray-600 hover:text-gray-900 shadow-sm z-10"
        onClick={(e) => openImageModal(image.url, image.params, e)}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
        </svg>
      </button>
      <div className={`aspect-square`}>
        <img 
          src={image.url} 
          alt={`Generated image ${index+1}`} 
          className="w-full h-full object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.onerror = null; // 防止循环触发
            target.src = "data:image/svg+xml,%3Csvg t='1760082631200' class='icon' viewBox='0 0 1024 1024' version='1.1' xmlns='http://www.w3.org/2000/svg' p-id='4747' width='56' height='56' fill='%238a8a8a'%3E%3Cpath d='M371.2 737.536l137.728-247.808c5.376-9.472 7.936-20.224 7.936-30.976 0-19.456-8.704-37.632-24.064-49.92L222.208 192.512 437.76 1.28H118.528C53.248 1.536 0 54.784 0 120.064v783.36c0 65.536 53.248 118.784 118.784 118.784h566.528L371.2 737.536z m-252.672 211.712c-25.088 0-45.568-20.48-45.568-45.824v-783.36c0-24.832 19.712-44.8 44.288-45.568h109.312l-71.68 62.976C137.984 150.784 128.256 170.752 128.256 192.512c0 21.504 9.728 41.728 26.368 55.04l271.104 216.832-133.376 240.128c-6.144 10.752-9.216 23.296-9.216 35.84 0 21.504 9.216 41.728 25.088 55.552l168.704 153.088h-358.4z' p-id='4748'%3E%3C/path%3E%3Cpath d='M905.216 1.536H565.504c-1.792 2.048-156.16 135.936-156.16 135.936-16.896 13.312-26.624 33.28-26.624 55.04 0 21.504 9.728 41.728 26.368 55.04l271.104 216.832-133.376 240.128c-6.144 10.752-9.216 23.296-9.216 35.84 0 21.504 9.216 41.728 25.088 55.552l249.088 226.304h93.44c65.536 0 118.784-53.248 118.784-118.784v-783.36c0-65.28-53.248-118.528-118.784-118.528z m45.824 901.888c0 25.344-20.48 45.824-45.824 45.824h-47.104l-232.448-211.456 137.728-247.808c5.376-9.472 7.936-20.224 7.936-30.976 0-19.456-8.704-37.632-24.064-49.92L476.672 192.512l133.632-118.016h294.912c25.344 0 45.824 20.48 45.824 45.568v783.36z' p-id='4749'%3E%3C/path%3E%3C/svg%3E";
          }}
        />
      </div>
      <div className="p-2 text-xs text-gray-600 bg-white max-h-16 overflow-y-auto">
        {Object.entries(image.params || {})
          // Filter out nodeParams and other complex objects from display
          .filter(([paramName, value]) => 
            paramName !== 'nodeParams' && 
            typeof value !== 'object'
          )
          .map(([paramName, value]) => (
            <div key={paramName}>{paramName}: {String(value)}</div>
          ))
        }
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col relative bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="mb-4 border-b pb-2 flex justify-between items-center">
        <div>
          <h3 className="text-base font-medium text-gray-800">Generation Complete</h3>
          <p className="text-xs text-gray-500">All {generatedImages.length} images have been generated.</p>
        </div>
        <button 
          className="text-gray-400 hover:text-gray-600"
          onClick={handleClose}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      {/* Notification toast */}
      {notificationVisible && (
        <div className="fixed top-4 right-4 bg-green-100 border-l-4 border-green-500 text-green-700 p-3 shadow-md rounded animate-fade-in-out z-50">
          <div className="flex items-center">
            <div className="py-1">
              <svg className="h-4 w-4 text-green-500 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-xs">Parameters has been applied.</p>
          </div>
        </div>
      )}

      <div className='flex-1 min-h-0'>
        <VirtualGrid 
          items={generatedImages} 
          renderItem={renderItem} 
        />
      </div>
      
      <div className="mt-6 flex justify-end">
        <button
          onClick={(e) => handleApplySelected(e)}
          className="px-3 py-1.5 text-xs bg-pink-200 text-pink-700 rounded-md hover:bg-pink-300 transition-colors"
          disabled={selectedImageIndex === null}
        >
          Apply Selected
        </button>
      </div>
      
      {/* Image Modal */}
      <ImageModal
        visible={modalVisible}
        imageUrl={modalImageUrl}
        params={modalImageParams || {}}
        onClose={closeImageModal}
      />
    </div>
  );
}; 