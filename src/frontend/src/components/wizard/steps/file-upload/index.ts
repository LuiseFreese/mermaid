/**
 * File Upload Step Module
 * Main entry point for the modularized File Upload Step
 */

// Main component
export { FileUploadStep } from './FileUploadStep';

// UI Components
export {
  FileUploadZone,
  MermaidDiagramViewer,
  CDMDetectionCard,
  ERDValidationPanel,
  AutoFixSuggestions,
  ERDSummaryAccordion
} from './components';

// Custom Hooks
export {
  useFileProcessing,
  useCDMDetection,
  useERDValidation,
  useAutoFix,
  useMermaidRenderer
} from './hooks';

// Types
export type {
  UploadedFile,
  CDMDetectionResult,
  ERDValidationResult,
  ValidationIssue,
  AutoFix,
  ERDStructure,
  ERDEntity,
  ERDRelationship,
  FileUploadZoneProps,
  MermaidDiagramViewerProps,
  CDMDetectionCardProps,
  ERDValidationPanelProps,
  AutoFixSuggestionsProps,
  ERDSummaryAccordionProps
} from './types/file-upload.types';

// Utilities
export { CDM_ENTITIES } from './utils/cdmEntityList';
export { parseERDContent } from './utils/erdParser';
export { validateERDStructure } from './utils/validationRules';
