const { DataverseClient } = require('../../../src/backend/dataverse-client');

describe('Rollback Relationship Schema Names - Simple Test', () => {
    test('should extract relationships from createdRelationships data correctly', async () => {
        const client = new DataverseClient({
            dataverseUrl: 'https://test.crm.dynamics.com',
            tenantId: 'test-tenant',
            clientId: 'test-client'
        });
        
        // Mock the internal methods to avoid actual API calls
        client._ensureToken = jest.fn();
        client._delete = jest.fn().mockResolvedValue();
        client._log = jest.fn();
        client._err = jest.fn();

        const deploymentData = {
            solutionInfo: {
                solutionName: 'TestSolution',
                publisherPrefix: 'ts'
            },
            rollbackData: {
                createdRelationships: {
                    'Professor->Course': {
                        SchemaName: 'ts_professor_courses',
                        DisplayName: 'Professor teaches Course'
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

        const mockProgress = jest.fn();

        await client.rollbackDeployment(deploymentData, mockProgress, rollbackConfig);

        // Should use the actual schema name directly
        expect(client._delete).toHaveBeenCalledWith("RelationshipDefinitions(SchemaName='ts_professor_courses')");
    });
});