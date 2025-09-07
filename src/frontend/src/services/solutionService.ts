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
  private baseUrl: string;
  
  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  async getSolutions(): Promise<Solution[]> {
    try {
      const response = await fetch(`${this.baseUrl}/solutions`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch solutions: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        return data.solutions || [];
      } else {
        throw new Error(data.error || 'Failed to fetch solutions');
      }
    } catch (error) {
      console.error('Error fetching solutions:', error);
      throw error;
    }
  }
}

export const solutionService = new SolutionService();
