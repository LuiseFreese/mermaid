// Shared types for the Mermaid to Dataverse application
// These types are used by both frontend and backend

export interface FileData {
  name: string;
  content: string;
  size: number;
  lastModified: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  cdmEntities?: CDMEntity[];
  customEntities?: CustomEntity[];
  correctedERD?: string;
  entities?: any[];
  relationships?: any[];
  summary?: any;
  cdmDetection?: any;
  cdmEntitiesDetected?: any[];
  hasErrors?: boolean;
}

export interface ValidationError {
  severity: 'error';
  message: string;
  line?: number;
  column?: number;
  code?: string;
}

export interface ValidationWarning {
  id: string;
  severity: 'warning' | 'info' | 'suggestion';
  message: string;
  line?: number;
  column?: number;
  code?: string;
  suggestion?: string;
  type?: string;
  entity?: string;
  relationship?: string;
  columns?: string[];
  autoFixed?: boolean;
  autoFixable?: boolean;
  category?: string;
}

export interface CDMEntity {
  name: string;
  displayName?: string;
  description?: string;
  attributes: CDMAttribute[];
  relationships: CDMRelationship[];
}

export interface CustomEntity {
  name: string;
  displayName?: string;
  description?: string;
  attributes: CustomAttribute[];
  relationships: CustomRelationship[];
}

export interface CDMAttribute {
  name: string;
  displayName?: string;
  type: string;
  required?: boolean;
  description?: string;
  isPrimaryKey?: boolean;
}

export interface CustomAttribute {
  name: string;
  displayName?: string;
  type: string;
  required?: boolean;
  description?: string;
  isPrimaryKey?: boolean;
}

export interface CDMRelationship {
  name: string;
  type: 'one-to-many' | 'many-to-one' | 'many-to-many';
  fromEntity: string;
  toEntity: string;
  fromAttribute?: string;
  toAttribute?: string;
}

export interface CustomRelationship {
  name: string;
  type: 'one-to-many' | 'many-to-one' | 'many-to-many';
  fromEntity: string;
  toEntity: string;
  fromAttribute?: string;
  toAttribute?: string;
}

export interface SolutionConfig {
  name: string;
  displayName: string;
  description?: string;
  publisher: string;
  version: string;
  uniqueName: string;
}

export interface DeploymentOptions {
  environment: string;
  createSolution: boolean;
  importData: boolean;
  validateOnly: boolean;
}

export type WizardStep = 
  | 'upload'
  | 'cdm-choice'
  | 'validation'
  | 'configuration'
  | 'deployment'
  | 'complete';

export interface WizardState {
  currentStep: WizardStep;
  fileData: FileData | null;
  validationResults: ValidationResult | null;
  cdmChoice: 'cdm' | 'custom' | null;
  solutionConfig: Partial<SolutionConfig>;
  deploymentOptions: Partial<DeploymentOptions>;
  isLoading: boolean;
  error: string | null;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
  services: {
    [key: string]: 'up' | 'down';
  };
}
