const { RollbackService } = require('../../../src/backend/services/rollback-service');

describe('Rollback Relationship Schema Names - Simple Test', () => {
    test('should extract relationships from createdRelationships data correctly', async () => {
        // Create mock dataverse repository
        const mockDataverseRepository = {
            delete: jest.fn().mockResolvedValue(),
            _delete: jest.fn().mockResolvedValue() // For backward compatibility
        };
        
        // Create mock deployment history service
        const mockDeploymentHistoryService = {
            getDeploymentById: jest.fn(),
            updateDeploymentStatus: jest.fn().mockResolvedValue(),
            updateDeployment: jest.fn().mockResolvedValue(),
            recordRollback: jest.fn().mockResolvedValue()
        };

        const rollbackService = new RollbackService({
            dataverseRepository: mockDataverseRepository,
            deploymentHistoryService: mockDeploymentHistoryService,
            logger: { 
                log: jest.fn(),
                warn: jest.fn(), 
                error: jest.fn() 
            }
        });

        const deploymentData = {
            id: 'test-deployment-123',
            status: 'success',
            solutionInfo: {
                solutionName: 'TestSolution',
                publisherPrefix: 'ts'
            },
            rollbackData: {
                relationships: [{
                    SchemaName: 'ts_professor_courses',
                    DisplayName: 'Professor teaches Course'
                }],
                customEntities: [],
                globalChoicesCreated: []
            },
            summary: {}
        };

        // Mock the deployment history service to return our test data
        mockDeploymentHistoryService.getDeploymentById.mockResolvedValue(deploymentData);

        const rollbackConfig = {
            relationships: true,
            entities: false,
            globalChoices: false
        };

        const mockProgress = jest.fn();

        try {
            await rollbackService.rollbackDeployment('test-deployment-123', mockProgress, rollbackConfig);
        } catch (error) {
            console.log('Rollback error:', error.message);
            console.log('Original error:', error.originalError?.message);
            console.log('Error stack:', error.originalError?.stack);
            throw error;
        }

        // Should use the actual schema name directly
        expect(mockDataverseRepository.delete).toHaveBeenCalledWith("RelationshipDefinitions(SchemaName='ts_professor_courses')");
    });
});