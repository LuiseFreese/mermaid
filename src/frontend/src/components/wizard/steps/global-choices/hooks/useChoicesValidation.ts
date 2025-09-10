/**
 * Hook for validating global choices step completion
 */

import { useMemo } from 'react';
import { useWizardContext } from '../../../../../context/WizardContext';
import type { UseChoicesValidationResult } from '../types';

export const useChoicesValidation = (): UseChoicesValidationResult => {
  const { wizardData } = useWizardContext();
  const { selectedGlobalChoices, uploadedGlobalChoices } = wizardData;

  const validationResult = useMemo(() => {
    const hasSelectedChoices = selectedGlobalChoices && selectedGlobalChoices.length > 0;
    const hasUploadedChoices = uploadedGlobalChoices && uploadedGlobalChoices.length > 0;
    
    // Step is valid if user has either selected choices OR uploaded choices (both optional)
    const isValid = true; // This step is always valid since global choices are optional
    
    let validationMessage: string | null = null;
    if (!hasSelectedChoices && !hasUploadedChoices) {
      validationMessage = 'Global choices are optional. You can proceed without selecting any.';
    } else if (hasSelectedChoices && hasUploadedChoices) {
      validationMessage = `Using ${selectedGlobalChoices?.length || 0} existing choices and ${uploadedGlobalChoices?.length || 0} uploaded choices.`;
    } else if (hasSelectedChoices) {
      validationMessage = `Using ${selectedGlobalChoices?.length || 0} existing global choices.`;
    } else if (hasUploadedChoices) {
      validationMessage = `Using ${uploadedGlobalChoices?.length || 0} uploaded global choices.`;
    }

    return {
      isValid,
      errors: [],
      warnings: validationMessage ? [{ 
        field: 'globalChoices', 
        message: validationMessage, 
        type: 'selection' as const 
      }] : []
    };
  }, [selectedGlobalChoices, uploadedGlobalChoices]);

  return validationResult;
};
