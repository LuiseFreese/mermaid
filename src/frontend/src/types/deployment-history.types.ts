// Deployment History Types
export interface DeploymentSummary {
  deploymentId: string;
  timestamp: string;
  environmentSuffix: string;
  status: 'pending' | 'success' | 'failed' | 'rolled-back' | 'modified';
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
    operationType?: 'deploy' | 'rollback';
  };
  rollbackData?: {
    relationships: any[];
    customEntities: Array<{
      name: string;
      logicalName: string;
      displayName?: string;
    }>;
    globalChoicesCreated: string[];
  };
  rollbackInfo?: {
    rollbackId: string;
    rollbackTimestamp: string;
    rollbackResults?: {
      relationshipsDeleted?: number;
      entitiesDeleted?: number;
      globalChoicesDeleted?: number;
      solutionDeleted?: boolean;
      publisherDeleted?: boolean;
      errors?: string[];
      warnings?: string[];
    };
    rollbacks?: Array<{
      rollbackId: string;
      rollbackTimestamp: string;
      rollbackOptions?: {
        relationships?: boolean;
        customEntities?: boolean;
        cdmEntities?: boolean;
        customGlobalChoices?: boolean;
        solution?: boolean;
        publisher?: boolean;
      };
      rollbackResults?: {
        relationshipsDeleted?: number;
        entitiesDeleted?: number;
        globalChoicesDeleted?: number;
        solutionDeleted?: boolean;
        publisherDeleted?: boolean;
        errors?: string[];
        warnings?: string[];
      };
    }>;
    lastRollback?: {
      rollbackId: string;
      rollbackTimestamp: string;
      rollbackOptions?: {
        relationships?: boolean;
        customEntities?: boolean;
        cdmEntities?: boolean;
        customGlobalChoices?: boolean;
        solution?: boolean;
        publisher?: boolean;
      };
      rollbackResults?: {
        relationshipsDeleted?: number;
        entitiesDeleted?: number;
        globalChoicesDeleted?: number;
        solutionDeleted?: boolean;
        publisherDeleted?: boolean;
        errors?: string[];
        warnings?: string[];
      };
    };
  };
  deploymentLogs?: string[];
  metadata?: {
    deploymentMethod: 'web-ui' | 'api' | 'rollback';
    previousDeploymentId?: string;
  };
}

export interface DeploymentDetails {
  deploymentId: string;
  timestamp: string;
  environmentSuffix: string;
  status: 'pending' | 'success' | 'failed' | 'rolled-back' | 'modified';
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