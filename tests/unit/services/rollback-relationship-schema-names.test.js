const { DataverseClient } = require('../../../src/backend/dataverse-client');

describe('Rollback Relationship Schema Names', () => {
    let client;
    let mockDelete;
    let mockProgress;
    
    beforeEach(() => {
        client = new DataverseClient({
            dataverseUrl: 'https://test.crm.dynamics.com',
            tenantId: 'test-tenant',
            clientId: 'test-client'
        });
        mockDelete = jest.fn();
        mockProgress = jest.fn();
        client._delete = mockDelete;
        client._ensureToken = jest.fn();
        client._log = jest.fn();
        client._err = jest.fn();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should use actual schema names from createdRelationships data', async () => {
        const deploymentData = {
            solutionInfo: {
                solutionName: 'TestSolution',
                publisherPrefix: 'ts'
            },
            rollbackData: {
                // New format with actual created relationships
                createdRelationships: {
                    'Professor->Course': {
                        SchemaName: 'ts_professor_courses',
                        DisplayName: 'Professor teaches Course'
                    },
                    'Student->Course': {
                        SchemaName: 'ts_student_courses', 
                        DisplayName: 'Student enrolls in Course'
                    }
                },
                customEntities: [],
                globalChoicesCreated: []
            },
            summary: {}
        };

        const rollbackConfig = {
            relationships: true,
            entities: false,
            globalChoices: false
        };

        mockDelete.mockResolvedValue();

        await client.rollbackDeployment(deploymentData, mockProgress, rollbackConfig);

        // Should use the actual schema names directly
        expect(mockDelete).toHaveBeenCalledWith("RelationshipDefinitions(SchemaName='ts_professor_courses')");
        expect(mockDelete).toHaveBeenCalledWith("RelationshipDefinitions(SchemaName='ts_student_courses')");
        expect(mockDelete).toHaveBeenCalledTimes(2);
    });

    test('should skip rollback when createdRelationships not available', async () => {
        const deploymentData = {
            solutionInfo: {
                solutionName: 'TestSolution',
                publisherPrefix: 'ts'
            },
            rollbackData: {
                // Original format with ERD relationships only - no createdRelationships
                relationships: [
                    {
                        name: 'taught by',
                        fromEntity: 'Professor',
                        toEntity: 'Course',
                        publisherPrefix: 'ts'
                    }
                ],
                customEntities: [],
                globalChoicesCreated: []
            },
            summary: {}
        };

        const rollbackConfig = {
            relationships: true,
            entities: false,
            globalChoices: false
        };

        mockDelete.mockResolvedValue();

        await client.rollbackDeployment(deploymentData, mockProgress, rollbackConfig);

        // Should NOT delete any relationships since we only use actually created ones
        expect(mockDelete).not.toHaveBeenCalled();
    });

    test('should handle mixed schema name formats correctly', async () => {
        const deploymentData = {
            solutionInfo: {
                solutionName: 'TestSolution',
                publisherPrefix: 'ts'
            },
            rollbackData: {
                createdRelationships: {
                    'Teacher->Student': {
                        SchemaName: 'ts_teacher_students', // Proper schema name
                        DisplayName: 'Teacher mentors Student'
                    },
                    'Parent->Student': {
                        schemaName: 'ts_parent_students', // Lowercase property
                        displayName: 'Parent of Student'
                    }
                },
                customEntities: [],
                globalChoicesCreated: []
            },
            summary: {}
        };

        const rollbackConfig = {
            relationships: true,
            entities: false,
            globalChoices: false
        };

        mockDelete.mockResolvedValue();

        await client.rollbackDeployment(deploymentData, mockProgress, rollbackConfig);

        // Should handle both uppercase and lowercase property names
        expect(mockDelete).toHaveBeenCalledWith("RelationshipDefinitions(SchemaName='ts_teacher_students')");
        expect(mockDelete).toHaveBeenCalledWith("RelationshipDefinitions(SchemaName='ts_parent_students')");
        expect(mockDelete).toHaveBeenCalledTimes(2);
    });

    test('should handle relationship deletion failures gracefully', async () => {
        const deploymentData = {
            solutionInfo: {
                solutionName: 'TestSolution',
                publisherPrefix: 'ts'
            },
            rollbackData: {
                createdRelationships: {
                    'Teacher->Course': {
                        SchemaName: 'ts_teacher_courses',
                        DisplayName: 'Teacher teaches Course'
                    },
                    'Student->Course': {
                        SchemaName: 'ts_student_courses',
                        DisplayName: 'Student takes Course'
                    }
                },
                customEntities: [],
                globalChoicesCreated: []
            },
            summary: {}
        };

        const rollbackConfig = {
            relationships: true,
            entities: false,
            globalChoices: false
        };

        // First relationship fails, second succeeds
        mockDelete
            .mockRejectedValueOnce(new Error('Relationship not found'))
            .mockResolvedValueOnce();

        const result = await client.rollbackDeployment(deploymentData, mockProgress, rollbackConfig);

        // Should process both relationships despite first failure
        expect(mockDelete).toHaveBeenCalledWith("RelationshipDefinitions(SchemaName='ts_teacher_courses')");
        expect(mockDelete).toHaveBeenCalledWith("RelationshipDefinitions(SchemaName='ts_student_courses')");
        expect(mockDelete).toHaveBeenCalledTimes(2);
        
        // Should report mixed results
        expect(result.relationshipsProcessed).toBe(2);
        expect(result.relationshipsDeleted).toBe(1);
        expect(result.warnings).toHaveLength(1); // One "not found" warning
        expect(result.warnings[0]).toContain('Teacher teaches Course');
    });
});