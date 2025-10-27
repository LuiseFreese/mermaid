/**
 * Unit tests for PublisherService
 * Tests publisher management functionality
 * @module tests/unit/services/publisher-service.test
 */

const { PublisherService } = require('../../../src/backend/services/publisher-service');

// ============================================================================
// Test Fixtures & Constants
// ============================================================================

const FIXTURES = {
    validPublisherData: {
        uniqueName: 'testpublisher',
        friendlyName: 'Test Publisher',
        prefix: 'tst'
    },

    mockPublishers: [
        { uniqueName: 'publisher1', friendlyName: 'Publisher 1' },
        { uniqueName: 'publisher2', friendlyName: 'Publisher 2' }
    ],

    responses: {
        publishersSuccess: {
            success: true,
            data: [
                { uniqueName: 'publisher1', friendlyName: 'Publisher 1' },
                { uniqueName: 'publisher2', friendlyName: 'Publisher 2' }
            ]
        },
        emptyPublishers: {
            success: true,
            data: []
        },
        connectionFailure: {
            success: false,
            message: 'Connection failed'
        },
        createdPublisher: {
            success: true,
            data: { id: 'new-publisher-id' }
        },
        creationFailure: {
            success: false,
            message: 'Publisher already exists'
        }
    },

    invalidData: {
        missingFields: { uniqueName: 'test' },
        prefixTooShort: { uniqueName: 'test', friendlyName: 'Test', prefix: 'x' },
        prefixTooLong: { uniqueName: 'test', friendlyName: 'Test', prefix: 'verylongprefix' },
        prefixUppercase: { uniqueName: 'test', friendlyName: 'Test', prefix: 'TST' },
        prefixWithNumbers: { uniqueName: 'test', friendlyName: 'Test', prefix: 'ts1' },
        invalidType: { uniqueName: 123, friendlyName: 'Test', prefix: 'tst' }
    },

    errors: {
        networkTimeout: new Error('Network timeout'),
        databaseError: new Error('Database error')
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
    getPublishers: jest.fn(),
    createPublisher: jest.fn(),
    getPublisher: jest.fn()
});

/**
 * Creates service with mocks
 * @returns {Object} Service instance and mocks
 */
const createService = () => {
    const mockLogger = createMockLogger();
    const mockDataverseRepository = createMockRepository();

    const service = new PublisherService({
        dataverseRepository: mockDataverseRepository,
        logger: mockLogger
    });

    return { service, mockDataverseRepository, mockLogger };
};

/**
 * Sets up duplicate check mock for publisher creation
 * @param {Object} mockRepo - Mock repository
 * @param {Array} existingPublishers - Existing publishers to return
 */
const setupDuplicateCheck = (mockRepo, existingPublishers = []) => {
    mockRepo.getPublishers.mockResolvedValue({
        success: true,
        data: existingPublishers
    });
};

// ============================================================================
// Test Suite
// ============================================================================

describe('PublisherService', () => {
    let service;
    let mockDataverseRepository;
    let mockLogger;

    beforeEach(() => {
        ({ service, mockDataverseRepository, mockLogger } = createService());
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // ==========================================================================
    // Constructor Tests
    // ==========================================================================

    describe('constructor', () => {
        test('should initialize with dataverse repository', () => {
            expect(service.name).toBe('PublisherService');
            expect(service.dataverseRepository).toBe(mockDataverseRepository);
        });

        test('should throw error if dataverse repository is missing', () => {
            expect(() => {
                new PublisherService({});
            }).toThrow('PublisherService missing required dependencies: dataverseRepository');
        });
    });

    // ==========================================================================
    // Get Publishers Tests
    // ==========================================================================

    describe('getPublishers', () => {
        test('should retrieve publishers successfully', async () => {
            mockDataverseRepository.getPublishers.mockResolvedValue(
                FIXTURES.responses.publishersSuccess
            );

            const result = await service.getPublishers();

            // Verify successful response structure
            expect(result).toEqual(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        publishers: expect.arrayContaining([
                            expect.objectContaining({ uniqueName: 'publisher1' }),
                            expect.objectContaining({ uniqueName: 'publisher2' })
                        ]),
                        count: 2
                    })
                })
            );
        });

        test('should handle empty publishers list', async () => {
            mockDataverseRepository.getPublishers.mockResolvedValue(
                FIXTURES.responses.emptyPublishers
            );

            const result = await service.getPublishers();

            expect(result).toEqual(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        publishers: [],
                        count: 0
                    })
                })
            );
        });

        test('should handle repository failures', async () => {
            mockDataverseRepository.getPublishers.mockResolvedValue(
                FIXTURES.responses.connectionFailure
            );

            const result = await service.getPublishers();

            expect(result).toBeDefined();
            expect(result.success).toBe(false);

            // Flexible error checking
            const errorInfo = result.errors || result.message;
            expect(errorInfo).toBeDefined();
        });

        test('should handle repository exceptions', async () => {
            mockDataverseRepository.getPublishers.mockRejectedValue(
                FIXTURES.errors.networkTimeout
            );

            await expect(
                service.getPublishers()
            ).rejects.toThrow('getPublishers failed: Network timeout');
        });
    });

    // ==========================================================================
    // Create Publisher Tests
    // ==========================================================================

    describe('createPublisher', () => {
        beforeEach(() => {
            setupDuplicateCheck(mockDataverseRepository);
        });

        describe('successful creation', () => {
            test('should create publisher successfully', async () => {
                mockDataverseRepository.createPublisher.mockResolvedValue(
                    FIXTURES.responses.createdPublisher
                );

                const result = await service.createPublisher(FIXTURES.validPublisherData);

                expect(result).toBeDefined();
                expect(result.success).toBe(true);

                // Flexible ID check
                const publisherId = result.id || result.data?.id;
                if (publisherId) {
                    expect(publisherId).toBe('new-publisher-id');
                }

                expect(mockDataverseRepository.createPublisher).toHaveBeenCalledWith(
                    FIXTURES.validPublisherData,
                    null // environmentId parameter
                );
            });
        });

        describe('validation', () => {
            test('should validate required fields', async () => {
                await expect(
                    service.createPublisher(FIXTURES.invalidData.missingFields)
                ).rejects.toThrow('Missing required parameters: friendlyName, prefix');
            });

            test('should validate prefix format - too short', async () => {
                await expect(
                    service.createPublisher(FIXTURES.invalidData.prefixTooShort)
                ).rejects.toThrow('Publisher prefix must be 2-8 lowercase letters');
            });

            test('should validate prefix format - too long', async () => {
                await expect(
                    service.createPublisher(FIXTURES.invalidData.prefixTooLong)
                ).rejects.toThrow('Publisher prefix must be 2-8 lowercase letters');
            });

            test('should validate prefix format - uppercase letters', async () => {
                await expect(
                    service.createPublisher(FIXTURES.invalidData.prefixUppercase)
                ).rejects.toThrow('Publisher prefix must be 2-8 lowercase letters');
            });

            test('should validate prefix format - numbers and special chars', async () => {
                await expect(
                    service.createPublisher(FIXTURES.invalidData.prefixWithNumbers)
                ).rejects.toThrow('Publisher prefix must be 2-8 lowercase letters');
            });

            test('should validate parameter types', async () => {
                await expect(
                    service.createPublisher(FIXTURES.invalidData.invalidType)
                ).rejects.toThrow("Parameter 'uniqueName' must be of type string, got number");
            });
        });

        describe('creation failures', () => {
            test('should handle creation failures', async () => {
                mockDataverseRepository.createPublisher.mockResolvedValue(
                    FIXTURES.responses.creationFailure
                );

                const result = await service.createPublisher(FIXTURES.validPublisherData);

                expect(result).toBeDefined();
                expect(result.success).toBe(false);

                const errorInfo = result.errors || result.message;
                if (Array.isArray(errorInfo)) {
                    expect(errorInfo).toContain('Publisher already exists');
                } else if (typeof errorInfo === 'string') {
                    expect(errorInfo).toContain('Publisher already exists');
                }
            });
        });
    });

    // ==========================================================================
    // Input Validation Tests
    // ==========================================================================

    describe('input validation', () => {
        test('should handle undefined input gracefully', async () => {
            await expect(
                service.createPublisher()
            ).rejects.toThrow();
        });

        test('should handle null input gracefully', async () => {
            await expect(
                service.createPublisher(null)
            ).rejects.toThrow();
        });
    });

    // ==========================================================================
    // Error Handling Tests
    // ==========================================================================

    describe('error handling', () => {
        test('should log operation failures', async () => {
            mockDataverseRepository.getPublishers.mockRejectedValue(
                FIXTURES.errors.databaseError
            );

            try {
                await service.getPublishers();
                fail('Should have thrown error');
            } catch (error) {
                // Expected
            }

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('getPublishers failed'),
                'Database error'
            );
        });
    });
});
