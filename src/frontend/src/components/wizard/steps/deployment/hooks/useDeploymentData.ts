/**
 * Hook for managing deployment data validation
 */

import { useMemo } from 'react';
import { useWizardContext } from '../../../../../context/WizardContext';
import { transformWizardDataToDeploymentData, validateDeploymentData } from '../utils';
import type { UseDeploymentDataResult } from '../types';

export const useDeploymentData = (): UseDeploymentDataResult => {
  const { wizardData } = useWizardContext();

  const deploymentDataInfo = useMemo(() => {
    const deploymentData = transformWizardDataToDeploymentData(wizardData);
    const validation = validateDeploymentData(deploymentData);

    return {
      deploymentData,
      isValid: validation.isValid,
      validationErrors: validation.errors,
    };
  }, [wizardData]);

  return deploymentDataInfo;
};
