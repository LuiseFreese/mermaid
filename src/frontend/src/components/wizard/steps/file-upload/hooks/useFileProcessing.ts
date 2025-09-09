/**
 * Custom hook for file processing
 * Handles file upload, content reading, CDM detection, and validation
 */

import { useState, useCallback } from 'react';
import { findCDMEntitiesInContent } from '../utils/cdmEntityList';
import { validateERDContent } from '../utils/validationRules';
import type { FileProcessingResult, CDMDetectionResult } from '../types/file-upload.types';
import type { ValidationResult } from '../types/validation.types';

export interface UseFileProcessingResult {
  isProcessing: boolean;
  isLoading: boolean; // Alias for compatibility
  processingError: string | null;
  lastProcessedFile: File | null;
  lastProcessingResult: FileProcessingResult | null;
  processFile: (file: File) => Promise<FileProcessingResult>;
  resetProcessing: () => void;
}

/**
 * Hook for managing comprehensive file upload and processing
 * @returns File processing state and management functions
 */
export const useFileProcessing = (): UseFileProcessingResult => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [lastProcessedFile, setLastProcessedFile] = useState<File | null>(null);
  const [lastProcessingResult, setLastProcessingResult] = useState<FileProcessingResult | null>(null);

  /**
   * Process an uploaded file with full analysis
   */
  const processFile = useCallback(async (file: File): Promise<FileProcessingResult> => {
    setIsProcessing(true);
    setProcessingError(null);

    try {
      // Step 1: Validate file type
      if (!file.name.endsWith('.mmd')) {
        throw new Error('Invalid file type. Please select a .mmd file.');
      }

      // Step 2: Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        throw new Error('File too large. Maximum size is 10MB.');
      }

      // Step 3: Read file content
      const content = await readFileContent(file);

      // Step 4: Validate content is not empty
      if (!content.trim()) {
        throw new Error('File is empty or contains no valid content.');
      }

      // Step 5: Basic validation for ERD content
      if (!content.includes('erDiagram')) {
        throw new Error('File does not appear to contain a valid Mermaid ERD diagram.');
      }

      // Step 6: Perform CDM detection
      const cdmEntities = findCDMEntitiesInContent(content);
      const cdmDetectionResult: CDMDetectionResult = {
        detected: cdmEntities.length > 0,
        entities: cdmEntities,
        choice: null // Will be set by user interaction
      };

      // Step 7: Perform validation analysis
      const validationResult: ValidationResult = validateERDContent(content);

      // Step 8: Create comprehensive result
      const result: FileProcessingResult = {
        success: true,
        file,
        content,
        cdmDetection: cdmDetectionResult,
        validation: {
          hasIssues: !validationResult.isValid || validationResult.hasWarnings,
          issues: validationResult.issues,
          namingConflicts: validationResult.issues
            .filter(issue => issue.type === 'naming')
            .map(issue => issue.entityName || ''),
          hasChoiceIssues: validationResult.issues.some(issue => issue.type === 'choice'),
          hasStatusIssues: validationResult.issues.some(issue => issue.type === 'status'),
          hasNamingIssues: validationResult.issues.some(issue => issue.type === 'naming')
        }
      };

      setLastProcessedFile(file);
      setLastProcessingResult(result);

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error processing file';
      setProcessingError(errorMessage);
      
      const errorResult: FileProcessingResult = {
        success: false,
        error: errorMessage
      };

      setLastProcessingResult(errorResult);
      return errorResult;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  /**
   * Reset processing state
   */
  const resetProcessing = useCallback(() => {
    setIsProcessing(false);
    setProcessingError(null);
    setLastProcessedFile(null);
    setLastProcessingResult(null);
  }, []);

  return {
    isProcessing,
    isLoading: isProcessing, // Alias for compatibility
    processingError,
    lastProcessedFile,
    lastProcessingResult,
    processFile,
    resetProcessing
  };
};

/**
 * Helper function to read file content as text
 */
const readFileContent = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        resolve(content);
      } else {
        reject(new Error('Failed to read file content as text'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
};
