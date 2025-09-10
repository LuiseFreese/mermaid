/**
 * Hook for managing configuration summary data
 */

import { useMemo } from 'react';
import { useWizardContext } from '../../../../../context/WizardContext';
import { filterEntitiesByType, combineGlobalChoices } from '../utils';
import type { UseConfigurationSummaryResult } from '../types';

export const useConfigurationSummary = (): UseConfigurationSummaryResult => {
  const { wizardData } = useWizardContext();

  const summaryData = useMemo(() => {
    // Get entities from the parsed mermaid data
    const allEntities = wizardData.parsedEntities || [];
    const { customEntities, cdmEntities } = filterEntitiesByType(allEntities);
    
    // Get relationships from the parsed mermaid data
    const relationships = wizardData.parsedRelationships || [];

    // Get selected global choices
    const selectedGlobalChoices = wizardData.selectedGlobalChoices || [];
    const uploadedChoices = wizardData.uploadedGlobalChoices || [];
    const allGlobalChoices = combineGlobalChoices(selectedGlobalChoices, uploadedChoices);

    return {
      allEntities,
      entities: customEntities, // Custom entities only for the custom entities section
      cdmEntities,
      relationships,
      selectedGlobalChoices,
      uploadedChoices,
      allGlobalChoices,
    };
  }, [wizardData]);

  return summaryData;
};
