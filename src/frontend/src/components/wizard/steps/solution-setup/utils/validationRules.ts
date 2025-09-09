/**
 * Validation Rules for Solution Setup
 * Centralized validation logic for solutions and publishers
 */

import {
  ValidationRules,
  ValidationError,
  ValidationResult,
  SolutionSetupFormState,
  NewPublisherFormData,
  PublisherValidationResult,
  PUBLISHER_CONSTANTS,
  PUBLISHER_PATTERNS,
  PUBLISHER_ERROR_MESSAGES,
  RESERVED_PUBLISHER_VALUES,
} from '../types';

/**
 * Default validation rules for the solution setup form
 */
export const DEFAULT_VALIDATION_RULES: ValidationRules = {
  solution: {
    name: {
      required: true,
      minLength: 1,
      maxLength: 100,
      pattern: /^[a-zA-Z0-9\s\-_]+$/,
    },
    internalName: {
      required: true,
      pattern: /^[a-zA-Z0-9]+$/,
      maxLength: 64,
    },
  },
  publisher: {
    name: {
      required: true,
      minLength: 1,
      maxLength: 100,
      pattern: /^[a-zA-Z0-9\s\-_]+$/,
    },
    internalName: {
      required: true,
      pattern: /^[a-zA-Z0-9]+$/,
      maxLength: 64,
    },
    prefix: {
      required: true,
      minLength: PUBLISHER_CONSTANTS.PREFIX_MIN_LENGTH,
      maxLength: PUBLISHER_CONSTANTS.PREFIX_MAX_LENGTH,
      pattern: /^[a-z]+$/,
    },
  },
};

/**
 * Validates a solution name
 */
export const validateSolutionName = (name: string): ValidationError[] => {
  const errors: ValidationError[] = [];
  const rules = DEFAULT_VALIDATION_RULES.solution.name;

  if (!name?.trim()) {
    if (rules.required) {
      errors.push({
        field: 'solutionName',
        message: 'Solution name is required',
        type: 'required',
      });
    }
    return errors;
  }

  const trimmedName = name.trim();

  if (rules.minLength && trimmedName.length < rules.minLength) {
    errors.push({
      field: 'solutionName',
      message: `Solution name must be at least ${rules.minLength} character${rules.minLength > 1 ? 's' : ''}`,
      type: 'length',
    });
  }

  if (rules.maxLength && trimmedName.length > rules.maxLength) {
    errors.push({
      field: 'solutionName',
      message: `Solution name must be no more than ${rules.maxLength} characters`,
      type: 'length',
    });
  }

  if (rules.pattern && !rules.pattern.test(trimmedName)) {
    errors.push({
      field: 'solutionName',
      message: 'Solution name can only contain letters, numbers, spaces, hyphens, and underscores',
      type: 'format',
    });
  }

  return errors;
};

/**
 * Validates a solution internal name
 */
export const validateSolutionInternalName = (internalName: string): ValidationError[] => {
  const errors: ValidationError[] = [];
  const rules = DEFAULT_VALIDATION_RULES.solution.internalName;

  if (!internalName?.trim()) {
    if (rules.required) {
      errors.push({
        field: 'solutionInternalName',
        message: 'Solution internal name is required',
        type: 'required',
      });
    }
    return errors;
  }

  const trimmedName = internalName.trim();

  if (rules.maxLength && trimmedName.length > rules.maxLength) {
    errors.push({
      field: 'solutionInternalName',
      message: `Solution internal name must be no more than ${rules.maxLength} characters`,
      type: 'length',
    });
  }

  if (rules.pattern && !rules.pattern.test(trimmedName)) {
    errors.push({
      field: 'solutionInternalName',
      message: 'Solution internal name can only contain letters and numbers (no spaces)',
      type: 'format',
    });
  }

  return errors;
};

/**
 * Validates publisher display name
 */
export const validatePublisherDisplayName = (displayName: string): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!displayName?.trim()) {
    errors.push({
      field: 'newPublisherName',
      message: PUBLISHER_ERROR_MESSAGES.DISPLAY_NAME_REQUIRED,
      type: 'required',
    });
    return errors;
  }

  const trimmedName = displayName.trim();

  if (trimmedName.length < PUBLISHER_CONSTANTS.NAME_MIN_LENGTH) {
    errors.push({
      field: 'newPublisherName',
      message: PUBLISHER_ERROR_MESSAGES.DISPLAY_NAME_TOO_SHORT,
      type: 'length',
    });
  }

  if (trimmedName.length > PUBLISHER_CONSTANTS.NAME_MAX_LENGTH) {
    errors.push({
      field: 'newPublisherName',
      message: PUBLISHER_ERROR_MESSAGES.DISPLAY_NAME_TOO_LONG,
      type: 'length',
    });
  }

  if (!PUBLISHER_PATTERNS.DISPLAY_NAME.test(trimmedName)) {
    errors.push({
      field: 'newPublisherName',
      message: PUBLISHER_ERROR_MESSAGES.DISPLAY_NAME_INVALID_CHARS,
      type: 'format',
    });
  }

  return errors;
};

/**
 * Validates publisher unique name
 */
export const validatePublisherInternalName = (internalName: string): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!internalName?.trim()) {
    errors.push({
      field: 'newPublisherInternalName',
      message: PUBLISHER_ERROR_MESSAGES.UNIQUE_NAME_REQUIRED,
      type: 'required',
    });
    return errors;
  }

  const trimmedName = internalName.trim();

  if (trimmedName.length > PUBLISHER_CONSTANTS.UNIQUE_NAME_MAX_LENGTH) {
    errors.push({
      field: 'newPublisherInternalName',
      message: PUBLISHER_ERROR_MESSAGES.UNIQUE_NAME_TOO_LONG,
      type: 'length',
    });
  }

  if (!PUBLISHER_PATTERNS.UNIQUE_NAME.test(trimmedName)) {
    errors.push({
      field: 'newPublisherInternalName',
      message: PUBLISHER_ERROR_MESSAGES.UNIQUE_NAME_INVALID_CHARS,
      type: 'format',
    });
  }

  if (RESERVED_PUBLISHER_VALUES.NAMES.includes(trimmedName.toLowerCase() as any)) {
    errors.push({
      field: 'newPublisherInternalName',
      message: PUBLISHER_ERROR_MESSAGES.UNIQUE_NAME_RESERVED,
      type: 'duplicate',
    });
  }

  return errors;
};

/**
 * Validates publisher prefix
 */
export const validatePublisherPrefix = (prefix: string): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!prefix?.trim()) {
    errors.push({
      field: 'newPublisherPrefix',
      message: PUBLISHER_ERROR_MESSAGES.PREFIX_REQUIRED,
      type: 'required',
    });
    return errors;
  }

  const trimmedPrefix = prefix.trim();

  if (trimmedPrefix.length < PUBLISHER_CONSTANTS.PREFIX_MIN_LENGTH) {
    errors.push({
      field: 'newPublisherPrefix',
      message: PUBLISHER_ERROR_MESSAGES.PREFIX_TOO_SHORT,
      type: 'length',
    });
  }

  if (trimmedPrefix.length > PUBLISHER_CONSTANTS.PREFIX_MAX_LENGTH) {
    errors.push({
      field: 'newPublisherPrefix',
      message: PUBLISHER_ERROR_MESSAGES.PREFIX_TOO_LONG,
      type: 'length',
    });
  }

  if (!PUBLISHER_PATTERNS.PREFIX.test(trimmedPrefix)) {
    errors.push({
      field: 'newPublisherPrefix',
      message: PUBLISHER_ERROR_MESSAGES.PREFIX_INVALID_CHARS,
      type: 'format',
    });
  }

  if (RESERVED_PUBLISHER_VALUES.PREFIXES.includes(trimmedPrefix.toLowerCase() as any)) {
    errors.push({
      field: 'newPublisherPrefix',
      message: PUBLISHER_ERROR_MESSAGES.PREFIX_RESERVED,
      type: 'duplicate',
    });
  }

  return errors;
};

/**
 * Validates the entire solution setup form
 */
export const validateSolutionSetupForm = (formState: Partial<SolutionSetupFormState>): ValidationResult => {
  const errors: ValidationError[] = [];

  // Validate solution fields
  if (formState.solutionType === 'new') {
    // Solution name validation
    if (formState.solutionName !== undefined) {
      errors.push(...validateSolutionName(formState.solutionName));
    }

    // Solution internal name validation
    if (formState.solutionInternalName !== undefined) {
      errors.push(...validateSolutionInternalName(formState.solutionInternalName));
    }

    // Publisher validation for new solutions
    if (formState.publisherType === 'existing') {
      if (!formState.selectedPublisher) {
        errors.push({
          field: 'selectedPublisher',
          message: 'Please select a publisher',
          type: 'required',
        });
      }
    } else if (formState.publisherType === 'new') {
      if (formState.newPublisherName !== undefined) {
        errors.push(...validatePublisherDisplayName(formState.newPublisherName));
      }
      if (formState.newPublisherInternalName !== undefined) {
        errors.push(...validatePublisherInternalName(formState.newPublisherInternalName));
      }
      if (formState.newPublisherPrefix !== undefined) {
        errors.push(...validatePublisherPrefix(formState.newPublisherPrefix));
      }
    }
  } else if (formState.solutionType === 'existing') {
    if (!formState.selectedSolution) {
      errors.push({
        field: 'selectedSolution',
        message: 'Please select a solution',
        type: 'required',
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validates new publisher form data
 */
export const validateNewPublisherForm = (formData: NewPublisherFormData): PublisherValidationResult => {
  const result: PublisherValidationResult = {
    isValid: true,
    errors: {},
  };

  // Validate display name
  const displayNameErrors = validatePublisherDisplayName(formData.displayName);
  if (displayNameErrors.length > 0) {
    result.errors.displayName = displayNameErrors[0].message;
    result.isValid = false;
  }

  // Validate unique name
  const uniqueNameErrors = validatePublisherInternalName(formData.uniqueName);
  if (uniqueNameErrors.length > 0) {
    result.errors.uniqueName = uniqueNameErrors[0].message;
    result.isValid = false;
  }

  // Validate prefix
  const prefixErrors = validatePublisherPrefix(formData.prefix);
  if (prefixErrors.length > 0) {
    result.errors.prefix = prefixErrors[0].message;
    result.isValid = false;
  }

  return result;
};

/**
 * Checks if a field has a specific type of error
 */
export const hasErrorType = (errors: ValidationError[], field: string, type: ValidationError['type']): boolean => {
  return errors.some(error => error.field === field && error.type === type);
};

/**
 * Gets all errors for a specific field
 */
export const getFieldErrors = (errors: ValidationError[], field: string): ValidationError[] => {
  return errors.filter(error => error.field === field);
};

/**
 * Gets the first error message for a specific field
 */
export const getFirstFieldError = (errors: ValidationError[], field: string): string | undefined => {
  const fieldErrors = getFieldErrors(errors, field);
  return fieldErrors.length > 0 ? fieldErrors[0].message : undefined;
};

/**
 * Creates a validation summary for display to users
 */
export const createValidationSummary = (errors: ValidationError[]): string => {
  if (errors.length === 0) {
    return 'All fields are valid';
  }

  if (errors.length === 1) {
    return errors[0].message;
  }

  return `${errors.length} validation errors found. Please review the form.`;
};

/**
 * Validates a single field by name
 */
export const validateSingleField = (
  fieldName: keyof SolutionSetupFormState,
  value: any,
  _formState?: Partial<SolutionSetupFormState>
): ValidationError[] => {
  switch (fieldName) {
    case 'solutionName':
      return validateSolutionName(value);
    case 'solutionInternalName':
      return validateSolutionInternalName(value);
    case 'newPublisherName':
      return validatePublisherDisplayName(value);
    case 'newPublisherInternalName':
      return validatePublisherInternalName(value);
    case 'newPublisherPrefix':
      return validatePublisherPrefix(value);
    default:
      return [];
  }
};
