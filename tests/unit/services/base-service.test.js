/**
 * Unit tests for BaseService
 * Tests common service functionality and patterns
 */

const { BaseService } = require('../../../src/backend/services/base-service');

describe('BaseService', () => {
  let baseService;
  let mockDependencies;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    mockDependencies = {
      dataverseRepository: { name: 'MockDataverseRepo' },
      configRepository: { name: 'MockConfigRepo' },
      logger: mockLogger
    };

    baseService = new BaseService(mockDependencies);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with dependencies', () => {
      expect(baseService.name).toBe('BaseService');
      expect(baseService.dependencies).toBe(mockDependencies);
      expect(baseService.dataverseRepository).toBe(mockDependencies.dataverseRepository);
      expect(baseService.configRepository).toBe(mockDependencies.configRepository);
      expect(baseService.logger).toBe(mockLogger);
    });

    it('should use console as default logger', () => {
      const service = new BaseService({});
      expect(service.logger).toBe(console);
    });

    it('should handle empty dependencies', () => {
      const service = new BaseService();
      expect(service.dependencies).toEqual({});
      expect(service.logger).toBe(console);
    });
  });

  describe('logging methods', () => {
    it('should log actions with service name', () => {
      baseService.log('testAction', { data: 'test' });
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        '🔧 BaseService.testAction',
        { data: 'test' }
      );
    });

    it('should log warnings with service name', () => {
      baseService.warn('test warning', { code: 'WARN001' });
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '⚠️ BaseService: test warning',
        { code: 'WARN001' }
      );
    });

    it('should log errors with service name', () => {
      const testError = new Error('Test error');
      baseService.error('test error message', testError);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        '❌ BaseService: test error message',
        'Test error'
      );
    });

    it('should handle error logging without error object', () => {
      baseService.error('test error message');
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        '❌ BaseService: test error message',
        null
      );
    });
  });

  describe('validateDependencies', () => {
    it('should pass validation when all dependencies are present', () => {
      expect(() => {
        baseService.validateDependencies(['dataverseRepository', 'logger']);
      }).not.toThrow();
    });

    it('should throw error when dependencies are missing', () => {
      expect(() => {
        baseService.validateDependencies(['missingDep1', 'missingDep2']);
      }).toThrow('BaseService missing required dependencies: missingDep1, missingDep2');
    });

    it('should handle empty required dependencies array', () => {
      expect(() => {
        baseService.validateDependencies([]);
      }).not.toThrow();
    });
  });

  describe('executeOperation', () => {
    it('should execute operation successfully and log timing', async () => {
      const mockOperation = jest.fn().mockResolvedValue({ success: true, data: 'test' });
      
      const result = await baseService.executeOperation('testOp', mockOperation, { id: 123 });
      
      expect(mockOperation).toHaveBeenCalled();
      expect(result).toEqual({ success: true, data: 'test' });
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        '🔧 BaseService.testOp',
        { starting: true, id: 123 }
      );
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        '🔧 BaseService.testOp',
        expect.objectContaining({
          completed: true,
          success: true,
          id: 123,
          duration: expect.stringMatching(/\d+ms/)
        })
      );
    });

    it('should handle operation failures and log errors', async () => {
      const testError = new Error('Operation failed');
      const mockOperation = jest.fn().mockRejectedValue(testError);
      
      await expect(
        baseService.executeOperation('failOp', mockOperation)
      ).rejects.toThrow('failOp failed: Operation failed');
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringMatching(/❌ BaseService: failOp failed after \d+ms/),
        'Operation failed'
      );
    });

    it('should handle operations with success=false as successful completion', async () => {
      const mockOperation = jest.fn().mockResolvedValue({ success: false, error: 'validation failed' });
      
      const result = await baseService.executeOperation('testOp', mockOperation);
      
      expect(result).toEqual({ success: false, error: 'validation failed' });
      expect(mockLogger.log).toHaveBeenCalledWith(
        '🔧 BaseService.testOp',
        expect.objectContaining({
          completed: true,
          success: false
        })
      );
    });
  });

  describe('result creation methods', () => {
    it('should create standardized result object', () => {
      const result = baseService.createResult(true, { count: 5 }, 'Success', []);
      
      expect(result).toEqual({
        success: true,
        message: 'Success',
        errors: [],
        timestamp: expect.any(String),
        service: 'BaseService',
        count: 5
      });
      
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });

    it('should create success result', () => {
      const result = baseService.createSuccess({ items: [] }, 'All good');
      
      expect(result).toEqual({
        success: true,
        message: 'All good',
        errors: [],
        timestamp: expect.any(String),
        service: 'BaseService',
        items: []
      });
    });

    it('should create success result with default message', () => {
      const result = baseService.createSuccess({ id: 123 });
      
      expect(result.message).toBe('Operation completed successfully');
      expect(result.success).toBe(true);
    });

    it('should create error result', () => {
      const result = baseService.createError('Something went wrong', ['ERR001'], { code: 500 });
      
      expect(result).toEqual({
        success: false,
        message: 'Something went wrong',
        errors: ['ERR001'],
        timestamp: expect.any(String),
        service: 'BaseService',
        code: 500
      });
    });
  });

  describe('validateInput', () => {
    it('should pass validation with all required fields present', () => {
      const input = { name: 'test', value: 123 };
      
      expect(() => {
        baseService.validateInput(input, ['name', 'value']);
      }).not.toThrow();
    });

    it('should throw error for missing required fields', () => {
      const input = { name: 'test' };
      
      expect(() => {
        baseService.validateInput(input, ['name', 'value', 'type']);
      }).toThrow('Missing required parameters: value, type');
    });

    it('should treat empty string as missing', () => {
      const input = { name: '', value: null };
      
      expect(() => {
        baseService.validateInput(input, ['name', 'value']);
      }).toThrow('Missing required parameters: name, value');
    });

    it('should validate parameter types when schema provided', () => {
      const input = { name: 'test', count: '123' };
      const schema = { name: 'string', count: 'number' };
      
      expect(() => {
        baseService.validateInput(input, ['name'], schema);
      }).toThrow("Parameter 'count' must be of type number, got string");
    });

    it('should allow optional parameters in schema', () => {
      const input = { name: 'test' };
      const schema = { name: 'string', optional: 'number' };
      
      expect(() => {
        baseService.validateInput(input, ['name'], schema);
      }).not.toThrow();
    });

    it('should handle empty input and no requirements', () => {
      expect(() => {
        baseService.validateInput({}, []);
      }).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should preserve original error context in executeOperation', async () => {
      const originalError = new Error('Database connection failed');
      originalError.code = 'DB_ERROR';
      
      const mockOperation = jest.fn().mockRejectedValue(originalError);
      
      try {
        await baseService.executeOperation('dbOp', mockOperation);
      } catch (error) {
        expect(error.message).toBe('dbOp failed: Database connection failed');
      }
    });
  });
});
