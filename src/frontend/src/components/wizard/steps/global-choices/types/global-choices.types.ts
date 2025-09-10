/**
 * Core types for Global Choices Step
 * Extracted from GlobalChoicesStep.tsx for better organization and reusability
 */

// Global Choice Types
export interface GlobalChoice {
  id: string;
  name: string;
  displayName: string;
  logicalName?: string;
  options?: GlobalChoiceOption[];
  isCustom?: boolean;
  prefix?: string;
}

export interface GlobalChoiceOption {
  value: number;
  label: string;
  description?: string;
  color?: string;
}

// JSON Upload Types
export interface GlobalChoicesJsonData {
  globalChoices?: GlobalChoice[];
  [key: string]: any; // Allow for legacy formats
}

export interface UploadedJsonFile {
  file: File;
  content: GlobalChoicesJsonData;
  parsedChoices: GlobalChoice[];
  isValid: boolean;
  errors?: string[];
}

// Search and Filter Types
export interface GlobalChoicesSearchConfig {
  searchProperties: string[];
  maxResults: number;
  includeBuiltIn: boolean;
  includeCustom: boolean;
  caseSensitive: boolean;
}

export interface GlobalChoicesFilterOptions {
  searchTerm: string;
  includeBuiltIn: boolean;
  includeCustom: boolean;
  selectedOnly: boolean;
}

// Selection State Types
export interface GlobalChoicesSelectionState {
  selectedChoices: GlobalChoice[];
  selectedChoiceIds: string[];
  isAllSelected: boolean;
  selectionCount: number;
}

// Form Data Types
export interface GlobalChoicesFormData {
  searchTerm: string;
  selectedGlobalChoices: GlobalChoice[];
  uploadedGlobalChoices: GlobalChoice[];
  showBuiltInChoices: boolean;
  showCustomChoices: boolean;
}

// Step Props Interface
export interface GlobalChoicesStepProps {
  // Data sources
  builtInChoices?: GlobalChoice[];
  customChoices?: GlobalChoice[];
  
  // Current state
  selectedChoices?: GlobalChoice[];
  searchTerm?: string;
  
  // Form data and state management
  formData?: GlobalChoicesFormData;
  onFormDataChange?: (data: Partial<GlobalChoicesFormData>) => void;
  
  // Event handlers
  onChoiceSelect?: (choice: GlobalChoice, selected: boolean) => void;
  onChoicesUpload?: (choices: GlobalChoice[]) => void;
  onSearchChange?: (searchTerm: string) => void;
  
  // UI state
  loading?: boolean;
  error?: string | null;
  
  // Navigation
  onNext?: () => void;
  onPrevious?: () => void;
  
  // UI configuration
  disabled?: boolean;
  showValidation?: boolean;
  autoValidate?: boolean;
}

// Validation Types
export interface GlobalChoicesValidationError {
  field: string;
  message: string;
  type: 'required' | 'format' | 'upload' | 'selection';
}

export interface GlobalChoicesValidationResult {
  isValid: boolean;
  errors: GlobalChoicesValidationError[];
  warnings: GlobalChoicesValidationError[];
}

// Hook Return Types
export interface UseGlobalChoicesSelectionResult {
  // Selection state
  selectedChoices: GlobalChoice[];
  selectedChoiceIds: string[];
  selectionCount: number;
  isAllSelected: boolean;
  
  // Selection methods
  handleChoiceSelect: (choiceId: string, selected: boolean) => void;
  selectChoice: (choice: GlobalChoice) => void;
  unselectChoice: (choice: GlobalChoice) => void;
  toggleChoice: (choice: GlobalChoice) => void;
  selectAll: () => void;
  unselectAll: () => void;
  
  // Validation
  isValid: boolean;
  errors: GlobalChoicesValidationError[];
}

export interface UseGlobalChoicesDataResult {
  // Data
  builtInChoices: GlobalChoice[];
  customChoices: GlobalChoice[];
  allChoices: GlobalChoice[];
  
  // Loading state
  loading: boolean;
  error: string | null;
  
  // Data management
  refetch: () => Promise<void>;
  addCustomChoices: (choices: GlobalChoice[]) => void;
}

export interface UseJsonUploadResult {
  // Upload state
  uploadedFile: File | null;
  uploadedChoices: GlobalChoice[];
  isUploading: boolean;
  uploadError: string | null;
  
  // Upload methods
  handleFileUpload: (file: File) => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  clearUpload: () => void;
  validateFile: (file: File) => Promise<boolean>;
  
  // File parsing
  parseJsonFile: (file: File) => Promise<GlobalChoice[]>;
  
  // Validation
  isValid: boolean;
  errors: GlobalChoicesValidationError[];
}

export interface UseGlobalChoicesConfigurationResult {
  // Data
  builtInChoices: GlobalChoice[];
  customChoices: GlobalChoice[];
  allChoices: GlobalChoice[];
  
  // Loading state
  loading: boolean;
  error: string | null;
  
  // Data management
  refreshChoices: () => Promise<void>;
  addCustomChoices: (choices: GlobalChoice[]) => void;
  
  // Search functionality
  search: UseGlobalChoicesDataResult;
  
  // Selection management
  selection: UseGlobalChoicesSelectionResult;
  
  // File upload
  upload: UseJsonUploadResult;
  
  // Overall validation
  isConfigurationValid: boolean;
  validationErrors: GlobalChoicesValidationError[];
}

// Constants and Patterns
export const GLOBAL_CHOICES_CONSTANTS = {
  MAX_SELECTIONS: 50,
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  SUPPORTED_FILE_TYPES: ['.json'] as const,
  MIN_SEARCH_LENGTH: 2,
  SEARCH_DEBOUNCE_MS: 300,
} as const;

export const JSON_FORMAT_PATTERNS = {
  STANDARD: 'globalChoices',
  ARRAY: 'array',
  LEGACY: 'legacy',
} as const;

export type JsonFormatType = typeof JSON_FORMAT_PATTERNS[keyof typeof JSON_FORMAT_PATTERNS];

// Error Messages
export const GLOBAL_CHOICES_ERROR_MESSAGES = {
  NO_CHOICES_SELECTED: 'Please select at least one global choice set',
  INVALID_JSON_FORMAT: 'Invalid JSON format. Please check your file structure',
  FILE_TOO_LARGE: `File size exceeds ${GLOBAL_CHOICES_CONSTANTS.MAX_FILE_SIZE / (1024 * 1024)}MB limit`,
  UNSUPPORTED_FILE_TYPE: 'Only JSON files are supported',
  UPLOAD_FAILED: 'Failed to upload file. Please try again',
  SEARCH_FAILED: 'Search failed. Please try again',
  LOADING_FAILED: 'Failed to load global choices. Please refresh',
} as const;

// Component Props Types
export interface ChoiceSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export interface GlobalChoicesListProps {
  choices: GlobalChoice[];
  selectedChoices: GlobalChoice[];
  onChoiceSelect: (choiceId: string, selected: boolean) => void;
  searchTerm?: string;
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
}

export interface CustomChoicesUploadProps {
  onFileUpload: (file: File) => void;
  onChoicesUpload?: (choices: GlobalChoice[]) => void;
  uploadedFile?: File | null;
  isUploading?: boolean;
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
  className?: string;
}

export interface UploadedChoicesPreviewProps {
  choices: GlobalChoice[];
  onRemove: () => void;
  className?: string;
}

export interface GlobalChoicesNavigationProps {
  onNext: () => void;
  onPrevious: () => void;
  canProceed: boolean;
  isValid?: boolean;
  showValidation?: boolean;
  className?: string;
}

// Hook Return Type Aliases
export type UseChoiceSelectionResult = UseGlobalChoicesSelectionResult;
export type UseFileUploadResult = UseJsonUploadResult;
export type UseChoicesValidationResult = GlobalChoicesValidationResult;

// Legacy exports for compatibility
export type ChoiceOption = GlobalChoiceOption;
