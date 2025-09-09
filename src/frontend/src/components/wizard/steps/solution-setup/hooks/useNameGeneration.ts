/**
 * Custom hook for name generation in Solution Setup
 * Handles auto-generation of internal names and prefixes
 */

import { useCallback, useMemo } from 'react';
import {
  UseNameGenerationResult,
  NameGenerationOptions,
} from '../types';
import {
  generateInternalName,
  generatePrefix,
  validateInternalName,
  validatePrefix,
  generateSolutionInternalName,
  generatePublisherInternalName,
  cleanInternalName,
  cleanPrefix,
} from '../utils';

/**
 * Hook that provides name generation utilities for solution setup
 */
export const useNameGeneration = (): UseNameGenerationResult => {
  /**
   * Generates an internal name from a display name with options
   */
  const generateInternalNameCallback = useCallback(
    (displayName: string, options?: NameGenerationOptions): string => {
      return generateInternalName(displayName, options);
    },
    []
  );

  /**
   * Generates a publisher prefix from a name
   */
  const generatePrefixCallback = useCallback(
    (name: string, maxLength?: number): string => {
      return generatePrefix(name, maxLength);
    },
    []
  );

  /**
   * Validates an internal name
   */
  const validateInternalNameCallback = useCallback(
    (name: string): boolean => {
      return validateInternalName(name);
    },
    []
  );

  /**
   * Validates a publisher prefix
   */
  const validatePrefixCallback = useCallback(
    (prefix: string): boolean => {
      return validatePrefix(prefix);
    },
    []
  );

  /**
   * Specialized generators with memoization
   */
  const generators = useMemo(
    () => ({
      /**
       * Generates a solution internal name from display name
       */
      solutionInternalName: (displayName: string): string => {
        return generateSolutionInternalName(displayName);
      },

      /**
       * Generates a publisher internal name from display name
       */
      publisherInternalName: (displayName: string): string => {
        return generatePublisherInternalName(displayName);
      },

      /**
       * Cleans a manually entered internal name
       */
      cleanInternalName: (name: string): string => {
        return cleanInternalName(name);
      },

      /**
       * Cleans a manually entered prefix
       */
      cleanPrefix: (prefix: string): string => {
        return cleanPrefix(prefix);
      },
    }),
    []
  );

  return {
    generateInternalName: generateInternalNameCallback,
    generatePrefix: generatePrefixCallback,
    validateInternalName: validateInternalNameCallback,
    validatePrefix: validatePrefixCallback,
    // Add specific generator methods from generators object
    solutionInternalName: generators.solutionInternalName,
    publisherInternalName: generators.publisherInternalName,
    cleanInternalName: generators.cleanInternalName,
    cleanPrefix: generators.cleanPrefix,
  };
};
