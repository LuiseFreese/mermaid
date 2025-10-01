import axios from 'axios';
import type { 
  DeploymentHistoryResponse, 
  DeploymentDetailsResponse,
  DeploymentComparisonResponse 
} from '../types/deployment-history.types';

// Create API client with same config as other services
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
    console.log(`Deployment History API: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('Deployment History API Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    console.log(`Deployment History API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('Deployment History API Response Error:', error);
    return Promise.reject(error);
  }
);

export class DeploymentHistoryService {
  /**
   * Get deployment history for an environment
   */
  static async getDeploymentHistory(
    environmentSuffix: string = 'default', 
    limit: number = 20
  ): Promise<DeploymentHistoryResponse> {
    try {
      const response = await api.get('/deployments/history', {
        params: {
          environmentSuffix,
          limit: Math.min(limit, 100) // Enforce max limit
        }
      });

      return response.data;
    } catch (error) {
      console.error('Failed to fetch deployment history:', error);
      throw new Error('Failed to load deployment history');
    }
  }

  /**
   * Get detailed information about a specific deployment
   */
  static async getDeploymentDetails(deploymentId: string): Promise<DeploymentDetailsResponse> {
    try {
      const response = await api.get(`/deployments/${deploymentId}/details`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch deployment details for ${deploymentId}:`, error);
      throw new Error('Failed to load deployment details');
    }
  }

  /**
   * Compare two deployments
   */
  static async compareDeployments(
    fromDeploymentId: string, 
    toDeploymentId: string
  ): Promise<DeploymentComparisonResponse> {
    try {
      const response = await api.get('/deployments/compare', {
        params: {
          from: fromDeploymentId,
          to: toDeploymentId
        }
      });

      return response.data;
    } catch (error) {
      console.error(`Failed to compare deployments ${fromDeploymentId} vs ${toDeploymentId}:`, error);
      throw new Error('Failed to compare deployments');
    }
  }

  /**
   * Get recent deployments (convenience method)
   */
  static async getRecentDeployments(count: number = 5): Promise<DeploymentHistoryResponse> {
    return this.getDeploymentHistory('default', count);
  }
}

export default DeploymentHistoryService;