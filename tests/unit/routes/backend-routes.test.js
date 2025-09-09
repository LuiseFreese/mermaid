/**
 * Backend Routes Unit Tests
 * Tests API route definitions, parameter validation, and response formatting
 */

const request = require('supertest');
const express = require('express');

// Mock controllers before importing routes
const mockValidationMethods = {
  validateERDData: jest.fn(),
  cleanupERD: jest.fn()
};

const mockDeploymentMethods = {
  getPublishers: jest.fn(),
  getSolutions: jest.fn(),
  getGlobalChoices: jest.fn(),
  deploySolution: jest.fn(),
  deploySolutionAPI: jest.fn(),
  testConnection: jest.fn()
};

jest.mock('../../../src/backend/controllers/validation-controller', () => {
  return jest.fn().mockImplementation(() => mockValidationMethods);
});

jest.mock('../../../src/backend/controllers/deployment-controller', () => {
  return jest.fn().mockImplementation(() => mockDeploymentMethods);
});

jest.mock('../../../src/backend/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

describe('Backend Routes Tests', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear the module cache and reimport routes to get fresh instances
    jest.resetModules();
    
    // Import routes after clearing modules
    const validationRoutes = require('../../../src/backend/routes/validation');
    const deploymentRoutes = require('../../../src/backend/routes/deployment');
    
    // Create Express app for testing
    app = express();
    app.use(express.json());
    app.use('/api/validation', validationRoutes);
    app.use('/api/deployment', deploymentRoutes);
  });

  describe('Validation Routes', () => {
    describe('POST /api/validation/validate', () => {
      test('should validate ERD successfully', async () => {
        mockValidationMethods.validateERDData.mockResolvedValue({
          success: true,
          data: {
            entities: [{ name: 'Customer', fields: ['id', 'name'] }],
            relationships: [{ from: 'Customer', to: 'Order', type: 'one-to-many' }]
          }
        });

        const testERD = 'erDiagram\n  Customer { string id PK }';

        const response = await request(app)
          .post('/api/validation/validate')
          .send({ mermaidContent: testERD })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.entities).toBeDefined();
        expect(response.body.data.relationships).toBeDefined();
      });

      test('should handle validation errors', async () => {
        mockValidationMethods.validateERDData.mockResolvedValue({
          success: false,
          message: 'Invalid ERD format',
          errors: ['Entity missing primary key']
        });

        const response = await request(app)
          .post('/api/validation/validate')
          .send({ mermaidContent: 'invalid erd' });

        // The route returns 400 for business logic validation errors
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('Invalid ERD format');
        expect(response.body.errors).toContain('Entity missing primary key');
      });

      test('should reject missing mermaidContent', async () => {
        const response = await request(app)
          .post('/api/validation/validate')
          .send({})
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/validation/cleanup', () => {
      test('should clean up ERD successfully', async () => {
        mockValidationMethods.cleanupERD.mockResolvedValue({
          success: true,
          data: { cleanedContent: 'erDiagram\n  Customer { string id PK }' }
        });

        const response = await request(app)
          .post('/api/validation/cleanup')
          .send({ mermaidContent: 'messy erd content' })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.cleanedContent).toBeDefined();
      });
    });
  });

  describe('Deployment Routes', () => {
    describe('GET /api/deployment/publishers', () => {
      test('should fetch publishers successfully', async () => {
        mockDeploymentMethods.getPublishers.mockResolvedValue({
          success: true,
          data: [
            { id: '1', name: 'TestPublisher', prefix: 'test' }
          ]
        });

        const response = await request(app)
          .get('/api/deployment/publishers')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].name).toBe('TestPublisher');
      });
    });

    describe('GET /api/deployment/solutions', () => {
      test('should fetch solutions successfully', async () => {
        mockDeploymentMethods.getSolutions.mockResolvedValue({
          success: true,
          data: [
            { id: 'sol1', name: 'TestSolution', version: '1.0.0' }
          ]
        });

        const response = await request(app)
          .get('/api/deployment/solutions')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].name).toBe('TestSolution');
      });
    });

    describe('POST /api/deployment/deploy', () => {
      test('should deploy solution successfully', async () => {
        mockDeploymentMethods.deploySolutionAPI.mockResolvedValue({
          success: true,
          data: { 
            solutionId: 'new-solution-id',
            entities: ['Customer', 'Order'],
            message: 'Deployment completed successfully'
          }
        });

        const deploymentData = {
          mermaidContent: 'erDiagram\n  Customer { string id PK }',
          solution: { name: 'TestSolution', publisher: 'testpub' },
          entities: [{ name: 'Customer', fields: ['id', 'name'] }],
          relationships: []
        };

        const response = await request(app)
          .post('/api/deployment/deploy')
          .send(deploymentData);

        // Log the actual response to debug validation issues
        if (response.status !== 200) {
          console.log('Deploy response:', response.status, response.body);
        }
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.solutionId).toBe('new-solution-id');
        expect(response.body.data.entities).toContain('Customer');
      });
    });

    describe('POST /api/deployment/test-connection', () => {
      test('should test connection successfully', async () => {
        mockDeploymentMethods.testConnection.mockResolvedValue({
          success: true,
          data: { status: 'connected', environment: 'test.crm.dynamics.com' }
        });

        const response = await request(app)
          .post('/api/deployment/test-connection')
          .send({ 
            dataverseUrl: 'https://test.crm.dynamics.com',
            tenantId: 'test-tenant-id',
            clientId: 'test-client-id',
            clientSecret: 'test-secret'
          });

        // Log the actual response to debug validation issues
        if (response.status !== 200) {
          console.log('Test connection response:', response.status, response.body);
        }

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.status).toBe('connected');
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect(404);

      expect(response.status).toBe(404);
    });
  });
});
