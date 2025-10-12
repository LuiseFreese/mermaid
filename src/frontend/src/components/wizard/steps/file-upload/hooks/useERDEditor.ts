import { useState, useCallback } from 'react';
import { ApiService } from '../../../../../services/apiService';

interface UseERDEditorOptions {
  correctedErdContent: string | null;
  uploadedFile: File | null;
  importSource: string | null;
  entityChoice: 'cdm' | 'custom' | null;
  onContentUpdate: (content: string) => void;
  onValidationComplete: (results: any) => void;
  onValidationError: (error: string) => void;
}

export interface UseERDEditorReturn {
  isEditingERD: boolean;
  editedERDContent: string;
  copySuccess: boolean;
  handleCopyERD: () => Promise<void>;
  handleEditERD: () => void;
  handleSaveERD: () => Promise<void>;
  handleCancelERD: () => void;
  setEditedERDContent: (content: string) => void;
}

/**
 * Custom hook to handle ERD editing operations
 * Manages edit mode, copy/paste, save/cancel operations
 */
export const useERDEditor = ({
  correctedErdContent,
  uploadedFile,
  importSource,
  entityChoice,
  onContentUpdate,
  onValidationComplete,
  onValidationError
}: UseERDEditorOptions): UseERDEditorReturn => {
  const [isEditingERD, setIsEditingERD] = useState(false);
  const [editedERDContent, setEditedERDContent] = useState<string>('');
  const [copySuccess, setCopySuccess] = useState(false);

  /**
   * Copy ERD content to clipboard
   */
  const handleCopyERD = useCallback(async () => {
    const contentToCopy = isEditingERD ? editedERDContent : correctedErdContent;
    if (!contentToCopy) return;
    
    try {
      await navigator.clipboard.writeText(contentToCopy);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy ERD:', error);
    }
  }, [correctedErdContent, isEditingERD, editedERDContent]);

  /**
   * Enter edit mode
   */
  const handleEditERD = useCallback(() => {
    setIsEditingERD(true);
    setEditedERDContent(correctedErdContent || '');
  }, [correctedErdContent]);

  /**
   * Save edited content and re-validate
   */
  const handleSaveERD = useCallback(async () => {
    setIsEditingERD(false);
    
    try {
      // For Dataverse imports, skip validation and just update the content
      if (importSource === 'dataverse') {
        onContentUpdate(editedERDContent);
        console.log('🔍 DEBUG: Dataverse import - skipping validation, just updating content');
        return;
      }
      
      // For file uploads, re-validate the edited content
      console.log('🔍 DEBUG: Re-validating edited ERD content');
      const validationResult = await ApiService.validateFile({
        name: uploadedFile?.name || 'edited-diagram.mmd',
        content: editedERDContent,
        size: editedERDContent.length,
        lastModified: Date.now()
      }, entityChoice || undefined);
      
      console.log('🔧 DEBUG: Validation result after edit:', {
        hasEntities: !!validationResult.entities,
        entitiesCount: validationResult.entities?.length || 0,
        hasCorrectedERD: !!validationResult.correctedERD
      });
      
      // Update with validation results
      const correctedERD = validationResult.correctedERD || editedERDContent;
      onContentUpdate(correctedERD);
      onValidationComplete(validationResult);
      
      console.log('✅ DEBUG: Content saved and re-validated successfully');
    } catch (error) {
      console.error('🚨 ERROR: Validation failed after edit:', error);
      const errorMessage = error instanceof Error ? error.message : 'Validation failed';
      onValidationError(errorMessage);
      // Still update with the edited content even if validation fails
      onContentUpdate(editedERDContent);
    }
  }, [editedERDContent, importSource, uploadedFile, entityChoice, onContentUpdate, onValidationComplete, onValidationError]);

  /**
   * Cancel editing and discard changes
   */
  const handleCancelERD = useCallback(() => {
    setIsEditingERD(false);
    setEditedERDContent('');
  }, []);

  return {
    isEditingERD,
    editedERDContent,
    copySuccess,
    handleCopyERD,
    handleEditERD,
    handleSaveERD,
    handleCancelERD,
    setEditedERDContent
  };
};
