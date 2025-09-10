/**
 * Hook for managing global choices data fetching and state
 */

import { useWizardContext } from '../../../../../context/WizardContext';
import { useGlobalChoices } from '../../../../../hooks/useGlobalChoices';
import type { UseGlobalChoicesDataResult, GlobalChoice } from '../types';

export const useGlobalChoicesData = (): UseGlobalChoicesDataResult => {
  const { wizardData } = useWizardContext();
  const { globalChoicesSearchTerm } = wizardData;

  // Use the existing global choices hook
  const { 
    builtInChoices, 
    customChoices, 
    loading, 
    error 
  } = useGlobalChoices();

  // Debug logging for development
  console.log('🔍 useGlobalChoicesData - Debug info:', {
    builtInChoices: builtInChoices.length,
    customChoices: customChoices.length,
    loading,
    error,
    searchTerm: globalChoicesSearchTerm,
    builtInChoicesData: builtInChoices.slice(0, 3),
    customChoicesData: customChoices.slice(0, 3)
  });

  return {
    builtInChoices: builtInChoices.map(choice => ({
      ...choice,
      options: choice.options || []
    })),
    customChoices: customChoices.map(choice => ({
      ...choice,
      options: choice.options || []
    })),
    allChoices: [...builtInChoices, ...customChoices].map(choice => ({
      ...choice,
      options: choice.options || []
    })),
    loading,
    error,
    refetch: async () => {
      // Implement refetch logic if needed
    },
    addCustomChoices: (_choices: GlobalChoice[]) => {
      // Implement add custom choices logic if needed
    }
  };
};
