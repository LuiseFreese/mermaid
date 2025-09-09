/**
 * Custom hook for Publisher Configuration in Solution Setup
 * Handles publisher type selection, new publisher creation, and existing publisher selection
 */

import { useCallback, useMemo, useEffect } from 'react';
// TODO: Replace with actual service imports during integration
// import { usePublishers } from '../../../hooks/usePublishers';
// import { useWizardContext } from '../../../context/WizardContext';
// Temporary placeholders for development
const usePublishers = () => ({ publishers: [], loading: false, error: null, refetch: () => {} });
const useWizardContext = () => ({ 
  wizardData: {
    publisherType: 'existing' as PublisherType,
    selectedPublisher: null,
    newPublisherName: '',
    newPublisherInternalName: '',
    newPublisherPrefix: '',
  }, 
  updateWizardData: (_data: any) => {} 
});
import {
  UsePublisherConfigurationResult,
  PublisherType,
  ValidationError,
  NewPublisherFormData,
  PublisherValidationResult,
} from '../types';
import {
  useNameGeneration,
  useFormValidation,
  useSearchableDropdown,
} from './';
import {
  validatePublisherDisplayName,
  validatePublisherInternalName,
  validatePublisherPrefix,
  validateNewPublisherForm,
  filterPublishers,
  createPublisherSearchConfig,
} from '../utils';

/**
 * Hook that manages publisher configuration state and logic
 */
export const usePublisherConfiguration = (): UsePublisherConfigurationResult => {
  // Get wizard context and external data
  const { wizardData, updateWizardData } = useWizardContext();
  const { publishers, loading: loadingPublishers, error: publisherError, refetch: refetchPublishers } = usePublishers();
  
  // Extract publisher-related data from wizard context
  const {
    publisherType,
    selectedPublisher,
    newPublisherName,
    newPublisherInternalName,
    newPublisherPrefix,
  } = wizardData;

  // Get utility hooks
  const { publisherInternalName: generatePublisherInternalName, generatePrefix, cleanInternalName, cleanPrefix } = useNameGeneration();
  const { validateField, getFirstErrorForField, hasFieldError } = useFormValidation({
    validateOnChange: true,
  });

  // Configure searchable dropdown for existing publishers
  const publisherSearchConfig = useMemo(
    () => createPublisherSearchConfig({
      searchProperties: ['displayName', 'uniqueName', 'prefix'],
      maxResults: 10,
    }),
    []
  );

  const publisherDropdown = useSearchableDropdown<any>({
    items: publishers,
    searchConfig: createPublisherSearchConfig(),
    debounceDelay: 300,
    sortByRelevance: true,
    closeOnSelect: true,
    clearSearchOnSelect: true,
  });

  // Initialize dropdown with selected publisher
  useEffect(() => {
    if (selectedPublisher && !publisherDropdown.selectedItem) {
      publisherDropdown.setSelectedItem(selectedPublisher);
    }
  }, [selectedPublisher, publisherDropdown]);

  /**
   * Handles publisher type changes (new vs existing)
   */
  const setPublisherType = useCallback((type: PublisherType) => {
    updateWizardData({ publisherType: type });
    
    // Clear relevant fields when switching types
    if (type === 'existing') {
      updateWizardData({
        newPublisherName: '',
        newPublisherInternalName: '',
        newPublisherPrefix: '',
      });
    } else if (type === 'new') {
      updateWizardData({
        selectedPublisher: null,
      });
      publisherDropdown.clearSelection();
    }
  }, [updateWizardData, publisherDropdown]);

  /**
   * Handles existing publisher selection
   */
  const setSelectedPublisher = useCallback((publisher: any | null) => {
    updateWizardData({ selectedPublisher: publisher });
    publisherDropdown.setSelectedItem(publisher);
  }, [updateWizardData, publisherDropdown]);

  /**
   * Handles new publisher display name changes with auto-generation
   */
  const setNewPublisherName = useCallback((name: string) => {
    updateWizardData({ newPublisherName: name });
    
    // Auto-generate internal name and prefix
    const internalName = generatePublisherInternalName(name);
    const prefix = generatePrefix(name);
    
    updateWizardData({
      newPublisherInternalName: internalName,
      newPublisherPrefix: prefix,
    });
    
    // Validate the name
    validateField('newPublisherName', name);
  }, [updateWizardData, generatePublisherInternalName, generatePrefix, validateField]);

  /**
   * Handles manual new publisher internal name changes
   */
  const setNewPublisherInternalName = useCallback((internalName: string) => {
    // Clean the input
    const cleaned = cleanInternalName(internalName);
    updateWizardData({ newPublisherInternalName: cleaned });
    
    // Auto-generate prefix from the internal name
    const prefix = generatePrefix(cleaned);
    updateWizardData({ newPublisherPrefix: prefix });
    
    validateField('newPublisherInternalName', cleaned);
  }, [updateWizardData, cleanInternalName, generatePrefix, validateField]);

  /**
   * Handles manual new publisher prefix changes
   */
  const setNewPublisherPrefix = useCallback((prefix: string) => {
    // Clean the input
    const cleaned = cleanPrefix(prefix);
    updateWizardData({ newPublisherPrefix: cleaned });
    validateField('newPublisherPrefix', cleaned);
  }, [updateWizardData, cleanPrefix, validateField]);

  /**
   * Gets validation errors for publisher fields
   */
  const publisherErrors = useMemo((): ValidationError[] => {
    const errors: ValidationError[] = [];
    
    if (publisherType === 'existing') {
      if (!selectedPublisher) {
        errors.push({
          field: 'selectedPublisher',
          message: 'Please select a publisher',
          type: 'required',
        });
      }
    } else if (publisherType === 'new') {
      errors.push(...validatePublisherDisplayName(newPublisherName || ''));
      errors.push(...validatePublisherInternalName(newPublisherInternalName || ''));
      errors.push(...validatePublisherPrefix(newPublisherPrefix || ''));
    }
    
    return errors;
  }, [publisherType, selectedPublisher, newPublisherName, newPublisherInternalName, newPublisherPrefix]);

  /**
   * Checks if publisher configuration is valid
   */
  const isValid = useMemo(() => {
    return publisherErrors.length === 0;
  }, [publisherErrors]);

  /**
   * Gets new publisher form validation result
   */
  const newPublisherValidation = useMemo((): PublisherValidationResult => {
    if (publisherType !== 'new') {
      return { isValid: true, errors: {} };
    }
    
    const formData: NewPublisherFormData = {
      displayName: newPublisherName || '',
      uniqueName: newPublisherInternalName || '',
      prefix: newPublisherPrefix || '',
    };
    
    return validateNewPublisherForm(formData);
  }, [publisherType, newPublisherName, newPublisherInternalName, newPublisherPrefix]);

  /**
   * Search functionality for existing publishers
   */
  const searchPublishers = useCallback((searchTerm: string) => {
    const filtered = filterPublishers(publishers, searchTerm, publisherSearchConfig);
    return filtered;
  }, [publishers, publisherSearchConfig]);

  /**
   * Gets display text for selected publisher
   */
  const getSelectedPublisherDisplay = useCallback(() => {
    if (!selectedPublisher) return '';
    return `${(selectedPublisher as any).displayName || (selectedPublisher as any).friendlyname || 'Unknown'} (${(selectedPublisher as any).prefix || 'Unknown'})`;
  }, [selectedPublisher]);

  /**
   * Clears publisher selection
   */
  const clearPublisherSelection = useCallback(() => {
    updateWizardData({ selectedPublisher: null });
    publisherDropdown.clearSelection();
  }, [updateWizardData, publisherDropdown]);

  /**
   * Refreshes publishers data
   */
  const refreshPublishers = useCallback(async () => {
    return await refetchPublishers();
  }, [refetchPublishers]);

  /**
   * Gets publisher configuration summary
   */
  const getPublisherSummary = useCallback(() => {
    if (publisherType === 'existing') {
      return {
        type: 'existing' as const,
        publisher: selectedPublisher,
      };
    } else {
      return {
        type: 'new' as const,
        displayName: newPublisherName,
        uniqueName: newPublisherInternalName,
        prefix: newPublisherPrefix,
      };
    }
  }, [publisherType, selectedPublisher, newPublisherName, newPublisherInternalName, newPublisherPrefix]);

  /**
   * Validates current publisher configuration
   */
  const validatePublisherConfig = useCallback(() => {
    return {
      isValid,
      errors: publisherErrors,
      newPublisherValidation,
    };
  }, [isValid, publisherErrors, newPublisherValidation]);

  /**
   * Clears new publisher form
   */
  const clearNewPublisherForm = useCallback(() => {
    updateWizardData({
      newPublisherName: '',
      newPublisherInternalName: '',
      newPublisherPrefix: '',
    });
  }, [updateWizardData]);

  /**
   * Pre-fills new publisher form with suggested values
   */
  const suggestNewPublisher = useCallback((baseName: string) => {
    const displayName = baseName.trim();
    const internalName = generatePublisherInternalName(displayName);
    const prefix = generatePrefix(displayName);
    
    updateWizardData({
      newPublisherName: displayName,
      newPublisherInternalName: internalName,
      newPublisherPrefix: prefix,
    });
  }, [updateWizardData, generatePublisherInternalName, generatePrefix]);

  /**
   * Checks if new publisher form has any data
   */
  const hasNewPublisherData = useMemo(() => {
    return !!(newPublisherName || newPublisherInternalName || newPublisherPrefix);
  }, [newPublisherName, newPublisherInternalName, newPublisherPrefix]);

  return {
    // Basic properties
    publisherType,
    setPublisherType,
    selectedPublisher,
    setSelectedPublisher,
    newPublisherName: newPublisherName || '',
    setNewPublisherName,
    newPublisherInternalName: newPublisherInternalName || '',
    setNewPublisherInternalName,
    newPublisherPrefix: newPublisherPrefix || '',
    setNewPublisherPrefix,
    
    // Validation
    isValid,
    errors: publisherErrors,
    newPublisherValidation,
    
    // External data state
    publishers,
    loadingPublishers,
    publisherError,
    refreshPublishers,
    
    // Search functionality
    searchPublishers,
    publisherDropdown: {
      ...publisherDropdown,
      filteredItems: publisherDropdown.filteredItems,
    },
    
    // Helper methods
    getSelectedPublisherDisplay,
    clearPublisherSelection,
    getPublisherSummary,
    validatePublisherConfig,
    clearNewPublisherForm,
    suggestNewPublisher,
    
    // State checks
    hasNewPublisherData,
    
    // Field-specific error checking
    hasDisplayNameError: hasFieldError('newPublisherName'),
    hasInternalNameError: hasFieldError('newPublisherInternalName'),
    hasPrefixError: hasFieldError('newPublisherPrefix'),
    displayNameError: getFirstErrorForField('newPublisherName'),
    internalNameError: getFirstErrorForField('newPublisherInternalName'),
    prefixError: getFirstErrorForField('newPublisherPrefix'),
  };
};
