/**
 * Publisher-specific types for Solution Setup Step
 * Extends base publisher types with additional functionality
 */

// Temporary placeholder Publisher type (will be replaced during integration)
interface Publisher {
  displayName: string;
  uniqueName: string;
  prefix: string;
  [key: string]: any;
}

// Extended Publisher interface with additional properties for UI
export interface EnhancedPublisher extends Publisher {
  displayName: string;
  searchableText?: string; // For search optimization
}

// Publisher Selection Options
export interface PublisherSelectionState {
  selectedPublisher: Publisher | null;
  searchTerm: string;
  filteredPublishers: Publisher[];
  isDropdownOpen: boolean;
  loading: boolean;
  error: string | null;
}

// New Publisher Form Data
export interface NewPublisherFormData {
  displayName: string;
  uniqueName: string;
  prefix: string;
  description?: string;
}

// Publisher Search Configuration
export interface PublisherSearchConfig {
  searchFields: ('displayName' | 'uniqueName' | 'prefix')[];
  caseSensitive: boolean;
  maxResults: number;
  minSearchLength: number;
}

// Publisher Validation Rules
export interface PublisherValidationRules {
  displayName: {
    required: boolean;
    minLength: number;
    maxLength: number;
    allowedCharacters: RegExp;
  };
  uniqueName: {
    required: boolean;
    minLength: number;
    maxLength: number;
    pattern: RegExp;
    reservedNames: string[];
  };
  prefix: {
    required: boolean;
    minLength: number;
    maxLength: number;
    pattern: RegExp;
    reservedPrefixes: string[];
  };
}

// Publisher Form Validation Result
export interface PublisherValidationResult {
  isValid: boolean;
  errors: {
    displayName?: string;
    uniqueName?: string;
    prefix?: string;
    general?: string;
  };
}

// Publisher Auto-generation Options
export interface PublisherGenerationOptions {
  fromDisplayName?: boolean;
  maxPrefixLength?: number;
  ensureUniqueness?: boolean;
  existingPrefixes?: string[];
  existingNames?: string[];
}

// Publisher Hook Configuration
export interface PublisherHookConfig {
  autoGenerateNames: boolean;
  validateInRealTime: boolean;
  checkUniqueness: boolean;
  maxSearchResults: number;
}

// Publisher Component Props
export interface PublisherSelectorProps {
  publishers: Publisher[];
  selectedPublisher: Publisher | null;
  onPublisherSelect: (publisher: Publisher | null) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export interface NewPublisherFormProps {
  formData: NewPublisherFormData;
  onFormChange: (data: Partial<NewPublisherFormData>) => void;
  validation: PublisherValidationResult;
  disabled?: boolean;
  autoGenerate?: boolean;
}

// Publisher Dropdown Item Renderer
export interface PublisherDropdownItemProps {
  publisher: Publisher;
  onSelect: (publisher: Publisher) => void;
  isSelected?: boolean;
  searchTerm?: string;
}

// Publisher Constants
export const PUBLISHER_CONSTANTS = {
  PREFIX_MIN_LENGTH: 3,
  PREFIX_MAX_LENGTH: 8,
  NAME_MIN_LENGTH: 1,
  NAME_MAX_LENGTH: 100,
  UNIQUE_NAME_MAX_LENGTH: 64,
  SEARCH_MIN_LENGTH: 2,
  MAX_DROPDOWN_RESULTS: 10,
  DEBOUNCE_DELAY: 300,
} as const;

// Publisher Validation Patterns
export const PUBLISHER_PATTERNS = {
  // Only letters and numbers for unique name
  UNIQUE_NAME: /^[a-zA-Z0-9]+$/,
  // Only lowercase letters for prefix
  PREFIX: /^[a-z]+$/,
  // Letters, numbers, spaces for display name
  DISPLAY_NAME: /^[a-zA-Z0-9\s]+$/,
} as const;

// Reserved Publisher Names and Prefixes
export const RESERVED_PUBLISHER_VALUES = {
  NAMES: [
    'Microsoft',
    'System',
    'Admin',
    'Default',
    'Dataverse',
    'PowerPlatform',
    'CRM',
    'Dynamics',
  ],
  PREFIXES: [
    'new',
    'cr',
    'msft',
    'sys',
    'admin',
    'test',
    'temp',
    'sample',
  ],
} as const;

// Publisher Error Messages
export const PUBLISHER_ERROR_MESSAGES = {
  DISPLAY_NAME_REQUIRED: 'Publisher display name is required',
  DISPLAY_NAME_TOO_SHORT: `Display name must be at least ${PUBLISHER_CONSTANTS.NAME_MIN_LENGTH} characters`,
  DISPLAY_NAME_TOO_LONG: `Display name must be no more than ${PUBLISHER_CONSTANTS.NAME_MAX_LENGTH} characters`,
  DISPLAY_NAME_INVALID_CHARS: 'Display name can only contain letters, numbers, and spaces',
  
  UNIQUE_NAME_REQUIRED: 'Publisher unique name is required',
  UNIQUE_NAME_TOO_LONG: `Unique name must be no more than ${PUBLISHER_CONSTANTS.UNIQUE_NAME_MAX_LENGTH} characters`,
  UNIQUE_NAME_INVALID_CHARS: 'Unique name can only contain letters and numbers (no spaces)',
  UNIQUE_NAME_RESERVED: 'This unique name is reserved and cannot be used',
  
  PREFIX_REQUIRED: 'Publisher prefix is required',
  PREFIX_TOO_SHORT: `Prefix must be at least ${PUBLISHER_CONSTANTS.PREFIX_MIN_LENGTH} characters`,
  PREFIX_TOO_LONG: `Prefix must be no more than ${PUBLISHER_CONSTANTS.PREFIX_MAX_LENGTH} characters`,
  PREFIX_INVALID_CHARS: 'Prefix can only contain lowercase letters',
  PREFIX_RESERVED: 'This prefix is reserved and cannot be used',
  
  LOAD_ERROR: 'Failed to load publishers',
  SEARCH_ERROR: 'Error occurred while searching publishers',
} as const;
