/**
 * End-to-End Tests
 * Full workflow tests from ERD input to Dataverse deployment
 */

const request = require('supertest');
const express = require('express');
const cors = require('cors');
const validationRoutes = require('../../src/backend/routes/validation');
const deploymentRoutes = require('../../src/backend/routes/deployment');
const testData = require('../fixtures/test-data');

// Mock external dependencies
jest.mock('../../src/backend/clients/dataverse-client');
jest.mock('../../src/backend/utils/logger');

describe('End-to-End Workflow Tests', () => {
  let app;

  beforeAll(() => {
    // Set up Express app similar to production
    app = express();
    app.use(cors());
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    
    // Add routes
    app.use('/api/validation', validationRoutes);
    app.use('/api/deployment', deploymentRoutes);
    
    // Global error handler
    app.use((err, req, res, next) => {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete ERD Validation Workflow', () => {
    test('should validate simple ERD and return structured data', async () => {
      const response = await request(app)
        .post('/api/validation/validate')
        .send({ mermaidContent: testData.simpleERD })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          entities: expect.any(Array),
          relationships: expect.any(Array),
          warnings: expect.any(Array),
          validation: expect.objectContaining({
            isValid: expect.any(Boolean)
          }),
          cdmDetection: expect.objectContaining({
            detectedCDM: expect.any(Array),
            customEntities: expect.any(Array)
          })
        }
      });

      // Verify entity structure
      const entities = response.body.data.entities;
      expect(entities).toHaveLength(2);
      
      const customerEntity = entities.find(e => e.name === 'Customer');
      expect(customerEntity).toBeDefined();
      expect(customerEntity.attributes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'customer_id',
            type: 'string',
            isPrimaryKey: true
          })
        ])
      );

      // Verify relationship structure
      const relationships = response.body.data.relationships;
      expect(relationships).toHaveLength(1);
      expect(relationships[0]).toMatchObject({
        from: 'Customer',
        to: 'Order',
        type: 'one-to-many'
      });
    });

    test('should detect and report validation issues', async () => {
      const response = await request(app)
        .post('/api/validation/validate')
        .send({ mermaidContent: testData.missingPrimaryKeyERD })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'primary_key',
            message: expect.stringContaining('missing primary key')
          })
        ])
      );
      expect(response.body.data.validation.isValid).toBe(false);
    });

    test('should cleanup ERD with automatic corrections', async () => {
      const response = await request(app)
        .post('/api/validation/cleanup')
        .send({ mermaidContent: testData.missingPrimaryKeyERD })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          correctedERD: expect.stringContaining('erDiagram'),
          warnings: expect.any(Array),
          changes: expect.any(Array)
        }
      });

      // Verify the corrected ERD includes primary key
      expect(response.body.data.correctedERD).toContain('PK');
    });
  });

  describe('Complete Deployment Workflow', () => {
    test('should fetch Dataverse metadata before deployment', async () => {
      // Mock successful Dataverse client responses
      const DataverseClient = require('../../src/backend/clients/dataverse-client');
      DataverseClient.mockImplementation(() => ({
        testConnection: jest.fn().mockResolvedValue({ success: true }),
        getPublishers: jest.fn().mockResolvedValue(testData.apiResponses.publishers),
        getSolutions: jest.fn().mockResolvedValue(testData.apiResponses.solutions),
        getGlobalChoices: jest.fn().mockResolvedValue(testData.apiResponses.globalChoices)
      }));

      // Test connection
      const connectionResponse = await request(app)
        .post('/api/deployment/test-connection')
        .send({
          dataverseUrl: 'https://test.crm.dynamics.com',
          tenantId: 'test-tenant-id'
        })
        .expect(200);

      expect(connectionResponse.body.success).toBe(true);

      // Fetch publishers
      const publishersResponse = await request(app)
        .get('/api/deployment/publishers')
        .expect(200);

      expect(publishersResponse.body.data.publishers).toBeDefined();
      expect(Array.isArray(publishersResponse.body.data.publishers)).toBe(true);

      // Fetch solutions
      const solutionsResponse = await request(app)
        .get('/api/deployment/solutions')
        .expect(200);

      expect(solutionsResponse.body.data.solutions).toBeDefined();

      // Fetch global choices
      const choicesResponse = await request(app)
        .get('/api/deployment/global-choices')
        .expect(200);

      expect(choicesResponse.body.data.all).toBeDefined();
      expect(choicesResponse.body.data.grouped).toBeDefined();
      expect(choicesResponse.body.data.summary).toBeDefined();
    });

    test('should deploy complete solution with entities and relationships', async () => {
      const DataverseClient = require('../../src/backend/clients/dataverse-client');
      const mockClient = {
        testConnection: jest.fn().mockResolvedValue({ success: true }),
        createSolution: jest.fn().mockResolvedValue({ success: true, solutionId: 'sol-123' }),
        createEntity: jest.fn().mockResolvedValue({ success: true, entityId: 'entity-123' }),
        createAttribute: jest.fn().mockResolvedValue({ success: true, attributeId: 'attr-123' }),
        createRelationship: jest.fn().mockResolvedValue({ success: true, relationshipId: 'rel-123' })
      };
      DataverseClient.mockImplementation(() => mockClient);

      const deploymentRequest = {
        ...testData.deploymentData.minimal,
        mermaidContent: testData.simpleERD
      };

      const response = await request(app)
        .post('/api/deployment/deploy')
        .send(deploymentRequest)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          entitiesCreated: expect.any(Number),
          relationshipsCreated: expect.any(Number),
          message: expect.stringContaining('successfully')
        }
      });

      // Verify Dataverse client was called with correct parameters
      expect(mockClient.createEntity).toHaveBeenCalled();
      expect(mockClient.createRelationship).toHaveBeenCalled();
    });

    test('should handle CDM entity deployment', async () => {
      const DataverseClient = require('../../src/backend/clients/dataverse-client');
      const mockClient = {
        testConnection: jest.fn().mockResolvedValue({ success: true }),
        createSolution: jest.fn().mockResolvedValue({ success: true, solutionId: 'sol-123' }),
        createEntity: jest.fn().mockResolvedValue({ success: true, entityId: 'entity-123' }),
        createRelationship: jest.fn().mockResolvedValue({ success: true, relationshipId: 'rel-123' })
      };
      DataverseClient.mockImplementation(() => mockClient);

      const cdmDeployment = {
        ...testData.deploymentData.withCDM,
        mermaidContent: testData.cdmERD
      };

      const response = await request(app)
        .post('/api/deployment/deploy')
        .send(cdmDeployment)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.cdmEntitiesUsed).toBeDefined();
      expect(response.body.data.customEntitiesCreated).toBeDefined();
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle invalid ERD gracefully', async () => {
      const response = await request(app)
        .post('/api/validation/validate')
        .send({ mermaidContent: testData.invalidSyntaxERD })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        message: expect.stringContaining('syntax'),
        errors: expect.any(Array)
      });
    });

    test('should handle Dataverse connection failures', async () => {
      const DataverseClient = require('../../src/backend/clients/dataverse-client');
      DataverseClient.mockImplementation(() => ({
        testConnection: jest.fn().mockResolvedValue({
          success: false,
          message: 'Authentication failed'
        })
      }));

      const response = await request(app)
        .post('/api/deployment/test-connection')
        .send({
          dataverseUrl: 'https://invalid.crm.dynamics.com',
          tenantId: 'invalid-tenant'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Authentication failed');
    });

    test('should handle partial deployment failures', async () => {
      const DataverseClient = require('../../src/backend/clients/dataverse-client');
      const mockClient = {
        testConnection: jest.fn().mockResolvedValue({ success: true }),
        createSolution: jest.fn().mockResolvedValue({ success: true, solutionId: 'sol-123' }),
        createEntity: jest.fn()
          .mockResolvedValueOnce({ success: true, entityId: 'entity-1' })
          .mockResolvedValueOnce({ success: false, message: 'Entity creation failed' }),
        createRelationship: jest.fn().mockResolvedValue({ success: false, message: 'Relationship failed' })
      };
      DataverseClient.mockImplementation(() => mockClient);

      const response = await request(app)
        .post('/api/deployment/deploy')
        .send(testData.deploymentData.minimal)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.data.partialResults).toBeDefined();
      expect(response.body.data.failedOperations).toBeDefined();
    });
  });

  describe('Performance and Load Testing', () => {
    test('should handle multiple concurrent validation requests', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post('/api/validation/validate')
            .send({ mermaidContent: testData.simpleERD })
        );
      }

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    test('should handle large ERD diagrams', async () => {
      // Generate a moderately large ERD
      let largeERD = 'erDiagram\n';
      for (let i = 1; i <= 20; i++) {
        largeERD += `Entity${i} {\n`;
        largeERD += `  string entity${i}_id PK\n`;
        largeERD += `  string name\n`;
        largeERD += `  datetime created_date\n`;
        largeERD += `}\n\n`;
      }
      
      // Add relationships
      for (let i = 1; i < 20; i++) {
        largeERD += `Entity${i} ||--o{ Entity${i + 1} : "has"\n`;
      }

      const startTime = Date.now();
      const response = await request(app)
        .post('/api/validation/validate')
        .send({ mermaidContent: largeERD })
        .expect(200);
      const endTime = Date.now();

      expect(response.body.success).toBe(true);
      expect(response.body.data.entities).toHaveLength(20);
      expect(response.body.data.relationships).toHaveLength(19);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Data Flow Validation', () => {
    test('should maintain data consistency through validation and deployment', async () => {
      // First validate the ERD
      const validationResponse = await request(app)
        .post('/api/validation/validate')
        .send({ mermaidContent: testData.complexERD })
        .expect(200);

      const validatedData = validationResponse.body.data;
      
      // Mock successful deployment
      const DataverseClient = require('../../src/backend/clients/dataverse-client');
      const mockClient = {
        testConnection: jest.fn().mockResolvedValue({ success: true }),
        createSolution: jest.fn().mockResolvedValue({ success: true, solutionId: 'sol-123' }),
        createEntity: jest.fn().mockResolvedValue({ success: true, entityId: 'entity-123' }),
        createAttribute: jest.fn().mockResolvedValue({ success: true, attributeId: 'attr-123' }),
        createRelationship: jest.fn().mockResolvedValue({ success: true, relationshipId: 'rel-123' })
      };
      DataverseClient.mockImplementation(() => mockClient);

      // Deploy using the validated data
      const deploymentResponse = await request(app)
        .post('/api/deployment/deploy')
        .send({
          ...testData.deploymentData.minimal,
          mermaidContent: testData.complexERD
        })
        .expect(200);

      // Verify data consistency
      expect(deploymentResponse.body.success).toBe(true);
      expect(deploymentResponse.body.data.entitiesCreated).toBe(validatedData.entities.length);
      expect(deploymentResponse.body.data.relationshipsCreated).toBe(validatedData.relationships.length);
    });

    test('should preserve entity attributes through the workflow', async () => {
      const validationResponse = await request(app)
        .post('/api/validation/validate')
        .send({ mermaidContent: testData.simpleERD })
        .expect(200);

      const customerEntity = validationResponse.body.data.entities.find(e => e.name === 'Customer');
      
      // Verify all expected attributes are present
      expect(customerEntity.attributes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'customer_id', isPrimaryKey: true }),
          expect.objectContaining({ name: 'first_name', type: 'string' }),
          expect.objectContaining({ name: 'last_name', type: 'string' }),
          expect.objectContaining({ name: 'email', type: 'string' }),
          expect.objectContaining({ name: 'created_date', type: 'datetime' })
        ])
      );
    });
  });

  describe('Security and Validation', () => {
    test('should reject malicious input', async () => {
      const maliciousContent = `erDiagram
        Entity {
          string field "<script>alert('xss')</script>"
        }`;

      const response = await request(app)
        .post('/api/validation/validate')
        .send({ mermaidContent: maliciousContent })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid content');
    });

    test('should enforce rate limiting', async () => {
      // Simulate rapid requests
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          request(app)
            .post('/api/validation/validate')
            .send({ mermaidContent: testData.simpleERD })
        );
      }

      const responses = await Promise.allSettled(promises);
      
      // Some requests should be rate limited
      const rateLimited = responses.some(r => 
        r.status === 'fulfilled' && r.value.status === 429
      );
      expect(rateLimited).toBe(true);
    });
  });
});
