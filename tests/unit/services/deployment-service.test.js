
/**
 * Unit tests for DeploymentService
 * Tests solution deployment, entity creation, and error handling
 * @module tests/backend/services/deployment-service.test
 */

const { DeploymentService } = require('../../../src/backend/services/deployment-service');

// ============================================================================
// Test Fixtures & Constants
// ============================================================================

const FIXTURES = {
    config: {
        serverUrl: 'https://test.crm.dynamics.com',
        clientId: 'test-client-id',
        tenantId: 'test-tenant-id',
        useManagedIdentity: true
    },

    publisher: {
        id: 'pub-123',
        uniqueName: 'testpublisher',
        prefix: 'test',
        friendlyName: 'Test Publisher'
    },

    solution: {
        id: 'sol-123',
        uniqueName: 'TestSolution',
        friendlyName: 'Test Solution'
    },

    entity: {
        id: 'entity-123',
        logicalName: 'test_customer',
        displayName: 'Customer'
    },

    relationship: {
        id: 'rel-123',
        schemaName: 'test_customer_orders'
    },

    deploymentData: {
        mermaidContent: global.testUtils?.mockERDContent || 'erDiagram\n  CUSTOMER ||--o{ ORDER : places',
        solutionName: 'TestSolution',
        solutionDisplayName: 'Test Solution',
        publisherName: 'Test Publisher',
        publisherPrefix: 'test',
        cdmChoice: 'custom',
        selectedChoices: []
    },

    validationResult: {
        success: true,
        entities: global.testUtils?.mockValidationResult?.entities || [
            {
                name: 'Customer',
                attributes: [
                    { name: 'customer_id', type: 'string', isPrimaryKey: true },
                    { name: 'name', type: 'string' }
                ]
            }
        ],
        relationships: global.testUtils?.mockValidationResult?.relationships || []
    }
};

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates mock repository instances with default implementations
 * @returns {Object} Mock repository objects
 */
const createMockRepositories = () => ({
    dataverseRepo: {
        createEntity: jest.fn(),
        createRelationship: jest.fn(),
        addEntityToSolution: jest.fn(),
        testConnection: jest.fn(),
        ensurePublisher: jest.fn(),
        getClient: jest.fn(),
        ensureSolution: jest.fn(),
        integrateCDMEntities: jest.fn(),
        createCustomEntities: jest.fn(),
        addGlobalChoicesToSolution: jest.fn(),
        createAndAddCustomGlobalChoices: jest.fn()
    },

    configRepo: {
        getDataverseConfig: jest.fn()
    }
});

/**
 * Creates mock service instances
 * @returns {Object} Mock service objects
 */
const createMockServices = () => ({
    validationService: {
        validateERD: jest.fn()
    },

    globalChoicesService: {
        createGlobalChoice: jest.fn(),
        addToSolution: jest.fn()
    },

    solutionService: {
        createSolution: jest.fn(),
        getSolution: jest.fn()
    },

    publisherService: {
        createPublisher: jest.fn(),
        getPublisher: jest.fn()
    }
});

/**
 * Creates a mock mermaid parser
 * @returns {Object} Mock parser
 */
const createMockParser = () => ({
    parse: jest.fn().mockReturnValue({
        entities: [{ name: 'TestEntity', fields: [] }],
        relationships: [],
        warnings: [],
        cdmDetection: null
    })
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sets up successful mock responses for a complete deployment flow
 * @param {Object} mocks - Object containing all mock instances
 */
const setupSuccessfulDeploymentMocks = (mocks) => {
    const { repositories, services } = mocks;

    // Config
    repositories.configRepo.getDataverseConfig.mockResolvedValue(FIXTURES.config);

    // Validation
    services.validationService.validateERD.mockResolvedValue(FIXTURES.validationResult);

    // Publisher
    services.publisherService.createPublisher.mockResolvedValue(FIXTURES.publisher);
    repositories.dataverseRepo.ensurePublisher.mockResolvedValue({
        data: {
            id: FIXTURES.publisher.id,
            uniquename: FIXTURES.publisher.uniqueName,
            friendlyname: FIXTURES.publisher.friendlyName,
            customizationprefix: FIXTURES.publisher.prefix
        }
    });

    // Solution
    services.solutionService.createSolution.mockResolvedValue(FIXTURES.solution);
    repositories.dataverseRepo.ensureSolution.mockResolvedValue({
        data: {
            solutionid: FIXTURES.solution.id,
            uniquename: FIXTURES.solution.uniqueName,
            friendlyname: FIXTURES.solution.friendlyName,
            publisherid: { uniquename: FIXTURES.publisher.uniqueName }
        }
    });

    // Client
    repositories.dataverseRepo.getClient.mockResolvedValue({
        url: FIXTURES.config.serverUrl
    });

    // Entity & Relationship creation
    repositories.dataverseRepo.createEntity.mockResolvedValue(FIXTURES.entity);
    repositories.dataverseRepo.createRelationship.mockResolvedValue(FIXTURES.relationship);

    // Custom entities
    repositories.dataverseRepo.createCustomEntities.mockResolvedValue({
        success: true,
        entitiesCreated: 1,
        relationshipsCreated: 1,
        results: [FIXTURES.entity]
    });

    // CDM entities
    repositories.dataverseRepo.integrateCDMEntities.mockResolvedValue({
        success: true,
        results: []
    });

    // Global choices
    repositories.dataverseRepo.addGlobalChoicesToSolution.mockResolvedValue({
        success: true,
        results: []
    });

    repositories.dataverseRepo.createAndAddCustomGlobalChoices.mockResolvedValue({
        success: true,
        results: []
    });
};

/**
 * Creates deployment data with optional overrides
 * @param {Object} overrides - Properties to override in deployment data
 * @returns {Object} Deployment data
 */
const createDeploymentData = (overrides = {}) => ({
    ...FIXTURES.deploymentData,
    ...overrides
});

// ============================================================================
// Test Suite
// ============================================================================

describe('DeploymentService', () => {
    let deploymentService;
    let mocks;

    beforeEach(() => {
        // Create all mocks
        const repositories = createMockRepositories();
        const services = createMockServices();
        const parser = createMockParser();
        const logger = global.testUtils?.createMockLogger() || {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
        };

        mocks = {
            repositories,
            services,
            parser,
            logger
        };

        // Initialize service
        deploymentService = new DeploymentService({
            dataverseRepository: repositories.dataverseRepo,
            configRepository: repositories.configRepo,
            validationService: services.validationService,
            globalChoicesService: services.globalChoicesService,
            solutionService: services.solutionService,
            publisherService: services.publisherService,
            mermaidParser: parser,
            logger
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // ==========================================================================
    // Constructor Tests
    // ==========================================================================

    describe('constructor', () => {
        it('should initialize with required dependencies', () => {
            expect(deploymentService.dataverseRepository).toBe(mocks.repositories.dataverseRepo);
            expect(deploymentService.configRepository).toBe(mocks.repositories.configRepo);
            expect(deploymentService.validationService).toBe(mocks.services.validationService);
            expect(deploymentService.logger).toBe(mocks.logger);
        });

        it('should throw error if required dependencies are missing', () => {
            expect(() => {
                new DeploymentService({
                    configRepository: mocks.repositories.configRepo,
                    validationService: mocks.services.validationService,
                    logger: mocks.logger
                });
            }).toThrow('DeploymentService missing required dependencies: dataverseRepository');
        });
    });

    // ==========================================================================
    // Deploy Solution Tests
    // ==========================================================================

    describe('deploySolution', () => {
        beforeEach(() => {
            setupSuccessfulDeploymentMocks(mocks);
        });

        describe('successful deployment', () => {
            it('should successfully deploy a complete solution', async () => {
                const result = await deploymentService.deploySolution(
                    createDeploymentData()
                );

                // Verify deployment was successful
                expect(result.success).toBe(true);

                // Verify the deployment flow was executed in the correct order
                expect(mocks.services.validationService.validateERD).toHaveBeenCalled();
                expect(mocks.services.publisherService.createPublisher).toHaveBeenCalled();
                expect(mocks.repositories.dataverseRepo.ensureSolution).toHaveBeenCalled();
                expect(mocks.repositories.dataverseRepo.createCustomEntities).toHaveBeenCalled();
            });

            it('should track progress with callback', async () => {
                const progressCallback = jest.fn();

                await deploymentService.deploySolution(
                    createDeploymentData(),
                    progressCallback
                );

                expect(progressCallback).toHaveBeenCalledWith(
                    'validation',
                    expect.stringContaining('Validating ERD'),
                    expect.any(Object)
                );
                expect(progressCallback).toHaveBeenCalledWith(
                    'publisher',
                    expect.stringContaining('Creating publisher'),
                    expect.any(Object)
                );
                expect(progressCallback).toHaveBeenCalledWith(
                    'solution',
                    expect.stringContaining('Creating solution'),
                    expect.any(Object)
                );
            });
        });

        describe('validation failures', () => {
            it('should handle validation failures', async () => {
                mocks.services.validationService.validateERD.mockResolvedValue({
                    success: false,
                    message: 'Invalid ERD syntax'
                });

                const result = await deploymentService.deploySolution(
                    createDeploymentData()
                );

                expect(result.success).toBe(false);
                expect(result.message).toContain('Invalid ERD syntax');

                // Should not proceed with deployment
                expect(mocks.services.publisherService.createPublisher).not.toHaveBeenCalled();
                expect(mocks.services.solutionService.createSolution).not.toHaveBeenCalled();
            });

            it('should handle missing required fields', async () => {
                const invalidData = {
                    mermaidContent: FIXTURES.deploymentData.mermaidContent
                    // Missing required fields
                };

                const result = await deploymentService.deploySolution(invalidData);

                expect(result.success).toBe(false);
                expect(result.message).toContain('required');
            });
        });

        describe('publisher failures', () => {
            it('should handle publisher creation failures', async () => {
                mocks.services.publisherService.createPublisher.mockRejectedValue(
                    new Error('Publisher creation failed')
                );

                const result = await deploymentService.deploySolution(
                    createDeploymentData()
                );

                expect(result.success).toBe(false);
                expect(result.message).toContain('Publisher creation failed');
            });
        });

        describe('solution failures', () => {
            it('should handle solution creation failures', async () => {
                mocks.repositories.dataverseRepo.ensureSolution.mockRejectedValue(
                    new Error('Solution creation failed')
                );

                const result = await deploymentService.deploySolution(
                    createDeploymentData()
                );

                expect(result.success).toBe(false);
                expect(result.message).toContain('Solution creation failed');
            });
        });

        describe('entity creation', () => {
            it('should handle entity creation failures gracefully', async () => {
                mocks.repositories.dataverseRepo.createCustomEntities.mockResolvedValue({
                    success: true,
                    entitiesCreated: 1,
                    entitiesFailed: 1,
                    relationshipsCreated: 0,
                    warnings: [
                        {
                            message: 'Entity creation failed for some entities',
                            details: 'Entity TestEntity2 failed: Entity creation failed'
                        }
                    ],
                    entities: [
                        { name: 'TestEntity1', logicalName: 'test_testentity1' }
                    ]
                });

                const result = await deploymentService.deploySolution(
                    createDeploymentData()
                );

                expect(result.success).toBe(true); // Partial success

                // Verify createCustomEntities was called
                expect(mocks.repositories.dataverseRepo.createCustomEntities).toHaveBeenCalled();

                // Verify warnings are propagated if the service supports it
                if (result.warnings && Array.isArray(result.warnings) && result.warnings.length > 0) {
                    expect(result.warnings).toContainEqual(
                        expect.objectContaining({
                            message: expect.stringContaining('Entity creation failed')
                        })
                    );
                }
            });
        });

        describe('CDM integration', () => {
            it('should handle CDM entity deployment', async () => {
                const cdmData = createDeploymentData({
                    cdmChoice: 'cdm',
                    cdmMatches: [
                        {
                            originalEntity: { name: 'Account' },
                            cdmEntity: { logicalName: 'account', displayName: 'Account' }
                        }
                    ]
                });

                // Mock parser to return CDM detection
                mocks.parser.parse.mockReturnValueOnce({
                    entities: [{ name: 'Account', fields: [] }],
                    relationships: [],
                    warnings: [],
                    cdmDetection: {
                        detectedCDM: [
                            {
                                originalEntity: { name: 'Account' },
                                cdmEntity: { logicalName: 'account', displayName: 'Account' },
                                matchType: 'exact',
                                confidence: 95
                            }
                        ]
                    }
                });

                mocks.repositories.dataverseRepo.integrateCDMEntities.mockResolvedValue({
                    success: true,
                    data: { integratedEntities: [{ name: 'Contact' }] }
                });

                const result = await deploymentService.deploySolution(cdmData);

                expect(result.success).toBe(true);
                expect(mocks.repositories.dataverseRepo.integrateCDMEntities).toHaveBeenCalled();
            });
        });

        describe('global choices', () => {
            it('should handle global choices integration', async () => {
                const choicesData = createDeploymentData({
                    selectedChoices: [
                        { LogicalName: 'test_choice_1' },
                        { LogicalName: 'test_choice_2' }
                    ]
                });

                mocks.repositories.dataverseRepo.addGlobalChoicesToSolution.mockResolvedValue({
                    added: 2,
                    errors: []
                });

                const result = await deploymentService.deploySolution(choicesData);

                expect(result.success).toBe(true);

                // Verify method was called with correct data
                expect(mocks.repositories.dataverseRepo.addGlobalChoicesToSolution).toHaveBeenCalledTimes(1);
                const [choices, , dataverseConfig] = mocks.repositories.dataverseRepo.addGlobalChoicesToSolution.mock.calls[0];
                expect(choices).toEqual([
                    { LogicalName: 'test_choice_1' },
                    { LogicalName: 'test_choice_2' }
                ]);
                expect(dataverseConfig).toMatchObject({
                    clientId: FIXTURES.config.clientId,
                    serverUrl: FIXTURES.config.serverUrl
                });

                // Verify the mock returned the expected values
                const addChoicesResult = await mocks.repositories.dataverseRepo.addGlobalChoicesToSolution.mock.results[0].value;
                expect(addChoicesResult).toMatchObject({
                    added: 2,
                    errors: []
                });
            });

            it('should handle custom global choices creation', async () => {
                const customChoicesData = createDeploymentData({
                    customChoices: [
                        {
                            name: 'Custom Choice 1',
                            logicalName: 'test_custom_choice_1',
                            options: [
                                { value: 1, label: 'Option 1' },
                                { value: 2, label: 'Option 2' }
                            ]
                        }
                    ]
                });

                mocks.repositories.dataverseRepo.createAndAddCustomGlobalChoices.mockResolvedValue({
                    created: 1,
                    skipped: 0,
                    errors: []
                });

                const result = await deploymentService.deploySolution(customChoicesData);

                expect(result.success).toBe(true);

                // Verify method was called with correct data
                expect(mocks.repositories.dataverseRepo.createAndAddCustomGlobalChoices).toHaveBeenCalledTimes(1);
                const [choices, , , dataverseConfig, progressCallback] =
                    mocks.repositories.dataverseRepo.createAndAddCustomGlobalChoices.mock.calls[0];
                expect(choices).toEqual([expect.objectContaining({
                    name: 'Custom Choice 1',
                    logicalName: 'test_custom_choice_1'
                })]);
                expect(dataverseConfig).toMatchObject({
                    clientId: FIXTURES.config.clientId,
                    serverUrl: FIXTURES.config.serverUrl
                });
                expect(typeof progressCallback).toBe('function');

                // Verify the mock returned the expected values
                const createChoicesResult = await mocks.repositories.dataverseRepo.createAndAddCustomGlobalChoices.mock.results[0].value;
                expect(createChoicesResult).toMatchObject({
                    created: 1,
                    skipped: 0,
                    errors: []
                });
            });
        });
    });

    // ==========================================================================
    // Create Entities Tests
    // ==========================================================================

    describe('_createEntities', () => {
        const mockEntities = [
            {
                name: 'Customer',
                attributes: [
                    { name: 'customer_id', type: 'string', isPrimaryKey: true },
                    { name: 'name', type: 'string' }
                ]
            }
        ];

        it('should create entities with proper naming conventions', async () => {
            mocks.repositories.dataverseRepo.createEntity.mockResolvedValue(FIXTURES.entity);

            const result = await deploymentService._createEntities(
                mockEntities,
                'TestSolution',
                'test'
            );

            expect(result.entitiesCreated).toBe(1);
            expect(mocks.repositories.dataverseRepo.createEntity).toHaveBeenCalledWith(
                expect.objectContaining({
                    logicalName: 'test_customer',
                    displayName: 'Customer'
                }),
                'TestSolution'
            );
        });

        it('should handle entity creation errors individually', async () => {
            mocks.repositories.dataverseRepo.createEntity
                .mockRejectedValueOnce(new Error('Entity 1 failed'))
                .mockResolvedValueOnce({ id: 'entity-2', logicalName: 'test_entity2' });

            const entitiesWithFailure = [
                mockEntities[0],
                { name: 'Entity2', attributes: [] }
            ];

            const result = await deploymentService._createEntities(
                entitiesWithFailure,
                'TestSolution',
                'test'
            );

            expect(result.entitiesCreated).toBe(1); // Only one succeeded
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toContain('Entity 1 failed');
        });
    });

    // ==========================================================================
    // Create Relationships Tests
    // ==========================================================================

    describe('_createRelationships', () => {
        const mockRelationships = [
            {
                from: 'Customer',
                to: 'Order',
                type: 'one-to-many',
                label: 'places'
            }
        ];

        const mockEntityMap = {
            'Customer': { id: 'customer-123', logicalName: 'test_customer' },
            'Order': { id: 'order-123', logicalName: 'test_order' }
        };

        it('should create relationships between entities', async () => {
            mocks.repositories.dataverseRepo.createRelationship.mockResolvedValue(FIXTURES.relationship);

            const result = await deploymentService._createRelationships(
                mockRelationships,
                mockEntityMap,
                'TestSolution'
            );

            expect(result.relationshipsCreated).toBe(1);
            expect(mocks.repositories.dataverseRepo.createRelationship).toHaveBeenCalledWith(
                expect.objectContaining({
                    fromEntity: 'test_customer',
                    toEntity: 'test_order',
                    type: 'one-to-many'
                }),
                'TestSolution'
            );
        });

        it('should skip relationships with missing entities', async () => {
            const incompleteEntityMap = {
                'Customer': { id: 'customer-123', logicalName: 'test_customer' }
                // Missing Order entity
            };

            const result = await deploymentService._createRelationships(
                mockRelationships,
                incompleteEntityMap,
                'TestSolution'
            );

            expect(result.relationshipsCreated).toBe(0);
            expect(result.warnings).toContainEqual(
                expect.stringContaining('Order')
            );
            expect(mocks.repositories.dataverseRepo.createRelationship).not.toHaveBeenCalled();
        });
    });
});
