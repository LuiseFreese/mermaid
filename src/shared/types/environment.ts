/**
 * Multi-Environment Support Types
 * 
 * This module defines the types for managing multiple Dataverse environments
 * with clear identification for users during import, deploy, and rollback operations.
 */

export interface DataverseEnvironment {
  /** Unique identifier for the environment */
  id: string;
  
  /** User-friendly name for the environment (e.g., "Customer Dev", "Partner UAT", "Production") */
  name: string;
  
  /** Full Dataverse environment URL */
  url: string;
  
  /** Optional description for additional context */
  description?: string;
  
  /** Color coding for UI (helps distinguish environments visually) */
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray';
  
  /** Whether this environment is currently active/selected */
  isActive?: boolean;
  
  /** Last successful connection timestamp */
  lastConnected?: Date;
  
  /** Environment metadata */
  metadata?: {
    /** Organization unique name from Dataverse */
    organizationName?: string;
    /** Organization friendly name */
    organizationDisplayName?: string;
    /** Region/location info */
    region?: string;
  };
}

export interface EnvironmentOperation {
  /** Type of operation being performed */
  type: 'import' | 'deploy' | 'rollback' | 'validate';
  
  /** Source environment (where data is coming from) */
  sourceEnvironment: DataverseEnvironment;
  
  /** Target environment (where data is going to) - null for import operations */
  targetEnvironment?: DataverseEnvironment;
  
  /** Human-readable description of the operation */
  description: string;
}

export interface EnvironmentConfig {
  /** List of configured environments */
  environments: DataverseEnvironment[];
  
  /** Default environment for new operations */
  defaultEnvironmentId?: string;
  
  /** Configuration version for migration purposes */
  version: string;
}

export interface EnvironmentContextUI {
  /** Current operation context */
  operation: EnvironmentOperation;
  
  /** Whether to show detailed environment info in UI */
  showDetails: boolean;
  
  /** Warning level for the current operation */
  warningLevel: 'none' | 'info' | 'warning' | 'danger';
  
  /** Additional context message for the user */
  contextMessage?: string;
}

/**
 * Helper type for environment selection in dropdowns
 */
export interface EnvironmentOption {
  value: string;
  label: string;
  description: string;
  url: string;
  color?: string;
  disabled?: boolean;
}

/**
 * Environment validation result
 */
export interface EnvironmentValidation {
  isValid: boolean;
  isReachable: boolean;
  error?: string;
  metadata?: {
    organizationName: string;
    organizationDisplayName: string;
    version: string;
  };
}