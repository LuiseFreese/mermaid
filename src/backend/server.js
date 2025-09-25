/**
 * Dataverse ERD-to-Solution Wizard Server
 * Layered architecture with controllers, services, repositories, and middleware
 * - Serves wizard UI and static files
 * - Provides API endpoints for ERD validation and solution deployment
 * - Integrates with Microsoft Dataverse through abstracted service layer
 */

const http = require('http');
const url  = require('url');
const path = require('path');

// Load environment variables - check .env.local first (for local dev), then .env
const fs = require('fs');
if (fs.existsSync('.env.local')) {
  require('dotenv').config({ path: '.env.local' });
} else {
  require('dotenv').config();
}

// --- Import New Architecture Layers ------------------------------------

// Controllers
const { WizardController } = require('./controllers/wizard-controller');
const ValidationController = require('./controllers/validation-controller');
const DeploymentController = require('./controllers/deployment-controller');
const { AdminController } = require('./controllers/admin-controller');

// Services
const { ValidationService } = require('./services/validation-service');
const { DeploymentService } = require('./services/deployment-service');
const { DeploymentHistoryService } = require('./services/deployment-history-service');
const { PublisherService } = require('./services/publisher-service');
const { GlobalChoicesService } = require('./services/global-choices-service');
const { SolutionService } = require('./services/solution-service');

// Repositories
const { DataverseRepository } = require('./repositories/dataverse-repository');
const { ConfigurationRepository } = require('./repositories/configuration-repository');

// Middleware
const { RequestLoggerMiddleware } = require('./middleware/request-logger-middleware');
const { ErrorHandlerMiddleware } = require('./middleware/error-handler-middleware');
const { CorsMiddleware } = require('./middleware/cors-middleware');
const { StreamingMiddleware } = require('./middleware/streaming-middleware');
const { SecurityMiddleware } = require('./middleware/security-middleware');

// Core modules
let MermaidERDParser = null;
let DataverseClient  = null;
try {
  const { MermaidERDParser: Parser } = require('./mermaid-parser.js');
  const { DataverseClient: Client }  = require('./dataverse-client.js');
  MermaidERDParser = Parser;
  DataverseClient  = Client;
} catch (e) {
  console.error('Failed to load core modules:', e.message);
}

// Managed identity authentication - no secrets or Key Vault required
console.log('Using managed identity authentication for secure, passwordless access');

// --- Logging Setup -----------------------------------------------------
const recentLogs = [];
const MAX_RECENT = 200;
const originalLog = console.log;
const originalErr = console.error;

function pushLog(prefix, args) {
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  recentLogs.push(`[${new Date().toISOString()}] ${prefix} ${msg}`);
  if (recentLogs.length > MAX_RECENT) recentLogs.shift();
}

console.log = (...args) => { pushLog('[INFO]', args); originalLog(...args); };
console.error = (...args) => { pushLog('[ERR ]', args); originalErr(...args); };
console.getLastLogs = () => [...recentLogs];

// --- Dependency Injection Setup ----------------------------------------
let appComponents = null;

async function initializeComponents() {
  console.log('Initializing application components...');
  
  try {
    // Initialize repositories with managed identity
    const configRepo = new ConfigurationRepository({
      logger: console
    });
    
    const dataverseRepo = new DataverseRepository({
      configurationRepository: configRepo,
      DataverseClient: DataverseClient, // Use regular client to avoid customization locks
      logger: console
    });

    // Initialize services
    const validationService = new ValidationService({
      dataverseRepository: dataverseRepo,
      mermaidParser: new MermaidERDParser(), // Create an instance of the parser
      cdmRegistry: null, // Will be loaded when needed
      logger: console
    });

    const globalChoicesService = new GlobalChoicesService({
      dataverseRepository: dataverseRepo,
      logger: console
    });

    const publisherService = new PublisherService({
      dataverseRepository: dataverseRepo,
      logger: console
    });

    const solutionService = new SolutionService({
      dataverseRepository: dataverseRepo,
      publisherService,
      logger: console
    });

    const deploymentService = new DeploymentService({
      dataverseRepository: dataverseRepo,
      configRepository: configRepo,
      validationService,
      globalChoicesService,
      solutionService,
      publisherService,
      mermaidParser: new MermaidERDParser(), // Add the missing Mermaid parser
      logger: console
    });

    const deploymentHistoryService = new DeploymentHistoryService({
      logger: console
    });

    // Initialize middleware
    const requestLogger = new RequestLoggerMiddleware({
      logger: console,
      includeBody: process.env.LOG_REQUEST_BODY === 'true'
    });

    const errorHandler = new ErrorHandlerMiddleware({
      logger: console,
      includeStack: process.env.NODE_ENV === 'development',
      environment: process.env.NODE_ENV || 'production'
    });

    const corsHandler = CorsMiddleware.createWebAppCors();
    
    const securityHandler = SecurityMiddleware.createWebAppSecurity();
    
    const streamingHandler = new StreamingMiddleware({
      logger: console,
      chunkSize: parseInt(process.env.STREAM_CHUNK_SIZE) || 8192
    });

    // Initialize controllers
    const wizardController = new WizardController({
      staticFilesPath: process.env.STATIC_FILES_PATH || path.join(__dirname)
    });

    const validationController = new ValidationController(validationService);

    const deploymentController = new DeploymentController({
      deploymentService,
      streamingMiddleware: streamingHandler
    });

    // Set deployment history service on the deployment controller
    deploymentController.setDeploymentHistoryService(deploymentHistoryService);

    const adminController = new AdminController(
      publisherService,
      globalChoicesService,
      solutionService
    );

    appComponents = {
      // Repositories
      configRepo,
      dataverseRepo,
      
      // Services
      validationService,
      deploymentService,
      globalChoicesService,
      publisherService,
      solutionService,
      
      // Middleware
      requestLogger,
      errorHandler,
      corsHandler,
      securityHandler,
      streamingHandler,
      
      // Controllers
      wizardController,
      validationController,
      deploymentController,
      adminController
    };

    console.log('Application components initialized successfully');
    return appComponents;
    
  } catch (error) {
    console.error('Failed to initialize components:', error);
    throw error;
  }
}

// --- helpers ------------------------------------------------------------
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', ch => body += ch);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// Utility functions
// Configuration management function



// --- cleanup endpoint handler ------------------------------------------
async function handleCleanup(req, res) {
  try {
    const body = await readRequestBody(req);
    const data = JSON.parse(body);
    
    if (!data) {
      console.error('No cleanup data received');
      res.writeHead(400, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({ success: false, error: 'No data received' }));
    }

    // Initialize Dataverse client with managed identity
    const cfg = { 
      dataverseUrl: data.dataverseUrl, 
      tenantId: data.tenantId, 
      clientId: data.clientId, 
      useManagedIdentity: true,
      verbose: true 
    };
    
    const client = new DataverseClient(cfg);
    
    // Start the cleanup process
    const cleanupOptions = {
      cleanupAll: data.cleanupAll || false,
      entityPrefixes: data.entityPrefixes || [],
      preserveCDM: data.preserveCDM !== false, // Default to true
      deleteRelationshipsFirst: data.deleteRelationshipsFirst !== false // Default to true
    };
    
    const results = await client.cleanupTestEntities(cleanupOptions);
    
    // Send results back to client
    const response = {
      success: true,
      entitiesFound: results.entitiesFound || [],
      relationshipsFound: results.relationshipsFound || [],
      entitiesDeleted: results.entitiesDeleted || 0,
      relationshipsDeleted: results.relationshipsDeleted || 0,
      errors: results.errors || [],
      warnings: results.warnings || [],
      summary: results.summary || 'Cleanup completed'
    };
    
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify(response));
    
  } catch (e) {
    console.error('/cleanup error:', e);
    res.writeHead(500, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ 
      success: false, 
      error: e.message
    }));
  }
}

// --- publishers endpoint handler ---------------------------------------
async function handleGetPublishers(req, res) {
  try {
    // Return mock data for tests and development (since managed identity doesn't work on localhost)
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
      const mockPublishers = [
        { id: 'pub1', uniqueName: 'testpub', friendlyName: 'Test Publisher', prefix: 'test' },
        { id: 'pub2', uniqueName: 'devpub', friendlyName: 'Development Publisher', prefix: 'dev' },
        { id: 'pub3', uniqueName: 'localpub', friendlyName: 'Local Publisher', prefix: 'local' }
      ];
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ success: true, publishers: mockPublishers }));
      return;
    }
    
    // Create DataverseRepository with managed identity
    const configRepo = new ConfigurationRepository({
      logger: console
    });
    
    const dataverseRepo = new DataverseRepository({
      configurationRepository: configRepo,
      DataverseClient: DataverseClient,
      logger: console
    });
    
    const result = await dataverseRepo.getPublishers();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to get publishers');
    }
    
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ success: true, publishers: result.data }));
    
  } catch (error) {
    console.error('Failed to get publishers:', error);
    res.writeHead(500, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ 
      success: false, 
      error: error.message,
      publishers: []
    }));
  }
}

async function handleGetSolutions(req, res) {
  try {
    // Return mock data for tests and development (since managed identity doesn't work on localhost)
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
      const mockSolutions = [
        { solutionid: 'sol1', uniquename: 'testsolution', friendlyname: 'Test Solution' },
        { solutionid: 'sol2', uniquename: 'devsolution', friendlyname: 'Development Solution' },
        { solutionid: 'sol3', uniquename: 'localsolution', friendlyname: 'Local Solution' }
      ];
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ success: true, solutions: mockSolutions }));
      return;
    }
    
    // Create DataverseRepository with managed identity
    const configRepo = new ConfigurationRepository({
      logger: console
    });
    
    const dataverseRepo = new DataverseRepository({
      configurationRepository: configRepo,
      DataverseClient: DataverseClient,
      logger: console
    });
    
    const result = await dataverseRepo.getSolutions();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to get solutions');
    }
    
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ success: true, solutions: result.data }));
    
  } catch (error) {
    console.error('Failed to get solutions:', error);
    res.writeHead(500, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ 
      success: false, 
      error: error.message,
      solutions: []
    }));
  }
}

// --- global choices endpoint handler -----------------------------------
async function handleGetGlobalChoices(req, res) {
  try {
    // Return mock data for tests and development (since managed identity doesn't work on localhost)
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
      const mockGlobalChoices = {
        all: [
          { id: 'gc1', logicalName: 'cr123_priority', displayName: 'Priority', isCustom: true, options: [
            { value: 1, label: 'Low' },
            { value: 2, label: 'Medium' },
            { value: 3, label: 'High' },
            { value: 4, label: 'Critical' }
          ]},
          { id: 'gc2', logicalName: 'cr123_status', displayName: 'Status', isCustom: true, options: [
            { value: 1, label: 'Active' },
            { value: 2, label: 'Inactive' },
            { value: 3, label: 'Pending' }
          ]},
          { id: 'gc3', logicalName: 'cr123_category', displayName: 'Category', isCustom: true, options: [
            { value: 1, label: 'General' },
            { value: 2, label: 'Technical' },
            { value: 3, label: 'Business' }
          ]},
          { id: 'gc4', logicalName: 'statecode', displayName: 'State Code', isCustom: false, options: [
            { value: 0, label: 'Active' },
            { value: 1, label: 'Inactive' }
          ]},
          { id: 'gc5', logicalName: 'statuscode', displayName: 'Status Reason', isCustom: false, options: [
            { value: 1, label: 'Active' },
            { value: 2, label: 'Inactive' }
          ]}
        ],
        grouped: {
          custom: [
            { id: 'gc1', logicalName: 'cr123_priority', displayName: 'Priority', options: [
              { value: 1, label: 'Low' },
              { value: 2, label: 'Medium' },
              { value: 3, label: 'High' },
              { value: 4, label: 'Critical' }
            ]},
            { id: 'gc2', logicalName: 'cr123_status', displayName: 'Status', options: [
              { value: 1, label: 'Active' },
              { value: 2, label: 'Inactive' },
              { value: 3, label: 'Pending' }
            ]},
            { id: 'gc3', logicalName: 'cr123_category', displayName: 'Category', options: [
              { value: 1, label: 'General' },
              { value: 2, label: 'Technical' },
              { value: 3, label: 'Business' }
            ]}
          ],
          builtIn: [
            { id: 'gc4', logicalName: 'statecode', displayName: 'State Code', options: [
              { value: 0, label: 'Active' },
              { value: 1, label: 'Inactive' }
            ]},
            { id: 'gc5', logicalName: 'statuscode', displayName: 'Status Reason', options: [
              { value: 1, label: 'Active' },
              { value: 2, label: 'Inactive' }
            ]}
          ]
        },
        summary: { 
          total: 5, 
          custom: 3, 
          builtIn: 2 
        }
      };
      
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ 
        success: true, 
        ...mockGlobalChoices
      }));
      return;
    }
    
    // Create DataverseRepository with managed identity
    const configRepo = new ConfigurationRepository({
      logger: console
    });
    
    const dataverseRepo = new DataverseRepository({
      configurationRepository: configRepo,
      DataverseClient: DataverseClient,
      logger: console
    });
    
    const result = await dataverseRepo.getGlobalChoiceSets();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to get global choices');
    }
    
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ 
      success: true, 
      ...result.data
    }));
    
  } catch (error) {
    console.error('Failed to get global choices:', error);
    res.writeHead(500, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ 
      success: false, 
      error: error.message,
      all: [],
      grouped: { custom: [], builtIn: [] },
      summary: { total: 0, custom: 0, builtIn: 0 }
    }));
  }
}

// --- Server Creation with Layered Architecture -------------------------
async function createLayeredServer() {
  console.log('Starting Dataverse ERD-to-Solution Wizard Server...');
  
  // Initialize components
  const components = await initializeComponents();
  
  const server = http.createServer(async (req, res) => {
    const { pathname, query } = url.parse(req.url, true);
    
    try {
      // Apply middleware chain
      await applyMiddleware(req, res, components, async () => {
        await routeRequest(pathname, req, res, components, query);
      });
    } catch (error) {
      await components.errorHandler.handle(error, req, res);
    }
  });

  return { server, components };
}

async function applyMiddleware(req, res, components, next) {
  // Add components to request for access in controllers
  req.components = components;
  
  // Request logging
  await components.requestLogger.handle(req, res, () => {
    // Security headers
    components.securityHandler.handle(req, res, () => {
      // CORS handling
      components.corsHandler.handle(req, res, () => {
        // Continue to routing
        next();
      });
    });
  });
}

async function routeRequest(pathname, req, res, components) {
  // Root redirect
  if (req.method === 'GET' && pathname === '/') {
    return components.wizardController.redirectToWizard(req, res);
  }

  // React App Routes (New Frontend)
  if (req.method === 'GET' && (pathname === '/wizard' || pathname.startsWith('/wizard/'))) {
    return components.wizardController.serveReactApp(req, res);
  }

  // Root redirect to wizard
  if (req.method === 'GET' && pathname === '/') {
    res.writeHead(302, { 'Location': '/wizard' });
    res.end();
    return;
  }

  // Static files
  if (req.method === 'GET' && pathname.startsWith('/static/')) {
    return components.wizardController.serveStaticFile(req, res);
  }

  // Assets files (for React frontend)
  if (req.method === 'GET' && pathname.startsWith('/assets/')) {
    return components.wizardController.serveReactAsset(req, res);
  }

  // Favicon
  if (req.method === 'GET' && pathname === '/favicon.ico') {
    return components.wizardController.serveFavicon(req, res);
  }

  // API Routes
  if (pathname.startsWith('/api/')) {
    return handleApiRoutes(pathname, req, res, components);
  }

  if (req.method === 'POST' && pathname === '/upload') {
    return components.deploymentController.deploySolution(req, res);
  }

  if (req.method === 'POST' && pathname === '/cleanup') {
    return handleCleanup(req, res);
  }

  // Performance metrics routes
  if (req.method === 'GET' && pathname === '/performance-metrics') {
    return components.deploymentController.getPerformanceMetrics(req, res);
  }

  if (req.method === 'GET' && pathname.startsWith('/performance-metrics/')) {
    return components.deploymentController.getDeploymentMetrics(req, res);
  }

  // Health check
  if (req.method === 'GET' && pathname === '/health') {
    return handleHealthCheck(req, res, components);
  }

  // --- SPA fallback: serve React app for all other GET routes (except above) ---
  if (req.method === 'GET') {
    return components.wizardController.serveReactApp(req, res);
  }

  // 404 Not Found (for non-GET or truly unknown)
  await components.errorHandler.handle404(req, res);
}

async function handleApiRoutes(pathname, req, res, components) {
  const route = pathname.replace('/api/', '');

  // Validation routes
  if (route.startsWith('validation/')) {
    const validationRoute = route.replace('validation/', '');
    switch (validationRoute) {
      case 'validate':
        if (req.method === 'POST') {
          return components.validationController.validateERD(req, res);
        } else {
          // Method not allowed
          res.writeHead(405, {
            'Content-Type': 'application/json',
            'Allow': 'POST'
          });
          res.end(JSON.stringify({
            success: false,
            error: 'Method not allowed'
          }));
          return;
        }
      case 'cleanup':
        if (req.method === 'POST') {
          return handleCleanup(req, res);
        } else {
          // Method not allowed
          res.writeHead(405, {
            'Content-Type': 'application/json',
            'Allow': 'POST'
          });
          res.end(JSON.stringify({
            success: false,
            error: 'Method not allowed'
          }));
          return;
        }
      case 'bulk-fix':
        if (req.method === 'POST') {
          return components.validationController.bulkFixWarnings(req, res);
        } else {
          // Method not allowed
          res.writeHead(405, {
            'Content-Type': 'application/json',
            'Allow': 'POST'
          });
          res.end(JSON.stringify({
            success: false,
            error: 'Method not allowed'
          }));
          return;
        }
      case 'fix-warning':
        if (req.method === 'POST') {
          return components.validationController.fixWarning(req, res);
        } else {
          // Method not allowed
          res.writeHead(405, {
            'Content-Type': 'application/json',
            'Allow': 'POST'
          });
          res.end(JSON.stringify({
            success: false,
            error: 'Method not allowed'
          }));
          return;
        }
    }
  }

  // Deployment routes
  if (route.startsWith('deployment/')) {
    const deploymentRoute = route.replace('deployment/', '');
    switch (deploymentRoute) {
      case 'publishers':
        if (req.method === 'GET') {
          return handleGetPublishers(req, res);
        }
        break;
      case 'solutions':
        if (req.method === 'GET') {
          return handleGetSolutions(req, res);
        }
        break;
      case 'global-choices':
        if (req.method === 'GET') {
          return handleGetGlobalChoices(req, res);
        }
        break;
      case 'deploy':
        if (req.method === 'POST') {
          return components.deploymentController.deploySolution(req, res);
        }
        break;
      case 'test-connection':
        if (req.method === 'POST') {
          return components.deploymentController.testConnection(req, res);
        }
        break;
    }
  }

  // Deployment history routes
  if (route.startsWith('deployments/')) {
    const deploymentsRoute = route.replace('deployments/', '');
    
    // Handle /api/deployments/history
    if (deploymentsRoute === 'history') {
      if (req.method === 'GET') {
        return components.deploymentController.getDeploymentHistory(req, res);
      }
    }
    
    // Handle /api/deployments/compare
    if (deploymentsRoute === 'compare') {
      if (req.method === 'GET') {
        return components.deploymentController.compareDeployments(req, res);
      }
    }
    
    // Handle /api/deployments/{id}/details
    if (deploymentsRoute.endsWith('/details')) {
      if (req.method === 'GET') {
        return components.deploymentController.getDeploymentDetails(req, res);
      }
    }
  }

  // API routes
  switch (route) {
    case 'validate':
    case 'validate-erd':
      if (req.method === 'POST') {
        return components.validationController.validateERD(req, res);
      } else {
        // Method not allowed
        res.writeHead(405, {
          'Content-Type': 'application/json',
          'Allow': 'POST'
        });
        res.end(JSON.stringify({
          success: false,
          error: 'Method not allowed'
        }));
        return;
      }

    case 'publishers':
      if (req.method === 'GET') {
        return handleGetPublishers(req, res);
      }
      break;

    case 'solutions':
      if (req.method === 'GET') {
        return handleGetSolutions(req, res);
      }
      break;

    case 'global-choices-list':
      if (req.method === 'GET') {
        return handleGetGlobalChoices(req, res);
      }
      break;

    case 'solution-status':
      if (req.method === 'GET') {
        return components.adminController.getSolutionStatus(req, res);
      }
      break;

    case 'admin/health':
      if (req.method === 'GET') {
        return components.adminController.getDetailedHealth(req, res);
      }
      break;

    case 'admin/logs':
      if (req.method === 'GET') {
        return components.adminController.getLogs(req, res);
      }
      break;

    default:
      // Unknown API route
      await components.errorHandler.handle404(req, res);
  }
}

async function handleHealthCheck(req, res, components) {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'production',
      uptime: process.uptime()
    };

    // Get component health if available
    if (components.adminController) {
      try {
        const componentHealth = await components.adminController.getBasicHealth();
        health.components = componentHealth;
      } catch (error) {
        health.components = { error: error.message };
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health, null, 2));
  } catch (error) {
    await components.errorHandler.handle(error, req, res);
  }
}

// --- Server Startup -----------------------------------------------------
async function startServer() {
  try {
    const { server } = await createLayeredServer();
    
    const port = Number(process.env.PORT) || 8080;
    
    server.listen(port, '0.0.0.0', () => {
      console.log(`Dataverse ERD-to-Solution Wizard Server running on port ${port}`);
      if (process.env.NODE_ENV === 'development') {
        console.log(`Start frontend server and access wizard at: http://localhost:3003/wizard`);
      } else {
        console.log(`Access the wizard at: http://localhost:${port}/wizard`);
      }
    });

    // Graceful shutdown handling
    process.on('SIGINT', () => {
      console.log('\nShutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGTERM', () => {
      console.log('\nShutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Export for testing or programmatic use
module.exports = { startServer, initializeComponents, createLayeredServer };