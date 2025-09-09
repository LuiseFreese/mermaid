/**
 * Custom hook for form validation in Solution Setup
 * Provides real-time validation and error management
 */

import { useState, useCallback, useMemo } from 'react';
import {
  UseFormValidationResult,
  ValidationError,
  ValidationResult,
  SolutionSetupFormState,
} from '../types';
import {
  validateSolutionSetupForm,
  validateSingleField,
  getFieldErrors,
  getFirstFieldError,
  createValidationSummary,
} from '../utils';

interface UseFormValidationOptions {
  validateOnChange?: boolean;
  debounceDelay?: number;
}

/**
 * Hook that provides form validation functionality for solution setup
 */
export const useFormValidation = (
  options: UseFormValidationOptions = {}
): UseFormValidationResult => {
  const { validateOnChange = true } = options;

  // State for tracking validation errors
  const [errors, setErrors] = useState<ValidationError[]>([]);

  /**
   * Validates a single field and updates errors
   */
  const validateField = useCallback(
    (field: string, value: any, formState?: Partial<SolutionSetupFormState>): ValidationError[] => {
      const fieldErrors = validateSingleField(field as keyof SolutionSetupFormState, value, formState);
      
      if (validateOnChange) {
        setErrors(prevErrors => {
          // Remove existing errors for this field
          const otherErrors = prevErrors.filter(error => error.field !== field);
          // Add new errors for this field
          return [...otherErrors, ...fieldErrors];
        });
      }

      return fieldErrors;
    },
    [validateOnChange]
  );

  /**
   * Validates the entire form
   */
  const validateForm = useCallback(
    (formState: Partial<SolutionSetupFormState>): ValidationResult => {
      const result = validateSolutionSetupForm(formState);
      setErrors(result.errors);
      return result;
    },
    []
  );

  /**
   * Clears all validation errors
   */
  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  /**
   * Clears errors for a specific field
   */
  const clearFieldErrors = useCallback((field: string) => {
    setErrors(prevErrors => prevErrors.filter(error => error.field !== field));
  }, []);

  /**
   * Gets errors for a specific field
   */
  const getErrorsForField = useCallback(
    (field: string): ValidationError[] => {
      return getFieldErrors(errors, field);
    },
    [errors]
  );

  /**
   * Gets the first error message for a specific field
   */
  const getFirstErrorForField = useCallback(
    (field: string): string | undefined => {
      return getFirstFieldError(errors, field);
    },
    [errors]
  );

  /**
   * Checks if a field has any errors
   */
  const hasFieldError = useCallback(
    (field: string): boolean => {
      return getFieldErrors(errors, field).length > 0;
    },
    [errors]
  );

  /**
   * Checks if the form is valid (no errors)
   */
  const isValid = useMemo(() => {
    return errors.length === 0;
  }, [errors]);

  /**
   * Gets a summary of all validation errors
   */
  const validationSummary = useMemo(() => {
    return createValidationSummary(errors);
  }, [errors]);

  /**
   * Gets errors grouped by field
   */
  const errorsByField = useMemo(() => {
    const grouped: Record<string, ValidationError[]> = {};
    errors.forEach(error => {
      if (!grouped[error.field]) {
        grouped[error.field] = [];
      }
      grouped[error.field].push(error);
    });
    return grouped;
  }, [errors]);

  /**
   * Validates multiple fields at once
   */
  const validateFields = useCallback(
    (fieldsToValidate: Array<{ field: string; value: any }>, formState?: Partial<SolutionSetupFormState>): ValidationError[] => {
      const allErrors: ValidationError[] = [];
      
      fieldsToValidate.forEach(({ field, value }) => {
        const fieldErrors = validateSingleField(field as keyof SolutionSetupFormState, value, formState);
        allErrors.push(...fieldErrors);
      });

      if (validateOnChange) {
        // Remove errors for fields being validated
        const fieldsBeingValidated = fieldsToValidate.map(f => f.field);
        setErrors(prevErrors => {
          const otherErrors = prevErrors.filter(error => !fieldsBeingValidated.includes(error.field));
          return [...otherErrors, ...allErrors];
        });
      }

      return allErrors;
    },
    [validateOnChange]
  );

  /**
   * Checks if form has any errors of a specific type
   */
  const hasErrorType = useCallback(
    (errorType: ValidationError['type']): boolean => {
      return errors.some(error => error.type === errorType);
    },
    [errors]
  );

  /**
   * Gets all required field errors
   */
  const getRequiredFieldErrors = useCallback((): ValidationError[] => {
    return errors.filter(error => error.type === 'required');
  }, [errors]);

  /**
   * Gets all format validation errors
   */
  const getFormatErrors = useCallback((): ValidationError[] => {
    return errors.filter(error => error.type === 'format');
  }, [errors]);

  return {
    isValid,
    errors,
    validateField,
    validateForm,
    clearErrors,
    clearFieldErrors,
    getErrorsForField,
    getFirstErrorForField,
    hasFieldError,
    validationSummary,
    errorsByField,
    validateFields,
    hasErrorType,
    getRequiredFieldErrors,
    getFormatErrors,
  };
};
