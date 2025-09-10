/**
 * Hook for managing global choice selection state and operations
 */

import { useCallback } from 'react';
import { useWizardContext } from '../../../../../context/WizardContext';
import type { UseChoiceSelectionResult, GlobalChoice } from '../types';

export const useChoiceSelection = (availableChoices: GlobalChoice[] = []): UseChoiceSelectionResult => {
  const { wizardData, updateWizardData } = useWizardContext();
  const { selectedGlobalChoices } = wizardData;

  const handleChoiceSelect = useCallback((choiceId: string, checked: boolean) => {
    const currentSelected = selectedGlobalChoices || [];
    
    if (checked) {
      // Find the choice object from available choices and add it to the array
      const choice = availableChoices.find(c => c.id === choiceId);
      if (choice && !currentSelected.find(c => c.id === choiceId)) {
        updateWizardData({ selectedGlobalChoices: [...currentSelected, choice] });
      }
    } else {
      // Remove the choice from the array
      const newSelected = currentSelected.filter(c => c.id !== choiceId);
      updateWizardData({ selectedGlobalChoices: newSelected });
    }
  }, [selectedGlobalChoices, updateWizardData, availableChoices]);

  return {
    selectedChoices: (selectedGlobalChoices || []).map(choice => ({
      ...choice,
      options: choice.options || []
    })),
    selectedChoiceIds: (selectedGlobalChoices || []).map(choice => choice.id),
    selectionCount: selectedGlobalChoices?.length || 0,
    isAllSelected: false, // TODO: Implement logic
    
    handleChoiceSelect,
    selectChoice: (_choice) => {
      // Implementation
    },
    unselectChoice: (_choice) => {
      // Implementation  
    },
    toggleChoice: (_choice) => {
      // Implementation
    },
    selectAll: () => {
      updateWizardData({ selectedGlobalChoices: availableChoices });
    },
    unselectAll: () => {
      updateWizardData({ selectedGlobalChoices: [] });
    },
    isValid: true, // TODO: Add validation logic
    errors: []
  };
};
