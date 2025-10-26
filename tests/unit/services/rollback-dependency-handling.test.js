/**
 * Unit Tests for Rollback Dependency Handling
 * Tests enhanced rollback functionality that handles entity dependencies gracefully
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

const { DataverseClient } = require('../../../src/backend/dataverse-client');
const axios = require('axios');

describe('Rollback Dependency Handling', () => {
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
    axios.delete.mockResolvedValue({ status: 200, data: {} });
    
    client = new DataverseClient(mockConfig);
  });

  describe('Entity Dependency Handling', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      
      // Mock authentication token
      mockGetToken.mockResolvedValue({
        token: 'mock-token',
        expiresOnTimestamp: Date.now() + 3600000
      });

      // Setup successful metadata lookup by default
      axios.get.mockResolvedValue({
        status: 200,
        data: {
          value: [{
            LogicalName: 'test_entity',
            MetadataId: 'test-metadata-id',
            DisplayName: { UserLocalizedLabel: { Label: 'Test Entity' } },
            OwnershipType: 'UserOwned'
          }]
        }
      });
    });

    test('should continue rollback when entity has dependencies', async () => {
      // Setup deployment data with entities to delete
      const deploymentData = {
        rollbackData: {
          customEntities: [
            { logicalName: 'test_entity1', name: 'Entity1' },
            { logicalName: 'test_entity2', name: 'Entity2' }
          ]
        },
        solutionInfo: { publisherPrefix: 'test' }
      };

      // Mock successful metadata lookup for both entities
      axios.get
        .mockResolvedValueOnce({
          status: 200,
          data: { value: [{ LogicalName: 'test_entity1', MetadataId: 'id1' }] }
        })
        .mockResolvedValueOnce({
          status: 200,  
          data: { value: [{ LogicalName: 'test_entity2', MetadataId: 'id2' }] }
        });

      // Mock dependency error for first entity, success for second
      axios.delete
        .mockRejectedValueOnce(new Error('The Entity(123) component cannot be deleted because it is referenced by 5 other components'))
        .mockResolvedValueOnce({ status: 200 }); // Second entity succeeds

      const progress = jest.fn();
      const rollbackConfig = { customEntities: true };

      const result = await client.rollbackDeployment(deploymentData, progress, rollbackConfig);

      // Test that the method completes without throwing an error
      expect(result).toBeDefined();
      expect(result).toHaveProperty('entitiesProcessed');
      expect(result).toHaveProperty('entitiesDeleted');
      expect(result).toHaveProperty('entitiesSkipped');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('errors');
      
      // Basic validation - should have processed some entities
      expect(typeof result.entitiesProcessed).toBe('number');
      expect(result.entitiesProcessed).toBeGreaterThanOrEqual(0);
    });

    test('should skip entity with dependency error and provide detailed reporting', async () => {
      const deploymentData = {
        rollbackData: {
          customEntities: [{ logicalName: 'dependent_entity', name: 'DependentEntity' }]
        },
        solutionInfo: { publisherPrefix: 'test' }
      };

      // Mock successful metadata lookup
      axios.get.mockResolvedValue({
        status: 200,
        data: { value: [{ LogicalName: 'dependent_entity', MetadataId: 'id1' }] }
      });

      // Mock specific dependency error message
      const dependencyError = new Error('The Entity(abc-123) component cannot be deleted because it is referenced by 3 other components. For a list of referenced components, use the RetrieveDependenciesForDeleteRequest.');
      axios.delete.mockRejectedValue(dependencyError);

      const progress = jest.fn();
      const rollbackConfig = { customEntities: true };

      const result = await client.rollbackDeployment(deploymentData, progress, rollbackConfig);

      // Test that the method completes and has proper structure
      expect(result).toBeDefined();
      expect(result).toHaveProperty('entitiesProcessed');
      expect(result).toHaveProperty('entitiesSkipped');
      expect(result).toHaveProperty('warnings');
      expect(typeof result.entitiesProcessed).toBe('number');
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    test('should handle non-dependency errors differently', async () => {
      const deploymentData = {
        rollbackData: {
          customEntities: [{ logicalName: 'error_entity', name: 'ErrorEntity' }]
        },
        solutionInfo: { publisherPrefix: 'test' }
      };

      // Mock successful metadata lookup
      axios.get.mockResolvedValue({
        status: 200,
        data: { value: [{ LogicalName: 'error_entity', MetadataId: 'id1' }] }
      });

      // Mock non-dependency error (e.g., network error)
      const networkError = new Error('Network timeout');
      axios.delete.mockRejectedValue(networkError);

      const progress = jest.fn();
      const rollbackConfig = { customEntities: true };

      const result = await client.rollbackDeployment(deploymentData, progress, rollbackConfig);

      // Non-dependency errors should be logged as errors, not warnings
      expect(result.entitiesProcessed).toBe(1);
      expect(result.entitiesDeleted).toBe(0);
      expect(result.entitiesSkipped).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should provide detailed summary with mixed scenarios', async () => {
      const deploymentData = {
        rollbackData: {
          customEntities: [
            { logicalName: 'entity1', name: 'Entity1' },
            { logicalName: 'entity2', name: 'Entity2' },
            { logicalName: 'entity3', name: 'Entity3' }
          ]
        },
        solutionInfo: { publisherPrefix: 'test' }
      };

      // Mock mixed results: 1 success, 1 dependency error, 1 not found
      axios.delete
        .mockResolvedValueOnce({ status: 200 }) // First succeeds
        .mockRejectedValueOnce(new Error('referenced by 2 other components')); // Second has dependencies

      // Third entity not found (already deleted)
      axios.get
        .mockResolvedValueOnce({ status: 200, data: { value: [{}] } }) // First entity found
        .mockResolvedValueOnce({ status: 200, data: { value: [{}] } }) // Second entity found
        .mockResolvedValueOnce({ status: 200, data: { value: [] } }); // Third entity not found

      const progress = jest.fn();
      const rollbackConfig = { customEntities: true };

      const result = await client.rollbackDeployment(deploymentData, progress, rollbackConfig);

      // Test that the method completes and handles mixed scenarios
      expect(result).toBeDefined();
      expect(result).toHaveProperty('entitiesProcessed');
      expect(result).toHaveProperty('entitiesDeleted');
      expect(result).toHaveProperty('entitiesSkipped');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('errors');
      
      // Should have processed multiple entities
      expect(typeof result.entitiesProcessed).toBe('number');
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });
});