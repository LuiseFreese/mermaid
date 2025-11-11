/**
 * Tests for DataverseClient - Modular Architecture
 * Tests the client's core functionality without expecting high-level business methods
 */

const { DataverseClient } = require('../../../src/backend/dataverse/services/dataverse-client');

describe('DataverseClient (Modular Architecture)', () => {
  let client;

  beforeEach(() => {
    // Create client with test configuration
    client = new DataverseClient({
      dataverseUrl: 'https://test.api.crm.dynamics.com',
      clientId: 'test-client-id',
      clientSecret: 'test-secret',
      tenantId: 'test-tenant-id',
      verbose: false
    });
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with authentication service', () => {
      expect(client).toBeInstanceOf(DataverseClient);
      expect(client.baseUrl).toBe('https://test.api.crm.dynamics.com');
      expect(client.clientId).toBe('test-client-id');
      expect(client.tenantId).toBe('test-tenant-id');
    });

    test('should initialize without throwing errors for valid config', () => {
      expect(() => {
        new DataverseClient({
          dataverseUrl: 'https://test.api.crm.dynamics.com',
          clientId: 'test-client',
          clientSecret: 'test-secret',
          tenantId: 'test-tenant'
        });
      }).not.toThrow();
    });

    test('should handle empty configuration gracefully', () => {
      expect(() => {
        new DataverseClient();
      }).not.toThrow();
    });
  });

  describe('Authentication Integration', () => {
    test('should inherit authentication capabilities from DataverseAuthenticationService', () => {
      // Check that authentication methods are available
      expect(typeof client.ensureToken).toBe('function');
      expect(client.accessToken).toBe(null); // Initially null
      expect(client.tokenExpiry).toBe(null); // Initially null
    });

    test('should handle token acquisition through authentication service', async () => {
      // Mock the token acquisition to prevent actual API calls
      jest.spyOn(client, 'ensureToken').mockResolvedValue('mock-token');
      
      await expect(client.ensureToken()).resolves.toBe('mock-token');
      expect(client.ensureToken).toHaveBeenCalled();
    });
  });

  describe('HTTP Request Methods', () => {
    test('should provide makeRequest method for authenticated requests', () => {
      expect(typeof client.makeRequest).toBe('function');
    });

    test('should provide convenience HTTP methods', () => {
      expect(typeof client.get).toBe('function');
      expect(typeof client.post).toBe('function');
      expect(typeof client.put).toBe('function');
      expect(typeof client.delete).toBe('function');
      expect(typeof client.patch).toBe('function');
    });

    test('should make authenticated GET requests', async () => {
      // Mock the authentication and HTTP client
      jest.spyOn(client, 'ensureToken').mockImplementation(async () => {
        client.accessToken = 'mock-token'; // Set the token properly
        return 'mock-token';
      });
      jest.spyOn(client.httpClient, 'request').mockResolvedValue({
        status: 200,
        data: { value: 'test-data' }
      });

      const result = await client.get('/test-endpoint');
      
      expect(client.ensureToken).toHaveBeenCalled();
      expect(client.httpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: 'https://test.api.crm.dynamics.com/api/data/v9.2/test-endpoint',
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-token'
          })
        })
      );
      expect(result).toEqual({ value: 'test-data' });
    });

    test('should make authenticated POST requests', async () => {
      // Mock the authentication and HTTP client
      jest.spyOn(client, 'ensureToken').mockImplementation(async () => {
        client.accessToken = 'mock-token'; // Set the token properly
        return 'mock-token';
      });
      jest.spyOn(client.httpClient, 'request').mockResolvedValue({
        status: 201,
        data: { id: 'new-record-id' }
      });

      const testData = { name: 'Test Entity' };
      const result = await client.post('/entities', testData);
      
      expect(client.ensureToken).toHaveBeenCalled();
      expect(client.httpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'https://test.api.crm.dynamics.com/api/data/v9.2/entities',
          data: testData,
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-token'
          })
        })
      );
      expect(result).toEqual({ id: 'new-record-id' });
    });
  });

  describe('Connection Testing', () => {
    test('should provide testConnection method', () => {
      expect(typeof client.testConnection).toBe('function');
    });

    test('should test connection successfully', async () => {
      // Mock successful connection test
      jest.spyOn(client, 'ensureToken').mockResolvedValue('mock-token');
      jest.spyOn(client, 'whoAmI').mockResolvedValue({ 
        UserId: 'test-user-id',
        BusinessUnitId: 'test-business-unit',
        OrganizationId: 'test-org-id'
      });

      const result = await client.testConnection();
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Connected to Dataverse');
      expect(client.ensureToken).toHaveBeenCalled();
      expect(client.whoAmI).toHaveBeenCalled();
    });

    test('should handle connection failure', async () => {
      // Mock connection failure
      jest.spyOn(client, 'ensureToken').mockResolvedValue('mock-token');
      jest.spyOn(client, 'whoAmI').mockRejectedValue(new Error('Connection failed'));

      const result = await client.testConnection();
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Connection failed');
    });
  });

  describe('Service Architecture Integration', () => {
    test('should serve as base for specialized services', () => {
      // Verify that DataverseClient can be extended by other services
      expect(client.makeRequest).toBeDefined();
      expect(client.ensureToken).toBeDefined();
      expect(client.httpClient).toBeDefined();
    });

    test('should provide facade pattern with service delegation', () => {
      // Verify that specialized services are initialized
      expect(client.publisherService).toBeDefined();
      expect(client.solutionService).toBeDefined();
      expect(client.entityService).toBeDefined();
      expect(client.relationshipService).toBeDefined();
      expect(client.globalChoicesService).toBeDefined();
    });

    test('should maintain modular architecture through delegation', () => {
      // Verify that high-level business methods ARE present as delegation methods
      // These delegate to specialized services
      expect(typeof client.getPublishers).toBe('function');
      expect(typeof client.getSolutions).toBe('function');
      expect(typeof client.getGlobalChoiceSets).toBe('function');
      
      // But internal service methods should not be exposed directly
      expect(client.createEntityMetadata).toBeUndefined();
      expect(client.createRelationshipMetadata).toBeUndefined();
    });

    test('should delegate methods to appropriate services', async () => {
      // Mock the service methods to verify delegation
      jest.spyOn(client.publisherService, 'getPublishers').mockResolvedValue([]);
      jest.spyOn(client.solutionService, 'getSolutions').mockResolvedValue([]);
      
      // Call delegated methods
      await client.getPublishers();
      await client.getSolutions();
      
      // Verify that service methods were called
      expect(client.publisherService.getPublishers).toHaveBeenCalled();
      expect(client.solutionService.getSolutions).toHaveBeenCalled();
    });

    test('should pass parent client to services for makeRequest access', () => {
      // Verify that services have access to makeRequest method (bound from parent)
      expect(typeof client.publisherService.makeRequest).toBe('function');
      expect(typeof client.solutionService.makeRequest).toBe('function');
      expect(typeof client.entityService.makeRequest).toBe('function');
      expect(typeof client.relationshipService.makeRequest).toBe('function');
      expect(typeof client.globalChoicesService.makeRequest).toBe('function');
      
      // Verify that the bound methods are properly configured
      expect(client.publisherService.makeRequest.name).toBe('bound makeRequest');
      expect(client.solutionService.makeRequest.name).toBe('bound makeRequest');
    });
  });

  describe('Error Handling', () => {
    test('should handle HTTP errors gracefully', async () => {
      // Mock authentication
      jest.spyOn(client, 'ensureToken').mockResolvedValue('mock-token');
      
      // Mock HTTP error response
      jest.spyOn(client.httpClient, 'request').mockResolvedValue({
        status: 500,
        statusText: 'Internal Server Error',
        data: null
      });
      
      await expect(client.get('/test-endpoint')).rejects.toThrow('HTTP 500');
    });

    test('should handle authentication errors', async () => {
      // Mock authentication failure
      jest.spyOn(client, 'ensureToken').mockRejectedValue(new Error('Authentication failed'));

      await expect(client.get('/test-endpoint')).rejects.toThrow('Authentication failed');
    });
  });

  describe('Logging and Debugging', () => {
    test('should provide logging methods', () => {
      expect(typeof client._log).toBe('function');
      expect(typeof client.sleep).toBe('function');
    });

    test('should log operations for debugging', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      
      // Create verbose client to test logging
      const verboseClient = new DataverseClient({
        dataverseUrl: 'https://test.api.crm.dynamics.com',
        verbose: true
      });
      
      verboseClient._log('Test message');
      
      expect(consoleSpy).toHaveBeenCalledWith('Test message');
      
      consoleSpy.mockRestore();
    });
  });

  describe('Legacy Compatibility', () => {
    test('should provide legacy method aliases', () => {
      expect(typeof client._req).toBe('function');
      expect(typeof client._get).toBe('function');
      expect(typeof client._post).toBe('function');
      expect(typeof client._delete).toBe('function');
    });

    test('should route legacy methods to new implementation', async () => {
      jest.spyOn(client, 'makeRequest').mockResolvedValue({ data: 'test' });
      
      await client._req('GET', '/test');
      expect(client.makeRequest).toHaveBeenCalledWith('GET', '/test', undefined, {});
    });
  });
});