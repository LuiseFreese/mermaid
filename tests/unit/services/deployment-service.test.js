/**
 * Unit tests for DeploymentService
 * Tests solution deployment, entity creation, and error handling
 */

const { DeploymentService } = require('../../../src/backend/services/deployment-service');

describe('DeploymentService', () => {
  let deploymentService;
  let mockDataverseRepo;
  let mockConfigRepo;
  let mockValidationService;
  let mockGlobalChoicesService;
  let mockSolutionService;
  let mockPublisherService;
  let mockMermaidParser;
  let mockLogger;

  beforeEach(() => {
    // Create mock dependencies
    mockDataverseRepo = {
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
    };

    mockConfigRepo = {
      getDataverseConfig: jest.fn()
    };

    mockValidationService = {
      validateERD: jest.fn()
    };

    mockGlobalChoicesService = {
      createGlobalChoice: jest.fn(),
      addToSolution: jest.fn()
    };

    mockSolutionService = {
      createSolution: jest.fn(),
      getSolution: jest.fn()
    };

    mockPublisherService = {
      createPublisher: jest.fn(),
      getPublisher: jest.fn()
    };

    mockLogger = global.testUtils.createMockLogger();

    // Mock mermaid parser
    mockMermaidParser = {
      parse: jest.fn().mockReturnValue({
        entities: [
          { name: 'TestEntity', fields: [] }
        ],
        relationships: [],
        warnings: [],
        cdmDetection: null
      })
    };

    // Initialize service with mocks
    deploymentService = new DeploymentService({
      dataverseRepository: mockDataverseRepo,
      configRepository: mockConfigRepo,
      validationService: mockValidationService,
      globalChoicesService: mockGlobalChoicesService,
      solutionService: mockSolutionService,
      publisherService: mockPublisherService,
      mermaidParser: mockMermaidParser,
      logger: mockLogger
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with required dependencies', () => {
      expect(deploymentService.dataverseRepository).toBe(mockDataverseRepo);
      expect(deploymentService.configRepository).toBe(mockConfigRepo);
      expect(deploymentService.validationService).toBe(mockValidationService);
      expect(deploymentService.logger).toBe(mockLogger);
    });

    it('should throw error if required dependencies are missing', () => {
      expect(() => {
        new DeploymentService({
          configRepository: mockConfigRepo,
          validationService: mockValidationService,
          logger: mockLogger
        });
      }).toThrow('DeploymentService missing required dependencies: dataverseRepository');
    });
  });

  describe('deploySolution', () => {
    const validDeploymentData = {
      mermaidContent: global.testUtils.mockERDContent,
      solutionName: 'TestSolution',
      solutionDisplayName: 'Test Solution',
      publisherName: 'Test Publisher',
      publisherPrefix: 'test',
      cdmChoice: 'custom',
      selectedChoices: []
    };

    beforeEach(() => {
      // Setup default mock responses
      mockConfigRepo.getDataverseConfig.mockResolvedValue({
        serverUrl: 'https://test.crm.dynamics.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        tenantId: 'test-tenant-id'
      });

      mockValidationService.validateERD.mockResolvedValue({
        success: true,
        entities: global.testUtils.mockValidationResult.entities,
        relationships: global.testUtils.mockValidationResult.relationships
      });

      mockPublisherService.createPublisher.mockResolvedValue({
        id: 'pub-123',
        uniqueName: 'testpublisher',
        prefix: 'test'
      });

      mockSolutionService.createSolution.mockResolvedValue({
        id: 'sol-123',
        uniqueName: 'TestSolution',
        friendlyName: 'Test Solution'
      });

      mockDataverseRepo.createEntity.mockResolvedValue({
        id: 'entity-123',
        logicalName: 'test_customer'
      });

      mockDataverseRepo.createRelationship.mockResolvedValue({
        id: 'rel-123',
        schemaName: 'test_customer_orders'
      });

      // Mock the additional dataverse repository methods
      mockDataverseRepo.ensurePublisher.mockResolvedValue({
        data: {
          id: 'pub-123',
          uniquename: 'testpublisher',
          friendlyname: 'Test Publisher',
          customizationprefix: 'test'
        }
      });

      mockDataverseRepo.ensureSolution.mockResolvedValue({
        data: {
          solutionid: 'sol-123',
          uniquename: 'TestSolution',
          friendlyname: 'Test Solution',
          publisherid: { uniquename: 'testpublisher' }
        }
      });

      mockDataverseRepo.getClient.mockResolvedValue({
        url: 'https://test.crm.dynamics.com'
      });

      mockDataverseRepo.integrateCDMEntities.mockResolvedValue({
        success: true,
        results: []
      });

      mockDataverseRepo.createCustomEntities.mockResolvedValue({
        success: true,
        entitiesCreated: 1,
        relationshipsCreated: 1,
        results: [
          { id: 'entity-123', logicalName: 'test_customer' }
        ]
      });

      mockDataverseRepo.addGlobalChoicesToSolution.mockResolvedValue({
        success: true,
        results: []
      });

      mockDataverseRepo.createAndAddCustomGlobalChoices.mockResolvedValue({
        success: true,
        results: []
      });
    });

    it('should successfully deploy a complete solution', async () => {
      const result = await deploymentService.deploySolution(validDeploymentData);

      console.log('🔧 DEBUG: Deployment result:', JSON.stringify(result, null, 2));
      expect(result.success).toBe(true);
      expect(result.entitiesCreated).toBeGreaterThan(0);
      expect(result.relationshipsCreated).toBeGreaterThan(0);
      
      // Verify the deployment flow
      expect(mockValidationService.validateERD).toHaveBeenCalled();
      expect(mockPublisherService.createPublisher).toHaveBeenCalled();
      expect(mockDataverseRepo.ensureSolution).toHaveBeenCalled();
      expect(mockDataverseRepo.createCustomEntities).toHaveBeenCalled();
    });

    it('should handle validation failures', async () => {
      mockValidationService.validateERD.mockResolvedValue({
        success: false,
        message: 'Invalid ERD syntax'
      });

      const result = await deploymentService.deploySolution(validDeploymentData);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid ERD syntax');
      
      // Should not proceed with deployment
      expect(mockPublisherService.createPublisher).not.toHaveBeenCalled();
      expect(mockSolutionService.createSolution).not.toHaveBeenCalled();
    });

    it('should handle missing required fields', async () => {
      const invalidData = {
        mermaidContent: validDeploymentData.mermaidContent
        // Missing required fields
      };

      const result = await deploymentService.deploySolution(invalidData);

      expect(result.success).toBe(false);
      expect(result.message).toContain('required');
    });

    it('should handle publisher creation failures', async () => {
      mockPublisherService.createPublisher.mockRejectedValue(
        new Error('Publisher creation failed')
      );

      const result = await deploymentService.deploySolution(validDeploymentData);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Publisher creation failed');
    });

    it('should handle solution creation failures', async () => {
      mockDataverseRepo.ensureSolution.mockRejectedValue(
        new Error('Solution creation failed')
      );

      const result = await deploymentService.deploySolution(validDeploymentData);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Solution creation failed');
    });

    it('should handle entity creation failures gracefully', async () => {
      // Mock createCustomEntities to return partial success with warnings
      mockDataverseRepo.createCustomEntities.mockResolvedValue({
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

      const result = await deploymentService.deploySolution(validDeploymentData);

      expect(result.success).toBe(true); // Partial success
      expect(result.entitiesCreated).toBe(1);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('Entity creation failed')
        })
      );
    });

    it('should handle CDM entity deployment', async () => {
      const cdmData = {
        ...validDeploymentData,
        cdmChoice: 'cdm',
        cdmMatches: [
          {
            originalEntity: { name: 'Account' },
            cdmEntity: { logicalName: 'account', displayName: 'Account' }
          }
        ]
      };

      // Mock the parser to return CDM detection
      mockMermaidParser.parse.mockReturnValueOnce({
        entities: [
          { name: 'Account', fields: [] }
        ],
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

      mockDataverseRepo.integrateCDMEntities = jest.fn().mockResolvedValue({
        success: true,
        data: { integratedEntities: [{ name: 'Contact' }] }
      });

      const result = await deploymentService.deploySolution(cdmData);

      expect(result.success).toBe(true);
      expect(mockDataverseRepo.integrateCDMEntities).toHaveBeenCalled();
    });

    it('should handle global choices integration', async () => {
      const choicesData = {
        ...validDeploymentData,
        selectedChoices: [
          { LogicalName: 'test_choice_1' },
          { LogicalName: 'test_choice_2' }
        ]
      };

      // Override just the global choices mock to return the expected data
      mockDataverseRepo.addGlobalChoicesToSolution.mockResolvedValue({
        added: 2,
        errors: []
      });

      const result = await deploymentService.deploySolution(choicesData);

      expect(result.success).toBe(true);
      expect(result.globalChoicesAdded).toBe(2);
      
      // Verify the method was called with the correct global choices data
      expect(mockDataverseRepo.addGlobalChoicesToSolution).toHaveBeenCalledTimes(1);
      const [choices, solutionName, dataverseConfig] = mockDataverseRepo.addGlobalChoicesToSolution.mock.calls[0];
      expect(choices).toEqual([
        { LogicalName: 'test_choice_1' },
        { LogicalName: 'test_choice_2' }
      ]);
      expect(dataverseConfig).toMatchObject({
        clientId: 'test-client-id',
        serverUrl: 'https://test.crm.dynamics.com'
      });
    });

    it('should handle custom global choices creation', async () => {
      const customChoicesData = {
        ...validDeploymentData,
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
      };

      // Mock custom global choices creation
      mockDataverseRepo.createAndAddCustomGlobalChoices.mockResolvedValue({
        created: 1,
        skipped: 0,
        errors: []
      });

      const result = await deploymentService.deploySolution(customChoicesData);

      expect(result.success).toBe(true);
      expect(result.globalChoicesCreated).toBe(1);
      
      // Verify the method was called with the correct custom choices data
      expect(mockDataverseRepo.createAndAddCustomGlobalChoices).toHaveBeenCalledTimes(1);
      const [choices, solutionName, prefix, dataverseConfig, progressCallback] = mockDataverseRepo.createAndAddCustomGlobalChoices.mock.calls[0];
      expect(choices).toEqual([expect.objectContaining({
        name: 'Custom Choice 1',
        logicalName: 'test_custom_choice_1'
      })]);
      expect(dataverseConfig).toMatchObject({
        clientId: 'test-client-id',
        serverUrl: 'https://test.crm.dynamics.com'
      });
      expect(typeof progressCallback).toBe('function');
    });

    it('should track progress with callback', async () => {
      const progressCallback = jest.fn();
      const dataWithCallback = {
        ...validDeploymentData
      };

      await deploymentService.deploySolution(dataWithCallback, progressCallback);

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
      mockDataverseRepo.createEntity.mockResolvedValue({
        id: 'entity-123',
        logicalName: 'test_customer'
      });

      const result = await deploymentService._createEntities(
        mockEntities,
        'TestSolution',
        'test'
      );

      expect(result.entitiesCreated).toBe(1);
      expect(mockDataverseRepo.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          logicalName: 'test_customer',
          displayName: 'Customer'
        }),
        'TestSolution'
      );
    });

    it('should handle entity creation errors individually', async () => {
      mockDataverseRepo.createEntity
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
      mockDataverseRepo.createRelationship.mockResolvedValue({
        id: 'rel-123',
        schemaName: 'test_customer_orders'
      });

      const result = await deploymentService._createRelationships(
        mockRelationships,
        mockEntityMap,
        'TestSolution'
      );

      expect(result.relationshipsCreated).toBe(1);
      expect(mockDataverseRepo.createRelationship).toHaveBeenCalledWith(
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
      expect(mockDataverseRepo.createRelationship).not.toHaveBeenCalled();
    });
  });
});
