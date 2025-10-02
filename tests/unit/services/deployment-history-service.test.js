/**
 * Unit tests for DeploymentHistoryService
 * Tests deployment history management, storage, and retrieval
 */

const { DeploymentHistoryService } = require('../../../src/backend/services/deployment-history-service');
const fs = require('fs').promises;
const path = require('path');

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn()
  }
}));

// Test Fixtures
const FIXTURES = {
  validDeploymentData: {
    deploymentId: 'deploy_12345_test',
    environmentSuffix: 'dev',
    erdContent: 'Customer { string name PK }',
    status: 'success',
    solutionName: 'TestSolution',
    publisherName: 'TestPublisher',
    version: '1.0.0',
    duration: 45000,
    logs: ['Log entry 1', 'Log entry 2'],
    summary: {
      totalEntities: 1,
      customEntities: 1,
      cdmEntities: 0
    },
    rollbackData: {
      customEntities: [{ name: 'Customer' }],
      relationships: []
    }
  },

  minimalDeploymentData: {
    erdContent: 'Product { string name PK }'
  },

  deploymentRecord: {
    deploymentId: 'deploy_12345_test',
    timestamp: '2025-10-02T10:00:00Z',
    environmentSuffix: 'dev',
    status: 'success',
    erdContent: 'Customer { string name PK }',
    deploymentLogs: ['Log entry 1', 'Log entry 2'],
    summary: {
      totalEntities: 1,
      customEntities: 1
    },
    solutionInfo: {
      solutionName: 'TestSolution',
      publisherName: 'TestPublisher'
    }
  },

  deploymentIndex: {
    deployments: [
      {
        deploymentId: 'deploy_12345_test',
        timestamp: '2025-10-02T10:00:00Z',
        status: 'success',
        summary: { totalEntities: 1 }
      },
      {
        deploymentId: 'deploy_67890_test',
        timestamp: '2025-10-01T10:00:00Z',
        status: 'success',
        summary: { totalEntities: 2 }
      }
    ]
  },

  erdContent: {
    simple: 'Customer { string name PK }',
    complex: `
      Customer {
        string name PK
        string email
        int age
      }
      Order {
        string orderId PK
        decimal total
      }
    `
  }
};

// Helper functions
const createMockLogger = () => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
});

const createDeploymentHistoryService = (customDeps = {}) => {
  const mockLogger = createMockLogger();

  const dependencies = {
    logger: mockLogger,
    ...customDeps
  };

  const service = new DeploymentHistoryService(dependencies);

  return {
    service,
    mockLogger
  };
};

describe('DeploymentHistoryService', () => {
  let service, mockLogger;
  const storageDir = path.join(process.cwd(), 'data', 'deployments');

  beforeEach(() => {
    ({ service, mockLogger } = createDeploymentHistoryService());
    
    // Clear all mocks
    jest.clearAllMocks();
    
    // Suppress console logs in tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with correct storage directory', () => {
      expect(service.storageDir).toBe(storageDir);
    });

    test('should set maxHistoryEntries to 50', () => {
      expect(service.maxHistoryEntries).toBe(50);
    });

    // Note: Storage directory creation happens asynchronously in constructor
    // and doesn't need explicit testing as it's an implementation detail
  });

  describe('ensureStorageDirectory', () => {
    test('should create storage directory if it does not exist', async () => {
      fs.mkdir.mockResolvedValue(undefined);

      await service.ensureStorageDirectory();

      expect(fs.mkdir).toHaveBeenCalledWith(storageDir, { recursive: true });
    });

    test('should handle errors gracefully', async () => {
      const error = new Error('Permission denied');
      fs.mkdir.mockRejectedValue(error);
      const consoleErrorSpy = jest.spyOn(console, 'error');

      await service.ensureStorageDirectory();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to create deployment storage directory:',
        error
      );
    });
  });

  describe('generateDeploymentId', () => {
    test('should generate unique deployment ID with correct format', () => {
      const id1 = service.generateDeploymentId();
      const id2 = service.generateDeploymentId();

      expect(id1).toMatch(/^deploy_\d+_[a-f0-9]+$/);
      expect(id2).toMatch(/^deploy_\d+_[a-f0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('recordDeployment', () => {
    beforeEach(() => {
      fs.writeFile.mockResolvedValue(undefined);
      fs.readFile.mockRejectedValue({ code: 'ENOENT' }); // Index doesn't exist yet
    });

    test('should record deployment with provided data', async () => {
      const deploymentId = await service.recordDeployment(FIXTURES.validDeploymentData);

      expect(deploymentId).toBe('deploy_12345_test');
      expect(fs.writeFile).toHaveBeenCalled();
    });

    test('should generate deployment ID if not provided', async () => {
      const deploymentId = await service.recordDeployment(FIXTURES.minimalDeploymentData);

      expect(deploymentId).toMatch(/^deploy_\d+_[a-f0-9]+$/);
    });

    test('should create deployment record with correct structure', async () => {
      await service.recordDeployment(FIXTURES.validDeploymentData);

      const writeCall = fs.writeFile.mock.calls.find(call => 
        call[0].includes('deploy_12345_test.json')
      );
      const recordData = JSON.parse(writeCall[1]);

      expect(recordData).toMatchObject({
        deploymentId: 'deploy_12345_test',
        environmentSuffix: 'dev',
        status: 'success',
        erdContent: FIXTURES.validDeploymentData.erdContent,
        solutionInfo: expect.objectContaining({
          solutionName: 'TestSolution',
          publisherName: 'TestPublisher'
        })
      });
    });

    test('should include rollback data in record', async () => {
      await service.recordDeployment(FIXTURES.validDeploymentData);

      const writeCall = fs.writeFile.mock.calls.find(call => 
        call[0].includes('deploy_12345_test.json')
      );
      const recordData = JSON.parse(writeCall[1]);

      expect(recordData.rollbackData).toEqual(FIXTURES.validDeploymentData.rollbackData);
    });

    test('should set default environment suffix to "default"', async () => {
      const data = { ...FIXTURES.minimalDeploymentData };
      delete data.environmentSuffix;

      await service.recordDeployment(data);

      const writeCall = fs.writeFile.mock.calls.find(call => 
        call[0].includes('deploy_')
      );
      const recordData = JSON.parse(writeCall[1]);

      expect(recordData.environmentSuffix).toBe('default');
    });

    test('should update deployment index', async () => {
      await service.recordDeployment(FIXTURES.validDeploymentData);

      const indexWriteCall = fs.writeFile.mock.calls.find(call =>
        call[0].includes('_index.json')
      );

      expect(indexWriteCall).toBeDefined();
    });

    test('should handle deployment logs correctly', async () => {
      await service.recordDeployment(FIXTURES.validDeploymentData);

      const writeCall = fs.writeFile.mock.calls.find(call =>
        call[0].includes('deploy_12345_test.json')
      );
      const recordData = JSON.parse(writeCall[1]);

      expect(recordData.deploymentLogs).toEqual(FIXTURES.validDeploymentData.logs);
    });
  });

  describe('updateDeployment', () => {
    beforeEach(() => {
      fs.readFile.mockResolvedValue(JSON.stringify(FIXTURES.deploymentRecord));
      fs.writeFile.mockResolvedValue(undefined);
    });

    test('should update deployment status', async () => {
      const updated = await service.updateDeployment('deploy_12345_test', {
        status: 'failed'
      });

      expect(updated.status).toBe('failed');
      expect(fs.writeFile).toHaveBeenCalled();
    });

    test('should update deployment duration', async () => {
      const updated = await service.updateDeployment('deploy_12345_test', {
        duration: 60000
      });

      expect(updated.duration).toBe(60000);
    });

    test('should append logs to existing logs', async () => {
      const updated = await service.updateDeployment('deploy_12345_test', {
        logs: ['New log entry']
      });

      expect(updated.deploymentLogs).toContain('New log entry');
    });

    test('should add error information', async () => {
      const updated = await service.updateDeployment('deploy_12345_test', {
        error: 'Deployment failed due to validation error'
      });

      expect(updated.error).toBe('Deployment failed due to validation error');
    });

    test('should update summary', async () => {
      const updated = await service.updateDeployment('deploy_12345_test', {
        summary: { totalEntities: 5 }
      });

      expect(updated.summary.totalEntities).toBe(5);
    });

    test('should add rollbackInfo', async () => {
      const rollbackInfo = {
        rollbackId: 'rollback_123',
        rollbackTimestamp: '2025-10-02T12:00:00Z',
        rollbackResults: { entitiesDeleted: 1 }
      };

      const updated = await service.updateDeployment('deploy_12345_test', {
        rollbackInfo
      });

      expect(updated.rollbackInfo).toEqual(rollbackInfo);
    });

    test('should set completedAt timestamp when status is success', async () => {
      const updated = await service.updateDeployment('deploy_12345_test', {
        status: 'success'
      });

      expect(updated.completedAt).toBeDefined();
      expect(new Date(updated.completedAt)).toBeInstanceOf(Date);
    });

    test('should set completedAt timestamp when status is failed', async () => {
      const updated = await service.updateDeployment('deploy_12345_test', {
        status: 'failed'
      });

      expect(updated.completedAt).toBeDefined();
    });

    test('should throw error when deployment not found', async () => {
      fs.readFile.mockRejectedValue({ code: 'ENOENT' });

      await expect(
        service.updateDeployment('nonexistent_deployment', { status: 'failed' })
      ).rejects.toThrow('Deployment nonexistent_deployment not found');
    });

    test('should save updated record to file', async () => {
      await service.updateDeployment('deploy_12345_test', { status: 'success' });

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('deploy_12345_test.json'),
        expect.any(String),
        'utf8'
      );
    });
  });

  describe('getDeploymentById', () => {
    test('should retrieve deployment by ID', async () => {
      fs.readFile.mockResolvedValue(JSON.stringify(FIXTURES.deploymentRecord));

      const deployment = await service.getDeploymentById('deploy_12345_test');

      expect(deployment).toEqual(FIXTURES.deploymentRecord);
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('deploy_12345_test.json'),
        'utf8'
      );
    });

    test('should return null when deployment not found', async () => {
      fs.readFile.mockRejectedValue({ code: 'ENOENT' });

      const deployment = await service.getDeploymentById('nonexistent_deployment');

      expect(deployment).toBeNull();
    });

    test('should throw error for other file read errors', async () => {
      fs.readFile.mockRejectedValue(new Error('Permission denied'));

      await expect(
        service.getDeploymentById('deploy_12345_test')
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('getDeploymentHistory', () => {
    test('should return deployment history for environment', async () => {
      fs.readFile
        .mockResolvedValueOnce(JSON.stringify(FIXTURES.deploymentIndex))
        .mockResolvedValueOnce(JSON.stringify(FIXTURES.deploymentRecord))
        .mockResolvedValueOnce(JSON.stringify({ ...FIXTURES.deploymentRecord, deploymentId: 'deploy_67890_test' }));

      const history = await service.getDeploymentHistory('dev', 20);

      expect(history).toHaveLength(2);
      expect(history[0].deploymentId).toBe('deploy_12345_test');
    });

    test('should sort deployments by timestamp (newest first)', async () => {
      const index = {
        deployments: [
          { deploymentId: 'deploy_old', timestamp: '2025-09-01T10:00:00Z', status: 'success' },
          { deploymentId: 'deploy_new', timestamp: '2025-10-02T10:00:00Z', status: 'success' }
        ]
      };

      const newDeployment = { ...FIXTURES.deploymentRecord, deploymentId: 'deploy_new' };
      const oldDeployment = { ...FIXTURES.deploymentRecord, deploymentId: 'deploy_old' };

      fs.readFile
        .mockResolvedValueOnce(JSON.stringify(index))
        .mockResolvedValueOnce(JSON.stringify(newDeployment))
        .mockResolvedValueOnce(JSON.stringify(oldDeployment));

      const history = await service.getDeploymentHistory('dev', 20);

      expect(history[0].deploymentId).toBe('deploy_new');
    });

    test('should limit results to specified limit', async () => {
      const manyDeployments = {
        deployments: Array.from({ length: 30 }, (_, i) => ({
          deploymentId: `deploy_${i}`,
          timestamp: new Date(Date.now() - i * 1000).toISOString(),
          status: 'success'
        }))
      };

      fs.readFile
        .mockResolvedValueOnce(JSON.stringify(manyDeployments))
        .mockResolvedValue(JSON.stringify(FIXTURES.deploymentRecord));

      const history = await service.getDeploymentHistory('dev', 10);

      expect(history.length).toBeLessThanOrEqual(10);
    });

    test('should return empty array when index file not found', async () => {
      fs.readFile.mockRejectedValue({ code: 'ENOENT' });

      const history = await service.getDeploymentHistory('dev', 20);

      expect(history).toEqual([]);
    });

    test('should use "default" as default environment suffix', async () => {
      fs.readFile.mockRejectedValue({ code: 'ENOENT' });

      await service.getDeploymentHistory(null, 20);

      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('default_index.json'),
        'utf8'
      );
    });

    test('should handle corrupted deployment records gracefully', async () => {
      fs.readFile
        .mockResolvedValueOnce(JSON.stringify(FIXTURES.deploymentIndex))
        .mockRejectedValueOnce(new Error('Corrupted file'))
        .mockResolvedValueOnce(JSON.stringify(FIXTURES.deploymentRecord));

      const consoleWarnSpy = jest.spyOn(console, 'warn');
      const history = await service.getDeploymentHistory('dev', 20);

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(history.length).toBeGreaterThan(0);
    });
  });

  describe('saveDeploymentRecord', () => {
    test('should save deployment record to file', async () => {
      fs.writeFile.mockResolvedValue(undefined);

      await service.saveDeploymentRecord(FIXTURES.deploymentRecord);

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('deploy_12345_test.json'),
        expect.stringContaining('"deploymentId": "deploy_12345_test"'),
        'utf8'
      );
    });

    test('should format JSON with indentation', async () => {
      fs.writeFile.mockResolvedValue(undefined);

      await service.saveDeploymentRecord(FIXTURES.deploymentRecord);

      const writeCall = fs.writeFile.mock.calls[0];
      const jsonData = writeCall[1];

      expect(jsonData).toContain('\n');
      expect(jsonData).toContain('  '); // Indentation
    });
  });

  describe('updateDeploymentIndex', () => {
    test('should create new index if it does not exist', async () => {
      fs.readFile.mockRejectedValue({ code: 'ENOENT' });
      fs.writeFile.mockResolvedValue(undefined);

      await service.updateDeploymentIndex(FIXTURES.deploymentRecord);

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('dev_index.json'),
        expect.stringContaining('"deploymentId": "deploy_12345_test"'),
        'utf8'
      );
    });

    test('should update existing deployment in index', async () => {
      fs.readFile.mockResolvedValue(JSON.stringify(FIXTURES.deploymentIndex));
      fs.writeFile.mockResolvedValue(undefined);

      await service.updateDeploymentIndex({
        ...FIXTURES.deploymentRecord,
        status: 'failed'
      });

      const writeCall = fs.writeFile.mock.calls[0];
      const indexData = JSON.parse(writeCall[1]);
      const deployment = indexData.deployments.find(d => d.deploymentId === 'deploy_12345_test');

      expect(deployment.status).toBe('failed');
    });

    test('should add new deployment to existing index', async () => {
      fs.readFile.mockResolvedValue(JSON.stringify(FIXTURES.deploymentIndex));
      fs.writeFile.mockResolvedValue(undefined);

      await service.updateDeploymentIndex({
        ...FIXTURES.deploymentRecord,
        deploymentId: 'deploy_99999_new'
      });

      const writeCall = fs.writeFile.mock.calls[0];
      const indexData = JSON.parse(writeCall[1]);

      expect(indexData.deployments).toHaveLength(3);
    });
  });

  describe('getLatestDeploymentId', () => {
    test('should return latest deployment ID', async () => {
      fs.readFile
        .mockResolvedValueOnce(JSON.stringify(FIXTURES.deploymentIndex))
        .mockResolvedValue(JSON.stringify(FIXTURES.deploymentRecord));

      const latestId = await service.getLatestDeploymentId('dev');

      expect(latestId).toBe('deploy_12345_test');
    });

    test('should return null when no deployments exist', async () => {
      fs.readFile.mockRejectedValue({ code: 'ENOENT' });

      const latestId = await service.getLatestDeploymentId('dev');

      expect(latestId).toBeNull();
    });
  });

  describe('cleanupOldDeployments', () => {
    test('should delete deployments beyond retention limit', async () => {
      const manyDeployments = Array.from({ length: 60 }, (_, i) => ({
        deploymentId: `deploy_${i}`,
        timestamp: new Date(Date.now() - i * 1000).toISOString(),
        status: 'success',
        summary: {}
      }));

      fs.readFile
        .mockResolvedValueOnce(JSON.stringify({ deployments: manyDeployments.slice(0, 60) }))
        .mockResolvedValueOnce(JSON.stringify({ deployments: manyDeployments.slice(0, 60) }))
        .mockResolvedValueOnce(JSON.stringify({ deployments: manyDeployments.slice(0, 60) }));
      
      fs.writeFile.mockResolvedValue(undefined);
      fs.unlink.mockResolvedValue(undefined);

      await service.cleanupOldDeployments('dev');

      expect(fs.unlink).toHaveBeenCalled();
      const unlinkCalls = fs.unlink.mock.calls.length;
      expect(unlinkCalls).toBeGreaterThan(0);
    });

    test('should update index after cleanup', async () => {
      const manyDeployments = Array.from({ length: 60 }, (_, i) => ({
        deploymentId: `deploy_${i}`,
        timestamp: new Date(Date.now() - i * 1000).toISOString(),
        status: 'success',
        summary: {}
      }));

      const deploymentRecords = Array.from({ length: 60 }, (_, i) => ({
        ...FIXTURES.deploymentRecord,
        deploymentId: `deploy_${i}`
      }));

      // First read: getDeploymentHistory reads index
      // Next 60 reads: getDeploymentHistory loads each deployment record
      // Last read: cleanupOldDeployments reads index again
      fs.readFile
        .mockResolvedValueOnce(JSON.stringify({ deployments: manyDeployments }));
      
      // Mock all deployment record reads
      deploymentRecords.forEach(record => {
        fs.readFile.mockResolvedValueOnce(JSON.stringify(record));
      });
      
      // Mock final index read for cleanup
      fs.readFile.mockResolvedValueOnce(JSON.stringify({ deployments: manyDeployments }));
      
      fs.writeFile.mockResolvedValue(undefined);
      fs.unlink.mockResolvedValue(undefined);

      await service.cleanupOldDeployments('dev');

      const indexWriteCall = fs.writeFile.mock.calls.find(call =>
        call[0].includes('_index.json')
      );

      expect(indexWriteCall).toBeDefined();
    });

    test('should handle cleanup errors gracefully', async () => {
      const manyDeployments = Array.from({ length: 60 }, (_, i) => ({
        deploymentId: `deploy_${i}`,
        timestamp: new Date(Date.now() - i * 1000).toISOString(),
        status: 'success',
        summary: {}
      }));

      fs.readFile.mockResolvedValue(JSON.stringify({ deployments: manyDeployments }));
      fs.unlink.mockRejectedValue(new Error('Permission denied'));
      fs.writeFile.mockResolvedValue(undefined);

      const consoleWarnSpy = jest.spyOn(console, 'warn');

      await expect(
        service.cleanupOldDeployments('dev')
      ).resolves.not.toThrow();

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    test('should not delete anything if under retention limit', async () => {
      const fewDeployments = Array.from({ length: 20 }, (_, i) => ({
        deploymentId: `deploy_${i}`,
        timestamp: new Date(Date.now() - i * 1000).toISOString(),
        status: 'success',
        summary: {}
      }));

      fs.readFile
        .mockResolvedValueOnce(JSON.stringify({ deployments: fewDeployments }))
        .mockResolvedValue(JSON.stringify(FIXTURES.deploymentRecord));

      await service.cleanupOldDeployments('dev');

      expect(fs.unlink).not.toHaveBeenCalled();
    });
  });

  describe('generateDeploymentSummary', () => {
    test('should generate summary from ERD content', () => {
      const summary = service.generateDeploymentSummary({
        erdContent: FIXTURES.erdContent.complex
      });

      expect(summary).toMatchObject({
        totalEntities: expect.any(Number),
        totalAttributes: expect.any(Number),
        cdmEntities: expect.any(Number),
        customEntities: expect.any(Number)
      });
    });

    test('should count entities correctly', () => {
      const summary = service.generateDeploymentSummary({
        erdContent: FIXTURES.erdContent.complex
      });

      expect(summary.totalEntities).toBeGreaterThan(0);
    });

    test('should include entity names in summary', () => {
      const summary = service.generateDeploymentSummary({
        erdContent: FIXTURES.erdContent.simple
      });

      expect(summary.customEntityNames).toBeDefined();
      expect(summary.cdmEntityNames).toBeDefined();
    });
  });

  describe('parseEntitiesFromERD', () => {
    test('should parse entities from ERD content', () => {
      const entities = service.parseEntitiesFromERD(FIXTURES.erdContent.complex);

      expect(entities.length).toBeGreaterThan(0);
      expect(entities[0]).toHaveProperty('name');
      expect(entities[0]).toHaveProperty('attributes');
    });

    test('should parse entity attributes', () => {
      const entities = service.parseEntitiesFromERD(FIXTURES.erdContent.simple);

      expect(entities[0].attributes).toBeDefined();
      expect(entities[0].attributes.length).toBeGreaterThan(0);
    });

    test('should handle empty ERD content', () => {
      const entities = service.parseEntitiesFromERD('');

      expect(entities).toEqual([]);
    });
  });

  describe('compareDeployments', () => {
    const oldERD = 'Customer { string name PK }';
    const newERD = `
      Customer { string name PK string email }
      Order { string orderId PK }
    `;

    beforeEach(() => {
      fs.readFile
        .mockResolvedValueOnce(JSON.stringify({
          ...FIXTURES.deploymentRecord,
          deploymentId: 'deploy_old',
          erdContent: oldERD
        }))
        .mockResolvedValueOnce(JSON.stringify({
          ...FIXTURES.deploymentRecord,
          deploymentId: 'deploy_new',
          erdContent: newERD
        }));
    });

    test('should compare two deployments', async () => {
      const comparison = await service.compareDeployments('deploy_old', 'deploy_new');

      expect(comparison).toHaveProperty('fromDeployment');
      expect(comparison).toHaveProperty('toDeployment');
      expect(comparison).toHaveProperty('changes');
    });

    test('should identify added entities', async () => {
      const comparison = await service.compareDeployments('deploy_old', 'deploy_new');

      expect(comparison.changes.entitiesAdded.length).toBeGreaterThan(0);
    });

    test('should throw error when deployment not found', async () => {
      fs.readFile.mockReset();
      fs.readFile.mockRejectedValue({ code: 'ENOENT' });

      await expect(
        service.compareDeployments('nonexistent1', 'nonexistent2')
      ).rejects.toThrow('compareDeployments failed');
    });
  });

  describe('entity comparison helpers', () => {
    const entities1 = [
      { name: 'Customer', attributes: [] },
      { name: 'Order', attributes: [] }
    ];

    const entities2 = [
      { name: 'Customer', attributes: [] },
      { name: 'Product', attributes: [] }
    ];

    test('getAddedEntities should return newly added entities', () => {
      const added = service.getAddedEntities(entities1, entities2);

      expect(added).toHaveLength(1);
      expect(added[0].name).toBe('Product');
    });

    test('getRemovedEntities should return removed entities', () => {
      const removed = service.getRemovedEntities(entities1, entities2);

      expect(removed).toHaveLength(1);
      expect(removed[0].name).toBe('Order');
    });

    test('getModifiedEntities should detect entity changes', () => {
      const entities1Mod = [
        { name: 'Customer', attributes: [{ name: 'id', type: 'string' }] }
      ];
      const entities2Mod = [
        { name: 'Customer', attributes: [{ name: 'id', type: 'string' }, { name: 'email', type: 'string' }] }
      ];

      const modified = service.getModifiedEntities(entities1Mod, entities2Mod);

      expect(modified.length).toBeGreaterThan(0);
    });

    test('entitiesAreDifferent should detect attribute differences', () => {
      const entity1 = { attributes: [{ name: 'id' }] };
      const entity2 = { attributes: [{ name: 'id' }, { name: 'name' }] };

      const different = service.entitiesAreDifferent(entity1, entity2);

      expect(different).toBe(true);
    });

    test('entitiesAreDifferent should return false for identical entities', () => {
      const entity1 = { attributes: [{ name: 'id' }] };
      const entity2 = { attributes: [{ name: 'id' }] };

      const different = service.entitiesAreDifferent(entity1, entity2);

      expect(different).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    test('should handle full deployment lifecycle', async () => {
      fs.writeFile.mockResolvedValue(undefined);
      
      const emptyIndex = JSON.stringify({ deployments: [] });
      const deploymentRecord = JSON.stringify(FIXTURES.deploymentRecord);
      
      // Mock for recordDeployment:
      // - getLatestDeploymentId → getDeploymentHistory reads index (empty)
      // - updateDeploymentIndex reads index (empty)
      // - cleanupOldDeployments → getDeploymentHistory reads index (empty)
      fs.readFile
        .mockResolvedValue(emptyIndex); // Default to empty index for all reads

      // Record deployment
      const deploymentId = await service.recordDeployment(FIXTURES.validDeploymentData);
      expect(deploymentId).toBeDefined();

      // Mock for updateDeployment:
      // - getDeploymentById reads deployment file
      fs.readFile.mockReset();
      fs.readFile.mockResolvedValueOnce(deploymentRecord);

      // Update deployment
      const updated = await service.updateDeployment(deploymentId, {
        status: 'success',
        duration: 45000
      });
      expect(updated.status).toBe('success');
      expect(updated.duration).toBe(45000);
    });

    test('should handle multiple deployments to same environment', async () => {
      fs.writeFile.mockResolvedValue(undefined);
      fs.readFile.mockRejectedValue({ code: 'ENOENT' });

      const id1 = await service.recordDeployment({
        ...FIXTURES.validDeploymentData,
        deploymentId: 'deploy_1'
      });

      const id2 = await service.recordDeployment({
        ...FIXTURES.validDeploymentData,
        deploymentId: 'deploy_2'
      });

      expect(id1).not.toBe(id2);
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });
});
