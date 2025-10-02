/**
 * Unit tests for RollbackService
 * Tests rollback operations, validation, and dependency management
 */

const { RollbackService } = require('../../../src/backend/services/rollback-service');

// Test Fixtures
const FIXTURES = {
  validDeployment: {
    deploymentId: 'deploy_12345_test',
    timestamp: '2025-10-02T10:00:00Z',
    status: 'success',
    environmentSuffix: 'dev',
    erdContent: 'test ERD content',
    summary: {
      totalEntities: 3,
      customEntities: 2,
      cdmEntities: 1
    },
    solutionInfo: {
      solutionId: 'sol_12345',
      solutionName: 'TestSolution',
      publisherName: 'TestPublisher',
      version: '1.0.0'
    },
    rollbackData: {
      customEntities: [
        { name: 'test_entity1', logicalName: 'test_entity1' },
        { name: 'test_entity2', logicalName: 'test_entity2' }
      ],
      relationships: [
        { schemaName: 'test_rel1' }
      ],
      globalChoicesCreated: ['test_choice1']
    }
  },
  
  deploymentWithoutRollbackData: {
    deploymentId: 'deploy_67890_norollback',
    status: 'success',
    solutionInfo: {
      solutionName: 'NoRollbackSolution'
    }
    // Missing rollbackData
  },
  
  failedDeployment: {
    deploymentId: 'deploy_11111_failed',
    status: 'failed',
    rollbackData: {
      customEntities: []
    }
  },
  
  rollbackResults: {
    relationshipsDeleted: 1,
    entitiesDeleted: 2,
    globalChoicesDeleted: 1,
    solutionDeleted: true,
    publisherDeleted: true,
    errors: [],
    warnings: []
  },
  
  rollbackResultsWithErrors: {
    relationshipsDeleted: 0,
    entitiesDeleted: 1,
    globalChoicesDeleted: 0,
    solutionDeleted: false,
    publisherDeleted: false,
    errors: ['Entity deletion failed', 'Solution deletion failed'],
    warnings: ['Publisher may be in use']
  }
};

// Helper functions
const createMockLogger = () => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
});

const createMockDataverseRepository = () => ({
  rollbackDeployment: jest.fn(),
  getSolutionById: jest.fn(),
  _get: jest.fn()
});

const createMockDeploymentHistoryService = () => ({
  getDeploymentById: jest.fn(),
  updateDeployment: jest.fn(),
  recordDeployment: jest.fn()
});

const createMockPerformanceMonitor = () => ({
  startOperation: jest.fn(),
  endOperation: jest.fn()
});

const createRollbackService = (customDeps = {}) => {
  const mockLogger = createMockLogger();
  const mockDataverseRepo = createMockDataverseRepository();
  const mockDeploymentHistoryService = createMockDeploymentHistoryService();
  const mockPerformanceMonitor = createMockPerformanceMonitor();

  const dependencies = {
    dataverseRepository: mockDataverseRepo,
    deploymentHistoryService: mockDeploymentHistoryService,
    logger: mockLogger,
    ...customDeps
  };

  const service = new RollbackService(dependencies);
  service.performanceMonitor = mockPerformanceMonitor;

  return {
    service,
    mockLogger,
    mockDataverseRepo,
    mockDeploymentHistoryService,
    mockPerformanceMonitor
  };
};

describe('RollbackService', () => {
  let service, mockLogger, mockDataverseRepo, mockDeploymentHistoryService, mockPerformanceMonitor;

  beforeEach(() => {
    ({
      service,
      mockLogger,
      mockDataverseRepo,
      mockDeploymentHistoryService,
      mockPerformanceMonitor
    } = createRollbackService());
    
    // Suppress console.log in tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with required dependencies', () => {
      expect(service.dataverseRepository).toBe(mockDataverseRepo);
      expect(service.deploymentHistoryService).toBe(mockDeploymentHistoryService);
      expect(service.activeRollbacks).toBeInstanceOf(Map);
    });

    test('should validate required dependencies', () => {
      expect(() => {
        new RollbackService({});
      }).toThrow();
    });

    test('should initialize activeRollbacks as empty Map', () => {
      expect(service.activeRollbacks.size).toBe(0);
    });
  });

  describe('generateRollbackId', () => {
    test('should generate unique rollback ID with correct format', () => {
      const id1 = service.generateRollbackId();
      const id2 = service.generateRollbackId();

      expect(id1).toMatch(/^rollback_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^rollback_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('canRollback', () => {
    test('should return true when deployment can be rolled back', async () => {
      mockDeploymentHistoryService.getDeploymentById.mockResolvedValue(
        FIXTURES.validDeployment
      );

      const result = await service.canRollback('deploy_12345_test');

      expect(result.canRollback).toBe(true);
      expect(result.deploymentInfo).toEqual({
        solutionName: 'TestSolution',
        entitiesCount: 2,
        relationshipsCount: 1,
        globalChoicesCount: 1
      });
    });

    test('should return false when deployment not found', async () => {
      mockDeploymentHistoryService.getDeploymentById.mockResolvedValue(null);

      const result = await service.canRollback('nonexistent_deployment');

      expect(result.canRollback).toBe(false);
      expect(result.reason).toBe('Deployment not found');
    });

    test('should return false when deployment was not successful', async () => {
      mockDeploymentHistoryService.getDeploymentById.mockResolvedValue(
        FIXTURES.failedDeployment
      );

      const result = await service.canRollback('deploy_11111_failed');

      expect(result.canRollback).toBe(false);
      expect(result.reason).toBe('Only successful deployments can be rolled back');
    });

    test('should return false when deployment has no rollback data', async () => {
      mockDeploymentHistoryService.getDeploymentById.mockResolvedValue(
        FIXTURES.deploymentWithoutRollbackData
      );

      const result = await service.canRollback('deploy_67890_norollback');

      expect(result.canRollback).toBe(false);
      expect(result.reason).toBe('Deployment does not contain rollback data');
    });

    test('should return false when deployment already rolled back', async () => {
      mockDeploymentHistoryService.getDeploymentById.mockResolvedValue({
        ...FIXTURES.validDeployment,
        status: 'rolled-back',
        rollbackInfo: { rollbackTimestamp: '2025-10-02T10:00:00Z' }
      });

      const result = await service.canRollback('deploy_12345_test');

      expect(result.canRollback).toBe(false);
      // The status check happens before the rolled-back check
      expect(result.reason).toBe('Only successful deployments can be rolled back');
    });

    test('should handle errors gracefully', async () => {
      mockDeploymentHistoryService.getDeploymentById.mockRejectedValue(
        new Error('Database error')
      );

      const result = await service.canRollback('deploy_12345_test');

      expect(result.canRollback).toBe(false);
      expect(result.reason).toContain('Error checking rollback capability');
    });
  });

  describe('validateRollbackPreconditions', () => {
    test('should validate successfully when solution exists', async () => {
      mockDataverseRepo.getSolutionById.mockResolvedValue({
        solutionid: 'sol_12345',
        friendlyname: 'TestSolution'
      });

      await expect(
        service.validateRollbackPreconditions(FIXTURES.validDeployment)
      ).resolves.not.toThrow();

      expect(mockDataverseRepo.getSolutionById).toHaveBeenCalledWith('sol_12345');
    });

    test('should throw error when solution does not exist', async () => {
      mockDataverseRepo.getSolutionById.mockResolvedValue(null);

      await expect(
        service.validateRollbackPreconditions(FIXTURES.validDeployment)
      ).rejects.toThrow('Solution TestSolution no longer exists in Dataverse');
    });

    test('should handle 404 errors for missing solutions', async () => {
      const error404 = new Error('Not found');
      error404.response = { status: 404 };
      mockDataverseRepo.getSolutionById.mockRejectedValue(error404);

      await expect(
        service.validateRollbackPreconditions(FIXTURES.validDeployment)
      ).rejects.toThrow('Solution TestSolution no longer exists in Dataverse');
    });

    test('should validate entity existence for custom entities', async () => {
      mockDataverseRepo.getSolutionById.mockResolvedValue({ solutionid: 'sol_12345' });
      mockDataverseRepo._get.mockResolvedValue({
        value: [{ LogicalName: 'test_entity1' }]
      });

      await expect(
        service.validateRollbackPreconditions(FIXTURES.validDeployment)
      ).resolves.not.toThrow();

      expect(mockDataverseRepo._get).toHaveBeenCalled();
    });

    test('should warn about missing entities but not throw', async () => {
      mockDataverseRepo.getSolutionById.mockResolvedValue({ solutionid: 'sol_12345' });
      mockDataverseRepo._get.mockResolvedValue({ value: [] }); // Entity not found

      const consoleWarnSpy = jest.spyOn(console, 'warn');

      await expect(
        service.validateRollbackPreconditions(FIXTURES.validDeployment)
      ).resolves.not.toThrow();

      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('rollbackDeployment', () => {
    beforeEach(() => {
      mockDeploymentHistoryService.getDeploymentById.mockResolvedValue(
        FIXTURES.validDeployment
      );
      mockDataverseRepo.getSolutionById.mockResolvedValue({ solutionid: 'sol_12345' });
      mockDataverseRepo._get.mockResolvedValue({ value: [{ LogicalName: 'test_entity1' }] });
      mockDataverseRepo.rollbackDeployment.mockResolvedValue({
        success: true,
        data: FIXTURES.rollbackResults
      });
    });

    test('should execute rollback successfully', async () => {
      const result = await service.rollbackDeployment('deploy_12345_test');

      expect(result.status).toBe('success');
      expect(result.deploymentId).toBe('deploy_12345_test');
      expect(result.rollbackId).toMatch(/^rollback_\d+_[a-z0-9]+$/);
      expect(result.results).toEqual(FIXTURES.rollbackResults);
    });

    test('should validate deployment ID input', async () => {
      // validateInput throws inside try-catch, so it gets wrapped in RollbackError
      try {
        await service.rollbackDeployment(null);
        throw new Error('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('RollbackError');
        expect(error.errors).toContain('Missing required parameters');
      }

      try {
        await service.rollbackDeployment('');
        throw new Error('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('RollbackError');
        expect(error.errors).toContain('Missing required parameters');
      }
    });

    test('should call progress callback with status updates', async () => {
      const progressCallback = jest.fn();

      await service.rollbackDeployment('deploy_12345_test', progressCallback);

      expect(progressCallback).toHaveBeenCalledWith('starting', expect.any(String));
      expect(progressCallback).toHaveBeenCalledWith('validating', expect.any(String));
      expect(progressCallback).toHaveBeenCalledWith('executing', expect.any(String));
      expect(progressCallback).toHaveBeenCalledWith('recording', expect.any(String));
      expect(progressCallback).toHaveBeenCalledWith('completed', expect.any(String));
    });

    test('should track active rollback during execution', async () => {
      const rollbackPromise = service.rollbackDeployment('deploy_12345_test');
      
      // Check that rollback is tracked while executing
      const activeRollbacks = service.getActiveRollbacks();
      expect(activeRollbacks.length).toBeGreaterThan(0);

      await rollbackPromise;

      // Check that rollback is removed after completion
      const activeRollbacksAfter = service.getActiveRollbacks();
      expect(activeRollbacksAfter.length).toBe(0);
    });

    test('should update deployment status to rolled-back', async () => {
      await service.rollbackDeployment('deploy_12345_test');

      expect(mockDeploymentHistoryService.updateDeployment).toHaveBeenCalledWith(
        'deploy_12345_test',
        expect.objectContaining({
          status: 'rolled-back',
          rollbackInfo: expect.objectContaining({
            rollbackTimestamp: expect.any(String),
            rollbackResults: FIXTURES.rollbackResults
          })
        })
      );
    });

    test('should record rollback in deployment history', async () => {
      await service.rollbackDeployment('deploy_12345_test');

      expect(mockDeploymentHistoryService.recordDeployment).toHaveBeenCalledWith(
        expect.objectContaining({
          summary: expect.objectContaining({
            operationType: 'rollback'
          }),
          metadata: expect.objectContaining({
            deploymentMethod: 'rollback',
            originalDeploymentId: 'deploy_12345_test'
          })
        })
      );
    });

    test('should start and end performance monitoring', async () => {
      await service.rollbackDeployment('deploy_12345_test');

      expect(mockPerformanceMonitor.startOperation).toHaveBeenCalledWith(
        expect.any(String),
        'rollback',
        expect.objectContaining({ deploymentId: 'deploy_12345_test' })
      );

      expect(mockPerformanceMonitor.endOperation).toHaveBeenCalledWith(
        expect.any(String),
        FIXTURES.rollbackResults
      );
    });

    test('should throw error when deployment not found', async () => {
      // This should override the beforeEach mock for this one call
      mockDeploymentHistoryService.getDeploymentById
        .mockResolvedValueOnce(null);

      try {
        await service.rollbackDeployment('nonexistent_deployment');
        throw new Error('Should have thrown an error');
      } catch (error) {
        // The service wraps errors in createError format
        expect(error.message).toBe('RollbackError');
        expect(error.errors).toContain('Deployment nonexistent_deployment not found');
      }
    });

    test('should throw error when deployment has no rollback data', async () => {
      mockDeploymentHistoryService.getDeploymentById
        .mockResolvedValueOnce(FIXTURES.deploymentWithoutRollbackData);

      try {
        await service.rollbackDeployment('deploy_67890_norollback');
        throw new Error('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('RollbackError');
        expect(error.errors).toContain('Deployment does not contain rollback data');
      }
    });

    test('should throw error when deployment was not successful', async () => {
      mockDeploymentHistoryService.getDeploymentById
        .mockResolvedValueOnce(FIXTURES.failedDeployment);

      try {
        await service.rollbackDeployment('deploy_11111_failed');
        throw new Error('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('RollbackError');
        expect(error.errors).toContain('Only successful deployments can be rolled back');
      }
    });

    test('should handle repository response wrapper correctly', async () => {
      mockDataverseRepo.rollbackDeployment.mockResolvedValue({
        success: true,
        data: FIXTURES.rollbackResults,
        message: 'Rollback completed'
      });

      const result = await service.rollbackDeployment('deploy_12345_test');

      expect(result.results).toEqual(FIXTURES.rollbackResults);
    });

    test('should handle direct response (no wrapper)', async () => {
      mockDataverseRepo.rollbackDeployment.mockResolvedValue(FIXTURES.rollbackResults);

      const result = await service.rollbackDeployment('deploy_12345_test');

      expect(result.results).toEqual(FIXTURES.rollbackResults);
    });

    test('should include error details in result summary', async () => {
      mockDataverseRepo.rollbackDeployment.mockResolvedValue({
        success: true,
        data: FIXTURES.rollbackResultsWithErrors
      });

      const result = await service.rollbackDeployment('deploy_12345_test');

      expect(result.summary).toContain('1 entities');
      expect(result.summary).toContain('not deleted');
    });

    test('should cleanup tracking on error', async () => {
      mockDataverseRepo.rollbackDeployment
        .mockRejectedValueOnce(new Error('Dataverse error'));

      try {
        await service.rollbackDeployment('deploy_12345_test');
        throw new Error('Should have thrown an error');
      } catch (error) {
        // Error was thrown - now check cleanup
        const activeRollbacks = service.getActiveRollbacks();
        expect(activeRollbacks.length).toBe(0);
      }
    });

    test('should end performance monitoring on error', async () => {
      const error = new Error('Rollback failed');
      mockDataverseRepo.rollbackDeployment
        .mockRejectedValueOnce(error);

      try {
        await service.rollbackDeployment('deploy_12345_test');
        throw new Error('Should have thrown an error');
      } catch (thrownError) {
        // Error was thrown - check performance monitoring was ended
        expect(mockPerformanceMonitor.endOperation).toHaveBeenCalledWith(
          expect.any(String),
          null,
          expect.any(Error)
        );
      }
    });
  });

  describe('recordRollback', () => {
    test('should create rollback record with correct structure', async () => {
      await service.recordRollback(
        FIXTURES.validDeployment,
        FIXTURES.rollbackResults,
        'rollback_test_123'
      );

      expect(mockDeploymentHistoryService.recordDeployment).toHaveBeenCalledWith(
        expect.objectContaining({
          deploymentId: 'rollback_test_123',
          originalDeploymentId: 'deploy_12345_test',
          environmentSuffix: 'dev',
          status: 'success',
          summary: expect.objectContaining({
            operationType: 'rollback',
            rollbackResults: expect.objectContaining({
              relationshipsDeleted: 1,
              entitiesDeleted: 2,
              globalChoicesDeleted: 1
            })
          }),
          metadata: expect.objectContaining({
            deploymentMethod: 'rollback',
            originalDeploymentId: 'deploy_12345_test'
          })
        })
      );
    });

    test('should include errors and warnings in rollback record', async () => {
      await service.recordRollback(
        FIXTURES.validDeployment,
        FIXTURES.rollbackResultsWithErrors,
        'rollback_test_456'
      );

      const call = mockDeploymentHistoryService.recordDeployment.mock.calls[0][0];
      expect(call.summary.rollbackResults.errors).toEqual(
        FIXTURES.rollbackResultsWithErrors.errors
      );
      expect(call.summary.rollbackResults.warnings).toEqual(
        FIXTURES.rollbackResultsWithErrors.warnings
      );
    });
  });

  describe('getActiveRollbacks', () => {
    test('should return empty array when no active rollbacks', () => {
      const activeRollbacks = service.getActiveRollbacks();

      expect(activeRollbacks).toEqual([]);
    });

    test('should return active rollbacks with correct structure', () => {
      service.activeRollbacks.set('rollback_1', {
        deploymentId: 'deploy_1',
        status: 'executing',
        startTime: Date.now()
      });

      service.activeRollbacks.set('rollback_2', {
        deploymentId: 'deploy_2',
        status: 'validating',
        startTime: Date.now()
      });

      const activeRollbacks = service.getActiveRollbacks();

      expect(activeRollbacks).toHaveLength(2);
      expect(activeRollbacks[0]).toEqual(
        expect.objectContaining({
          rollbackId: 'rollback_1',
          deploymentId: 'deploy_1',
          status: 'executing'
        })
      );
    });
  });

  describe('updateRollbackStatus', () => {
    test('should update status of existing rollback', () => {
      service.activeRollbacks.set('rollback_1', {
        deploymentId: 'deploy_1',
        status: 'starting',
        startTime: Date.now()
      });

      service.updateRollbackStatus('rollback_1', 'executing');

      const rollback = service.activeRollbacks.get('rollback_1');
      expect(rollback.status).toBe('executing');
      expect(rollback.lastUpdate).toBeDefined();
    });

    test('should add error message when provided', () => {
      service.activeRollbacks.set('rollback_1', {
        deploymentId: 'deploy_1',
        status: 'executing',
        startTime: Date.now()
      });

      service.updateRollbackStatus('rollback_1', 'failed', 'Test error');

      const rollback = service.activeRollbacks.get('rollback_1');
      expect(rollback.status).toBe('failed');
      expect(rollback.error).toBe('Test error');
    });

    test('should do nothing if rollback does not exist', () => {
      expect(() => {
        service.updateRollbackStatus('nonexistent', 'completed');
      }).not.toThrow();
    });
  });

  describe('error handling', () => {
    test('should create error with context', async () => {
      mockDeploymentHistoryService.getDeploymentById
        .mockRejectedValueOnce(new Error('Database connection failed'));

      try {
        await service.rollbackDeployment('deploy_12345_test');
        throw new Error('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('RollbackError');
        expect(error.data).toBeDefined();
        expect(error.data.deploymentId).toBe('deploy_12345_test');
      }
    });

    test('should preserve original error message', async () => {
      // Set up successful path mocks
      mockDeploymentHistoryService.getDeploymentById
        .mockResolvedValue(FIXTURES.validDeployment);
      mockDataverseRepo.getSolutionById
        .mockResolvedValue({ solutionid: 'sol_12345' });
      mockDataverseRepo._get
        .mockResolvedValue({ value: [{ LogicalName: 'test_entity1' }] });
      
      // Then make rollbackDeployment fail
      const originalError = new Error('Specific dataverse error');
      mockDataverseRepo.rollbackDeployment
        .mockRejectedValueOnce(originalError);

      try {
        await service.rollbackDeployment('deploy_12345_test');
        throw new Error('Should have thrown an error');
      } catch (error) {
        expect(error.message).toBe('RollbackError');
        expect(error.errors).toContain('Specific dataverse error');
      }
    });
  });

  describe('integration scenarios', () => {
    test('should handle complete rollback flow end-to-end', async () => {
      mockDeploymentHistoryService.getDeploymentById.mockResolvedValue(
        FIXTURES.validDeployment
      );
      mockDataverseRepo.getSolutionById.mockResolvedValue({ solutionid: 'sol_12345' });
      mockDataverseRepo._get.mockResolvedValue({ value: [{ LogicalName: 'test_entity1' }] });
      mockDataverseRepo.rollbackDeployment.mockResolvedValue({
        success: true,
        data: FIXTURES.rollbackResults
      });

      const progressUpdates = [];
      const progressCallback = (status, message) => {
        progressUpdates.push({ status, message });
      };

      const result = await service.rollbackDeployment(
        'deploy_12345_test',
        progressCallback
      );

      // Verify all steps were executed
      expect(mockDeploymentHistoryService.getDeploymentById).toHaveBeenCalled();
      expect(mockDataverseRepo.getSolutionById).toHaveBeenCalled();
      expect(mockDataverseRepo.rollbackDeployment).toHaveBeenCalled();
      expect(mockDeploymentHistoryService.updateDeployment).toHaveBeenCalled();
      expect(mockDeploymentHistoryService.recordDeployment).toHaveBeenCalled();

      // Verify result
      expect(result.status).toBe('success');
      expect(result.results).toEqual(FIXTURES.rollbackResults);

      // Verify progress updates
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0].status).toBe('starting');
      expect(progressUpdates[progressUpdates.length - 1].status).toBe('completed');
    });
  });
});
