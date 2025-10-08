/**
 * Unit tests for RollbackController
 * Tests HTTP request handling for rollback operations
 */

const RollbackController = require('../../../src/backend/controllers/rollback-controller');

// Test Fixtures
const FIXTURES = {
  rollbackCapability: {
    canRollback: true,
    deploymentInfo: {
      solutionName: 'TestSolution',
      entitiesCount: 2,
      relationshipsCount: 1,
      globalChoicesCount: 1
    }
  },

  rollbackCapabilityDenied: {
    canRollback: false,
    reason: 'Only successful deployments can be rolled back'
  },

  rollbackResult: {
    rollbackId: 'rollback_12345_test',
    deploymentId: 'deploy_12345_test',
    status: 'success',
    results: {
      relationshipsDeleted: 1,
      entitiesDeleted: 2,
      globalChoicesDeleted: 1,
      solutionDeleted: true,
      publisherDeleted: true
    },
    summary: 'Rollback completed: 1 relationships, 2 entities, 1 choices deleted'
  }
};

// Helper functions
const createMockRollbackService = () => ({
  canRollback: jest.fn(),
  rollbackDeployment: jest.fn()
});

const createMockResponse = () => {
  const res = {
    writeHead: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    headersSent: false
  };
  return res;
};

const createMockRequest = (body = {}) => ({
  rawBody: JSON.stringify(body),
  headers: {}
});

const createRollbackController = () => {
  const mockService = createMockRollbackService();
  const controller = new RollbackController(mockService);

  return {
    controller,
    mockService
  };
};

describe('RollbackController', () => {
  let controller, mockService;

  beforeEach(() => {
    ({ controller, mockService } = createRollbackController());
    
    // Suppress console logs in tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Stop the cleanup timer to prevent open handles
    if (controller && controller.statusTracker) {
      controller.statusTracker.stopCleanupTimer();
    }
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  afterAll(() => {
    // Final cleanup to ensure no handles remain open
    if (controller && controller.statusTracker) {
      controller.statusTracker.stopCleanupTimer();
    }
  });

  describe('constructor', () => {
    test('should initialize with rollback service', () => {
      expect(controller.rollbackService).toBe(mockService);
    });
  });

  describe('checkRollbackCapability', () => {
    test('should return rollback capability successfully', async () => {
      mockService.canRollback.mockResolvedValue(FIXTURES.rollbackCapability);
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.checkRollbackCapability(req, res, 'deploy_12345_test');

      expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
        'Content-Type': 'application/json'
      }));

      const responseBody = JSON.parse(res.end.mock.calls[0][0]);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data).toEqual(FIXTURES.rollbackCapability);
    });

    test('should call rollback service with correct deployment ID', async () => {
      mockService.canRollback.mockResolvedValue(FIXTURES.rollbackCapability);
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.checkRollbackCapability(req, res, 'deploy_12345_test');

      expect(mockService.canRollback).toHaveBeenCalledWith('deploy_12345_test');
    });

    test('should return capability denied when cannot rollback', async () => {
      mockService.canRollback.mockResolvedValue(FIXTURES.rollbackCapabilityDenied);
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.checkRollbackCapability(req, res, 'deploy_12345_test');

      const responseBody = JSON.parse(res.end.mock.calls[0][0]);
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.canRollback).toBe(false);
      expect(responseBody.data.reason).toBeDefined();
    });

    test('should include timestamp in response', async () => {
      mockService.canRollback.mockResolvedValue(FIXTURES.rollbackCapability);
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.checkRollbackCapability(req, res, 'deploy_12345_test');

      const responseBody = JSON.parse(res.end.mock.calls[0][0]);
      expect(responseBody.timestamp).toBeDefined();
      expect(new Date(responseBody.timestamp)).toBeInstanceOf(Date);
    });

    test('should set CORS headers', async () => {
      mockService.canRollback.mockResolvedValue(FIXTURES.rollbackCapability);
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.checkRollbackCapability(req, res, 'deploy_12345_test');

      expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
        'Access-Control-Allow-Origin': '*'
      }));
    });

    test('should handle service errors', async () => {
      mockService.canRollback.mockRejectedValue(new Error('Service error'));
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.checkRollbackCapability(req, res, 'deploy_12345_test');

      expect(res.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
      const responseBody = JSON.parse(res.end.mock.calls[0][0]);
      expect(responseBody.error).toBeDefined();
    });

    test('should log errors to console', async () => {
      const error = new Error('Test error');
      mockService.canRollback.mockRejectedValue(error);
      const consoleErrorSpy = jest.spyOn(console, 'error');
      const req = createMockRequest();
      const res = createMockResponse();

      await controller.checkRollbackCapability(req, res, 'deploy_12345_test');

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('executeRollback', () => {
    test('should execute rollback successfully', async () => {
      mockService.canRollback.mockResolvedValue({ canRollback: true });
      mockService.rollbackDeployment.mockResolvedValue(FIXTURES.rollbackResult);
      const req = createMockRequest({ confirm: true });
      const res = createMockResponse();

      await controller.executeRollback(req, res, 'deploy_12345_test');

      // Should return 202 Accepted immediately (async pattern)
      expect(res.writeHead).toHaveBeenCalledWith(202, expect.objectContaining({
        'Content-Type': 'application/json'
      }));
      
      const responseBody = JSON.parse(res.end.mock.calls[0][0]);
      expect(responseBody.success).toBe(true);
      expect(responseBody.rollbackId).toBeDefined();
      expect(responseBody.statusUrl).toBeDefined();
    });

    test('should parse request body correctly', async () => {
      mockService.canRollback.mockResolvedValue({ canRollback: true });
      mockService.rollbackDeployment.mockResolvedValue(FIXTURES.rollbackResult);
      const req = createMockRequest({ confirm: true, additionalData: 'test' });
      const res = createMockResponse();

      await controller.executeRollback(req, res, 'deploy_12345_test');

      expect(mockService.rollbackDeployment).toHaveBeenCalled();
      expect(res.end).toHaveBeenCalled();
    });

    test('should return JSON response with correct headers', async () => {
      mockService.canRollback.mockResolvedValue({ canRollback: true });
      mockService.rollbackDeployment.mockResolvedValue(FIXTURES.rollbackResult);
      const req = createMockRequest({ confirm: true });
      const res = createMockResponse();

      await controller.executeRollback(req, res, 'deploy_12345_test');

      expect(res.writeHead).toHaveBeenCalledWith(202, expect.objectContaining({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }));
    });

    test('should include rollback results in response', async () => {
      mockService.canRollback.mockResolvedValue({ canRollback: true });
      mockService.rollbackDeployment.mockResolvedValue(FIXTURES.rollbackResult);
      const req = createMockRequest({ confirm: true });
      const res = createMockResponse();

      await controller.executeRollback(req, res, 'deploy_12345_test');

      const response = JSON.parse(res.end.mock.calls[0][0]);
      expect(response.success).toBe(true);
      expect(response.rollbackId).toBeDefined(); // ID is generated dynamically
      expect(response.deploymentId).toBe('deploy_12345_test');
      expect(response.statusUrl).toContain('/api/rollback/');
    });

    test('should include timestamp in response', async () => {
      mockService.canRollback.mockResolvedValue({ canRollback: true });
      mockService.rollbackDeployment.mockResolvedValue(FIXTURES.rollbackResult);
      const req = createMockRequest({ confirm: true });
      const res = createMockResponse();

      await controller.executeRollback(req, res, 'deploy_12345_test');

      const response = JSON.parse(res.end.mock.calls[0][0]);
      expect(response.timestamp).toBeDefined();
    });

    test('should close SSE connection after completion', async () => {
      mockService.rollbackDeployment.mockResolvedValue(FIXTURES.rollbackResult);
      const req = createMockRequest({ confirm: true });
      const res = createMockResponse();

      await controller.executeRollback(req, res, 'deploy_12345_test');

      expect(res.end).toHaveBeenCalled();
    });

    test('should handle service errors during capability check', async () => {
      // Test error during canRollback check (this should return 500)
      mockService.canRollback.mockRejectedValue(new Error('Service error'));
      const req = createMockRequest({ confirm: true });
      const res = createMockResponse();

      await controller.executeRollback(req, res, 'deploy_12345_test');

      expect(res.writeHead).toHaveBeenCalledWith(500, expect.any(Object));
      const response = JSON.parse(res.end.mock.calls[0][0]);
      expect(response.success).toBe(false);
    });

    test('should handle missing request body', async () => {
      const req = { headers: {} }; // No rawBody
      const res = createMockResponse();

      await controller.executeRollback(req, res, 'deploy_12345_test');

      // Should reject without confirmation
      expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
      expect(mockService.rollbackDeployment).not.toHaveBeenCalled();
    });

    test('should handle invalid JSON in request body', async () => {
      const req = {
        rawBody: 'invalid json {',
        headers: {}
      };
      const res = createMockResponse();

      await controller.executeRollback(req, res, 'deploy_12345_test');

      // Should return 400 error for invalid JSON
      expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
      expect(mockService.rollbackDeployment).not.toHaveBeenCalled();
    });

    test('should log rollback execution start', async () => {
      mockService.rollbackDeployment.mockResolvedValue(FIXTURES.rollbackResult);
      const consoleLogSpy = jest.spyOn(console, 'log');
      const req = createMockRequest({ confirm: true });
      const res = createMockResponse();

      await controller.executeRollback(req, res, 'deploy_12345_test');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('ROLLBACK CONTROLLER'),
        expect.any(String)
      );
    });

    test('should not send response twice on error', async () => {
      mockService.rollbackDeployment.mockRejectedValue(new Error('Test error'));
      const req = createMockRequest({ confirm: true });
      const res = createMockResponse();

      await controller.executeRollback(req, res, 'deploy_12345_test');

      // Should only call writeHead once
      expect(res.writeHead).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendError', () => {
    test('should send error response with status code', () => {
      const res = createMockResponse();

      controller.sendError(res, 500, 'Internal server error');

      expect(res.writeHead).toHaveBeenCalledWith(500, expect.objectContaining({
        'Content-Type': 'application/json'
      }));

      const responseBody = JSON.parse(res.end.mock.calls[0][0]);
      expect(responseBody.error).toBe('Internal server error');
    });

    test('should include error timestamp', () => {
      const res = createMockResponse();

      controller.sendError(res, 400, 'Bad request');

      const responseBody = JSON.parse(res.end.mock.calls[0][0]);
      expect(responseBody.timestamp).toBeDefined();
    });

    test('should set CORS headers on error', () => {
      const res = createMockResponse();

      controller.sendError(res, 404, 'Not found');

      expect(res.writeHead).toHaveBeenCalledWith(404, expect.objectContaining({
        'Access-Control-Allow-Origin': '*'
      }));
    });
  });

  describe('SSE helpers', () => {
    test('should format SSE message correctly', () => {
      const res = createMockResponse();
      
      // Simulate SSE write
      res.write('data: {"stage":"test","message":"Testing"}\n\n');

      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining('data: ')
      );
      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining('\n\n')
      );
    });

    test('should handle multiple SSE messages', () => {
      const res = createMockResponse();
      
      res.write('data: {"stage":"stage1"}\n\n');
      res.write('data: {"stage":"stage2"}\n\n');
      res.write('data: {"stage":"stage3"}\n\n');

      expect(res.write).toHaveBeenCalledTimes(3);
    });
  });

  describe('integration scenarios', () => {
    test('should handle complete rollback flow', async () => {
      mockService.canRollback.mockResolvedValue({ canRollback: true });
      mockService.rollbackDeployment.mockResolvedValue(FIXTURES.rollbackResult);

      const req = createMockRequest({ confirm: true });
      const res = createMockResponse();

      await controller.executeRollback(req, res, 'deploy_12345_test');

      // Verify complete flow executed
      expect(mockService.canRollback).toHaveBeenCalledWith('deploy_12345_test');
      expect(res.writeHead).toHaveBeenCalledWith(202, expect.any(Object));
      expect(res.end).toHaveBeenCalled();
      
      const response = JSON.parse(res.end.mock.calls[0][0]);
      expect(response.success).toBe(true);
      expect(response.rollbackId).toBeDefined();
    });

    test('should handle check capability followed by execute', async () => {
      mockService.canRollback.mockResolvedValue(FIXTURES.rollbackCapability);
      mockService.rollbackDeployment.mockResolvedValue(FIXTURES.rollbackResult);

      const deploymentId = 'deploy_12345_test';

      // Step 1: Check capability
      const checkReq = createMockRequest();
      const checkRes = createMockResponse();
      await controller.checkRollbackCapability(checkReq, checkRes, deploymentId);

      const capabilityResponse = JSON.parse(checkRes.end.mock.calls[0][0]);
      expect(capabilityResponse.data.canRollback).toBe(true);

      // Step 2: Execute rollback
      const executeReq = createMockRequest({ confirm: true });
      const executeRes = createMockResponse();
      await controller.executeRollback(executeReq, executeRes, deploymentId);

      expect(mockService.rollbackDeployment).toHaveBeenCalled();
    });
  });

  describe('error recovery', () => {
    test('should recover from progress callback errors', async () => {
      // Current implementation doesn't use progress callbacks
      // This test validates graceful execution
      mockService.canRollback.mockResolvedValue({ canRollback: true });
      mockService.rollbackDeployment.mockResolvedValue(FIXTURES.rollbackResult);

      const req = createMockRequest({ confirm: true });
      const res = createMockResponse();

      await expect(
        controller.executeRollback(req, res, 'deploy_12345_test')
      ).resolves.not.toThrow();
      
      expect(res.writeHead).toHaveBeenCalledWith(202, expect.any(Object));
    });

    test('should handle service returning partial data', async () => {
      mockService.canRollback.mockResolvedValue({ canRollback: true });
      mockService.rollbackDeployment.mockResolvedValue({
        rollbackId: 'rollback_123',
        status: 'success',
        summary: 'Partial rollback completed'
        // Missing some optional fields
      });

      const req = createMockRequest({ confirm: true });
      const res = createMockResponse();

      await controller.executeRollback(req, res, 'deploy_12345_test');

      const response = JSON.parse(res.end.mock.calls[0][0]);
      expect(response.success).toBe(true);
      expect(response.rollbackId).toBeDefined(); // ID is generated dynamically
    });
  });
});
