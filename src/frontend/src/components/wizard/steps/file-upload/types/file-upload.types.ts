/**
 * Type definitions for File Upload Step components
 */

export interface UploadedFile {
  file: File;
  content: string;
  processed: boolean;
}

export interface CDMDetectionResult {
  detected: boolean;
  entities: string[];
  choice: 'cdm' | 'custom' | null;
}

export interface ValidationIssue {
  type: 'naming' | 'choice' | 'status' | 'primary-key';
  severity: 'error' | 'warning' | 'info';
  entityName?: string;
  description: string;
  fixable: boolean;
  fixed?: boolean;
}

export interface ERDValidationResult {
  hasIssues: boolean;
  issues: ValidationIssue[];
  namingConflicts: string[];
  hasChoiceIssues: boolean;
  hasStatusIssues: boolean;
  hasNamingIssues: boolean;
}

export interface ParsedEntity {
  name: string;
  attributes: EntityAttribute[];
  isCdm: boolean;
  hasNamingConflict?: boolean;
}

export interface ParsedRelationship {
  from: string;
  to: string;
  cardinality: string;
  label: string;
}

export interface EntityAttribute {
  name: string;
  type: string;
  constraint?: string;
  isPrimaryKey?: boolean;
}

export interface AutoFixResult {
  success: boolean;
  updatedContent: string;
  fixedIssues: Set<string>;
  error?: string;
}

export interface MermaidRenderResult {
  success: boolean;
  svg?: string;
  error?: string;
}

export interface FileProcessingResult {
  success: boolean;
  file?: File;
  content?: string;
  cdmDetection?: CDMDetectionResult;
  validation?: ERDValidationResult;
  error?: string;
}

// Props interfaces for components
export interface FileUploadZoneProps {
  onFileSelected: (file: File, content: string) => void;
  acceptedFileTypes?: string;
  disabled?: boolean;
  className?: string;
}

export interface CDMDetectionCardProps {
  detectionResult: CDMDetectionResult;
  onChoiceSelected: (choice: 'cdm' | 'custom') => void;
  onChoiceChanged: () => void;
  className?: string;
}

export interface ERDValidationPanelProps {
  validationResult: ERDValidationResult;
  className?: string;
}

export interface AutoFix {
  id: string;
  type: 'naming' | 'choice' | 'status' | 'primary-key';
  entityName?: string;
  description: string;
  preview?: string;
}

export interface AutoFixSuggestionsProps {
  autoFixes: AutoFix[];
  onApplyFix: (fixId: string) => void;
  onApplyAllFixes: () => void;
  isLoading?: boolean;
  className?: string;
}

export interface MermaidDiagramViewerProps {
  content: string;
  onRenderError?: (error: string) => void;
  className?: string;
}

export interface ERDEntity {
  name: string;
  columns?: ERDColumn[];
}

export interface ERDColumn {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isRequired?: boolean;
}

export interface ERDRelationship {
  fromEntity: string;
  toEntity: string;
  type: string;
  label?: string;
}

export interface ERDStructure {
  entities: ERDEntity[];
  relationships: ERDRelationship[];
}

export interface ERDSummaryAccordionProps {
  erdStructure: ERDStructure;
  className?: string;
}
