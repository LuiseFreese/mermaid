/**
 * Validation Rules for ERD Content
 * Contains all validation logic for detecting issues in ERD structures
 */

import type { ValidationIssue, ValidationResult } from '../types/validation.types';
import { parseERDEntities } from './erdParser';

/**
 * Validate ERD content for naming conflicts
 * Detects entities with 'name' columns that aren't primary keys (conflicts with Dataverse)
 */
export const validateNamingConflicts = (content: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const entities = parseERDEntities(content);
  
  entities.forEach(entity => {
    // Skip CDM entities - they are untouchable
    if (entity.isCdm) {
      return;
    }
    
    // Check if entity has a non-PK column named 'name'
    const hasNameConflict = entity.attributes?.some(attr => 
      attr.name.toLowerCase() === 'name' && !attr.isPrimaryKey
    );
    
    if (hasNameConflict) {
      issues.push({
        type: 'naming',
        entityName: entity.name,
        description: `Entity "${entity.name}" has a 'name' column that conflicts with Dataverse naming conventions`,
        fixable: true,
        severity: 'warning'
      });
    }
  });
  
  return issues;
};

/**
 * Validate ERD content for choice/category columns
 * Detects choice and category columns that should be created manually in Dataverse
 */
export const validateChoiceColumns = (content: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  
  // Look for choice and category column patterns
  const choiceColumnRegex = /\w+\s+(choice|category)\s+\w+/g;
  const matches = content.match(choiceColumnRegex);
  
  if (matches && matches.length > 0) {
    issues.push({
      type: 'choice',
      description: `Found ${matches.length} choice/category column(s) that should be created manually in Dataverse`,
      fixable: true,
      severity: 'warning'
    });
  }
  
  return issues;
};

/**
 * Validate ERD content for status columns
 * Detects status columns that may need special handling
 */
export const validateStatusColumns = (content: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  
  // Look for status column patterns
  const hasStatusColumns = content.includes('string status') || content.includes('status ');
  
  if (hasStatusColumns) {
    issues.push({
      type: 'status',
      description: 'Status columns detected - consider using Dataverse status/state fields',
      fixable: false,
      severity: 'info'
    });
  }
  
  return issues;
};

/**
 * Validate ERD content for primary key issues
 * Detects entities without primary keys
 */
export const validatePrimaryKeys = (content: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const entities = parseERDEntities(content);
  
  entities.forEach(entity => {
    const hasPrimaryKey = entity.attributes?.some(attr => attr.isPrimaryKey);
    
    if (!hasPrimaryKey) {
      issues.push({
        type: 'primary-key',
        entityName: entity.name,
        description: `Entity "${entity.name}" is missing a primary key`,
        fixable: false,
        severity: 'warning'
      });
    }
  });
  
  return issues;
};

/**
 * Validate ERD syntax and structure
 * Basic syntax validation for Mermaid ERD content
 */
export const validateERDSyntax = (content: string): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  
  // Check for erDiagram declaration
  if (!content.includes('erDiagram')) {
    issues.push({
      type: 'syntax',
      description: 'Missing "erDiagram" declaration',
      fixable: false,
      severity: 'error'
    });
  }
  
  // Check for at least one entity
  const entityMatches = content.match(/(\w+)\s*\{/g);
  if (!entityMatches || entityMatches.length === 0) {
    issues.push({
      type: 'syntax',
      description: 'No entities found in the ERD',
      fixable: false,
      severity: 'error'
    });
  }
  
  // Check for unmatched braces
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    issues.push({
      type: 'syntax',
      description: 'Unmatched braces in entity definitions',
      fixable: false,
      severity: 'error'
    });
  }
  
  return issues;
};

/**
 * Run comprehensive validation on ERD content
 * Executes all validation rules and returns combined results
 */
export const validateERDContent = (content: string): ValidationResult => {
  const allIssues: ValidationIssue[] = [
    ...validateERDSyntax(content),
    ...validateNamingConflicts(content),
    ...validateChoiceColumns(content),
    ...validateStatusColumns(content),
    ...validatePrimaryKeys(content)
  ];
  
  const errors = allIssues.filter(issue => issue.severity === 'error');
  const warnings = allIssues.filter(issue => issue.severity === 'warning');
  const infos = allIssues.filter(issue => issue.severity === 'info');
  
  return {
    isValid: errors.length === 0,
    hasWarnings: warnings.length > 0,
    issues: allIssues,
    summary: {
      totalIssues: allIssues.length,
      errors: errors.length,
      warnings: warnings.length,
      infos: infos.length,
      fixableIssues: allIssues.filter(issue => issue.fixable).length
    }
  };
};

/**
 * Get specific validation issues by type
 * Helper function to filter issues by type
 */
export const getIssuesByType = (issues: ValidationIssue[], type: ValidationIssue['type']): ValidationIssue[] => {
  return issues.filter(issue => issue.type === type);
};

/**
 * Check if content has specific types of issues
 * Helper functions for quick issue detection
 */
export const hasNamingIssues = (content: string): boolean => {
  return validateNamingConflicts(content).length > 0;
};

export const hasChoiceIssues = (content: string): boolean => {
  return validateChoiceColumns(content).length > 0;
};

export const hasStatusIssues = (content: string): boolean => {
  return validateStatusColumns(content).length > 0;
};

export const hasPrimaryKeyIssues = (content: string): boolean => {
  return validatePrimaryKeys(content).length > 0;
};

/**
 * Auto-fix functions for fixable issues
 */

/**
 * Fix naming conflicts by renaming 'name' columns to 'entityname_name'
 */
export const fixNamingConflicts = (content: string): string => {
  let fixedContent = content;
  const namingIssues = validateNamingConflicts(content);
  
  namingIssues.forEach(issue => {
    if (issue.entityName) {
      // Replace 'string name' with 'string entityname_name' for specific entity
      const entityRegex = new RegExp(
        `(${issue.entityName}\\s*\\{[^}]*?)string\\s+name(?!\\w)`,
        'gi'
      );
      fixedContent = fixedContent.replace(
        entityRegex,
        `$1string ${issue.entityName.toLowerCase()}_name`
      );
    }
  });
  
  return fixedContent;
};

/**
 * Fix choice/category columns by removing them from ERD
 */
export const fixChoiceColumns = (content: string): string => {
  // Remove all choice and category column lines
  return content.replace(/^\s*\w+\s+(choice|category)\s+\w+.*$/gm, '');
};

/**
 * Apply all available fixes to ERD content
 */
export const applyAllFixes = (content: string): string => {
  let fixedContent = content;
  
  // Apply fixes in order of safety/impact
  fixedContent = fixChoiceColumns(fixedContent);
  fixedContent = fixNamingConflicts(fixedContent);
  
  return fixedContent;
};
