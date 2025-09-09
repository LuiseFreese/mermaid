/**
 * Custom hook for Solution Configuration in Solution Setup
 * Handles solution type selection, new solution creation, and existing solution selection
 */

import { useCallback, useMemo, useEffect } from 'react';
// TODO: Replace with actual service imports during integration
// import { useSolutions } from '../../../hooks/useSolutions';
// import { useWizardContext } from '../../../context/WizardContext';
// Temporary placeholders for development
const useSolutions = () => ({ solutions: [], loading: false, error: null, refetch: () => {} });
const useWizardContext = () => ({ 
  wizardData: {
    solutionType: 'existing' as SolutionType,
    solutionName: '',
    solutionInternalName: '',
    selectedSolution: null,
    includeRelatedTables: false,
  }, 
  updateWizardData: (_data: any) => {} 
});
import {
  UseSolutionConfigurationResult,
  SolutionType,
  ValidationError,
} from '../types';
import {
  useNameGeneration,
  useFormValidation,
  useSearchableDropdown,
} from './';
import {
  validateSolutionName,
  validateSolutionInternalName,
  filterSolutions,
  createSolutionSearchConfig,
} from '../utils';

/**
 * Hook that manages solution configuration state and logic
 */
export const useSolutionConfiguration = (): UseSolutionConfigurationResult => {
  // Get wizard context and external data
  const { wizardData, updateWizardData } = useWizardContext();
  const { solutions, loading: loadingSolutions, error: solutionError, refetch: refetchSolutions } = useSolutions();
  
  // Extract solution-related data from wizard context
  const {
    solutionType,
    solutionName,
    solutionInternalName,
    selectedSolution,
    includeRelatedTables,
  } = wizardData;

  // Get utility hooks
  const { solutionInternalName: generateSolutionInternalName } = useNameGeneration();
  const { validateField, getFirstErrorForField, hasFieldError } = useFormValidation({
    validateOnChange: true,
  });

  const solutionDropdown = useSearchableDropdown<any>({
    items: solutions,
    searchConfig: createSolutionSearchConfig(15),
    debounceDelay: 300,
    sortByRelevance: true,
    closeOnSelect: true,
    clearSearchOnSelect: true,
  });

  // Initialize dropdown with selected solution
  useEffect(() => {
    if (selectedSolution && !solutionDropdown.selectedItem) {
      solutionDropdown.setSelectedItem(selectedSolution);
    }
  }, [selectedSolution, solutionDropdown]);

  /**
   * Handles solution type changes (new vs existing)
   */
  const setSolutionType = useCallback((type: SolutionType) => {
    updateWizardData({ solutionType: type });
    
    // Clear relevant fields when switching types
    if (type === 'existing') {
      updateWizardData({
        solutionName: '',
        solutionInternalName: '',
      });
    } else if (type === 'new') {
      updateWizardData({
        selectedSolution: null,
      });
      solutionDropdown.clearSelection();
    }
  }, [updateWizardData, solutionDropdown]);

  /**
   * Handles solution name changes with auto-generation
   */
  const setSolutionName = useCallback((name: string) => {
    updateWizardData({ solutionName: name });
    
    // Auto-generate internal name
    const internalName = generateSolutionInternalName(name);
    updateWizardData({ solutionInternalName: internalName });
    
    // Validate the name
    validateField('solutionName', name);
  }, [updateWizardData, generateSolutionInternalName, validateField]);

  /**
   * Handles manual internal name changes
   */
  const setSolutionInternalName = useCallback((internalName: string) => {
    updateWizardData({ solutionInternalName: internalName });
    validateField('solutionInternalName', internalName);
  }, [updateWizardData, validateField]);

  /**
   * Handles existing solution selection
   */
  const setSelectedSolution = useCallback((solution: any | null) => {
    updateWizardData({ selectedSolution: solution });
    
    // When selecting an existing solution, automatically set its publisher
    if (solution?.publisherid) {
      updateWizardData({
        selectedPublisher: {
          id: solution.publisherid.publisherid,
          uniqueName: solution.publisherid.uniquename,
          displayName: solution.publisherid.uniquename,
          prefix: solution.publisherid.customizationprefix,
        },
      });
    }
    
    // Update dropdown state
    solutionDropdown.setSelectedItem(solution);
  }, [updateWizardData, solutionDropdown]);

  /**
   * Handles include related tables option
   */
  const setIncludeRelatedTables = useCallback((include: boolean) => {
    updateWizardData({ includeRelatedTables: include });
  }, [updateWizardData]);

  /**
   * Gets validation errors for solution fields
   */
  const solutionErrors = useMemo((): ValidationError[] => {
    const errors: ValidationError[] = [];
    
    if (solutionType === 'new') {
      errors.push(...validateSolutionName(solutionName || ''));
      errors.push(...validateSolutionInternalName(solutionInternalName || ''));
    } else if (solutionType === 'existing') {
      if (!selectedSolution) {
        errors.push({
          field: 'selectedSolution',
          message: 'Please select a solution',
          type: 'required',
        });
      }
    }
    
    return errors;
  }, [solutionType, solutionName, solutionInternalName, selectedSolution]);

  /**
   * Checks if solution configuration is valid
   */
  const isValid = useMemo(() => {
    return solutionErrors.length === 0;
  }, [solutionErrors]);

  /**
   * Search functionality for existing solutions
   */
  const searchSolutions = useCallback((searchTerm: string) => {
    const filtered = filterSolutions(solutions, searchTerm, 15);
    return filtered;
  }, [solutions]);

  /**
   * Gets display text for selected solution
   */
  const getSelectedSolutionDisplay = useCallback(() => {
    if (!selectedSolution) return '';
    return `${(selectedSolution as any).friendlyname || 'Unknown'} (${(selectedSolution as any).uniquename || 'Unknown'})`;
  }, [selectedSolution]);

  /**
   * Clears solution selection
   */
  const clearSolutionSelection = useCallback(() => {
    updateWizardData({ selectedSolution: null });
    solutionDropdown.clearSelection();
  }, [updateWizardData, solutionDropdown]);

  /**
   * Refreshes solutions data
   */
  const refreshSolutions = useCallback(async () => {
    return await refetchSolutions();
  }, [refetchSolutions]);

  /**
   * Gets solution configuration summary
   */
  const getSolutionSummary = useCallback(() => {
    if (solutionType === 'new') {
      return {
        type: 'new' as const,
        name: solutionName,
        internalName: solutionInternalName,
        includeRelatedTables,
      };
    } else {
      return {
        type: 'existing' as const,
        solution: selectedSolution,
        includeRelatedTables: false, // Not applicable for existing solutions
      };
    }
  }, [solutionType, solutionName, solutionInternalName, selectedSolution, includeRelatedTables]);

  /**
   * Validates current solution configuration
   */
  const validateSolutionConfig = useCallback(() => {
    return {
      isValid,
      errors: solutionErrors,
    };
  }, [isValid, solutionErrors]);

  return {
    // Basic properties
    solutionType,
    setSolutionType,
    solutionName: solutionName || '',
    setSolutionName,
    solutionInternalName: solutionInternalName || '',
    setSolutionInternalName,
    selectedSolution,
    setSelectedSolution,
    includeRelatedTables: includeRelatedTables || false,
    setIncludeRelatedTables,
    
    // Validation
    isValid,
    errors: solutionErrors,
    
    // External data state
    solutions,
    loadingSolutions,
    solutionError,
    refreshSolutions,
    
    // Search functionality
    searchSolutions,
    solutionDropdown: {
      ...solutionDropdown,
      filteredItems: solutionDropdown.filteredItems,
    },
    
    // Helper methods
    getSelectedSolutionDisplay,
    clearSolutionSelection,
    getSolutionSummary,
    validateSolutionConfig,
    
    // Field-specific error checking
    hasNameError: hasFieldError('solutionName'),
    hasInternalNameError: hasFieldError('solutionInternalName'),
    nameError: getFirstErrorForField('solutionName'),
    internalNameError: getFirstErrorForField('solutionInternalName'),
  };
};
