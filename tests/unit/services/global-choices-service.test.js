/**
 * Unit tests for GlobalChoicesService
 * Test global choice set management functionality
 * @module tests/unit/services/global-choices-service.test
 */

const { GlobalChoicesService } = require('../../../src/backend/services/global-choices-service');

// ============================================================================
// Test Fixtures & Constants
// ============================================================================

const FIXTURES = {
    validChoiceData: {
        name: 'test_choice',
        displayName: 'Test Choice',
        options: [
            { label: 'Option 1', value: 1 },
            { label: 'Option 2', value: 2 }
        ]
    },

    mockChoices: {
        success: true,
        data: {
            all: [
                { LogicalName: 'choice1', Name: 'Choice 1' },
                { LogicalName: 'choice2', Name: 'Choice 2' }
            ]
        }
    },

    emptyChoices: {
        success: true,
        data: { all: [] }
    },

    failureResponse: {
        success: false,
        message: 'Connection failed'
    },

    createdChoice: {
        success: true,
        data: { id: 'new-choice-id' }
    },

    queryOptions: {
        default: {
            includeBuiltIn: true,
            includeCustom: true,
            limit: undefined,
            filter: undefined
        },
        custom: {
            includeBuiltIn: false,
            includeCustom: true,
            limit: 10,
            filter: 'test'
        }
    },

    invalidData: {
        missingOptions: { name: 'test' },
        invalidOptionsType: { name: 'test_choice', options: 'not an array' },
        emptyOptions: { name: 'test_choice', options: [] },
        missingLabel: { name: 'test_choice', options: [{ value: 1 }] },
        invalidValue: { name: 'test_choice', options: [{ label: 'Test', value: 'not a number' }] }
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
 * Creates mock repository with default implementations
 * @returns {Object} Mock repository
 */
const createMockRepository = () => ({
    getGlobalChoiceSets: jest.fn(),
    createGlobalChoiceSet: jest.fn(),
    getGlobalChoiceSet: jest.fn(),
    addGlobalChoicesToSolution: jest.fn()
});

/**
 * Creates a mock environment manager
 * @returns {Object} Mock environment manager
 */
const createMockEnvironmentManager = () => ({
    getEnvironmentConfig: jest.fn((envId) => ({
        serverUrl: `https://test-${envId || 'default'}.crm4.dynamics.com`,
        dataverseUrl: `https://test-${envId || 'default'}.crm4.dynamics.com`,
        tenantId: 'test-tenant-id',
        clientId: 'test-client-id',
        useManagedIdentity: true
    })),
    getEnvironment: jest.fn(),
    initialize: jest.fn().mockResolvedValue(undefined)
});

/**
 * Creates service with mocks
 * @returns {Object} Service instance and mocks
 */
const createService = () => {
    const mockLogger = createMockLogger();
    const mockDataverseRepository = createMockRepository();
    const mockEnvironmentManager = createMockEnvironmentManager();

    const service = new GlobalChoicesService({
        dataverseRepository: mockDataverseRepository,
        environmentManager: mockEnvironmentManager,
        logger: mockLogger
    });

    return { service, mockDataverseRepository, mockEnvironmentManager, mockLogger };
};

/**
 * Sets up successful duplicate check mock
 * @param {Object} mockRepo - Mock repository
 * @param {Array} existingChoices - Existing choices to return
 */
const setupDuplicateCheck = (mockRepo, existingChoices = []) => {
    mockRepo.getGlobalChoiceSets.mockResolvedValue({
        success: true,
        data: { all: existingChoices }
    });
};

// ============================================================================
// Test Suite
// ============================================================================

describe('GlobalChoicesService', () => {
    let service;
    let mockDataverseRepository;
    let mockEnvironmentManager;
    let mockLogger;

    beforeEach(() => {
        ({ service, mockDataverseRepository, mockEnvironmentManager, mockLogger } = createService());
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // ==========================================================================
    // Constructor Tests
    // ==========================================================================

    describe('constructor', () => {
        test('should initialize with dataverse repository', () => {
            expect(service.name).toBe('GlobalChoicesService');
            expect(service.dataverseRepository).toBe(mockDataverseRepository);
        });

        test('should throw error if dataverse repository is missing', () => {
            expect(() => {
                new GlobalChoicesService({});
            }).toThrow('GlobalChoicesService missing required dependencies: dataverseRepository');
        });
    });

    // ==========================================================================
    // Get Global Choices Tests
    // ==========================================================================

    describe('getGlobalChoices', () => {
        test('should retrieve global choices with default options', async () => {
            mockDataverseRepository.getGlobalChoiceSets.mockResolvedValue(FIXTURES.mockChoices);

            const result = await service.getGlobalChoices();

            // Verify successful completion
            expect(result).toBeDefined();
            expect(result.success).toBe(true);

            // Verify repository was called with correct options (queryOptions, config)
            expect(mockDataverseRepository.getGlobalChoiceSets).toHaveBeenCalledWith(
                FIXTURES.queryOptions.default,
                null  // config is null when no environmentId provided
            );

            // Verify choices were returned (flexible structure check)
            expect(
                result.all || result.data?.all || result.choices
            ).toBeDefined();
        });

        test('should handle custom query options', async () => {
            mockDataverseRepository.getGlobalChoiceSets.mockResolvedValue(FIXTURES.emptyChoices);

            const result = await service.getGlobalChoices(FIXTURES.queryOptions.custom);

            expect(result).toBeDefined();
            expect(mockDataverseRepository.getGlobalChoiceSets).toHaveBeenCalledWith(
                FIXTURES.queryOptions.custom,
                null  // config is null when no environmentId provided
            );
        });

        test('should handle repository failures', async () => {
            mockDataverseRepository.getGlobalChoiceSets.mockResolvedValue(FIXTURES.failureResponse);

            const result = await service.getGlobalChoices();

            expect(result).toBeDefined();
            expect(result.success).toBe(false);

            // Check that error information is present
            expect(
                result.errors || result.message || result.error
            ).toBeDefined();
        });
    });

    // ==========================================================================
    // Create Custom Global Choice Tests
    // ==========================================================================

    describe('createCustomGlobalChoice', () => {
        beforeEach(() => {
            setupDuplicateCheck(mockDataverseRepository);
        });

        describe('successful creation', () => {
            test('should create custom global choice successfully', async () => {
                mockDataverseRepository.createGlobalChoiceSet.mockResolvedValue(FIXTURES.createdChoice);

                const result = await service.createCustomGlobalChoice(FIXTURES.validChoiceData);

                // Verify successful completion
                expect(result).toBeDefined();
                expect(result.success).toBe(true);

                // Verify the repository was called correctly
                expect(mockDataverseRepository.createGlobalChoiceSet).toHaveBeenCalledWith(
                    FIXTURES.validChoiceData
                );

                // Verify that some form of ID was returned (flexible check)
                expect(
                    result.id || result.data?.id || result.choiceId || result.data
                ).toBeDefined();
            });
        });

        describe('validation', () => {
            test('should validate required fields', async () => {
                await expect(
                    service.createCustomGlobalChoice(FIXTURES.invalidData.missingOptions)
                ).rejects.toThrow('Missing required parameters: options');
            });

            test('should validate options array type', async () => {
                await expect(
                    service.createCustomGlobalChoice(FIXTURES.invalidData.invalidOptionsType)
                ).rejects.toThrow("Parameter 'options' must be of type object, got string");
            });

            test('should validate empty options array', async () => {
                await expect(
                    service.createCustomGlobalChoice(FIXTURES.invalidData.emptyOptions)
                ).rejects.toThrow('Options must be a non-empty array');
            });

            test('should validate option structure', async () => {
                await expect(
                    service.createCustomGlobalChoice(FIXTURES.invalidData.missingLabel)
                ).rejects.toThrow('Option at index 0 must have a string label');
            });

            test('should validate option value type', async () => {
                await expect(
                    service.createCustomGlobalChoice(FIXTURES.invalidData.invalidValue)
                ).rejects.toThrow('Option at index 0 value must be a number if provided');
            });
        });

        describe('duplicate detection', () => {
            test('should check for duplicate choice names', async () => {
                setupDuplicateCheck(mockDataverseRepository, [
                    { LogicalName: 'test_choice', Name: 'Test Choice' }
                ]);

                await expect(
                    service.createCustomGlobalChoice(FIXTURES.validChoiceData)
                ).rejects.toThrow("Global choice set with name 'test_choice' already exists");
            });
        });

        describe('creation failures', () => {
            test('should handle creation failures', async () => {
                mockDataverseRepository.createGlobalChoiceSet.mockResolvedValue(
                    FIXTURES.failureResponse
                );

                const result = await service.createCustomGlobalChoice(FIXTURES.validChoiceData);

                expect(result).toBeDefined();
                expect(result.success).toBe(false);

                // Verify that error information is present
                expect(
                    result.errors || result.message || result.error
                ).toBeDefined();
            });
        });
    });

    // ==========================================================================
    // Error Handling Tests
    // ==========================================================================

    describe('error handling', () => {
        test('should handle repository connection errors', async () => {
            mockDataverseRepository.getGlobalChoiceSets.mockRejectedValue(
                new Error('Network timeout')
            );

            await expect(
                service.getGlobalChoices()
            ).rejects.toThrow('getGlobalChoices failed: Network timeout');
        });

        test('should log operation failures', async () => {
            const error = new Error('Database error');
            mockDataverseRepository.getGlobalChoiceSets.mockRejectedValue(error);

            try {
                await service.getGlobalChoices();
                fail('Should have thrown error');
            } catch (err) {
                // Expected
            }

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('getGlobalChoices failed'),
                'Database error'
            );
        });
    });

    // ==========================================================================
    // Input Validation Tests
    // ==========================================================================

    describe('input validation', () => {
        test('should handle undefined input gracefully', async () => {
            await expect(
                service.createCustomGlobalChoice()
            ).rejects.toThrow();
        });

        test('should handle null input gracefully', async () => {
            await expect(
                service.createCustomGlobalChoice(null)
            ).rejects.toThrow();
        });
    });
});
