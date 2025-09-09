/**
 * Validation utilities for Global Choices Step
 * Comprehensive validation logic extracted for better organization and testing
 */

import { 
  GlobalChoice, 
  GlobalChoicesValidationError,
  GlobalChoicesValidationResult,
  GlobalChoicesFormData,
  GLOBAL_CHOICES_CONSTANTS,
  GLOBAL_CHOICES_ERROR_MESSAGES
} from '../types/global-choices.types';

// ===== FORM VALIDATION =====

/**
 * Validates the entire global choices form
 */
export function validateGlobalChoicesForm(formData: GlobalChoicesFormData): GlobalChoicesValidationResult {
  const errors: GlobalChoicesValidationError[] = [];
  const warnings: GlobalChoicesValidationError[] = [];

  // Validate selection
  const selectionValidation = validateChoiceSelection(formData.selectedGlobalChoices);
  errors.push(...selectionValidation.errors);
  warnings.push(...selectionValidation.warnings);

  // Validate uploaded choices if any
  if (formData.uploadedGlobalChoices && formData.uploadedGlobalChoices.length > 0) {
    const uploadValidation = validateUploadedChoices(formData.uploadedGlobalChoices);
    errors.push(...uploadValidation.errors);
    warnings.push(...uploadValidation.warnings);
  }

  // Check for conflicts between selected and uploaded choices
  const conflictValidation = validateChoiceConflicts(
    formData.selectedGlobalChoices,
    formData.uploadedGlobalChoices
  );
  errors.push(...conflictValidation.errors);
  warnings.push(...conflictValidation.warnings);

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates choice selection requirements
 */
export function validateChoiceSelection(selectedChoices: GlobalChoice[]): GlobalChoicesValidationResult {
  const errors: GlobalChoicesValidationError[] = [];
  const warnings: GlobalChoicesValidationError[] = [];

  // Check if at least one choice is selected
  if (!selectedChoices || selectedChoices.length === 0) {
    errors.push({
      field: 'selectedChoices',
      message: GLOBAL_CHOICES_ERROR_MESSAGES.NO_CHOICES_SELECTED,
      type: 'required'
    });
  }

  // Check selection limit
  if (selectedChoices.length > GLOBAL_CHOICES_CONSTANTS.MAX_SELECTIONS) {
    warnings.push({
      field: 'selectedChoices',
      message: `You have selected ${selectedChoices.length} choices. Consider limiting to ${GLOBAL_CHOICES_CONSTANTS.MAX_SELECTIONS} or fewer for optimal performance.`,
      type: 'selection'
    });
  }

  // Validate individual choices
  selectedChoices.forEach((choice, index) => {
    const choiceValidation = validateSingleChoice(choice, `selectedChoices[${index}]`);
    errors.push(...choiceValidation.errors);
    warnings.push(...choiceValidation.warnings);
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates uploaded choices
 */
export function validateUploadedChoices(uploadedChoices: GlobalChoice[]): GlobalChoicesValidationResult {
  const errors: GlobalChoicesValidationError[] = [];
  const warnings: GlobalChoicesValidationError[] = [];

  if (!Array.isArray(uploadedChoices)) {
    errors.push({
      field: 'uploadedChoices',
      message: 'Uploaded choices must be an array',
      type: 'format'
    });
    return { isValid: false, errors, warnings };
  }

  // Validate each uploaded choice
  uploadedChoices.forEach((choice, index) => {
    const choiceValidation = validateSingleChoice(choice, `uploadedChoices[${index}]`);
    errors.push(...choiceValidation.errors);
    warnings.push(...choiceValidation.warnings);
  });

  // Check for duplicates within uploaded choices
  const duplicateValidation = validateDuplicateChoices(uploadedChoices, 'uploadedChoices');
  errors.push(...duplicateValidation.errors);
  warnings.push(...duplicateValidation.warnings);

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates a single global choice
 */
export function validateSingleChoice(choice: GlobalChoice, fieldPrefix: string): GlobalChoicesValidationResult {
  const errors: GlobalChoicesValidationError[] = [];
  const warnings: GlobalChoicesValidationError[] = [];

  if (!choice || typeof choice !== 'object') {
    errors.push({
      field: fieldPrefix,
      message: 'Choice must be a valid object',
      type: 'format'
    });
    return { isValid: false, errors, warnings };
  }

  // Validate required fields
  if (!choice.id) {
    errors.push({
      field: `${fieldPrefix}.id`,
      message: 'Choice ID is required',
      type: 'required'
    });
  }

  if (!choice.name) {
    errors.push({
      field: `${fieldPrefix}.name`,
      message: 'Choice name is required',
      type: 'required'
    });
  }

  if (!choice.logicalName) {
    errors.push({
      field: `${fieldPrefix}.logicalName`,
      message: 'Choice logical name is required',
      type: 'required'
    });
  }

  // Validate logical name format
  if (choice.logicalName && !/^[a-z][a-z0-9_]*$/i.test(choice.logicalName)) {
    errors.push({
      field: `${fieldPrefix}.logicalName`,
      message: 'Logical name must start with a letter and contain only letters, numbers, and underscores',
      type: 'format'
    });
  }

  // Validate options
  if (!choice.options || !Array.isArray(choice.options)) {
    errors.push({
      field: `${fieldPrefix}.options`,
      message: 'Choice must have a valid options array',
      type: 'required'
    });
  } else {
    if (choice.options.length === 0) {
      warnings.push({
        field: `${fieldPrefix}.options`,
        message: 'Choice has no options defined',
        type: 'format'
      });
    }

    // Validate each option
    choice.options.forEach((option, optionIndex) => {
      const optionValidation = validateChoiceOption(option, `${fieldPrefix}.options[${optionIndex}]`);
      errors.push(...optionValidation.errors);
      warnings.push(...optionValidation.warnings);
    });

    // Check for duplicate option values
    const duplicateValues = findDuplicateOptionValues(choice.options);
    if (duplicateValues.length > 0) {
      errors.push({
        field: `${fieldPrefix}.options`,
        message: `Duplicate option values found: ${duplicateValues.join(', ')}`,
        type: 'format'
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates a choice option
 */
export function validateChoiceOption(option: any, fieldPrefix: string): GlobalChoicesValidationResult {
  const errors: GlobalChoicesValidationError[] = [];
  const warnings: GlobalChoicesValidationError[] = [];

  if (!option || typeof option !== 'object') {
    errors.push({
      field: fieldPrefix,
      message: 'Option must be a valid object',
      type: 'format'
    });
    return { isValid: false, errors, warnings };
  }

  // Validate value
  if (option.value === undefined || option.value === null) {
    errors.push({
      field: `${fieldPrefix}.value`,
      message: 'Option value is required',
      type: 'required'
    });
  } else if (!Number.isInteger(option.value)) {
    errors.push({
      field: `${fieldPrefix}.value`,
      message: 'Option value must be an integer',
      type: 'format'
    });
  }

  // Validate label
  if (!option.label || typeof option.label !== 'string') {
    errors.push({
      field: `${fieldPrefix}.label`,
      message: 'Option label is required and must be a string',
      type: 'required'
    });
  } else if (option.label.trim().length === 0) {
    errors.push({
      field: `${fieldPrefix}.label`,
      message: 'Option label cannot be empty',
      type: 'required'
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates conflicts between selected and uploaded choices
 */
export function validateChoiceConflicts(
  selectedChoices: GlobalChoice[],
  uploadedChoices: GlobalChoice[]
): GlobalChoicesValidationResult {
  const errors: GlobalChoicesValidationError[] = [];
  const warnings: GlobalChoicesValidationError[] = [];

  if (!selectedChoices || !uploadedChoices || uploadedChoices.length === 0) {
    return { isValid: true, errors, warnings };
  }

  // Check for ID conflicts
  const selectedIds = new Set(selectedChoices.map(c => c.id));
  const uploadedIds = new Set(uploadedChoices.map(c => c.id));
  const conflictingIds = [...selectedIds].filter(id => uploadedIds.has(id));

  if (conflictingIds.length > 0) {
    warnings.push({
      field: 'conflicts',
      message: `Some uploaded choices have the same IDs as selected choices: ${conflictingIds.join(', ')}. Uploaded choices will take precedence.`,
      type: 'selection'
    });
  }

  // Check for logical name conflicts
  const selectedLogicalNames = new Set(selectedChoices.map(c => c.logicalName?.toLowerCase()));
  const uploadedLogicalNames = new Set(uploadedChoices.map(c => c.logicalName?.toLowerCase()));
  const conflictingLogicalNames = [...selectedLogicalNames].filter(name => uploadedLogicalNames.has(name));

  if (conflictingLogicalNames.length > 0) {
    errors.push({
      field: 'conflicts',
      message: `Logical name conflicts detected: ${conflictingLogicalNames.join(', ')}. Each choice must have a unique logical name.`,
      type: 'format'
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates for duplicate choices in an array
 */
export function validateDuplicateChoices(choices: GlobalChoice[], fieldName: string): GlobalChoicesValidationResult {
  const errors: GlobalChoicesValidationError[] = [];
  const warnings: GlobalChoicesValidationError[] = [];

  // Check for duplicate IDs
  const ids = choices.map(c => c.id).filter(Boolean);
  const duplicateIds = findDuplicates(ids);
  if (duplicateIds.length > 0) {
    errors.push({
      field: fieldName,
      message: `Duplicate choice IDs found: ${duplicateIds.join(', ')}`,
      type: 'format'
    });
  }

  // Check for duplicate logical names
  const logicalNames = choices.map(c => c.logicalName?.toLowerCase()).filter(Boolean);
  const duplicateLogicalNames = findDuplicates(logicalNames);
  if (duplicateLogicalNames.length > 0) {
    errors.push({
      field: fieldName,
      message: `Duplicate logical names found: ${duplicateLogicalNames.join(', ')}`,
      type: 'format'
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// ===== FILE VALIDATION =====

/**
 * Validates uploaded JSON file structure
 */
export function validateJsonFileStructure(data: any): GlobalChoicesValidationResult {
  const errors: GlobalChoicesValidationError[] = [];
  const warnings: GlobalChoicesValidationError[] = [];

  if (!data || typeof data !== 'object') {
    errors.push({
      field: 'file',
      message: 'File must contain valid JSON object',
      type: 'format'
    });
    return { isValid: false, errors, warnings };
  }

  // Check for recognized formats
  const hasGlobalChoices = data.globalChoices && Array.isArray(data.globalChoices);
  const isDirectArray = Array.isArray(data);
  const hasLegacyFormat = data.choices || data.optionSets || data.globalOptionSets;

  if (!hasGlobalChoices && !isDirectArray && !hasLegacyFormat) {
    errors.push({
      field: 'file',
      message: GLOBAL_CHOICES_ERROR_MESSAGES.INVALID_JSON_FORMAT,
      type: 'format'
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates file before processing
 */
export function validateFileBeforeProcessing(file: File): GlobalChoicesValidationResult {
  const errors: GlobalChoicesValidationError[] = [];
  const warnings: GlobalChoicesValidationError[] = [];

  // Check file size
  if (file.size > GLOBAL_CHOICES_CONSTANTS.MAX_FILE_SIZE) {
    errors.push({
      field: 'file',
      message: GLOBAL_CHOICES_ERROR_MESSAGES.FILE_TOO_LARGE,
      type: 'upload'
    });
  }

  // Check file type
  const extension = file.name.toLowerCase().split('.').pop();
  if (!extension || !GLOBAL_CHOICES_CONSTANTS.SUPPORTED_FILE_TYPES.includes(`.${extension}` as '.json')) {
    errors.push({
      field: 'file',
      message: GLOBAL_CHOICES_ERROR_MESSAGES.UNSUPPORTED_FILE_TYPE,
      type: 'upload'
    });
  }

  // Warn about large files
  if (file.size > 1024 * 1024) { // 1MB
    warnings.push({
      field: 'file',
      message: 'Large file detected. Processing may take a moment.',
      type: 'upload'
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// ===== HELPER FUNCTIONS =====

/**
 * Finds duplicate values in an array
 */
function findDuplicates<T>(array: T[]): T[] {
  const seen = new Set<T>();
  const duplicates = new Set<T>();

  array.forEach(item => {
    if (seen.has(item)) {
      duplicates.add(item);
    } else {
      seen.add(item);
    }
  });

  return Array.from(duplicates);
}

/**
 * Finds duplicate option values in a choice
 */
function findDuplicateOptionValues(options: any[]): number[] {
  const values = options.map(o => o.value).filter(v => v !== undefined && v !== null);
  return findDuplicates(values);
}

/**
 * Creates a formatted validation error message
 */
export function formatValidationErrors(errors: GlobalChoicesValidationError[]): string {
  if (errors.length === 0) return '';

  if (errors.length === 1) {
    return errors[0].message;
  }

  return `Multiple issues found:\n${errors.map(e => `• ${e.message}`).join('\n')}`;
}

/**
 * Checks if validation result has blocking errors
 */
export function hasBlockingErrors(result: GlobalChoicesValidationResult): boolean {
  return result.errors.some(error => 
    error.type === 'required' || error.type === 'format'
  );
}

/**
 * Gets validation summary
 */
export function getValidationSummary(result: GlobalChoicesValidationResult): string {
  const errorCount = result.errors.length;
  const warningCount = result.warnings.length;

  if (errorCount === 0 && warningCount === 0) {
    return 'All validations passed';
  }

  const parts: string[] = [];
  if (errorCount > 0) {
    parts.push(`${errorCount} error${errorCount === 1 ? '' : 's'}`);
  }
  if (warningCount > 0) {
    parts.push(`${warningCount} warning${warningCount === 1 ? '' : 's'}`);
  }

  return `Found ${parts.join(' and ')}`;
}
