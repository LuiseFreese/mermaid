import { AxiosResponse } from 'axios';
import { apiClient } from '../api/apiClient'; // Use authenticated client
import { msalInstance } from '../auth/AuthProvider'; // For getting auth token
import { loginRequest } from '../auth/authConfig'; // For token request
import type { 
  ApiResponse, 
  ValidationResult, 
  HealthCheckResponse,
  FileData,
  SolutionConfig
} from '@shared/types';

// Use the authenticated API client from apiClient.ts
// This client automatically adds Bearer tokens to all requests
const api = apiClient;

export class ApiService {
  /**
   * Validate an uploaded Mermaid ERD file
   */
  static async validateFile(fileData: FileData, entityChoice?: 'cdm' | 'custom' | null): Promise<ValidationResult> {
    try {
      const response: AxiosResponse<any> = await api.post('/validate-erd', {
        filename: fileData.name,
        mermaidContent: fileData.content,
        entityChoice: entityChoice || null,
      });

      if (response.data.success) {
        // Backend spreads the data directly in the response, not nested under 'data'
        const { success, ...validationResult } = response.data;
        return validationResult as ValidationResult;
      } else {
        throw new Error(response.data.error || response.data.message || 'Validation failed');
      }
    } catch (error: any) {
      // Handle 422 responses specially - they contain validation warnings, not errors
      if (error.response?.status === 422 && error.response?.data) {
        console.log('🔍 DEBUG: Handling 422 response with validation data:', error.response.data);
        
        // 422 means validation found warnings - treat as successful validation with issues
        const validationData = error.response.data;
        
        // Check if we have the full validation data structure (after backend fix)
        if (validationData.entities || validationData.warnings) {
          // Return the validation data as if it was a successful response
          const { success, message, errors, ...validationResult } = validationData;
          console.log('🔍 DEBUG: Extracted validation result from 422:', validationResult);
          return validationResult as ValidationResult;
        }
      }
      
      console.error('File validation error:', error);
      throw error;
    }
  }

  /**
   * Get health status of the backend services
   */
  static async getHealthStatus(): Promise<HealthCheckResponse> {
    try {
      const response: AxiosResponse<HealthCheckResponse> = await api.get('/health');
      return response.data;
    } catch (error) {
      console.error('Health check error:', error);
      throw error;
    }
  }

  /**
   * Generate solution based on validation results and configuration
   */
  static async generateSolution(data: {
    validationResults: ValidationResult;
    solutionConfig: Partial<SolutionConfig>;
    cdmChoice: 'cdm' | 'custom';
  }): Promise<unknown> {
    try {
      const response: AxiosResponse<ApiResponse> = await api.post('/generate-solution', data);
      
      if (response.data.success) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Solution generation failed');
      }
    } catch (error) {
      console.error('Solution generation error:', error);
      throw error;
    }
  }

  /**
   * Deploy solution to Dataverse with streaming progress
   */
  static async deploySolution(
    deploymentData: any,
    onProgress?: (message: string, details?: any) => void
  ): Promise<any> {
    try {
      console.log('Starting deployment request to /upload');
      
      // Get authentication token for streaming request
      let authToken = '';
      try {
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length > 0) {
          const response = await msalInstance.acquireTokenSilent({
            ...loginRequest,
            account: accounts[0],
          });
          authToken = response.idToken; // Use ID token for authentication
        }
      } catch (error) {
        console.error('Failed to acquire token for deployment:', error);
        throw new Error('Authentication failed. Please log in again.');
      }
      
      const response = await fetch('/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`, // Include authentication token
        },
        body: JSON.stringify(deploymentData),
      });

      if (!response.ok) {
        throw new Error(`Deployment failed: ${response.statusText}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let result: any = null;

      try {
        let reading = true;
        while (reading) {
          const { done, value } = await reader.read();
          if (done) {
            reading = false;
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              
              if (data.type === 'progress' && onProgress) {
                // Extract enhanced progress data
                const progressData = {
                  stepId: data.stepId,
                  stepLabel: data.stepLabel,
                  percentage: data.percentage,
                  timeEstimate: data.timeEstimate,
                  steps: data.steps,
                  operationType: data.operationType,
                  status: data.status,
                  message: data.message
                };
                
                // Create user-friendly message, prioritizing stepLabel over generic message
                const displayMessage = data.stepLabel || data.message || `${data.step}: ${data.message}`;
                
                onProgress(displayMessage, progressData);
              } else if (data.type === 'log' && onProgress) {
                onProgress(data.message, data);
              } else if (data.type === 'final') {
                result = data.data; // Extract the actual result from data.data
                if (onProgress) {
                  onProgress('Deployment completed', data.data);
                }
              }
            } catch (e) {
              // Ignore malformed JSON chunks
              console.warn('Malformed JSON chunk:', line);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      return result || { success: false, error: 'No result received' };
    } catch (error) {
      console.error('Deployment error:', error);
      throw error;
    }
  }

  /**
   * Fix an individual warning by ID
   */
  static async fixIndividualWarning(data: {
    mermaidContent: string;
    warningId: string;
    entityChoice?: string;
    options?: any;
  }): Promise<{
    success: boolean;
    fixedContent?: string;
    appliedFix?: any;
    remainingWarnings?: any[];
    error?: string;
  }> {
    try {
      const requestData = {
        ...data,
        entityChoice: data.entityChoice || (data.options as any)?.entityChoice
      };
      console.log('🔧 FRONTEND DEBUG: Sending fix request with entityChoice:', requestData.entityChoice);
      const response: AxiosResponse<any> = await api.post('/validation/fix-warning', requestData);
      return response.data;
    } catch (error) {
      console.error('Individual warning fix error:', error);
      throw error;
    }
  }

  /**
   * Upload file with progress tracking
   */
  static async uploadFile(
    file: File,
    onProgress?: (progressValue: number) => void
  ): Promise<FileData> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onProgress) {
            const progressValue = (progressEvent.loaded / progressEvent.total) * 100;
            onProgress(Math.round(progressValue));
          }
        },
      });

      if (response.data.success && response.data.data) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'File upload failed');
      }
    } catch (error) {
      console.error('File upload error:', error);
      throw error;
    }
  }

  /**
   * Get configuration data from the backend
   */
  static async getConfig(): Promise<{ powerPlatformEnvironmentId: string }> {
    try {
      const response: AxiosResponse<any> = await api.get('/config');
      
      if (response.data.success && response.data.data) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Failed to fetch configuration');
      }
    } catch (error) {
      console.error('Config fetch error:', error);
      throw error;
    }
  }
}

export default ApiService;
