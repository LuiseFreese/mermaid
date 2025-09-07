import { useState, useCallback } from 'react';
import type { WizardState, WizardStep, FileData, ValidationResult } from '@shared/types';

const initialState: WizardState = {
  currentStep: 'upload',
  fileData: null,
  validationResults: null,
  cdmChoice: null,
  solutionConfig: {},
  deploymentOptions: {},
  isLoading: false,
  error: null,
};

export const useWizardState = () => {
  const [state, setState] = useState<WizardState>(initialState);

  const setCurrentStep = useCallback((step: WizardStep) => {
    setState(prev => ({ ...prev, currentStep: step }));
  }, []);

  const setFileData = useCallback((fileData: FileData | null) => {
    setState(prev => ({ ...prev, fileData }));
  }, []);

  const setValidationResults = useCallback((validationResults: ValidationResult | null) => {
    setState(prev => ({ ...prev, validationResults }));
  }, []);

  const setCdmChoice = useCallback((cdmChoice: 'cdm' | 'custom' | null) => {
    setState(prev => ({ ...prev, cdmChoice }));
  }, []);

  const setSolutionConfig = useCallback((solutionConfig: Partial<typeof initialState.solutionConfig>) => {
    setState(prev => ({ 
      ...prev, 
      solutionConfig: { ...prev.solutionConfig, ...solutionConfig } 
    }));
  }, []);

  const setDeploymentOptions = useCallback((deploymentOptions: Partial<typeof initialState.deploymentOptions>) => {
    setState(prev => ({ 
      ...prev, 
      deploymentOptions: { ...prev.deploymentOptions, ...deploymentOptions } 
    }));
  }, []);

  const setLoading = useCallback((isLoading: boolean) => {
    setState(prev => ({ ...prev, isLoading }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  const resetWizard = useCallback(() => {
    setState(initialState);
  }, []);

  const goToNextStep = useCallback(() => {
    setState(prev => {
      const stepOrder: WizardStep[] = ['upload', 'cdm-choice', 'validation', 'configuration', 'deployment', 'complete'];
      const currentIndex = stepOrder.indexOf(prev.currentStep);
      const nextIndex = Math.min(currentIndex + 1, stepOrder.length - 1);
      return { ...prev, currentStep: stepOrder[nextIndex] };
    });
  }, []);

  const goToPreviousStep = useCallback(() => {
    setState(prev => {
      const stepOrder: WizardStep[] = ['upload', 'cdm-choice', 'validation', 'configuration', 'deployment', 'complete'];
      const currentIndex = stepOrder.indexOf(prev.currentStep);
      const prevIndex = Math.max(currentIndex - 1, 0);
      return { ...prev, currentStep: stepOrder[prevIndex] };
    });
  }, []);

  return {
    state,
    actions: {
      setCurrentStep,
      setFileData,
      setValidationResults,
      setCdmChoice,
      setSolutionConfig,
      setDeploymentOptions,
      setLoading,
      setError,
      resetWizard,
      goToNextStep,
      goToPreviousStep,
    },
  };
};
