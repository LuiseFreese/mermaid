/**
 * Validation-specific type definitions
 */

export interface ValidationIssue {
  type: 'naming' | 'choice' | 'status' | 'primary-key' | 'syntax';
  entityName?: string;
  description: string;
  fixable: boolean;
  severity: 'error' | 'warning' | 'info';
  fixed?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  hasWarnings: boolean;
  issues: ValidationIssue[];
  summary: {
    totalIssues: number;
    errors: number;
    warnings: number;
    infos: number;
    fixableIssues: number;
  };
}

export type ValidationRuleType = ValidationIssue['type'];

export interface ValidationRule {
  type: ValidationRuleType;
  name: string;
  description: string;
  check: (content: string, entityName?: string) => boolean;
  fix?: (content: string, entityName?: string) => string;
  fixable: boolean;
}

export interface ValidationContext {
  content: string;
  entities: string[];
  cdmEntities: string[];
  isCdmEntity: (entityName: string) => boolean;
}

export interface NamingConflictDetails {
  entityName: string;
  conflictingAttribute: string;
  suggestedFix: string;
  isFixed: boolean;
}

export interface ChoiceColumnDetails {
  entityName: string;
  columnName: string;
  columnType: 'choice' | 'category';
  isFixed: boolean;
}

export interface StatusColumnDetails {
  entityName: string;
  columnName: string;
  isFixed: boolean;
}

export interface ValidationReport {
  timestamp: Date;
  totalIssues: number;
  fixableIssues: number;
  issuesByType: Record<ValidationRuleType, number>;
  entitiesWithIssues: string[];
  recommendations: string[];
}
