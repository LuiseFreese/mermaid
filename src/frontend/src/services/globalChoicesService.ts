export interface GlobalChoice {
  id: string;
  name: string;
  displayName: string;
  logicalName: string;
  isCustom: boolean;
  options?: Array<{
    value: number;
    label: string;
  }>;
}

export interface GlobalChoicesService {
  getGlobalChoices(): Promise<GlobalChoice[]>;
}

class DataverseGlobalChoicesService implements GlobalChoicesService {
  private baseUrl: string;
  
  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  async getGlobalChoices(): Promise<GlobalChoice[]> {
    try {
      const response = await fetch(`${this.baseUrl}/global-choices-list`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch global choices: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('📋 Frontend received global choices response:', data);
      
      // The backend returns: { success: true, all: [...], grouped: {...}, summary: {...} }
      const choices = data.all || [];
      
      // Map backend response to frontend interface
      return choices.map((choice: any) => ({
        id: choice.id || choice.metadataId || choice.MetadataId,
        name: choice.name || choice.logicalName || choice.LogicalName,
        displayName: choice.displayName || choice.DisplayName || choice.name || choice.LogicalName,
        logicalName: choice.logicalName || choice.LogicalName,
        isCustom: choice.isCustom || choice.IsCustom || false,
        options: choice.options || choice.Options || []
      }));
    } catch (error) {
      console.error('Error fetching global choices from Dataverse:', error);
      throw error;
    }
  }
}

class MockGlobalChoicesService implements GlobalChoicesService {
  async getGlobalChoices(): Promise<GlobalChoice[]> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const builtInChoices = Array.from({ length: 148 }, (_, i) => ({
      id: `builtin_${i + 1}`,
      name: `builtin_choice_${i + 1}`,
      displayName: `Built-in Global Choice ${i + 1}`,
      logicalName: `builtin_choice_${i + 1}`,
      isCustom: false,
      options: [
        { value: 1, label: 'Option 1' },
        { value: 2, label: 'Option 2' },
      ]
    }));

    const customChoices = Array.from({ length: 8 }, (_, i) => ({
      id: `custom_${i + 1}`,
      name: `custom_choice_${i + 1}`,
      displayName: `Custom Global Choice ${i + 1}`,
      logicalName: `custom_choice_${i + 1}`,
      isCustom: true,
      options: [
        { value: 100, label: 'Custom Option 1' },
        { value: 101, label: 'Custom Option 2' },
      ]
    }));

    return [...builtInChoices, ...customChoices];
  }
}

// Factory function to create the appropriate service
export const createGlobalChoicesService = (useMock: boolean = true): GlobalChoicesService => {
  return useMock ? new MockGlobalChoicesService() : new DataverseGlobalChoicesService();
};

// Export the default service instance
export const globalChoicesService = createGlobalChoicesService(false); // Set to false to use real API
