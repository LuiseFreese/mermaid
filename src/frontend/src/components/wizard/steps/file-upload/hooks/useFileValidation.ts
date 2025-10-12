import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ApiService } from '../../../../../services/apiService';
import { ValidationWarning } from '../../../../../../../shared/types';

interface FileData {
  name: string;
  content: string;
  size: number;
  lastModified: number;
}

interface UseFileValidationOptions {
  originalErdContent: string | null;
  correctedErdContent: string | null;
  uploadedFile: File | null;
  entityChoice: 'cdm' | 'custom' | null;
  validationResults: any;
  fixedIssues: Set<string>;
  onValidationComplete: (results: any) => void;
  onContentUpdate: (content: string) => void;
  onFixedIssuesUpdate: (issues: Set<string>) => void;
}

export interface UseFileValidationReturn {
  isValidating: boolean;
  validationError: string | null;
  hasBackendWarnings: boolean;
  hasAnyIssues: boolean;
  validateFile: (file: FileData, entityChoice?: 'cdm' | 'custom') => Promise<any>;
  revalidateWithChoice: () => Promise<void>;
  handleBackendWarningFix: (warningOrId: any) => Promise<void>;
  applyAllFixes: () => Promise<void>;
  applyChoiceColumnFix: () => void;
  applyNamingConflictFixForEntity: (entityName: string) => void;
  setValidationError: (error: string | null) => void;
}

/**
 * Custom hook to handle file validation logic
 * Manages validation state, API calls, error handling, and fix application
 */
export const useFileValidation = ({
  originalErdContent,
  correctedErdContent,
  uploadedFile,
  entityChoice,
  validationResults,
  fixedIssues,
  onValidationComplete,
  onContentUpdate,
  onFixedIssuesUpdate
}: UseFileValidationOptions): UseFileValidationReturn => {
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const lastRevalidatedChoiceRef = useRef<string | null>(null);
  const revalidationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if there are any backend validation warnings
  const hasBackendWarnings = useMemo(() => {
    // For CDM entities, trust the backend completely - if user selected CDM, no frontend warnings needed
    if (entityChoice === 'cdm') {
      console.log('🔧 DEBUG: CDM entity choice - trusting backend validation (no frontend warnings)');
      return false;
    }

    if (!validationResults?.warnings) {
      console.log('🔧 DEBUG: No validation results or warnings found');
      return false;
    }
    
    const totalWarnings = validationResults.warnings.length;
    console.log('🔧 DEBUG: Processing warnings for non-CDM entities:', {
      totalWarnings,
      entityChoice
    });
    
    // For non-CDM entities, check each warning
    const visibleWarnings = validationResults.warnings.filter((warning: any) => {
      // Check if this specific warning has been fixed by the user
      if (fixedIssues.has(warning.id)) {
        console.log('🔧 DEBUG: Warning filtered out (already fixed):', warning.id, warning.type);
        return false;
      }
      
      // Count all non-auto-fixed warnings except pure info messages
      return !warning.autoFixed && warning.severity !== 'info';
    });
    
    const hasWarnings = visibleWarnings.length > 0;
    console.log('🔧 DEBUG: Final hasBackendWarnings result:', {
      visibleWarningsCount: visibleWarnings.length,
      hasWarnings
    });
    
    return hasWarnings;
  }, [validationResults, entityChoice, fixedIssues]);
  
  // Check if ERD has any issues at all
  const hasAnyIssues = hasBackendWarnings;

  /**
   * Validate a file with the backend
   */
  const validateFile = useCallback(async (file: FileData, choice?: 'cdm' | 'custom') => {
    setIsValidating(true);
    setValidationError(null);

    try {
      console.log('🔍 DEBUG: Validating file with entityChoice:', choice);
      
      const validationResult = await ApiService.validateFile(file, choice);
      
      console.log('✅ DEBUG: Validation completed', {
        hasEntities: !!validationResult.entities,
        entitiesCount: validationResult.entities?.length || 0,
        warningsCount: validationResult.warnings?.length || 0
      });

      onValidationComplete(validationResult);
      return validationResult;
    } catch (error) {
      console.error('Validation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Validation failed';
      setValidationError(errorMessage);
      throw error;
    } finally {
      setIsValidating(false);
    }
  }, [onValidationComplete]);

  /**
   * Re-validate with current entity choice
   */
  const revalidateWithChoice = useCallback(async () => {
    if (!entityChoice || !uploadedFile || !originalErdContent) {
      return;
    }

    if (entityChoice === lastRevalidatedChoiceRef.current) {
      console.log('🔧 DEBUG: Skipping revalidation - choice unchanged');
      return;
    }

    console.log('🔧 DEBUG: Triggering revalidation with entityChoice:', entityChoice);
    lastRevalidatedChoiceRef.current = entityChoice;

    try {
      const revalidationResult = await validateFile({
        name: uploadedFile.name,
        content: originalErdContent,
        size: uploadedFile.size,
        lastModified: uploadedFile.lastModified
      }, entityChoice);
      
      console.log('🔧 DEBUG: Revalidation completed');
    } catch (error) {
      console.error('Error during revalidation:', error);
    }
  }, [entityChoice, uploadedFile, originalErdContent, validateFile]);

  /**
   * Apply a fix for choice/category columns
   */
  const applyChoiceColumnFix = useCallback(() => {
    if (!correctedErdContent) return;

    let updatedContent = correctedErdContent;
    console.log('Before choice fix:', updatedContent);
    
    // Remove all choice and category columns from all entities
    updatedContent = updatedContent.replace(/^\s*(\w+\s+)?(choice|category)\s+\w+.*$/gm, '');
    
    console.log('After choice fix:', updatedContent);
    onContentUpdate(updatedContent);
    onFixedIssuesUpdate(new Set([...fixedIssues, 'choice-columns']));
  }, [correctedErdContent, fixedIssues, onContentUpdate, onFixedIssuesUpdate]);

  /**
   * Apply naming conflict fix for a specific entity
   */
  const applyNamingConflictFixForEntity = useCallback((entityName: string) => {
    if (!correctedErdContent) return;

    let updatedContent = correctedErdContent;
    
    // Ensure we have proper line breaks before processing
    if (updatedContent.includes('\\n')) {
      updatedContent = updatedContent.replace(/\\n/g, '\n');
    }
    
    // Find the specific warning for this entity to determine fix type
    const entityWarning = validationResults?.warnings?.find((w: any) => 
      w.type === 'naming_conflict' && w.entity === entityName
    );
    
    const hasCustomPrimaryColumn = entityWarning?.message?.includes('custom primary column');
    const isInfoLevel = entityWarning?.severity === 'info';
    
    if (hasCustomPrimaryColumn) {
      // Case: Entity has custom PK + separate 'name' column - rename the 'name' column
      const entityRegex = new RegExp(`(${entityName}\\s*\\{[\\s\\S]*?)\\bstring\\s+name\\s+([^\n]*?)(\\s*[\\s\\S]*?\\})`, 'g');
      updatedContent = updatedContent.replace(entityRegex, (match, entityStart, columnDescription, entityEnd) => {
        if (!columnDescription.includes('PK')) {
          return `${entityStart}string ${entityName.toLowerCase()}_name ${columnDescription}${entityEnd}`;
        }
        return match;
      });
    } else if (isInfoLevel) {
      // Case: Entity has no explicit PK but has 'name' column - make it primary
      const entityRegex = new RegExp(`(${entityName}\\s*\\{[\\s\\S]*?)\\bstring\\s+name\\s+([^\n]*?)(\\s*[\\s\\S]*?\\})`, 'g');
      updatedContent = updatedContent.replace(entityRegex, (match, entityStart, columnDescription, entityEnd) => {
        if (!columnDescription.includes('PK')) {
          return `${entityStart}string name PK ${columnDescription}${entityEnd}`;
        }
        return match;
      });
    } else {
      // Legacy behavior - rename name column
      const entityPattern = new RegExp(`(${entityName}\\s*\\{[\\s\\S]*?)\\n?\\s*string\\s+name(?![\\w_])`, 'g');
      updatedContent = updatedContent.replace(entityPattern, `$1\n        string ${entityName.toLowerCase()}_name`);
    }
    
    onContentUpdate(updatedContent);
    onFixedIssuesUpdate(new Set([...fixedIssues, `naming-conflicts-${entityName}`]));
  }, [correctedErdContent, fixedIssues, validationResults, onContentUpdate, onFixedIssuesUpdate]);

  /**
   * Handle backend warning fix
   */
  const handleBackendWarningFix = useCallback(async (warningOrId: any) => {
    console.log('🔧 DEBUG: handleBackendWarningFix called with:', warningOrId);
    
    // Handle both warning object and warning ID
    const warningId = typeof warningOrId === 'string' ? warningOrId : warningOrId?.id;
    
    if (!warningId || !correctedErdContent) {
      console.error('Warning ID or content not found');
      return;
    }

    try {
      console.log('🔧 FRONTEND DEBUG: Calling backend fix with entityChoice:', entityChoice);
      const fixResult = await ApiService.fixIndividualWarning({
        mermaidContent: correctedErdContent,
        warningId: warningId,
        entityChoice: entityChoice || undefined,
        options: {}
      });

      console.log('🔧 DEBUG: Fix result received:', fixResult);

      const result = fixResult as any;

      if (result.success && (result.fixedContent || result.data?.fixedContent)) {
        console.log('🔧 DEBUG: Individual fix applied successfully:', result.appliedFix || result.data?.appliedFix);
        
        const fixedContent = result.fixedContent || result.data?.fixedContent;
        
        // Update the corrected ERD content
        onContentUpdate(fixedContent);
        onFixedIssuesUpdate(new Set([...fixedIssues, warningId]));

        // Re-validate to get updated warnings
        if (uploadedFile) {
          const revalidationResult = await validateFile({
            name: uploadedFile.name,
            content: fixedContent,
            size: fixedContent.length,
            lastModified: Date.now()
          }, entityChoice || undefined);

          onValidationComplete(revalidationResult);
        }
      } else {
        console.error('Individual fix failed:', result.error || result.message || 'Unknown error');
      }
    } catch (error) {
      console.error('Error applying individual fix:', error);
    }
  }, [correctedErdContent, fixedIssues, uploadedFile, entityChoice, validateFile, onContentUpdate, onFixedIssuesUpdate, onValidationComplete]);

  /**
   * Apply all auto-fixable warnings
   */
  const applyAllFixes = useCallback(async () => {
    const autoFixableWarnings = validationResults?.warnings?.filter((w: ValidationWarning) => w.autoFixable) || [];
    
    for (const warning of autoFixableWarnings) {
      try {
        await handleBackendWarningFix(warning.id);
      } catch (error) {
        console.error('Failed to fix warning:', warning.id, error);
      }
    }
  }, [handleBackendWarningFix, validationResults]);

  // Re-validate when entity choice changes
  useEffect(() => {
    console.log('🔧 DEBUG: entityChoice changed, checking if revalidation needed', {
      entityChoice,
      hasUploadedFile: !!uploadedFile,
      hasOriginalContent: !!originalErdContent,
      lastRevalidatedChoice: lastRevalidatedChoiceRef.current
    });

    if (entityChoice && 
        uploadedFile && 
        originalErdContent && 
        entityChoice !== lastRevalidatedChoiceRef.current) {
      revalidateWithChoice();
    }
  }, [entityChoice, uploadedFile, originalErdContent, revalidateWithChoice]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (revalidationTimeoutRef.current) {
        clearTimeout(revalidationTimeoutRef.current);
      }
    };
  }, []);

  return {
    isValidating,
    validationError,
    hasBackendWarnings,
    hasAnyIssues,
    validateFile,
    revalidateWithChoice,
    handleBackendWarningFix,
    applyAllFixes,
    applyChoiceColumnFix,
    applyNamingConflictFixForEntity,
    setValidationError
  };
};
