export interface Publisher {
  id: string;
  displayName: string;
  uniqueName: string;
  prefix: string;
}

export interface PublisherService {
  getPublishers(): Promise<Publisher[]>;
}

class DataversePublisherService implements PublisherService {
  private baseUrl: string;
  
  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  async getPublishers(): Promise<Publisher[]> {
    try {
      // TODO: Replace with actual Dataverse API endpoint
      // This should call the same endpoint that was working in the legacy version
      const response = await fetch(`${this.baseUrl}/publishers`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch publishers: ${response.status}`);
      }
      
      const data = await response.json();
      const publishers = data.publishers || [];
      
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
