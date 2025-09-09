/**
 * Custom hook for auto-fixing ERD validation issues
 * Handles application of fixes to ERD content
 */

import { useState, useCallback } from 'react';
import { 
  fixNamingConflicts, 
  fixChoiceColumns, 
  applyAllFixes 
} from '../utils/validationRules';
import type { ValidationIssue } from '../types/validation.types';

export interface UseAutoFixResult {
  fixedIssues: Set<string>;
  isFixing: boolean;
  isApplying: boolean; // Alias for compatibility
  lastFixError: string | null;
  autoFixes: any[]; // Array of available fixes
  generateAutoFixes: (content: string, issues: ValidationIssue[]) => any[];
  applyFix: (content: string, fixType: string, entityName?: string) => string;
  applyAllFixes: (content: string, fixes: any[]) => string;
  applyAllAvailableFixes: (content: string) => string;
  markIssueAsFixed: (issueKey: string) => void;
  resetFixedIssues: () => void;
  hasBeenFixed: (issueKey: string) => boolean;
}

/**
 * Hook for managing auto-fix functionality
 * @returns Auto-fix state and management functions
 */
export const useAutoFix = (): UseAutoFixResult => {
  const [fixedIssues, setFixedIssues] = useState<Set<string>>(new Set());
  const [isFixing, setIsFixing] = useState(false);
  const [lastFixError, setLastFixError] = useState<string | null>(null);
  const [autoFixes, setAutoFixes] = useState<any[]>([]);

  /**
   * Apply a specific fix to the content
   */
  const applyFix = useCallback((
    content: string, 
    fixType: string, 
    entityName?: string
  ): string => {
    setIsFixing(true);
    setLastFixError(null);

    try {
      let fixedContent = content;
      let issueKey = '';

      switch (fixType) {
        case 'naming':
          if (entityName) {
            // Fix specific entity naming conflict
            const entityRegex = new RegExp(
              `(${entityName}\\s*\\{[^}]*?)string\\s+name(?!\\w)`,
              'gi'
            );
            fixedContent = content.replace(
              entityRegex,
              `$1string ${entityName.toLowerCase()}_name`
            );
            issueKey = `naming-${entityName}`;
          } else {
            // Fix all naming conflicts
            fixedContent = fixNamingConflicts(content);
            issueKey = 'naming-all';
          }
          break;

        case 'choice':
          fixedContent = fixChoiceColumns(content);
          issueKey = 'choice-columns';
          break;

        default:
          throw new Error(`Unknown fix type: ${fixType}`);
      }

      // Mark the fix as applied
      setFixedIssues(prev => new Set([...prev, issueKey]));

      return fixedContent;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setLastFixError(errorMessage);
      console.error('Error applying fix:', error);
      return content; // Return original content on error
    } finally {
      setIsFixing(false);
    }
  }, []);

  /**
   * Apply all available fixes to the content
   */
  const applyAllAvailableFixes = useCallback((content: string): string => {
    setIsFixing(true);
    setLastFixError(null);

    try {
      const fixedContent = applyAllFixes(content);
      
      // Mark all fix types as applied
      setFixedIssues(prev => new Set([
        ...prev,
        'choice-columns',
        'naming-all'
      ]));

      return fixedContent;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setLastFixError(errorMessage);
      console.error('Error applying all fixes:', error);
      return content; // Return original content on error
    } finally {
      setIsFixing(false);
    }
  }, []);

  /**
   * Mark a specific issue as fixed
   */
  const markIssueAsFixed = useCallback((issueKey: string) => {
    setFixedIssues(prev => new Set([...prev, issueKey]));
  }, []);

  /**
   * Reset all fixed issues
   */
  const resetFixedIssues = useCallback(() => {
    setFixedIssues(new Set());
    setLastFixError(null);
  }, []);

  /**
   * Check if an issue has been fixed
   */
  const hasBeenFixed = useCallback((issueKey: string): boolean => {
    return fixedIssues.has(issueKey);
  }, [fixedIssues]);

  /**
   * Generate auto-fixes for given issues
   */
  const generateAutoFixes = useCallback((_content: string, issues: ValidationIssue[]): any[] => {
    const fixes: any[] = [];
    
    issues.forEach(issue => {
      switch (issue.type) {
        case 'naming':
          fixes.push({
            type: 'naming',
            description: 'Fix naming conflict',
            entityName: issue.entityName
          });
          break;
        case 'choice':
          fixes.push({
            type: 'choice',
            description: 'Fix choice column'
          });
          break;
      }
    });
    
    setAutoFixes(fixes);
    return fixes;
  }, []);

  /**
   * Apply all provided fixes
   */
  const applyAllFixesFromArray = useCallback((content: string, fixes: any[]): string => {
    let fixedContent = content;
    
    fixes.forEach(fix => {
      try {
        fixedContent = applyFix(fixedContent, fix.type, fix.entityName);
      } catch (error) {
        console.error('Failed to apply fix:', fix, error);
      }
    });
    
    return fixedContent;
  }, [applyFix]);

  return {
    fixedIssues,
    isFixing,
    isApplying: isFixing, // Alias for compatibility
    lastFixError,
    autoFixes,
    generateAutoFixes,
    applyFix,
    applyAllFixes: applyAllFixesFromArray,
    applyAllAvailableFixes,
    markIssueAsFixed,
    resetFixedIssues,
    hasBeenFixed
  };
};
