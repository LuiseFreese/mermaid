/**
 * Global Choices Step Module
 * Main entry point for the modularized Global Choices Step
 */

// Main component
export { GlobalChoicesStep } from './GlobalChoicesStep';

// UI Components
export {
  ChoiceSearch,
  GlobalChoicesList,
  CustomChoicesUpload,
  UploadedChoicesPreview,
  GlobalChoicesNavigation
} from './components';

// Custom Hooks
export {
  useGlobalChoicesData,
  useChoiceSelection,
  useFileUpload,
  useChoicesValidation
} from './hooks';

// Types
export type {
  GlobalChoicesStepProps,
  GlobalChoice,
  ChoiceOption,
  UseGlobalChoicesDataResult,
  UseChoiceSelectionResult,
  UseFileUploadResult,
  UseChoicesValidationResult,
  GlobalChoicesListProps,
  ChoiceSearchProps,
  CustomChoicesUploadProps,
  UploadedChoicesPreviewProps,
  GlobalChoicesNavigationProps
} from './types';

// Utilities (re-export existing ones)
export * from './utils';
