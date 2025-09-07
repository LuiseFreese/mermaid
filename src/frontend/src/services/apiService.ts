import axios, { AxiosResponse } from 'axios';
import type { 
  ApiResponse, 
  ValidationResult, 
  HealthCheckResponse,
  FileData,
  SolutionConfig
} from '@shared/types';

// Configure axios defaults
const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Response Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export class ApiService {
  /**
   * Validate an uploaded Mermaid ERD file
   */
  static async validateFile(fileData: FileData): Promise<ValidationResult> {
    try {
      const response: AxiosResponse<ApiResponse<ValidationResult>> = await api.post('/validate', {
        filename: fileData.name,
        content: fileData.content,
      });

      if (response.data.success && response.data.data) {
        return response.data.data;
      } else {
        throw new Error(response.data.error || 'Validation failed');
      }
    } catch (error) {
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
      
      const response = await fetch('/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
                onProgress(`${data.step}: ${data.message}`, data);
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
}

export default ApiService;
