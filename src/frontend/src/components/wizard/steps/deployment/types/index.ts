/**
 * TypeScript definitions for Deployment Step
 */

// Main component props
export interface DeploymentStepProps {
  onNext?: () => void;
  onPrevious?: () => void;
}

// Deployment state types
export interface DeploymentState {
  isDeploying: boolean;
  deploymentProgress: string;
  progressData?: ProgressData; // Enhanced progress data structure
  deploymentResult: DeploymentResult | null;
  deploymentError: string;
  deploymentSuccess: boolean;
}

// Deployment result from API
export interface DeploymentResult {
  success: boolean;
  error?: string;
  message?: string;
  summary?: string;
  entitiesCreated?: number;
  cdmEntitiesIntegrated?: any[];
  relationshipsCreated?: number;
  globalChoicesAdded?: number;
  globalChoicesCreated?: number;
  globalChoicesExistingAdded?: number;
}

// Configuration summary props
export interface ConfigurationSummaryProps {
  className?: string;
}

// Enhanced progress data structure from backend
export interface ProgressData {
  stepId?: string;
  stepLabel?: string;
  percentage?: number;
  timeEstimate?: {
    estimatedRemainingTime?: number;
    elapsedTime?: number;
  };
  steps?: Array<{
    id: string;
    label: string;
    status: 'pending' | 'active' | 'completed' | 'error';
    description?: string;
  }>;
  operationType?: 'deployment' | 'validation' | 'rollback';
  message?: string;
}

// Deployment progress props
export interface DeploymentProgressProps {
  isDeploying: boolean;
  progress: string;
  progressData?: ProgressData | string; // Support both structured data and legacy string
  className?: string;
}

// Deployment results display props
export interface DeploymentResultsProps {
  result: DeploymentResult | null;
  error: string;
  isDeploying: boolean;
  className?: string;
}

// Deployment controls props
export interface DeploymentControlsProps {
  isDeploying: boolean;
  deploymentSuccess: boolean;
  onDeploy: () => void;
  onPrevious?: () => void;
  onBackToStart: () => void;
  className?: string;
}

// Deployment data structure
export interface DeploymentData {
  mermaidContent: string;
  solutionName: string;
  solutionDisplayName: string;
  useExistingSolution: boolean;
  selectedSolutionId?: string;
  selectedPublisher: {
    id: string;
    uniqueName: string;
    displayName: string;
    prefix: string;
  } | null;
  createNewPublisher: boolean;
  publisherName: string;
  publisherUniqueName?: string;
  publisherPrefix: string;
  cdmChoice: string;
  cdmMatches: any[];
  selectedChoices: any[];
  customChoices: any[];
  includeRelatedEntities: boolean;
  entities: any[];
  relationships: any[];
}

// Hook return types
export interface UseDeploymentStateResult {
  deploymentState: DeploymentState;
  handleDeploy: () => Promise<void>;
  resetDeployment: () => void;
}

export interface UseConfigurationSummaryResult {
  allEntities: any[];
  entities: any[];
  cdmEntities: any[];
  relationships: any[];
  selectedGlobalChoices: any[];
  uploadedChoices: any[];
  allGlobalChoices: any[];
}

export interface UseDeploymentDataResult {
  deploymentData: DeploymentData;
  isValid: boolean;
  validationErrors: string[];
}
