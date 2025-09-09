/**
 * Core types for Solution Setup Step
 * Extracted from SolutionSetupStep.tsx for better organization and reusability
 */

// Solution Types
export type SolutionType = 'new' | 'existing';
export type PublisherType = 'new' | 'existing';

// Solution Configuration
export interface SolutionConfiguration {
  type: SolutionType;
  name: string;
  internalName: string;
  includeRelatedTables: boolean;
}

// New Solution Data
export interface NewSolutionData {
  name: string;
  internalName: string;
  includeRelatedTables: boolean;
  // Additional properties used in the component
  solutionName: string;
  solutionUniqueName: string;
}

// Publisher Configuration  
export interface PublisherConfiguration {
  type: PublisherType;
}

// New Publisher Data
export interface NewPublisherData {
  name: string;
  internalName: string;
  prefix: string;
  // Additional properties used in the component
  publisherName: string;
  publisherUniqueName: string;
  publisherPrefix: string;
  publisherDescription?: string;
}

// Form State for Solution Setup
export interface SolutionSetupFormState {
  // Solution Configuration
  solutionType: SolutionType;
  solutionName: string;
  solutionInternalName: string;
  selectedSolution: any | null; // Using any temporarily, will import proper Solution type
  includeRelatedTables: boolean;
  
  // Publisher Configuration
  publisherType: PublisherType;
  selectedPublisher: any | null; // Using any temporarily, will import proper Publisher type
  newPublisherName: string;
  newPublisherInternalName: string;
  newPublisherPrefix: string;
  
  // Search State
  solutionSearchTerm: string;
  publisherSearchTerm: string;
  showSolutionDropdown: boolean;
  showPublisherDropdown: boolean;
}

// Validation Results
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  type: 'required' | 'format' | 'length' | 'duplicate';
}

// Form Validation Rules
export interface ValidationRules {
  solution: {
    name: {
      required: boolean;
      minLength?: number;
      maxLength?: number;
      pattern?: RegExp;
    };
    internalName: {
      required: boolean;
      pattern?: RegExp;
      maxLength?: number;
    };
  };
  publisher: {
    name: {
      required: boolean;
      minLength?: number;
      maxLength?: number;
      pattern?: RegExp;
    };
    internalName: {
      required: boolean;
      pattern?: RegExp;
      maxLength?: number;
    };
    prefix: {
      required: boolean;
      minLength: number;
      maxLength: number;
      pattern?: RegExp;
    };
  };
}

// Name Generation Options
export interface NameGenerationOptions {
  removeSpaces?: boolean;
  removeSpecialChars?: boolean;
  toLowerCase?: boolean;
  maxLength?: number;
  prefix?: string;
  suffix?: string;
}

// Search Configuration
export interface SearchConfiguration<T> {
  searchProperties: (keyof T)[];
  caseSensitive?: boolean;
  exactMatch?: boolean;
  maxResults?: number;
}

// Dropdown State
export interface DropdownState<T> {
  isOpen: boolean;
  searchTerm: string;
  filteredItems: T[];
  selectedItem: T | null;
  loading: boolean;
  error: string | null;
}

// Step Navigation Props
export interface SolutionSetupStepProps {
  // Data sources
  solutions?: any[];
  publishers?: any[];
  
  // Current state
  currentSolution?: any;
  currentPublisher?: any;
  formData?: SolutionSetupFormState;
  
  // State management
  onSolutionChange?: (solution: any) => void;
  onPublisherChange?: (publisher: any) => void;
  onFormDataChange?: (formData: Partial<SolutionSetupFormState>) => void;
  onValidationChange?: (errors: Record<string, any>) => void;
  
  // UI state
  loading?: boolean;
  error?: string | null;
  
  // Event handlers
  onCreateSolution?: (data: NewSolutionData) => void;
  onCreatePublisher?: (data: NewPublisherData) => void;
  onEditSolution?: (solution: any) => void;
  onEditPublisher?: (publisher: any) => void;
  onRefreshData?: () => void;
  
  // Validation
  validationErrors?: Record<string, any>;
  
  // UI configuration
  disabled?: boolean;
  showValidation?: boolean;
  autoValidate?: boolean;
  
  // Navigation
  onNext?: () => void;
  onPrevious?: () => void;
}

// Hook Return Types
export interface UseSolutionConfigurationResult {
  solutionType: SolutionType;
  setSolutionType: (type: SolutionType) => void;
  solutionName: string;
  setSolutionName: (name: string) => void;
  solutionInternalName: string;
  setSolutionInternalName: (name: string) => void;
  selectedSolution: any | null;
  setSelectedSolution: (solution: any | null) => void;
  includeRelatedTables: boolean;
  setIncludeRelatedTables: (include: boolean) => void;
  isValid: boolean;
  errors: ValidationError[];
  solutions: any[];
  loadingSolutions: boolean;
  solutionError: string | null;
  refreshSolutions: () => Promise<void>;
  searchSolutions: (searchTerm: string) => any[];
  solutionDropdown: UseSearchableDropdownResult<any>;
  getSelectedSolutionDisplay: () => string;
  clearSolutionSelection: () => void;
  getSolutionSummary: () => any;
  validateSolutionConfig: () => { isValid: boolean; errors: ValidationError[] };
  hasNameError: boolean;
  hasInternalNameError: boolean;
  nameError: string | undefined;
  internalNameError: string | undefined;
}

export interface UsePublisherConfigurationResult {
  publisherType: PublisherType;
  setPublisherType: (type: PublisherType) => void;
  selectedPublisher: any | null;
  setSelectedPublisher: (publisher: any | null) => void;
  newPublisherName: string;
  setNewPublisherName: (name: string) => void;
  newPublisherInternalName: string;
  setNewPublisherInternalName: (name: string) => void;
  newPublisherPrefix: string;
  setNewPublisherPrefix: (prefix: string) => void;
  isValid: boolean;
  errors: ValidationError[];
  newPublisherValidation: any; // Will be properly typed later
  publishers: any[];
  loadingPublishers: boolean;
  publisherError: string | null;
  refreshPublishers: () => Promise<void>;
  searchPublishers: (searchTerm: string) => any[];
  publisherDropdown: UseSearchableDropdownResult<any>;
  getSelectedPublisherDisplay: () => string;
  clearPublisherSelection: () => void;
  getPublisherSummary: () => any;
  validatePublisherConfig: () => any;
  clearNewPublisherForm: () => void;
  suggestNewPublisher: (baseName: string) => void;
  hasNewPublisherData: boolean;
  hasDisplayNameError: boolean;
  hasInternalNameError: boolean;
  hasPrefixError: boolean;
  displayNameError: string | undefined;
  internalNameError: string | undefined;
  prefixError: string | undefined;
}

export interface UseSearchableDropdownResult<T> {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filteredItems: T[];
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  selectedItem: T | null;
  setSelectedItem: (item: T | null) => void;
  handleItemSelect: (item: T) => void;
  handleSearchChange: (term: string) => void;
  handleFocus: () => void;
  handleBlur: () => void;
  clearSelection: () => void;
  reset: () => void;
  open: () => void;
  close: () => void;
}

export interface UseFormValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  validateField: (field: string, value: any, formState?: Partial<SolutionSetupFormState>) => ValidationError[];
  validateForm: (formState: Partial<SolutionSetupFormState>) => ValidationResult;
  clearErrors: () => void;
  clearFieldErrors: (field: string) => void;
  getErrorsForField: (field: string) => ValidationError[];
  getFirstErrorForField: (field: string) => string | undefined;
  hasFieldError: (field: string) => boolean;
  validationSummary: string;
  errorsByField: Record<string, ValidationError[]>;
  validateFields: (fieldsToValidate: Array<{ field: string; value: any }>, formState?: Partial<SolutionSetupFormState>) => ValidationError[];
  hasErrorType: (errorType: ValidationError['type']) => boolean;
  getRequiredFieldErrors: () => ValidationError[];
  getFormatErrors: () => ValidationError[];
}

export interface UseNameGenerationResult {
  generateInternalName: (displayName: string, options?: NameGenerationOptions) => string;
  generatePrefix: (name: string, maxLength?: number) => string;
  validateInternalName: (name: string) => boolean;
  validatePrefix: (prefix: string) => boolean;
  solutionInternalName: (displayName: string) => string;
  publisherInternalName: (displayName: string) => string;
  cleanInternalName: (name: string) => string;
  cleanPrefix: (prefix: string) => string;
}
