// Deployment History Types
export interface DeploymentSummary {
  deploymentId: string;
  timestamp: string;
  environmentSuffix: string;
  status: 'pending' | 'success' | 'failed';
  completedAt?: string;
  duration?: number;
  solutionInfo?: {
    solutionName: string;
    publisherName: string;
    version?: string;
    solutionId?: string;
  };
  summary?: {
    totalEntities: number;
    entitiesAdded: string[];
    entitiesModified: string[];
    entitiesRemoved: string[];
    totalAttributes: number;
    cdmEntities: number;
    customEntities: number;
    cdmEntityNames: string[];
    customEntityNames: string[];
    cdmEntitiesAdded?: string[];
    globalChoicesAdded?: string[];
    globalChoicesCreated?: string[];
  };
  deploymentLogs?: string[];
  metadata?: {
    deploymentMethod: 'web-ui' | 'api';
    previousDeploymentId?: string;
  };
}

export interface DeploymentDetails {
  deploymentId: string;
  timestamp: string;
  environmentSuffix: string;
  status: 'pending' | 'success' | 'failed';
  completedAt?: string;
  erdContent: string;
  summary: {
    totalEntities: number;
    entitiesAdded: string[];
    entitiesModified: string[];
    entitiesRemoved: string[];
    totalAttributes: number;
    cdmEntities: number;
    customEntities: number;
    cdmEntityNames: string[];
    customEntityNames: string[];
    cdmEntitiesAdded?: string[];
    globalChoicesAdded?: string[];
    globalChoicesCreated?: string[];
  };
  deploymentLogs: string[];
  duration?: number;
  solutionInfo: {
    solutionName: string;
    publisherName: string;
    publisherPrefix?: string;
    solutionId?: string;
  };
  metadata: {
    deploymentMethod: 'web-ui' | 'api';
    previousDeploymentId?: string;
  };
  result?: {
    success: boolean;
    message?: string;
    entitiesCreated?: number;
    relationshipsCreated?: number;
  };
}

export interface DeploymentHistoryResponse {
  success: boolean;
  environmentSuffix: string;
  count: number;
  deployments: DeploymentSummary[];
}

export interface DeploymentDetailsResponse {
  success: boolean;
  deployment?: DeploymentDetails;
  message?: string;
}

export interface DeploymentComparison {
  from: DeploymentDetails;
  to: DeploymentDetails;
  differences: {
    entities: {
      added: string[];
      removed: string[];
      modified: string[];
    };
    relationships: {
      added: string[];
      removed: string[];
      modified: string[];
    };
    summary: string;
  };
}

export interface DeploymentComparisonResponse {
  success: boolean;
  comparison?: DeploymentComparison;
  message?: string;
}