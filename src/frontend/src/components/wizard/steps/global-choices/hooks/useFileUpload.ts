/**
 * Hook for managing custom choices file upload and parsing
 */

import { useState, useCallback } from 'react';
import { useWizardContext } from '../../../../../context/WizardContext';
import type { UseFileUploadResult } from '../types';

export const useFileUpload = (): UseFileUploadResult => {
  const { wizardData, updateWizardData } = useWizardContext();
  const { uploadedGlobalChoices } = wizardData;
  
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const clearUpload = useCallback(() => {
    setUploadedFile(null);
    setUploadError(null);
    updateWizardData({ uploadedGlobalChoices: [] });
  }, [updateWizardData]);

  const handleFileUploadWrapper = async (file: File) => {
    try {
      setIsUploading(true);
      setUploadError(null);
      
      // Handle the file upload logic
      setUploadedFile(file);
      
      // Parse the file content (mock implementation)
      const choices = await parseJsonFile(file);
      updateWizardData({ uploadedGlobalChoices: choices });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const parseJsonFile = async (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = JSON.parse(e.target?.result as string);
          resolve(content.globalChoices || []);
        } catch (error) {
          reject(new Error('Invalid JSON format'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  return {
    uploadedFile,
    uploadedChoices: (uploadedGlobalChoices || []).map(choice => ({
      ...choice,
      options: choice.options || []
    })),
    isUploading,
    uploadError,
    handleFileUpload: handleFileUploadWrapper,
    uploadFile: handleFileUploadWrapper,
    clearUpload,
    validateFile: async (file: File) => {
      return file.type === 'application/json' && file.size < 5 * 1024 * 1024;
    },
    parseJsonFile,
    isValid: !uploadError && uploadedGlobalChoices !== null,
    errors: uploadError ? [{ field: 'upload', message: uploadError, type: 'upload' as const }] : []
  };
};
