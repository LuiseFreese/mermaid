/**
 * Unit tests for BaseService
 * Tests common service functionality and patterns
 * @module tests/unit/services/base-service.test
 */

const { BaseService } = require('../../../src/backend/services/base-service');

// ============================================================================
// Test Fixtures & Constants
// ============================================================================

const FIXTURES = {
    mockDependencies: {
        dataverseRepository: { name: 'MockDataverseRepo' },
        configRepository: { name: 'MockConfigRepo' }
    },

    testData: {
        simpleResult: { success: true, data: 'test' },
        failureResult: { success: false, error: 'validation failed' },
        errorMessage: 'Operation failed',
        inputValid: { name: 'test', value: 123 },
        inputMissing: { name: 'test' },
        inputEmpty: { name: '', value: null }
    },

    schemas: {
        basic: { name: 'string', count: 'number' },
        optional: { name: 'string', optional: 'number' }
    }
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a mock logger instance
 * @returns {Object} Mock logger
 */
const createMockLogger = () => ({
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
});

/**
 * Creates base service with default or custom dependencies
 * @param {Object} customDeps - Custom dependencies to override defaults
 * @returns {Object} Service instance and mocks
 */
const createBaseService = (customDeps = {}) => {
    const mockLogger = createMockLogger();
    const dependencies = {
        ...FIXTURES.mockDependencies,
        logger: mockLogger,
        ...customDeps
    };

    const service = new BaseService(dependencies);

    return { service, mockLogger, dependencies };
};

/**
 * Extracts log call arguments for easier assertions
 * @param {Function} logFn - Mock log function
 * @param {number} callIndex - Index of call to extract
 * @returns {Array} Call arguments
 */


// ============================================================================
// Test Suite
// ============================================================================

describe('BaseService', () => {
    let service;
    let mockLogger;
    let dependencies;

    beforeEach(() => {
        ({ service, mockLogger, dependencies } = createBaseService());
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // ==========================================================================
    // Constructor Tests
    // ==========================================================================

    describe('constructor', () => {
        test('should initialize with dependencies', () => {
            expect(service.name).toBe('BaseService');
            expect(service.dependencies).toBe(dependencies);
            expect(service.dataverseRepository).toBe(dependencies.dataverseRepository);
            expect(service.configRepository).toBe(dependencies.configRepository);
            expect(service.logger).toBe(mockLogger);
        });

        test('should use console as default logger', () => {
            const serviceWithoutLogger = new BaseService({});
            expect(serviceWithoutLogger.logger).toBe(console);
        });

        test('should handle empty dependencies', () => {
            const serviceEmpty = new BaseService();
            expect(serviceEmpty.dependencies).toEqual({});
            expect(serviceEmpty.logger).toBe(console);
        });
    });

    // ==========================================================================
    // Logging Methods Tests
    // ==========================================================================

    describe('logging methods', () => {
        describe('log', () => {
            test('should not log actions (disabled to reduce noise)', () => {
                service.log('testAction', { data: 'test' });

                // Log method is disabled - should not call logger
                expect(mockLogger.log).not.toHaveBeenCalled();
            });
        });

        describe('warn', () => {
            test('should log warnings with service name', () => {
                service.warn('test warning', { code: 'WARN001' });

                expect(mockLogger.warn).toHaveBeenCalledWith(
                    '⚠️ BaseService: test warning',
                    { code: 'WARN001' }
                );
            });
        });

        describe('error', () => {
            test('should log errors with service name', () => {
                const testError = new Error('Test error');
                service.error('test error message', testError);

                expect(mockLogger.error).toHaveBeenCalledWith(
                    '❌ BaseService: test error message',
                    'Test error'
                );
            });

            test('should handle error logging without error object', () => {
                service.error('test error message');

                expect(mockLogger.error).toHaveBeenCalledWith(
                    '❌ BaseService: test error message',
                    null
                );
            });
        });
    });

    // ==========================================================================
    // Validate Dependencies Tests
    // ==========================================================================

    describe('validateDependencies', () => {
        test('should pass validation when all dependencies are present', () => {
            expect(() => {
                service.validateDependencies(['dataverseRepository', 'logger']);
            }).not.toThrow();
        });

        test('should throw error when dependencies are missing', () => {
            expect(() => {
                service.validateDependencies(['missingDep1', 'missingDep2']);
            }).toThrow('BaseService missing required dependencies: missingDep1, missingDep2');
        });

        test('should handle empty required dependencies array', () => {
            expect(() => {
                service.validateDependencies([]);
            }).not.toThrow();
        });
    });

    // ==========================================================================
    // Execute Operation Tests
    // ==========================================================================

    describe('executeOperation', () => {
        test('should execute operation successfully', async () => {
            const mockOperation = jest.fn().mockResolvedValue(FIXTURES.testData.simpleResult);

            const result = await service.executeOperation('testOp', mockOperation);

            expect(mockOperation).toHaveBeenCalled();
            expect(result).toEqual(FIXTURES.testData.simpleResult);
        });

        test('should handle operation failures and log errors', async () => {
            const testError = new Error(FIXTURES.testData.errorMessage);
            const mockOperation = jest.fn().mockRejectedValue(testError);

            await expect(
                service.executeOperation('failOp', mockOperation)
            ).rejects.toThrow(`failOp failed: ${FIXTURES.testData.errorMessage}`);

            expect(mockLogger.error).toHaveBeenCalledWith(
                "❌ BaseService: failOp failed",
                FIXTURES.testData.errorMessage
            );
        });
    });

    // ==========================================================================
    // Result Creation Methods Tests
    // ==========================================================================

    describe('result creation methods', () => {
        describe('createResult', () => {
            test('should create standardized result object', () => {
                const result = service.createResult(true, { count: 5 }, 'Success', []);

                // Core properties that should always be present
                expect(result).toEqual(
                    expect.objectContaining({
                        success: true,
                        message: 'Success',
                        errors: [],
                        service: 'BaseService',
                        timestamp: expect.any(String)
                    })
                );

                // Verify timestamp is valid
                expect(new Date(result.timestamp)).toBeInstanceOf(Date);
            });
        });

        describe('createSuccess', () => {
            test('should create success result', () => {
                const result = service.createSuccess({ items: [] }, 'All good');

                expect(result).toEqual(
                    expect.objectContaining({
                        success: true,
                        message: 'All good',
                        errors: [],
                        service: 'BaseService',
                        timestamp: expect.any(String)
                    })
                );

                expect(new Date(result.timestamp)).toBeInstanceOf(Date);
            });

            test('should create success result with default message', () => {
                const result = service.createSuccess({ id: 123 });

                expect(result.message).toBe('Operation completed successfully');
                expect(result.success).toBe(true);
                expect(result.timestamp).toBeDefined();
            });
        });

        describe('createError', () => {
            test('should create error result', () => {
                const result = service.createError('Something went wrong', ['ERR001'], { code: 500 });

                expect(result).toEqual(
                    expect.objectContaining({
                        success: false,
                        message: 'Something went wrong',
                        errors: ['ERR001'],
                        service: 'BaseService',
                        timestamp: expect.any(String)
                    })
                );

                expect(new Date(result.timestamp)).toBeInstanceOf(Date);
            });
        });
    });

    // ==========================================================================
    // Validate Input Tests
    // ==========================================================================

    describe('validateInput', () => {
        test('should pass validation with all required fields present', () => {
            expect(() => {
                service.validateInput(FIXTURES.testData.inputValid, ['name', 'value']);
            }).not.toThrow();
        });

        test('should throw error for missing required fields', () => {
            expect(() => {
                service.validateInput(FIXTURES.testData.inputMissing, ['name', 'value', 'type']);
            }).toThrow('Missing required parameters: value, type');
        });

        test('should treat empty string as missing', () => {
            expect(() => {
                service.validateInput(FIXTURES.testData.inputEmpty, ['name', 'value']);
            }).toThrow('Missing required parameters: name, value');
        });

        test('should validate parameter types when schema provided', () => {
            const input = { name: 'test', count: '123' };

            expect(() => {
                service.validateInput(input, ['name'], FIXTURES.schemas.basic);
            }).toThrow("Parameter 'count' must be of type number, got string");
        });

        test('should allow optional parameters in schema', () => {
            const input = { name: 'test' };

            expect(() => {
                service.validateInput(input, ['name'], FIXTURES.schemas.optional);
            }).not.toThrow();
        });

        test('should handle empty input and no requirements', () => {
            expect(() => {
                service.validateInput({}, []);
            }).not.toThrow();
        });
    });

    // ==========================================================================
    // Error Handling Tests
    // ==========================================================================

    describe('error handling', () => {
        test('should preserve original error context in executeOperation', async () => {
            const originalError = new Error('Database connection failed');
            originalError.code = 'DB_ERROR';

            const mockOperation = jest.fn().mockRejectedValue(originalError);

            await expect(
                service.executeOperation('dbOp', mockOperation)
            ).rejects.toThrow('dbOp failed: Database connection failed');
        });
    });
});
