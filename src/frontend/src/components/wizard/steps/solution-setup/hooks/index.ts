/**
 * Custom hooks for Solution Setup Step
 * Central export point for all hooks used in solution setup functionality
 */

// Core business logic hooks
export { useNameGeneration } from './useNameGeneration';
export { useFormValidation } from './useFormValidation';
export { useSearchableDropdown } from './useSearchableDropdown';

// Configuration logic hooks (Phase 2)
export { useSolutionConfiguration } from './useSolutionConfiguration';
export { usePublisherConfiguration } from './usePublisherConfiguration';

// Re-export hook result types for convenience
export type {
  UseNameGenerationResult,
  UseFormValidationResult,
  UseSearchableDropdownResult,
  UseSolutionConfigurationResult,
  UsePublisherConfigurationResult,
} from '../types';
