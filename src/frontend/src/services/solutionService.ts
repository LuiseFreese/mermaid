import { apiClient } from '../api/apiClient';

export interface Solution {
  solutionid: string;
  uniquename: string;
  friendlyname: string;
  _publisherid_value?: string;
  publisherid?: {
    publisherid: string;
    uniquename: string;
    customizationprefix: string;
  };
}

class SolutionService {
  async getSolutions(environmentId?: string): Promise<Solution[]> {
    try {
      // Use authenticated apiClient instead of raw fetch
      const params = environmentId ? { environmentId } : {};
      console.log('🔍 SolutionService.getSolutions called with:', { environmentId, params });
      const response = await apiClient.get('/solutions', { params });
      console.log('🔍 SolutionService.getSolutions response:', response.data);
      
      if (response.data.success) {
        return response.data.solutions || [];
      } else {
        throw new Error(response.data.error || 'Failed to fetch solutions');
      }
    } catch (error) {
      console.error('Error fetching solutions:', error);
      throw error;
    }
  }
}

export const solutionService = new SolutionService();
