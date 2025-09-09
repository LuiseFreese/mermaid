/**
 * Type definitions for Solution Setup Step
 * Central export point for all types used in solution setup functionality
 */

// Core solution setup types
export type {
  SolutionType,
  PublisherType,
  SolutionConfiguration,
  NewSolutionData,
  PublisherConfiguration,
  NewPublisherData,
  SolutionSetupFormState,
  ValidationResult,
  ValidationError,
  ValidationRules,
  NameGenerationOptions,
  SearchConfiguration,
  DropdownState,
  SolutionSetupStepProps,
  UseSolutionConfigurationResult,
  UsePublisherConfigurationResult,
  UseSearchableDropdownResult,
  UseFormValidationResult,
  UseNameGenerationResult,
} from './solution-setup.types';

// Publisher-specific types
export type {
  EnhancedPublisher,
  PublisherSelectionState,
  NewPublisherFormData,
  PublisherSearchConfig,
  PublisherValidationRules,
  PublisherValidationResult,
  PublisherGenerationOptions,
  PublisherHookConfig,
  PublisherSelectorProps,
  NewPublisherFormProps,
  PublisherDropdownItemProps,
} from './publisher.types';

// Publisher constants and patterns
export {
  PUBLISHER_CONSTANTS,
  PUBLISHER_PATTERNS,
  RESERVED_PUBLISHER_VALUES,
  PUBLISHER_ERROR_MESSAGES,
} from './publisher.types';

// Re-export external types that are commonly used
// These will be connected during full integration
// export type { Publisher } from '../../../services/publisherService';
// export type { Solution } from '../../../services/solutionService';

// Temporary placeholder types for testing and development
export interface Publisher {
  displayName: string;
  uniqueName: string;
  prefix: string;
  [key: string]: any;
}

export interface Solution {
  friendlyname: string;
  uniquename: string;
  [key: string]: any;
}

// Type aliases for legacy component interface compatibility
export type {
  SolutionSetupFormState as SolutionSetupFormData,
  NewSolutionData as SolutionFormData,
  NewPublisherData as PublisherFormData,
} from './solution-setup.types';

// Additional convenience aliases
export type DataverseSolution = Solution;
export type DataversePublisher = Publisher;
