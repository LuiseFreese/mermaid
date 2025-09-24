/**
 * Custom hook for ERD validation
 * Handles validation of ERD content and issue detection
 */

import { useState, useCallback, useMemo } from 'react';
import { 
  validateERDContent, 
  getIssuesByType
} from '../utils/validationRules';
import { ApiService } from '../../../../../services/apiService';
import type { ValidationResult, ValidationIssue } from '../types/validation.types';

export interface UseERDValidationResult {
  validationResult: ValidationResult | null;
  validateContent: (content: string) => void;
  validateERD: (content: string, isCDM?: boolean) => Promise<void>;
  resetValidation: () => void;
  isValid: boolean;
  hasWarnings: boolean;
  hasErrors: boolean;
  issuesByType: {
    naming: ValidationIssue[];
    choice: ValidationIssue[];
    status: ValidationIssue[];
    primaryKey: ValidationIssue[];
    syntax: ValidationIssue[];
  };
  hasIssuesOfType: {
    naming: boolean;
    choice: boolean;
    status: boolean;
    primaryKey: boolean;
    syntax: boolean;
  };
  summary: {
    totalIssues: number;
    fixableIssues: number;
    criticalIssues: number;
  };
}

/**
 * Hook for managing ERD content validation
 * @param initialContent - Optional initial content to validate
 * @returns Validation state and management functions
 */
export const useERDValidation = (initialContent?: string): UseERDValidationResult => {
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  /**
   * Validate the provided ERD content using frontend validation only
   */
  const validateContent = useCallback((content: string) => {
    const result = validateERDContent(content);
    setValidationResult(result);
  }, []);

  /**
   * Validate the provided ERD content using backend API with CDM choice
   */
  const validateERD = useCallback(async (content: string, isCDM?: boolean) => {
    try {
      console.log('🔧 DEBUG: useERDValidation.validateERD called with:', {
        contentLength: content.length,
        isCDM,
        entityChoice: isCDM ? 'cdm' : 'custom'
      });

      const fileData = {
        name: 'validation.mmd',
        content: content,
        size: content.length,
        lastModified: Date.now()
      };

      const entityChoice = isCDM ? 'cdm' : 'custom';
      const backendResult = await ApiService.validateFile(fileData, entityChoice);
      
      console.log('🔧 DEBUG: Backend validation result:', backendResult);
      
      // Map backend result to frontend ValidationResult interface
      const validationResult: ValidationResult = {
        isValid: backendResult.valid ?? !backendResult.errors?.length,
        hasWarnings: !!backendResult.warnings?.length,
        issues: [
          // Map errors to issues
          ...(backendResult.errors || []).map((error: any) => ({
            type: 'syntax' as const,
            entityName: error.entityName,
            description: error.message,
            fixable: false,
            severity: 'error' as const,
            fixed: false
          })),
          // Map warnings to issues
          ...(backendResult.warnings || []).map((warning: any) => ({
            type: 'naming' as const,
            entityName: warning.entityName,
            description: warning.message || warning.suggestion,
            fixable: warning.autoFixable || false,
            severity: 'warning' as const,
            fixed: false
          }))
        ],
        summary: backendResult.summary || {
          totalIssues: (backendResult.errors?.length || 0) + (backendResult.warnings?.length || 0),
          errors: backendResult.errors?.length || 0,
          warnings: backendResult.warnings?.length || 0,
          info: 0
        }
      };
      
      setValidationResult(validationResult);
    } catch (error) {
      console.error('ERD validation error:', error);
      // Fall back to frontend validation if backend fails
      const fallbackResult = validateERDContent(content);
      setValidationResult(fallbackResult);
    }
  }, []);

  /**
   * Reset validation state
   */
  const resetValidation = useCallback(() => {
    setValidationResult(null);
  }, []);

  /**
   * Computed validation status
   */
  const isValid = useMemo(() => 
    validationResult?.isValid ?? true, 
    [validationResult]
  );

  const hasWarnings = useMemo(() => 
    validationResult?.hasWarnings ?? false, 
    [validationResult]
  );

  const hasErrors = useMemo(() => 
    (validationResult?.summary.errors ?? 0) > 0, 
    [validationResult]
  );

  /**
   * Issues grouped by type for easy access
   */
  const issuesByType = useMemo(() => {
    if (!validationResult) {
      return {
        naming: [],
        choice: [],
        status: [],
        primaryKey: [],
        syntax: []
      };
    }

    return {
      naming: getIssuesByType(validationResult.issues, 'naming'),
      choice: getIssuesByType(validationResult.issues, 'choice'),
      status: getIssuesByType(validationResult.issues, 'status'),
      primaryKey: getIssuesByType(validationResult.issues, 'primary-key'),
      syntax: getIssuesByType(validationResult.issues, 'syntax')
    };
  }, [validationResult]);

  /**
   * Quick boolean checks for issue types
   */
  const hasIssuesOfType = useMemo(() => ({
    naming: issuesByType.naming.length > 0,
    choice: issuesByType.choice.length > 0,
    status: issuesByType.status.length > 0,
    primaryKey: issuesByType.primaryKey.length > 0,
    syntax: issuesByType.syntax.length > 0
  }), [issuesByType]);

  /**
   * Summary statistics
   */
  const summary = useMemo(() => {
    if (!validationResult) {
      return {
        totalIssues: 0,
        fixableIssues: 0,
        criticalIssues: 0
      };
    }

    return {
      totalIssues: validationResult.summary.totalIssues,
      fixableIssues: validationResult.summary.fixableIssues,
      criticalIssues: validationResult.summary.errors
    };
  }, [validationResult]);

  // Auto-validate on initial content if provided
  useMemo(() => {
    if (initialContent) {
      validateContent(initialContent);
    }
  }, [initialContent, validateContent]);

  return {
    validationResult,
    validateContent,
    validateERD, // Use the actual async validateERD function
    resetValidation,
    isValid,
    hasWarnings,
    hasErrors,
    issuesByType,
    hasIssuesOfType,
    summary
  };
};
