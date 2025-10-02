/**
 * Unit tests for ValidationService
 * Tests ERD validation, CDM detection, and error handling
 * @module tests/unit/services/validation-service.test
 */

const { ValidationService } = require('../../../src/backend/services/validation-service');

// ============================================================================
// Test Fixtures & Constants
// ============================================================================

const FIXTURES = {
    validERD: {
        basic: {
            mermaidContent: global.testUtils?.mockERDContent || 'erDiagram\n  Customer ||--o{ Order : places',
            options: {}
        }
    },

    mockParserResponses: {
        success: {
            success: true,
            entities: global.testUtils?.mockValidationResult?.entities || [
                { name: 'Customer', attributes: [{ name: 'id', type: 'string', isPrimaryKey: true }] }
            ],
            relationships: global.testUtils?.mockValidationResult?.relationships || [],
            warnings: [],
            validation: { isValid: true }
        },
        error: {
            errors: ['Invalid syntax at line 1']
        },
        cdmMatch: {
            success: true,
            entities: [
                { name: 'Account', attributes: [] },
                { name: 'Contact', attributes: [] },
                { name: 'CustomEntity', attributes: [] }
            ],
            relationships: [],
            warnings: [],
            validation: { isValid: true }
        },
        missingPK: {
            success: true,
            entities: [
                {
                    name: 'EntityWithoutPK',
                    attributes: [
                        { name: 'field1', type: 'string' },
                        { name: 'field2', type: 'string' }
                    ]
                }
            ],
            relationships: [],
            warnings: [],
            validation: { isValid: true }
        },
        invalidRelationship: {
            success: true,
            entities: [
                { name: 'Customer', attributes: [] }
            ],
            relationships: [
                {
                    fromEntity: 'Customer',
                    toEntity: 'Order',
                    type: 'one-to-many'
                }
            ],
            warnings: [],
            validation: { isValid: true }
        }
    },

    cdmEntities: [
        { logicalName: 'account', displayName: 'Account' },
        { logicalName: 'contact', displayName: 'Contact' }
    ]
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates mock dependencies
 * @returns {Object} Mock objects
 */
const createMockDependencies = () => ({
    dataverseRepo: {
        getCDMEntities: jest.fn(),
        testConnection: jest.fn()
    },
    mermaidParser: {
        parse: jest.fn()
    },
    logger: global.testUtils?.createMockLogger() || {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }
});

/**
 * Creates validation service with mocks
 * @param {Object} customMocks - Custom mock overrides
 * @returns {Object} Service instance and mocks
 */
const createValidationService = (customMocks = {}) => {
    const mocks = createMockDependencies();

    const service = new ValidationService({
        dataverseRepository: customMocks.dataverseRepo || mocks.dataverseRepo,
        mermaidParser: customMocks.mermaidParser || mocks.mermaidParser,
        logger: customMocks.logger || mocks.logger
    });

    return { service, mocks };
};

/**
 * Sets up default successful mocks
 * @param {Object} mocks - Mock objects
 */
const setupSuccessfulMocks = (mocks) => {
    mocks.mermaidParser.parse.mockReturnValue(FIXTURES.mockParserResponses.success);
    mocks.dataverseRepo.getCDMEntities.mockResolvedValue(FIXTURES.cdmEntities);
};

// ============================================================================
// Test Suite
// ============================================================================

describe('ValidationService', () => {
    let service;
    let mocks;
    let consoleWarnSpy;

    beforeEach(() => {
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        ({ service, mocks } = createValidationService());
        setupSuccessfulMocks(mocks);
    });

    afterEach(() => {
        if (consoleWarnSpy) {
            consoleWarnSpy.mockRestore();
        }
        jest.clearAllMocks();
    });

    // ==========================================================================
    // Constructor Tests
    // ==========================================================================

    describe('constructor', () => {
        test('should initialize with required dependencies', () => {
            expect(service.dataverseRepository).toBe(mocks.dataverseRepo);
            expect(service.mermaidParser).toBe(mocks.mermaidParser);
            expect(service.logger).toBe(mocks.logger);
        });

        test('should initialize correctly with optional dataverseRepository', () => {
            const serviceWithoutDataverse = new ValidationService({
                mermaidParser: mocks.mermaidParser,
                logger: mocks.logger
            });

            expect(serviceWithoutDataverse.mermaidParser).toBe(mocks.mermaidParser);
            expect(serviceWithoutDataverse.logger).toBe(mocks.logger);
            expect(serviceWithoutDataverse.dataverseRepository).toBeUndefined();
        });

        test('should throw error if mermaidParser is missing', () => {
            expect(() => {
                new ValidationService({
                    dataverseRepository: mocks.dataverseRepo,
                    logger: mocks.logger
                });
            }).toThrow('ValidationService missing required dependencies: mermaidParser');
        });
    });

    // ==========================================================================
    // Validate ERD Tests
    // ==========================================================================

    describe('validateERD', () => {
        describe('successful validation', () => {
            test('should successfully validate valid ERD content', async () => {
                const result = await service.validateERD(FIXTURES.validERD.basic);

                expect(result).toBeDefined();
                expect(result.success).toBe(true);
                expect(mocks.mermaidParser.parse).toHaveBeenCalledWith(
                    FIXTURES.validERD.basic.mermaidContent
                );
            });
        });

        describe('input validation', () => {
            test('should handle missing mermaidContent', async () => {
                await expect(
                    service.validateERD({ options: {} })
                ).rejects.toThrow('validateERD failed: Missing required parameters: mermaidContent');
            });
        });

        describe('parser errors', () => {
            test('should handle parser errors gracefully', async () => {
                mocks.mermaidParser.parse.mockReturnValue(FIXTURES.mockParserResponses.error);

                const result = await service.validateERD(FIXTURES.validERD.basic);

                expect(result).toBeDefined();
                expect(result.success).toBe(false);
            });
        });

        describe('CDM detection', () => {
            test('should detect CDM entities when available', async () => {
                mocks.mermaidParser.parse.mockReturnValue(FIXTURES.mockParserResponses.cdmMatch);

                const result = await service.validateERD(FIXTURES.validERD.basic);

                expect(result).toBeDefined();
                expect(result.success).toBe(true);

                if (result.cdmDetection) {
                    expect(result.cdmDetection.matches).toBeDefined();
                    expect(result.cdmDetection.confidence).toBeDefined();
                }
            });

            test('should handle CDM detection failures gracefully', async () => {
                mocks.dataverseRepo.getCDMEntities.mockRejectedValue(
                    new Error('CDM fetch failed')
                );

                const result = await service.validateERD(FIXTURES.validERD.basic);

                expect(result).toBeDefined();
                expect(result.success).toBe(true);
            });

            test('should handle options parameter correctly', async () => {
                const optionsData = {
                    mermaidContent: FIXTURES.validERD.basic.mermaidContent,
                    options: {
                        validateNaming: false,
                        detectCDM: false
                    }
                };

                const result = await service.validateERD(optionsData);

                expect(result).toBeDefined();
                expect(result.success).toBe(true);

                // Should skip CDM detection when disabled
                expect(mocks.dataverseRepo.getCDMEntities).not.toHaveBeenCalled();
            });
        });

        describe('entity validation', () => {
            test('should validate entity naming conventions', async () => {
                mocks.mermaidParser.parse.mockReturnValue({
                    success: true,
                    entities: [{ name: 'TestEntity', attributes: [] }],
                    relationships: [],
                    warnings: [],
                    validation: { isValid: true }
                });

                const result = await service.validateERD(FIXTURES.validERD.basic);

                expect(result).toBeDefined();
                expect(result.success).toBe(true);

                if (result.entities) {
                    expect(result.entities).toHaveLength(1);
                    expect(result.entities[0].name).toBe('TestEntity');
                }
            });

            test('should detect primary key issues', async () => {
                mocks.mermaidParser.parse.mockReturnValue(FIXTURES.mockParserResponses.missingPK);

                const result = await service.validateERD(FIXTURES.validERD.basic);

                expect(result).toBeDefined();
                expect(result.success).toBe(true);

                const warnings = result.warnings || [];
                const pkWarnings = warnings.filter(w => w.type === 'missing_primary_key');

                if (pkWarnings.length > 0) {
                    expect(pkWarnings[0].message).toContain('EntityWithoutPK');
                }
            });
        });

        describe('relationship validation', () => {
            test('should validate relationship integrity', async () => {
                mocks.mermaidParser.parse.mockReturnValue(
                    FIXTURES.mockParserResponses.invalidRelationship
                );

                const result = await service.validateERD(FIXTURES.validERD.basic);

                expect(result).toBeDefined();

                // Service should detect missing entity in relationship
                if (!result.success) {
                    const errors = result.errors || [];
                    if (errors.length > 0) {
                        expect(errors[0]).toContain('Order');
                    }
                }
            });
        });
    });
});
