/**
 * Test setup for integration tests
 * Provides mocked Dataverse configuration and services
 */

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.DATAVERSE_URL = 'https://test.crm.dynamics.com';
process.env.TENANT_ID = 'test-tenant-id';
process.env.CLIENT_ID = 'test-client-id';
process.env.USE_MANAGED_IDENTITY = 'false'; // Disable managed identity
process.env.LOG_REQUEST_BODY = 'false';
process.env.STREAM_CHUNK_SIZE = '1024';

// Key Vault disabled - using managed identity only
process.env.KEY_VAULT_URI = '';
process.env.AUTH_MODE = '';

// Mock the Dataverse client before any imports
jest.mock('../../src/backend/dataverse-client.js', () => {
  return {
    DataverseClient: jest.fn().mockImplementation(() => ({
      getPublishers: jest.fn().mockResolvedValue([
        { id: 'pub1', uniqueName: 'testpub', friendlyName: 'Test Publisher', prefix: 'test' }
      ]),
      getSolutions: jest.fn().mockResolvedValue([
        { solutionid: 'sol1', uniquename: 'testsolution', friendlyname: 'Test Solution' }
      ]),
      getGlobalChoiceSets: jest.fn().mockResolvedValue({
        all: [
          { id: 'choice1', name: 'test_choice', displayName: 'Test Choice' }
        ],
        grouped: {
          custom: [{ id: 'choice1', name: 'test_choice', displayName: 'Test Choice' }],
          builtIn: []
        },
        summary: { total: 1, custom: 1, builtIn: 0 }
      }),
      getSolutionComponents: jest.fn().mockResolvedValue([
        { componentid: 'comp1', componenttype: 1, solutionid: 'sol1' }
      ]),
      createEntity: jest.fn().mockResolvedValue({ success: true }),
      integrateCDMEntities: jest.fn().mockResolvedValue({ success: true }),
      ensurePublisher: jest.fn().mockResolvedValue({ id: 'pub1', uniqueName: 'testpub' }),
      ensureSolution: jest.fn().mockResolvedValue({ solutionid: 'sol1', uniquename: 'testsolution' })
    }))
  };
});

// Azure Key Vault removed - using managed identity only
// No mocking needed for managed identity authentication

module.exports = {
  setupTestEnvironment: () => {
    // Mock console methods to reduce noise during tests
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
    
    return {
      restore: () => {
        console.log = originalLog;
        console.error = originalError;
        console.warn = originalWarn;
      }
    };
  }
};
