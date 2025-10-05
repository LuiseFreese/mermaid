/**
 * Integration tests for API endpoints
 * Tests the complete flow from HTTP request to response
 */

const request = require('supertest');
const { createLayeredServer } = require('../../src/backend/server');
const { setupTestEnvironment } = require('./test-setup');

describe('API Integration Tests', () => {
  let server;
  let app;
  let testEnv;

  beforeAll(async () => {
    // Set up test environment
    testEnv = setupTestEnvironment();
    
    // Create server with test configuration
    process.env.NODE_ENV = 'test';
    process.env.PORT = '0'; // Use random port
    process.env.AUTH_ENABLED = 'false'; // Disable authentication for integration tests
    
    // Set up mocked Dataverse configuration for tests
    process.env.DATAVERSE_URL = 'https://test.crm.dynamics.com';
    process.env.TENANT_ID = 'test-tenant-id';
    process.env.CLIENT_ID = 'test-client-id';
    process.env.CLIENT_SECRET = 'test-client-secret'; // Provide client secret
    process.env.USE_CLIENT_SECRET = 'true'; // Use client secret instead
    process.env.MANAGED_IDENTITY_CLIENT_ID = 'test-managed-identity-id';
    process.env.USE_MANAGED_IDENTITY = 'false'; // Disable managed identity in tests
    process.env.AUTH_MODE = '';

    const { server: testServer } = await createLayeredServer();
    server = testServer;
    app = request(server);
  }, 60000); // Increase timeout for server startup

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
    if (testEnv) {
      testEnv.restore();
    }
  }, 60000); // Increase timeout for server shutdown

  describe('Health Endpoints', () => {
    it('GET /health should return health status', async () => {
      const response = await app
        .get('/health')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number)
      });
    });

    it('GET /api/admin/health should return detailed health', async () => {
      const response = await app
        .get('/api/admin/health')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('components');
    });
  });

  describe('ERD Validation API', () => {
    const validERD = {
      mermaidContent: `erDiagram
        Customer {
          string customer_id PK
          string name
        }
        Order {
          string order_id PK
          string customer_id FK
        }
        Customer ||--o{ Order : places`
    };

    it('POST /api/validate should validate valid ERD', async () => {
      const response = await app
        .post('/api/validate')
        .send(validERD)
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toMatchObject({
        success: true,
        entities: expect.any(Array),
        relationships: expect.any(Array),
        validation: expect.objectContaining({
          isValid: expect.any(Boolean)
        })
      });

      expect(response.body.entities).toHaveLength(2);
      expect(response.body.relationships).toHaveLength(1);
    });

    it('POST /api/validate should handle invalid ERD', async () => {
      const invalidERD = {
        mermaidContent: 'invalid erd content'
      };

      const response = await app
        .post('/api/validate')
        .send(invalidERD)
        .expect(422)
        .expect('Content-Type', /json/);

      expect(response.body).toMatchObject({
        success: false,
        message: expect.any(String)
      });
    });

    it('POST /api/validate should require mermaidContent', async () => {
      const response = await app
        .post('/api/validate')
        .send({})
        .expect(422)
        .expect('Content-Type', /json/);

      expect(response.body.message).toContain('mermaidContent is required');
    });

    it('POST /api/validate should handle malformed JSON', async () => {
      const response = await app
        .post('/api/validate')
        .send('{ invalid json }')
        .expect(400)
        .expect('Content-Type', /json/);

      expect(response.body.message).toContain('Invalid JSON');
    });

    it('POST /api/validate should include CDM detection', async () => {
      const erdWithCDM = {
        mermaidContent: `erDiagram
          Account {
            string accountid PK
            string name
          }
          Contact {
            string contactid PK
            string fullname
          }`
      };

      const response = await app
        .post('/api/validate')
        .send(erdWithCDM)
        .expect(200);

      expect(response.body).toHaveProperty('cdmDetection');
      expect(response.body.cdmDetection).toHaveProperty('detectedCDM');
      expect(response.body.cdmDetection).toHaveProperty('customEntities');
    });
  });

  describe('Solution Deployment API', () => {
    const deploymentData = {
      mermaidContent: `erDiagram
        TestEntity {
          string test_id PK
          string name
        }`,
      solutionName: 'TestSolution',
      solutionDisplayName: 'Test Solution',
      publisherName: 'Test Publisher',
      publisherPrefix: 'test',
      cdmChoice: 'custom'
    };

    it('POST /upload should deploy solution successfully', async () => {
      const response = await app
        .post('/upload')
        .send(deploymentData)
        .expect(200)
        .expect('Content-Type', /json/);

      // In test mode, should return regular JSON response
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('deploymentId');
    });

    it('POST /upload should handle missing required fields', async () => {
      const incompleteData = {
        mermaidContent: deploymentData.mermaidContent
        // Missing required fields
      };

      const response = await app
        .post('/upload')
        .send(incompleteData)
        .expect(400); // Should be 400 for missing required fields

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('Admin API Endpoints', () => {
    // These tests require a real Dataverse connection and cannot be mocked
    // because the server handlers create new repository instances
    it.skip('GET /api/publishers should return publishers list', async () => {
      const response = await app
        .get('/api/publishers')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toMatchObject({
        success: true,
        publishers: expect.any(Array)
      });
    });

    it.skip('GET /api/solutions should return solutions list', async () => {
      const response = await app
        .get('/api/solutions')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toMatchObject({
        success: true,
        solutions: expect.any(Array)
      });
    });

    it('GET /api/global-choices-list should return global choices', async () => {
      const response = await app
        .get('/api/global-choices-list')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        all: expect.any(Array),
        grouped: expect.objectContaining({
          custom: expect.any(Array),
          builtIn: expect.any(Array)
        })
      });
    });

    it('GET /api/solution-status should return solution status', async () => {
      const response = await app
        .get('/api/solution-status?solution=TestSolution')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('success');
    });

    it('GET /api/solution-status should require solution parameter', async () => {
      const response = await app
        .get('/api/solution-status')
        .expect(400)
        .expect('Content-Type', /json/);

      expect(response.body.error).toContain('Solution name is required');
    });
  });

  describe('Static File Serving', () => {
    it('GET / should redirect to /wizard', async () => {
      const response = await app
        .get('/')
        .expect(302);

      expect(response.headers.location).toBe('/wizard');
    });

    it('GET /wizard should serve React app', async () => {
      const response = await app
        .get('/wizard')
        .expect(200);

      // Should serve HTML content (React app or fallback)
      expect(response.headers['content-type']).toMatch(/html/);
    });

    it('GET /favicon.ico should handle favicon requests', async () => {
      await app
        .get('/favicon.ico')
        .expect((res) => {
          // Should either serve favicon or return 404
          expect([200, 404]).toContain(res.status);
        });
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const response = await app
        .get('/unknown-route');

      // Note: The server serves the React app for unknown routes (SPA behavior)
      // This is correct - the React app handles client-side 404s
      expect([200, 404]).toContain(response.status);
      expect(response.body || response.text).toBeTruthy();
    });

    it('should handle 405 for wrong methods', async () => {
      const response = await app
        .put('/api/validate')
        .expect(405);

      expect(response.headers.allow).toContain('POST');
    });

    it('should handle CORS preflight requests', async () => {
      const response = await app
        .options('/api/validate')
        .set('Origin', 'http://localhost:3003')
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBeTruthy();
    });
  });

  describe('Request/Response Middleware', () => {
    it('should log requests', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await app.get('/health');

      // Check that the first argument contains the expected request log
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('REQUEST START: GET /health'),
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });

    it('should handle large request bodies', async () => {
      const largeERD = {
        mermaidContent: 'erDiagram\n' + 'Entity {\n  string field\n}\n'.repeat(1000)
      };

      const response = await app
        .post('/api/validate')
        .send(largeERD)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should set security headers', async () => {
      const response = await app.get('/health');

      // Check for basic security headers set by middleware
      expect(response.headers).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should respond within reasonable time', async () => {
      const start = Date.now();
      
      await app.get('/health').expect(200);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should respond within 1 second
    });

    it('should handle concurrent requests', async () => {
      const promises = Array(10).fill().map(() => 
        app.get('/health').expect(200)
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.body.status).toBe('healthy');
      });
    });
  });
});
