/**
 * Custom hook for ERD validation
 * Handles validation of ERD content and issue detection
 */

import { useState, useCallback, useMemo } from 'react';
import { 
  validateERDContent, 
  hasNamingIssues, 
  hasChoiceIssues, 
  hasStatusIssues, 
  hasPrimaryKeyIssues,
  getIssuesByType
} from '../utils/validationRules';
import type { ValidationResult, ValidationIssue } from '../types/validation.types';

export interface UseERDValidationResult {
  validationResult: ValidationResult | null;
  validateContent: (content: string) => void;
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
   * Validate the provided ERD content
   */
  const validateContent = useCallback((content: string) => {
    const result = validateERDContent(content);
    setValidationResult(result);
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
    validationResult?.summary.errors ?? 0 > 0, 
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
    resetValidation,
    isValid,
    hasWarnings,
    hasErrors,
    issuesByType,
    hasIssuesOfType,
    summary
  };
};
