/**
 * Progress Step Definitions
 * Centralized definitions for all progress steps in the application
 */

import type { ProgressStep } from '../components/common';

// Deployment Progress Steps
export const DEPLOYMENT_STEPS: Record<string, Omit<ProgressStep, 'status'>> = {
  validation: {
    id: 'validation',
    label: 'Validating ERD'
  },
  publisher: {
    id: 'publisher',
    label: 'Creating Publisher'
  },
  solution: {
    id: 'solution',
    label: 'Setting up Solution'
  },
  entities: {
    id: 'entities',
    label: 'Creating Entities'
  },
  relationships: {
    id: 'relationships',
    label: 'Setting up Relationships'
  },
  globalChoices: {
    id: 'globalChoices',
    label: 'Creating Global Choices'
  },
  finalization: {
    id: 'finalization',
    label: 'Finalizing Deployment'
  }
};

// Rollback Progress Steps
export const ROLLBACK_STEPS: Record<string, Omit<ProgressStep, 'status'>> = {
  preparation: {
    id: 'preparation',
    label: 'Preparing Rollback'
  },
  validation: {
    id: 'validation',
    label: 'Validating Rollback Requirements'
  },
  relationships: {
    id: 'relationships',
    label: 'Removing Relationships'
  },
  customEntities: {
    id: 'customEntities',
    label: 'Removing Custom Entities'
  },
  cdmEntities: {
    id: 'cdmEntities',
    label: 'Removing CDM Entities from Solution'
  },
  globalChoices: {
    id: 'globalChoices',
    label: 'Removing Global Choices'
  },
  solution: {
    id: 'solution',
    label: 'Removing Solution'
  },
  publisher: {
    id: 'publisher',
    label: 'Removing Publisher'
  },
  finalization: {
    id: 'finalization',
    label: 'Finalizing Rollback'
  }
};

// Validation Progress Steps
export const VALIDATION_STEPS: Record<string, Omit<ProgressStep, 'status'>> = {
  parsing: {
    id: 'parsing',
    label: 'Parsing ERD Content'
  },
  entityValidation: {
    id: 'entityValidation',
    label: 'Validating Entities'
  },
  relationshipValidation: {
    id: 'relationshipValidation',
    label: 'Validating Relationships'
  },
  cdmDetection: {
    id: 'cdmDetection',
    label: 'Detecting CDM Entities'
  },
  finalValidation: {
    id: 'finalValidation',
    label: 'Final Validation Checks'
  }
};

// Progress Step Utilities
export class ProgressStepManager {
  private steps: ProgressStep[];
  
  constructor(stepDefinitions: Record<string, Omit<ProgressStep, 'status'>>) {
    this.steps = Object.values(stepDefinitions).map(step => ({
      ...step,
      status: 'pending' as const
    }));
  }

  /**
   * Get all steps
   */
  getSteps(): ProgressStep[] {
    return [...this.steps];
  }

  /**
   * Update step status
   */
  updateStep(stepId: string, status: ProgressStep['status'], message?: string): ProgressStep[] {
    this.steps = this.steps.map(step => 
      step.id === stepId 
        ? { ...step, status, message }
        : step
    );
    return this.getSteps();
  }

  /**
   * Set step as active
   */
  setActiveStep(stepId: string, message?: string): ProgressStep[] {
    return this.updateStep(stepId, 'active', message);
  }

  /**
   * Set step as completed
   */
  setCompletedStep(stepId: string, message?: string): ProgressStep[] {
    return this.updateStep(stepId, 'completed', message);
  }

  /**
   * Set step as error
   */
  setErrorStep(stepId: string, message?: string): ProgressStep[] {
    return this.updateStep(stepId, 'error', message);
  }

  /**
   * Get current active step
   */
  getCurrentStep(): ProgressStep | undefined {
    return this.steps.find(step => step.status === 'active');
  }

  /**
   * Get progress percentage based on completed steps
   */
  getProgressPercentage(): number {
    const completedSteps = this.steps.filter(step => step.status === 'completed').length;
    const totalSteps = this.steps.length;
    return totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  }

  /**
   * Check if all steps are completed
   */
  isComplete(): boolean {
    return this.steps.every(step => step.status === 'completed');
  }

  /**
   * Check if any step has error
   */
  hasErrors(): boolean {
    return this.steps.some(step => step.status === 'error');
  }

  /**
   * Reset all steps to pending
   */
  reset(): ProgressStep[] {
    this.steps = this.steps.map(step => ({
      ...step,
      status: 'pending' as const,
      message: undefined
    }));
    return this.getSteps();
  }
}

// Progress step manager factory functions
export const createDeploymentStepManager = () => 
  new ProgressStepManager(DEPLOYMENT_STEPS);

export const createRollbackStepManager = () => 
  new ProgressStepManager(ROLLBACK_STEPS);

export const createValidationStepManager = () => 
  new ProgressStepManager(VALIDATION_STEPS);

// Time estimation utilities
export interface TimeEstimate {
  estimatedTotalTime: number; // in seconds
  estimatedRemainingTime: number; // in seconds
  elapsedTime: number; // in seconds
}

export class TimeEstimator {
  private startTime: number;
  private stepEstimates: Record<string, number>; // step estimates in seconds
  
  constructor(stepEstimates: Record<string, number> = {}) {
    this.startTime = Date.now();
    this.stepEstimates = stepEstimates;
  }

  /**
   * Get time estimate based on current progress
   */
  getTimeEstimate(_currentStepId: string, completedSteps: string[]): TimeEstimate {
    const now = Date.now();
    const elapsedTime = Math.round((now - this.startTime) / 1000);
    
    // Calculate total estimated time
    const estimatedTotalTime = Object.values(this.stepEstimates).reduce((sum, time) => sum + time, 0);
    
    // Calculate remaining time based on completed steps
    const completedTime = completedSteps.reduce((sum, stepId) => 
      sum + (this.stepEstimates[stepId] || 0), 0);
    const estimatedRemainingTime = Math.max(0, estimatedTotalTime - completedTime);
    
    return {
      estimatedTotalTime,
      estimatedRemainingTime,
      elapsedTime
    };
  }

  /**
   * Format time in human readable format
   */
  static formatTime(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
  }
}

// Default time estimates (in seconds)
export const DEFAULT_DEPLOYMENT_ESTIMATES: Record<string, number> = {
  validation: 5,
  publisher: 10,
  solution: 15,
  globalChoices: 20,
  entities: 30,
  relationships: 25,
  finalization: 10
};

export const DEFAULT_ROLLBACK_ESTIMATES: Record<string, number> = {
  preparation: 5,
  relationships: 15,
  entities: 20,
  globalChoices: 10,
  solution: 10,
  publisher: 5,
  cleanup: 5
};

export const DEFAULT_VALIDATION_ESTIMATES: Record<string, number> = {
  parsing: 2,
  entityValidation: 3,
  relationshipValidation: 3,
  cdmDetection: 2,
  finalValidation: 2
};