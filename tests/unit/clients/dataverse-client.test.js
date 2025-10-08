/**
 * Unit Tests for DataverseClient
 * Tests Dataverse API interactions, connection handling, and error scenarios
 */

// Mock dependencies first, before any imports
jest.mock('../../../src/backend/utils/logger');

// Mock axios
jest.mock('axios');

// Mock Azure SDK with proper mock function
const mockGetToken = jest.fn();
jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn().mockImplementation(() => ({
    getToken: mockGetToken
  }))
}));

const DataverseClient = require('../../../src/backend/clients/dataverse-client');
const testData = require('../../fixtures/test-data');
const logger = require('../../../src/backend/utils/logger');
const axios = require('axios');

describe('DataverseClient', () => {
  let client;
  const mockConfig = {
    dataverseUrl: 'https://test.crm.dynamics.com',
    tenantId: 'test-tenant-id',
    clientId: 'test-client-id',
    useManagedIdentity: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mock implementation for getToken
    mockGetToken.mockResolvedValue({
      token: 'mock-token',
      expiresOnTimestamp: Date.now() + 3600000
    });
    
    // Setup axios mocks
    axios.get.mockResolvedValue({ status: 200, data: {} });
    axios.post.mockResolvedValue({ status: 200, data: {} });
    
    client = new DataverseClient(mockConfig);
    
    // Manually set the credential mock after instantiation
    client.credential = {
      getToken: mockGetToken
    };
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with correct configuration', () => {
      expect(client.dataverseUrl).toBe(mockConfig.dataverseUrl);
      expect(client.tenantId).toBe(mockConfig.tenantId);
      expect(client.clientId).toBe(mockConfig.clientId);
    });

    test('should throw error for missing configuration', () => {
      expect(() => new DataverseClient({})).toThrow('Dataverse configuration is required');
    });

    test('should throw error for invalid URL', () => {
      const invalidConfig = { ...mockConfig, dataverseUrl: 'invalid-url' };
      expect(() => new DataverseClient(invalidConfig)).toThrow('Invalid Dataverse URL');
    });
  });

  describe('Authentication', () => {
    test('should acquire token successfully', async () => {
      const token = await client.getAccessToken();
      expect(token).toBe('mock-token');
      expect(client.credential.getToken).toHaveBeenCalledWith('https://test.crm.dynamics.com/.default');
    });

    test('should handle authentication failure', async () => {
      mockGetToken.mockRejectedValue(new Error('Auth failed'));

      await expect(client.getAccessToken()).rejects.toThrow('Auth failed');
      expect(logger.error).toHaveBeenCalledWith('Authentication failed:', expect.any(Error));
    });

    test('should cache and reuse valid tokens', async () => {
      // First call
      const token1 = await client.getAccessToken();
      // Second call should use cached token
      const token2 = await client.getAccessToken();
      
      expect(token1).toBe(token2);
      expect(mockGetToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('Connection Testing', () => {
    test('should test connection successfully', async () => {
      axios.get.mockResolvedValue({
        status: 200,
        data: { DisplayName: 'Test Environment' }
      });

      const result = await client.testConnection();
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully connected');
      expect(axios.get).toHaveBeenCalledWith(
        `${mockConfig.dataverseUrl}/api/data/v9.2/WhoAmI`,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-token'
          })
        })
      );
    });

    test('should handle connection failure', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));

      const result = await client.testConnection();
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Connection failed');
      expect(logger.error).toHaveBeenCalled();
    });

    test('should handle HTTP error responses', async () => {
      axios.get.mockRejectedValue({
        response: {
          status: 401,
          statusText: 'Unauthorized',
          data: { error: { message: 'Invalid credentials' } }
        }
      });

      const result = await client.testConnection();
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('HTTP 401');
    });
  });

  describe('Publisher Operations', () => {
    test('should fetch publishers successfully', async () => {
      const mockPublishers = testData.apiResponses.publishers;
      axios.get.mockResolvedValue({
        status: 200,
        data: { value: mockPublishers.publishers }
      });

      const result = await client.getPublishers();
      
      expect(result.success).toBe(true);
      expect(result.publishers).toEqual(mockPublishers.publishers);
      expect(axios.get).toHaveBeenCalledWith(
        `${mockConfig.dataverseUrl}/api/data/v9.2/publishers`,
        expect.any(Object)
      );
    });

    test('should handle empty publishers response', async () => {
      axios.get.mockResolvedValue({
        status: 200,
        data: { value: [] }
      });

      const result = await client.getPublishers();
      
      expect(result.success).toBe(true);
      expect(result.publishers).toEqual([]);
    });

    test('should handle publishers fetch error', async () => {
      axios.get.mockRejectedValue(new Error('API Error'));

      const result = await client.getPublishers();
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to fetch publishers');
    });
  });

  describe('Solution Operations', () => {
    test('should fetch solutions successfully', async () => {
      const mockSolutions = testData.apiResponses.solutions;
      axios.get.mockResolvedValue({
        status: 200,
        data: { value: mockSolutions.solutions }
      });

      const result = await client.getSolutions();
      
      expect(result.success).toBe(true);
      expect(result.solutions).toEqual(mockSolutions.solutions);
    });

    test('should create solution successfully', async () => {
      const solutionData = {
        uniquename: 'TestSolution',
        friendlyname: 'Test Solution',
        publisherid: 'pub-123'
      };

      axios.post.mockResolvedValue({
        status: 201,
        data: { solutionid: 'sol-123' },
        headers: { 'odata-entityid': 'solutions(sol-123)' }
      });

      const result = await client.createSolution(solutionData);
      
      expect(result.success).toBe(true);
      expect(result.solutionId).toBe('sol-123');
      expect(axios.post).toHaveBeenCalledWith(
        `${mockConfig.dataverseUrl}/api/data/v9.2/solutions`,
        solutionData,
        expect.any(Object)
      );
    });

    test('should handle solution creation conflict', async () => {
      const conflictError = new Error('Request failed with status code 409');
      conflictError.response = {
        status: 409,
        data: { error: { message: 'Solution already exists' } }
      };
      
      // Make sure axios.post throws the error
      axios.post.mockRejectedValue(conflictError);

      const result = await client.createSolution({ uniquename: 'test_solution' });
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Solution already exists');
    });
  });

  describe('Entity Operations', () => {
    test('should create entity successfully', async () => {
      const entityData = {
        LogicalName: 'test_entity',
        DisplayName: { UserLocalizedLabel: { Label: 'Test Entity' } }
      };

      axios.post.mockResolvedValue({
        status: 201,
        data: { MetadataId: 'entity-123' }
      });

      const result = await client.createEntity(entityData);
      
      expect(result.success).toBe(true);
      expect(result.entityId).toBe('entity-123');
      expect(axios.post).toHaveBeenCalledWith(
        `${mockConfig.dataverseUrl}/api/data/v9.2/EntityDefinitions`,
        entityData,
        expect.any(Object)
      );
    });

    test('should handle entity creation validation error', async () => {
      const validationError = new Error('Request failed with status code 400');
      validationError.response = {
        status: 400,
        data: { 
          error: { 
            message: 'Validation failed',
            details: [{ message: 'Invalid logical name' }]
          }
        }
      };
      
      axios.post.mockRejectedValue(validationError);

      const result = await client.createEntity({ LogicalName: 'test_entity' });
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Validation failed');
    });

    test('should create attribute successfully', async () => {
      const attributeData = {
        LogicalName: 'test_field',
        DisplayName: { UserLocalizedLabel: { Label: 'Test Field' } },
        AttributeType: 'String'
      };

      axios.post.mockResolvedValue({
        status: 201,
        data: { MetadataId: 'attr-123' }
      });

      const result = await client.createAttribute('test_entity', attributeData);
      
      expect(result.success).toBe(true);
      expect(result.attributeId).toBe('attr-123');
      expect(axios.post).toHaveBeenCalledWith(
        `${mockConfig.dataverseUrl}/api/data/v9.2/EntityDefinitions(LogicalName='test_entity')/Attributes`,
        attributeData,
        expect.any(Object)
      );
    });
  });

  describe('Relationship Operations', () => {
    test('should create one-to-many relationship successfully', async () => {
      const relationshipData = {
        SchemaName: 'test_relationship',
        ReferencedEntity: 'account',
        ReferencingEntity: 'contact'
      };

      axios.post.mockResolvedValue({
        status: 201,
        data: { MetadataId: 'rel-123' }
      });

      const result = await client.createRelationship(relationshipData);
      
      expect(result.success).toBe(true);
      expect(result.relationshipId).toBe('rel-123');
    });

    test('should create many-to-many relationship successfully', async () => {
      const relationshipData = {
        SchemaName: 'test_manytomany',
        Entity1LogicalName: 'account',
        Entity2LogicalName: 'contact',
        RelationshipType: 'ManyToManyRelationship'
      };

      axios.post.mockResolvedValue({
        status: 201,
        data: { MetadataId: 'rel-456' }
      });

      const result = await client.createManyToManyRelationship(relationshipData);
      
      expect(result.success).toBe(true);
      expect(result.relationshipId).toBe('rel-456');
      expect(axios.post).toHaveBeenCalledWith(
        `${mockConfig.dataverseUrl}/api/data/v9.2/ManyToManyRelationships`,
        relationshipData,
        expect.any(Object)
      );
    });
  });

  describe('Global Choice Operations', () => {
    test('should fetch global choices successfully', async () => {
      const mockChoices = testData.apiResponses.globalChoices;
      axios.get.mockResolvedValue({
        status: 200,
        data: { value: mockChoices.all }
      });

      const result = await client.getGlobalChoices();
      
      expect(result.success).toBe(true);
      expect(result.all).toEqual(mockChoices.all);
      expect(result.grouped.custom).toEqual(mockChoices.grouped.custom);
      expect(result.summary.total).toBe(2);
    });

    test('should create global choice successfully', async () => {
      const choiceData = {
        LogicalName: 'test_choice',
        DisplayName: { UserLocalizedLabel: { Label: 'Test Choice' } },
        Options: [
          { Value: 1, Label: { UserLocalizedLabel: { Label: 'Option 1' } } }
        ]
      };

      axios.post.mockResolvedValue({
        status: 201,
        data: { MetadataId: 'choice-123' }
      });

      const result = await client.createGlobalChoice(choiceData);
      
      expect(result.success).toBe(true);
      expect(result.choiceId).toBe('choice-123');
    });
  });

  describe('Error Handling', () => {
    test('should handle network timeouts', async () => {
      axios.get.mockRejectedValue({ code: 'ECONNABORTED' });

      const result = await client.testConnection();
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('timeout');
    });

    test('should handle rate limiting', async () => {
      const rateLimitError = new Error('Request failed with status code 429');
      rateLimitError.response = {
        status: 429,
        headers: { 'retry-after': '60' },
        data: { error: { message: 'Too many requests' } }
      };
      
      axios.post.mockRejectedValue(rateLimitError);

      const result = await client.createEntity({ LogicalName: 'test_entity' });
      
      expect(result.success).toBe(false);
      expect(result.message.toLowerCase()).toContain('rate limit');
    });

    test('should handle service unavailable', async () => {
      // Mock axios.get to reject with 503 error
      const error503 = new Error('Service unavailable');
      error503.response = {
        status: 503,
        data: { error: { message: 'Service temporarily unavailable' } },
        headers: {}
      };
      axios.get.mockRejectedValue(error503);

      const result = await client.getPublishers();
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Service temporarily unavailable');
    }, 35000); // 35 second timeout to allow for retries
  });

  describe('Request Configuration', () => {
    test('should include proper headers in requests', async () => {
      axios.get.mockResolvedValue({ status: 200, data: { value: [] } });

      await client.getPublishers();
      
      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-token',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0'
          })
        })
      );
    });

    test('should handle request timeout configuration', () => {
      const configWithTimeout = { ...mockConfig, timeout: 5000 };
      const clientWithTimeout = new DataverseClient(configWithTimeout);
      
      expect(clientWithTimeout.timeout).toBe(5000);
    });
  });

  describe('Utility Methods', () => {
    test('should build API URLs correctly', () => {
      const url = client.buildApiUrl('publishers');
      expect(url).toBe(`${mockConfig.dataverseUrl}/api/data/v9.2/publishers`);
    });

    test('should extract entity ID from OData response', () => {
      const testGuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      const odataId = `solutions(${testGuid})`;
      const entityId = client.extractEntityId(odataId);
      expect(entityId).toBe(testGuid);
    });

    test('should validate GUID format', () => {
      const testGuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      expect(client.isValidGuid(testGuid)).toBe(true);
      expect(client.isValidGuid('invalid-guid')).toBe(false);
      expect(client.isValidGuid('')).toBe(false);
    });
  });
});
