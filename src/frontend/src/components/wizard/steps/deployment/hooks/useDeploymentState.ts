/**
 * Hook for managing deployment state and operations
 */

import { useState, useCallback } from 'react';
import { useWizardContext } from '../../../../../context/WizardContext';
import { useDeploymentContext } from '../../../../../context/DeploymentContext';
import { ApiService } from '../../../../../services/apiService';
import { transformWizardDataToDeploymentData, validateDeploymentData } from '../utils';
import type { UseDeploymentStateResult, DeploymentState } from '../types';

export const useDeploymentState = (): UseDeploymentStateResult => {
  const { wizardData } = useWizardContext();
  const { startDeployment, finishDeployment } = useDeploymentContext();

  const [deploymentState, setDeploymentState] = useState<DeploymentState>({
    isDeploying: false,
    deploymentProgress: '',
    progressData: undefined,
    deploymentResult: null,
    deploymentError: '',
    deploymentSuccess: false,
  });

  const resetDeployment = useCallback(() => {
    setDeploymentState({
      isDeploying: false,
      deploymentProgress: '',
      progressData: undefined,
      deploymentResult: null,
      deploymentError: '',
      deploymentSuccess: false,
    });
  }, []);

  const handleDeploy = useCallback(async () => {
    console.log('Deploying with data:', wizardData);
    
    // Start deployment tracking
    const deploymentId = `deployment-${Date.now()}`;
    startDeployment(deploymentId);
    
    setDeploymentState(prev => ({
      ...prev,
      isDeploying: true,
      deploymentProgress: 'Preparing deployment...',
      deploymentResult: null,
      deploymentError: '',
      deploymentSuccess: false,
    }));

    try {
      // Transform wizard data to deployment format
      const deploymentData = transformWizardDataToDeploymentData(wizardData);
      
      // Validate deployment data
      const validation = validateDeploymentData(deploymentData);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      console.log('Sending deployment request with data:', deploymentData);

      const result = await ApiService.deploySolution(
        deploymentData,
        (message, details) => {
          console.log('Deployment progress:', message, details);
          
          // Handle enhanced progress data if details contains structured information
          let progressData = undefined;
          if (details && typeof details === 'object') {
            // Check if details contains ProgressTracker data
            if (details.stepId || details.stepLabel || details.percentage !== undefined || details.timeEstimate) {
              progressData = details;
            }
          }
          
          setDeploymentState(prev => ({
            ...prev,
            deploymentProgress: message,
            progressData: progressData,
          }));
        }
      );

      console.log('Deployment result:', result);
      console.log('🔍 DEBUG: Deployment result structure:', JSON.stringify(result, null, 2));
      
      setDeploymentState(prev => ({
        ...prev,
        deploymentResult: result,
      }));
      
      if (result.success) {
        setDeploymentState(prev => ({
          ...prev,
          deploymentProgress: 'Deployment completed successfully!',
          deploymentSuccess: true,
        }));
      } else {
        setDeploymentState(prev => ({
          ...prev,
          deploymentError: result.error || 'Deployment failed',
          deploymentProgress: 'Deployment failed',
        }));
      }
    } catch (error) {
      console.error('Deployment error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setDeploymentState(prev => ({
        ...prev,
        deploymentError: errorMessage,
        deploymentProgress: 'Deployment failed',
      }));
    } finally {
      setDeploymentState(prev => ({
        ...prev,
        isDeploying: false,
      }));
      
      // Finish deployment tracking
      finishDeployment();
    }
  }, [wizardData, startDeployment, finishDeployment]);

  return {
    deploymentState,
    handleDeploy,
    resetDeployment,
  };
};
