/**
 * Deployment Progress Component
 * Shows enhanced deployment progress with steps, percentages, and time estimates
 */

import React, { useMemo } from 'react';
import { EnhancedProgress } from '../../../../common';
import type { DeploymentProgressProps } from '../types';
import { 
  createDeploymentStepManager, 
  TimeEstimator,
  DEFAULT_DEPLOYMENT_ESTIMATES 
} from '../../../../../utils/progressSteps';

export const DeploymentProgress: React.FC<DeploymentProgressProps> = ({ 
  isDeploying,
  progress,
  progressData,
  className
}) => {
  // Create step manager and time estimator
  const stepManager = useMemo(() => createDeploymentStepManager(), []);
  const timeEstimator = useMemo(() => new TimeEstimator(DEFAULT_DEPLOYMENT_ESTIMATES), []);

  if (!isDeploying) {
    return null;
  }

  // Parse progress data if available
  let enhancedProgressProps: any = {
    isActive: true,
    currentStep: 'Processing...',
    message: progress || 'Processing...',
    percentage: undefined,
    steps: [],
    estimatedTimeRemaining: undefined,
    timeElapsed: undefined,
    showSteps: true
  };

  // If we have structured progress data from the backend
  if (progressData && typeof progressData === 'object') {
    const { 
      stepId, 
      stepLabel, 
      percentage, 
      timeEstimate, 
      steps: backendSteps
    } = progressData;

    enhancedProgressProps = {
      isActive: true,
      currentStep: stepLabel || stepId || 'Processing...',
      message: progress || progressData.message || 'Processing...',
      percentage: percentage,
      steps: backendSteps || [],
      estimatedTimeRemaining: timeEstimate?.estimatedRemainingTime,
      timeElapsed: timeEstimate?.elapsedTime,
      showSteps: Boolean(backendSteps?.length)
    };
  } else {
    // Fallback: try to extract step info from progress message
    const progressMessage = progress || '';
    let currentStepId = 'unknown';
    let stepMessage = progressMessage;

    // Map common progress messages to step IDs
    if (progressMessage.toLowerCase().includes('validat')) {
      currentStepId = 'validation';
      stepMessage = 'Validating ERD content and structure';
    } else if (progressMessage.toLowerCase().includes('publisher')) {
      currentStepId = 'publisher';
      stepMessage = 'Setting up publisher configuration';
    } else if (progressMessage.toLowerCase().includes('solution')) {
      currentStepId = 'solution';
      stepMessage = 'Creating or configuring solution';
    } else if (progressMessage.toLowerCase().includes('global choice') || progressMessage.toLowerCase().includes('choice')) {
      currentStepId = 'globalChoices';
      stepMessage = 'Processing global choice sets';
    } else if (progressMessage.toLowerCase().includes('entit') || progressMessage.toLowerCase().includes('table')) {
      currentStepId = 'entities';
      stepMessage = 'Creating entities and tables';
    } else if (progressMessage.toLowerCase().includes('relationship')) {
      currentStepId = 'relationships';
      stepMessage = 'Setting up entity relationships';
    } else if (progressMessage.toLowerCase().includes('finaliz') || progressMessage.toLowerCase().includes('complet')) {
      currentStepId = 'finalization';
      stepMessage = 'Finalizing deployment';
    }

    // Update step manager based on current step
    const allSteps = stepManager.getSteps();
    const currentStepIndex = allSteps.findIndex(step => step.id === currentStepId);
    
    if (currentStepIndex >= 0) {
      // Mark previous steps as completed
      for (let i = 0; i < currentStepIndex; i++) {
        stepManager.setCompletedStep(allSteps[i].id);
      }
      
      // Mark current step as active
      stepManager.setActiveStep(currentStepId, stepMessage);
      
      // Calculate time estimate
      const completedStepIds = allSteps.slice(0, currentStepIndex).map(s => s.id);
      const timeEstimate = timeEstimator.getTimeEstimate(currentStepId, completedStepIds);
      
      enhancedProgressProps = {
        isActive: true,
        currentStep: stepMessage,
        message: progressMessage,
        percentage: stepManager.getProgressPercentage(),
        steps: stepManager.getSteps(),
        estimatedTimeRemaining: timeEstimate.estimatedRemainingTime > 0 ? 
          TimeEstimator.formatTime(timeEstimate.estimatedRemainingTime) : undefined,
        timeElapsed: TimeEstimator.formatTime(timeEstimate.elapsedTime),
        showSteps: true
      } as any;
    }
  }

  return (
    <EnhancedProgress
      {...enhancedProgressProps}
      className={className}
    />
  );
};
