import { apiClient } from '../api/apiClient';

export interface Publisher {
  id: string;
  displayName: string;
  uniqueName: string;
  prefix: string;
}

export interface PublisherService {
  getPublishers(environmentId?: string): Promise<Publisher[]>;
}

class DataversePublisherService implements PublisherService {
  async getPublishers(environmentId?: string): Promise<Publisher[]> {
    try {
      // Build query string with environmentId parameter
      const queryParams = environmentId ? `?environmentId=${encodeURIComponent(environmentId)}` : '';
      
      // Use authenticated apiClient instead of raw fetch
      const response = await apiClient.get(`/publishers${queryParams}`);
      
      const publishers = response.data.publishers || [];
      
      // Map backend response to frontend interface
      return publishers.map((pub: any) => ({
        id: pub.id,
        displayName: pub.friendlyName || pub.displayName || 'Unknown Publisher',
        uniqueName: pub.uniqueName,
        prefix: pub.prefix
      }));
    } catch (error) {
      console.error('Error fetching publishers from Dataverse:', error);
      throw error;
    }
  }
}

class MockPublisherService implements PublisherService {
  async getPublishers(): Promise<Publisher[]> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return [
      { id: 'pub1', displayName: 'Microsoft Corporation', uniqueName: 'MicrosoftCorporation', prefix: 'msft' },
      { id: 'pub2', displayName: 'Contoso Ltd', uniqueName: 'ContosoLtd', prefix: 'con' },
      { id: 'pub3', displayName: 'Fabrikam Inc', uniqueName: 'FabrikamInc', prefix: 'fab' },
      { id: 'pub4', displayName: 'Adventure Works', uniqueName: 'AdventureWorks', prefix: 'adv' },
    ];
  }
}

// Factory function to create the appropriate service
export const createPublisherService = (useMock: boolean = true): PublisherService => {
  return useMock ? new MockPublisherService() : new DataversePublisherService();
};

// Export the default service instance
export const publisherService = createPublisherService(false); // Set to false to use real API
