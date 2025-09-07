import { useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiService } from '../services/apiService';
import type { FileData, ValidationResult } from '@shared/types';

export const useFileUpload = () => {
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const validateFileMutation = useMutation({
    mutationFn: (fileData: FileData) => ApiService.validateFile(fileData),
    onSuccess: (data: ValidationResult) => {
      console.log('File validation successful:', data);
    },
    onError: (error) => {
      console.error('File validation failed:', error);
    },
  });

  const uploadFileMutation = useMutation({
    mutationFn: (file: File) => 
      ApiService.uploadFile(file, setUploadProgress),
    onSuccess: (data: FileData) => {
      console.log('File upload successful:', data);
      setUploadProgress(0);
    },
    onError: (error) => {
      console.error('File upload failed:', error);
      setUploadProgress(0);
    },
  });

  const processFileUpload = useCallback(async (file: File): Promise<{
    fileData: FileData;
    validationResults: ValidationResult;
  }> => {
    // Create file data object for validation
    const fileData: FileData = {
      name: file.name,
      content: await file.text(),
      size: file.size,
      lastModified: file.lastModified,
    };

    // Validate the file content
    const validationResults = await validateFileMutation.mutateAsync(fileData);

    return { fileData, validationResults };
  }, [validateFileMutation]);

  const isValidating = validateFileMutation.isPending;
  const isUploading = uploadFileMutation.isPending;
  const validationError = validateFileMutation.error;
  const uploadError = uploadFileMutation.error;

  return {
    processFileUpload,
    uploadProgress,
    isValidating,
    isUploading,
    validationError,
    uploadError,
    isLoading: isValidating || isUploading,
  };
};
