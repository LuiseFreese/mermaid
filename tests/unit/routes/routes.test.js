/**
 * Unit Tests for Backend Routes
 * Tests API route definitions, parameter validation, and response formatting
 */

const request = require('supertest');
const express = require('express');
const validationRoutes = require('../../../src/backend/routes/validation');
const deploymentRoutes = require('../../../src/backend/routes/deployment');
const ValidationController = require('../../../src/backend/controllers/validation-controller');
const DeploymentController = require('../../../src/backend/controllers/deployment-controller');
const testData = require('../../fixtures/test-data');

// Mock controllers
jest.mock('../../../src/backend/controllers/validation-controller');
jest.mock('../../../src/backend/controllers/deployment-controller');
jest.mock('../../../src/backend/utils/logger');

describe('Backend Routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create Express app for testing
    app = express();
    app.use(express.json());
    app.use('/api/validation', validationRoutes);
    app.use('/api/deployment', deploymentRoutes);
  });

  describe('Validation Routes', () => {
    describe('POST /api/validation/validate', () => {
      test('should validate ERD successfully', async () => {
        ValidationController.prototype.validateERD.mockResolvedValue({
          success: true,
          data: testData.validationResults.success
        });

        const response = await request(app)
          .post('/api/validation/validate')
          .send({ mermaidContent: testData.simpleERD })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.entities).toBeDefined();
        expect(response.body.data.relationships).toBeDefined();
        expect(ValidationController.prototype.validateERD).toHaveBeenCalledWith({
          mermaidContent: testData.simpleERD
        });
      });

      test('should handle validation errors', async () => {
        ValidationController.prototype.validateERD.mockResolvedValue({
          success: false,
          message: 'Invalid ERD syntax',
          errors: ['Syntax error on line 3']
        });

        const response = await request(app)
          .post('/api/validation/validate')
          .send({ mermaidContent: 'invalid erd' })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('Invalid ERD syntax');
        expect(response.body.errors).toBeDefined();
      });

      test('should reject missing mermaidContent', async () => {
        const response = await request(app)
          .post('/api/validation/validate')
          .send({})
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('mermaidContent is required');
      });

      test('should reject empty mermaidContent', async () => {
        const response = await request(app)
          .post('/api/validation/validate')
          .send({ mermaidContent: '' })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('mermaidContent cannot be empty');
      });

      test('should handle controller exceptions', async () => {
        ValidationController.prototype.validateERD.mockRejectedValue(
          new Error('Internal validation error')
        );

        const response = await request(app)
          .post('/api/validation/validate')
          .send({ mermaidContent: testData.simpleERD })
          .expect(500);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('validation failed');
      });
    });

    describe('POST /api/validation/cleanup', () => {
      test('should clean up ERD successfully', async () => {
        ValidationController.prototype.cleanupERD.mockResolvedValue({
          success: true,
          data: {
            correctedERD: testData.validationResults.withWarnings.correctedERD,
            warnings: testData.validationResults.withWarnings.warnings
          }
        });

        const response = await request(app)
          .post('/api/validation/cleanup')
          .send({ mermaidContent: testData.missingPrimaryKeyERD })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.correctedERD).toBeDefined();
        expect(response.body.data.warnings).toBeDefined();
      });

      test('should handle cleanup failures', async () => {
        ValidationController.prototype.cleanupERD.mockResolvedValue({
          success: false,
          message: 'Cannot clean up invalid ERD'
        });

        const response = await request(app)
          .post('/api/validation/cleanup')
          .send({ mermaidContent: 'completely invalid' })
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('Cannot clean up');
      });
    });
  });

  describe('Deployment Routes', () => {
    describe('GET /api/deployment/publishers', () => {
      test('should fetch publishers successfully', async () => {
        DeploymentController.prototype.getPublishers.mockResolvedValue({
          success: true,
          data: testData.apiResponses.publishers
        });

        const response = await request(app)
          .get('/api/deployment/publishers')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.publishers).toBeDefined();
        expect(Array.isArray(response.body.data.publishers)).toBe(true);
      });

      test('should handle publisher fetch errors', async () => {
        DeploymentController.prototype.getPublishers.mockResolvedValue({
          success: false,
          message: 'Failed to connect to Dataverse'
        });

        const response = await request(app)
          .get('/api/deployment/publishers')
          .expect(500);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('Failed to connect');
      });
    });

    describe('GET /api/deployment/solutions', () => {
      test('should fetch solutions successfully', async () => {
        DeploymentController.prototype.getSolutions.mockResolvedValue({
          success: true,
          data: testData.apiResponses.solutions
        });

        const response = await request(app)
          .get('/api/deployment/solutions')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.solutions).toBeDefined();
      });
    });

    describe('GET /api/deployment/global-choices', () => {
      test('should fetch global choices successfully', async () => {
        DeploymentController.prototype.getGlobalChoices.mockResolvedValue({
          success: true,
          data: testData.apiResponses.globalChoices
        });

        const response = await request(app)
          .get('/api/deployment/global-choices')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.all).toBeDefined();
        expect(response.body.data.grouped).toBeDefined();
        expect(response.body.data.summary).toBeDefined();
      });

      test('should handle global choices fetch errors', async () => {
        DeploymentController.prototype.getGlobalChoices.mockRejectedValue(
          new Error('Dataverse connection failed')
        );

        const response = await request(app)
          .get('/api/deployment/global-choices')
          .expect(500);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('failed to fetch');
      });
    });

    describe('POST /api/deployment/deploy', () => {
      test('should deploy solution successfully', async () => {
        DeploymentController.prototype.deploySolution.mockResolvedValue({
          success: true,
          data: testData.mockResponses.deploymentService.deploySolution
        });

        const deploymentRequest = testData.deploymentData.minimal;

        const response = await request(app)
          .post('/api/deployment/deploy')
          .send(deploymentRequest)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.entitiesCreated).toBeDefined();
        expect(response.body.data.relationshipsCreated).toBeDefined();
        expect(DeploymentController.prototype.deploySolution).toHaveBeenCalledWith(deploymentRequest);
      });

      test('should validate required deployment parameters', async () => {
        const incompleteRequest = {
          mermaidContent: testData.simpleERD
          // Missing required fields
        };

        const response = await request(app)
          .post('/api/deployment/deploy')
          .send(incompleteRequest)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('required');
      });

      test('should handle deployment failures', async () => {
        DeploymentController.prototype.deploySolution.mockResolvedValue({
          success: false,
          message: 'Entity creation failed',
          errors: ['Invalid entity definition']
        });

        const response = await request(app)
          .post('/api/deployment/deploy')
          .send(testData.deploymentData.minimal)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('Entity creation failed');
      });
    });

    describe('POST /api/deployment/test-connection', () => {
      test('should test connection successfully', async () => {
        DeploymentController.prototype.testConnection.mockResolvedValue({
          success: true,
          data: { message: 'Connected successfully' }
        });

        const response = await request(app)
          .post('/api/deployment/test-connection')
          .send({
            dataverseUrl: 'https://test.crm.dynamics.com',
            tenantId: 'test-tenant'
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.message).toBeDefined();
      });

      test('should handle connection failures', async () => {
        DeploymentController.prototype.testConnection.mockResolvedValue({
          success: false,
          message: 'Authentication failed'
        });

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
    });
  });

  describe('Route Parameter Validation', () => {
    test('should validate JSON content type', async () => {
      const response = await request(app)
        .post('/api/validation/validate')
        .set('Content-Type', 'text/plain')
        .send('invalid content')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/validation/validate')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid JSON');
    });

    test('should enforce request size limits', async () => {
      const largeContent = 'x'.repeat(10 * 1024 * 1024); // 10MB
      
      const response = await request(app)
        .post('/api/validation/validate')
        .send({ mermaidContent: largeContent })
        .expect(413);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Error Handling Middleware', () => {
    test('should handle 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/unknown/route')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found');
    });

    test('should handle method not allowed', async () => {
      const response = await request(app)
        .put('/api/validation/validate')
        .expect(405);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('method not allowed');
    });
  });

  describe('Response Headers', () => {
    test.skip('should include CORS headers', async () => {
      // Skipping: CORS headers are applied by server middleware, not route modules
      ValidationController.prototype.validateERD.mockResolvedValue({
        success: true,
        data: testData.validationResults.success
      });

      const response = await request(app)
        .post('/api/validation/validate')
        .send({ mermaidContent: testData.simpleERD });

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
      expect(response.headers['access-control-allow-headers']).toBeDefined();
    });

    test.skip('should include security headers', async () => {
      // Skipping: Security headers are applied by server middleware, not route modules
      const response = await request(app)
        .get('/api/deployment/publishers');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });

    test.skip('should include cache control headers', async () => {
      // Skipping: Cache control headers are applied by server middleware, not route modules
      const response = await request(app)
        .get('/api/deployment/global-choices');

      expect(response.headers['cache-control']).toBeDefined();
    });
  });

  describe('Request Logging', () => {
    test.skip('should log request details', async () => {
      // Skipping: Request logging is handled by server middleware, not route modules
      ValidationController.prototype.validateERD.mockResolvedValue({
        success: true,
        data: testData.validationResults.success
      });

      await request(app)
        .post('/api/validation/validate')
        .send({ mermaidContent: testData.simpleERD });

      // Verify logging was called (mocked logger)
      expect(require('../../../src/backend/utils/logger').info).toHaveBeenCalled();
    });

    test('should log errors with stack traces', async () => {
      ValidationController.prototype.validateERD.mockRejectedValue(
        new Error('Test error with stack')
      );

      await request(app)
        .post('/api/validation/validate')
        .send({ mermaidContent: testData.simpleERD });

      expect(require('../../../src/backend/utils/logger').error).toHaveBeenCalled();
    });
  });
});
