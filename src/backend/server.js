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
// IMPORTANT: Use override: true to prioritize .env over shell environment variables
const fs = require('fs');
const envLocalPath = path.join(__dirname, '../../.env.local');
const envPath = path.join(__dirname, '../../.env');

if (fs.existsSync(envLocalPath)) {
  require('dotenv').config({ path: envLocalPath, override: true });
  console.log('📄 Loaded .env.local (overriding shell environment variables)');
} else if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath, override: true });
  console.log('📄 Loaded .env (overriding shell environment variables)');
} else {
  require('dotenv').config({ override: true }); // fallback to default behavior
  console.log('📄 Loaded default .env (overriding shell environment variables)');
}

// Log what was actually loaded
console.log('🔑 Authentication config loaded:');
console.log(`   CLIENT_ID: ${process.env.CLIENT_ID ? process.env.CLIENT_ID.substring(0, 8) + '...' : 'NOT SET'}`);
console.log(`   CLIENT_SECRET: ${process.env.CLIENT_SECRET ? 'SET (' + process.env.CLIENT_SECRET.substring(0, 10) + '...)' : 'NOT SET'}`);
console.log(`   DATAVERSE_URL: ${process.env.DATAVERSE_URL || 'NOT SET'}`);
console.log(`   Expected CLIENT_ID: 1048116d...`);

// --- Import New Architecture Layers ------------------------------------

// Controllers
const { WizardController } = require('./controllers/wizard-controller');
const ValidationController = require('./controllers/validation-controller');
const DeploymentController = require('./controllers/deployment-controller');
const { AdminController } = require('./controllers/admin-controller');
const RollbackController = require('./controllers/rollback-controller');
const { ImportController } = require('./controllers/import-controller');
const { AnalyticsController } = require('./controllers/analytics-controller');
const { SearchController } = require('./controllers/search-controller');
const { TemplatesController } = require('./controllers/templates-controller');

// Services
const { ValidationService } = require('./services/validation-service');
const { DeploymentService } = require('./services/deployment-service');
const { DeploymentHistoryService } = require('./services/deployment-history-service');
const { PublisherService } = require('./services/publisher-service');
const { GlobalChoicesService } = require('./services/global-choices-service');
const { SolutionService } = require('./services/solution-service');
const { RollbackService } = require('./services/rollback-service');
const { DataverseExtractorService } = require('./services/dataverse-extractor-service');
const CrossEnvironmentService = require('./services/cross-environment-service');

// Repositories
const { DataverseRepository } = require('./repositories/dataverse-repository');
const { ConfigurationRepository } = require('./repositories/configuration-repository');

// Environment Management
const EnvironmentManager = require('./environment-manager');
const DataverseClientFactory = require('./dataverse-client-factory');

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
    // Initialize environment manager FIRST (needed by services)
    const environmentManager = new EnvironmentManager();
    await environmentManager.initialize();
    
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
      environmentManager,
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

    const deploymentHistoryService = new DeploymentHistoryService({
      logger: console
    });

    const deploymentService = new DeploymentService({
      dataverseRepository: dataverseRepo,
      configRepository: configRepo,
      environmentManager,
      validationService,
      globalChoicesService,
      solutionService,
      publisherService,
      deploymentHistoryService,
      mermaidParser: new MermaidERDParser(), // Add the missing Mermaid parser
      logger: console
    });

    const rollbackService = new RollbackService({
      dataverseRepository: dataverseRepo,
      deploymentHistoryService,
      logger: console
    });

    const dataverseExtractorService = new DataverseExtractorService({
      dataverseRepository: dataverseRepo,
      configurationRepository: configRepo,
      logger: console
    });

    // Initialize middleware
    const requestLogger = new RequestLoggerMiddleware({
      logger: console,
      includeBody: process.env.LOG_REQUEST_BODY === 'true',
      maxBodySize: 10 * 1024 * 1024 // 10MB to handle large ERD files
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

    // New Phase-1 controllers
    const analyticsController = new AnalyticsController({ analyticsService: null });
    const searchController = new SearchController({ deploymentHistoryService });
    const templatesController = new TemplatesController({ templatesDir: path.join(__dirname, '../../data/templates') });

    // Set deployment history service on the deployment controller
    deploymentController.setDeploymentHistoryService(deploymentHistoryService);

    // Environment manager already initialized at the top of this function
    // Initialize Dataverse client factory
    const dataverseClientFactory = new DataverseClientFactory(environmentManager);

    const adminController = new AdminController(
      publisherService,
      globalChoicesService,
      solutionService,
      {
        environmentManager,
        dataverseClientFactory
      }
    );

    const rollbackController = new RollbackController(rollbackService, {
      deploymentHistoryService,
      environmentManager,
      dataverseClientFactory
    });

    const importController = new ImportController({
      dataverseExtractorService,
      validationService,
      environmentManager
    });

    // Initialize cross-environment service (depends on environmentManager and dataverseClientFactory)
    const crossEnvironmentService = new CrossEnvironmentService({
      environmentManager,
      dataverseClientFactory,
      validationService,
      deploymentService,
      rollbackService,
      logger: console
    });

    appComponents = {
      // Repositories
      configRepo,
      dataverseRepo,
      
      // Services
      validationService,
      deploymentService,
      rollbackService,
      dataverseExtractorService,
      crossEnvironmentService,
      globalChoicesService,
      publisherService,
      solutionService,
      deploymentHistoryService,
      
      // Environment Management
      environmentManager,
      dataverseClientFactory,
      
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
      rollbackController,
      importController,
      adminController,
      
      // Phase-1 controllers
      analyticsController,
      searchController,
      templatesController
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
      verbose: process.env.NODE_ENV === 'development' || process.env.DATAVERSE_VERBOSE === 'true'
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
    // Create DataverseRepository with proper authentication
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
    const result = await appComponents.solutionService.getSolutions();
    console.log('🔍 DEBUG: SolutionService result:', {
      success: result.success,
      hasData: !!result.data,
      dataType: typeof result.data,
      dataLength: Array.isArray(result.data) ? result.data.length : 'not array'
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to get solutions');
    }
    
    const response = { success: true, solutions: result.data };
    console.log('🔍 DEBUG: Final response:', {
      solutionsCount: response.solutions.length,
      responseSize: JSON.stringify(response).length + ' bytes'
    });
    
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify(response));
    
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
    // Create DataverseRepository with proper authentication
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

  // Increase server timeout to 10 minutes for very long operations (e.g., rolling back many entities)
  // Default is 120 seconds (2 minutes) which is too short for complex Dataverse operations
  // Each entity deletion can take 2-3 minutes, so multiple entities need longer timeout
  server.setTimeout(600000); // 600 seconds (10 minutes)

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

  // Storage health check route
  if (route === 'health/storage' && req.method === 'GET') {
    return handleStorageHealthCheck(req, res, components);
  }

  // Configuration routes
  if (route === 'config/environment') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      
      // For backward compatibility, return default environment or legacy config
      const defaultEnv = components.environmentManager.getDefaultEnvironment();
      if (defaultEnv) {
        res.end(JSON.stringify({
          dataverseUrl: defaultEnv.url,
          tenantId: process.env.TENANT_ID || '',
          clientId: process.env.CLIENT_ID || ''
        }));
      } else {
        // Fallback to legacy environment variables
        res.end(JSON.stringify({
          dataverseUrl: process.env.DATAVERSE_URL || '',
          tenantId: process.env.TENANT_ID || '',
          clientId: process.env.CLIENT_ID || ''
        }));
      }
      return;
    }
  }

  // Multi-environment management routes
  if (route === 'environments') {
    if (req.method === 'GET') {
      try {
        const environments = components.environmentManager.getEnvironments();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          environments,
          defaultEnvironmentId: components.environmentManager.defaultEnvironmentId
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }
    
    if (req.method === 'POST') {
      try {
        const body = await readRequestBody(req);
        const environment = JSON.parse(body);
        
        await components.environmentManager.setEnvironment(environment);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, environment }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }
  }

  if (route.startsWith('environments/')) {
    const envId = route.replace('environments/', '');
    
    if (req.method === 'GET') {
      try {
        const environment = components.environmentManager.getEnvironment(envId);
        if (!environment) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Environment not found' }));
          return;
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(environment));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }
    
    if (req.method === 'PUT') {
      try {
        const body = await readRequestBody(req);
        const environment = JSON.parse(body);
        environment.id = envId; // Ensure ID matches URL
        
        await components.environmentManager.setEnvironment(environment);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, environment }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }
    
    if (req.method === 'DELETE') {
      try {
        await components.environmentManager.removeEnvironment(envId);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }
  }

  if (route === 'environments/default') {
    if (req.method === 'POST') {
      try {
        const body = await readRequestBody(req);
        const { environmentId } = JSON.parse(body);
        
        await components.environmentManager.setDefaultEnvironment(environmentId);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, defaultEnvironmentId: environmentId }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }
  }

  if (route.startsWith('environments/') && route.endsWith('/validate')) {
    const envId = route.replace('environments/', '').replace('/validate', '');
    
    if (req.method === 'POST') {
      try {
        const validation = await components.environmentManager.validateEnvironment(envId);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(validation));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }
  }

  if (route.startsWith('environments/') && route.endsWith('/test-connection')) {
    const envId = route.replace('environments/', '').replace('/test-connection', '');
    
    if (req.method === 'POST') {
      try {
        const result = await components.dataverseClientFactory.testConnection(envId);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }
  }

  if (route.startsWith('environments/') && route.endsWith('/metadata')) {
    const envId = route.replace('environments/', '').replace('/metadata', '');
    
    if (req.method === 'GET') {
      try {
        const metadata = await components.dataverseClientFactory.getEnvironmentMetadata(envId);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(metadata));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }
  }

  // Import routes
  if (route.startsWith('import/')) {
    const importRoute = route.replace('import/', '');
    
    if (importRoute === 'sources') {
      if (req.method === 'GET') {
        return components.importController.getImportSources(req, res);
      }
    }
    
    if (importRoute.startsWith('dataverse-solution')) {
      const subRoute = importRoute.replace('dataverse-solution', '').replace(/^\//, '');
      
      switch (subRoute) {
        case '':
          if (req.method === 'POST') {
            return components.importController.importDataverseSolution(req, res);
          }
          break;
        case 'preview':
          if (req.method === 'GET') {
            return components.importController.previewDataverseSolution(req, res);
          }
          break;
        case 'test-connection':
          if (req.method === 'POST') {
            return components.importController.testDataverseConnection(req, res);
          }
          break;
      }
    }
  }

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
          return components.adminController.getPublishers(req, res);
        }
        break;
      case 'solutions':
        if (req.method === 'GET') {
          return components.adminController.getSolutions(req, res);
        }
        break;
      case 'global-choices':
        if (req.method === 'GET') {
          return components.adminController.getGlobalChoices(req, res);
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

  // Rollback routes
  if (route.startsWith('rollback/')) {
    const rollbackRoute = route.replace('rollback/', '');
    
    // Handle /api/rollback/{deploymentId}/can-rollback
    if (rollbackRoute.endsWith('/can-rollback')) {
      if (req.method === 'GET') {
        const deploymentId = rollbackRoute.replace('/can-rollback', '');
        return components.rollbackController.checkRollbackCapability(req, res, deploymentId);
      }
    }
    
    // Handle /api/rollback/{deploymentId}/execute
    if (rollbackRoute.endsWith('/execute')) {
      console.log('🔍 SERVER ROUTING: Matched /execute route, method:', req.method);
      if (req.method === 'POST') {
        console.log('🔍 SERVER ROUTING: POST method confirmed, body already in req.rawBody');
        const deploymentId = rollbackRoute.replace('/execute', '');
        // Body already read by request logger middleware and stored in req.rawBody
        // No need to call readRequestBody again (would hang on already-consumed stream)
        console.log('🔍 SERVER ROUTING: Calling controller.executeRollback()...');
        return components.rollbackController.executeRollback(req, res, deploymentId);
      }
    }
    
    // Handle /api/rollback/{rollbackId}/status
    if (rollbackRoute.endsWith('/status')) {
      if (req.method === 'GET') {
        const rollbackId = rollbackRoute.replace('/status', '');
        return components.rollbackController.getRollbackStatus(req, res, rollbackId);
      }
    }
    
    // Handle /api/rollback/history/{deploymentId}
    if (rollbackRoute.startsWith('history/')) {
      if (req.method === 'GET') {
        const deploymentId = rollbackRoute.replace('history/', '');
        return components.rollbackController.getRollbackHistory(req, res, deploymentId);
      }
    }
    
    // Handle /api/rollback/active
    if (rollbackRoute === 'active') {
      if (req.method === 'GET') {
        return components.rollbackController.getActiveRollbacks(req, res);
      }
    }
  }

  // Cross-environment routes
  if (route.startsWith('cross-environment/')) {
    const crossEnvRoute = route.replace('cross-environment/', '');
    
    if (crossEnvRoute === 'import') {
      if (req.method === 'POST') {
        try {
          const body = await readRequestBody(req);
          const { sourceEnvironmentId, solutionName } = JSON.parse(body);
          
          const result = await components.crossEnvironmentService.importFromEnvironment(
            sourceEnvironmentId, 
            solutionName
          );
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
        return;
      }
    }
    
    if (crossEnvRoute === 'deploy') {
      if (req.method === 'POST') {
        try {
          const body = await readRequestBody(req);
          const { targetEnvironmentId, solutionData, deploymentOptions } = JSON.parse(body);
          
          const result = await components.crossEnvironmentService.deployToEnvironment(
            targetEnvironmentId, 
            solutionData, 
            deploymentOptions
          );
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
        return;
      }
    }
    
    if (crossEnvRoute === 'pipeline') {
      if (req.method === 'POST') {
        try {
          const body = await readRequestBody(req);
          const pipelineConfig = JSON.parse(body);
          
          const result = await components.crossEnvironmentService.executePipeline(pipelineConfig);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
        return;
      }
    }
    
    if (crossEnvRoute.startsWith('solutions/')) {
      const envId = crossEnvRoute.replace('solutions/', '');
      
      if (req.method === 'GET') {
        try {
          const solutions = await components.crossEnvironmentService.getAvailableSolutions(envId);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ solutions }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
        return;
      }
    }
    
    if (crossEnvRoute === 'compare') {
      if (req.method === 'POST') {
        try {
          const body = await readRequestBody(req);
          const { sourceEnvironmentId, targetEnvironmentId } = JSON.parse(body);
          
          const comparison = await components.crossEnvironmentService.compareEnvironments(
            sourceEnvironmentId, 
            targetEnvironmentId
          );
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(comparison));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
        return;
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
        return components.adminController.getPublishers(req, res);
      }
      break;

    case 'solutions':
      if (req.method === 'GET') {
        return components.adminController.getSolutions(req, res);
      }
      break;

    case 'global-choices-list':
      if (req.method === 'GET') {
        return components.adminController.getGlobalChoices(req, res);
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

    case 'config':
      if (req.method === 'GET') {
        // Return configuration data needed by the frontend
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: {
            powerPlatformEnvironmentId: process.env.POWER_PLATFORM_ENVIRONMENT_ID
          }
        }));
        return;
      }
      break;

    case 'deployment-history':
      if (req.method === 'POST') {
        return handleCreateDeploymentRecord(req, res, components);
      }
      if (req.method === 'GET') {
        return handleGetDeploymentHistory(req, res, components);
      }
      break;

    case 'deployments/history':
      if (req.method === 'GET') {
        return handleGetDeploymentHistory(req, res, components);
      }
      break;

    // Phase-1: Analytics routes
    case 'analytics/deployment-trends':
      if (req.method === 'GET') {
        return components.analyticsController.getDeploymentTrends(req, res);
      }
      break;

    case 'analytics/success-rates':
      if (req.method === 'GET') {
        return components.analyticsController.getSuccessRates(req, res);
      }
      break;

    case 'analytics/rollback-frequency':
      if (req.method === 'GET') {
        return components.analyticsController.getRollbackFrequency(req, res);
      }
      break;

    // Phase-1: Search routes
    case 'deployments/search':
      if (req.method === 'GET') {
        return components.searchController.searchDeployments(req, res);
      }
      break;

    // Phase-1: Templates routes
    case 'templates':
      if (req.method === 'GET') {
        return components.templatesController.listTemplates(req, res);
      }
      if (req.method === 'POST') {
        return components.templatesController.createTemplate(req, res);
      }
      break;

    default:
      // Check for templates by ID (dynamic routes)
      if (route.startsWith('templates/')) {
        if (req.method === 'GET') {
          return components.templatesController.getTemplate(req, res);
        }
        if (req.method === 'DELETE') {
          return components.templatesController.deleteTemplate(req, res);
        }
      }

      // Unknown API route
      await components.errorHandler.handle404(req, res);
  }
}

// --- Deployment History API Handlers -----------------------------------
async function handleCreateDeploymentRecord(req, res, components) {
  try {
    console.log('🎯 POST /api/deployment-history - Creating deployment record');
    
    const body = req.rawBody;
    if (!body) {
      throw new Error('Request body is required');
    }
    
    const deploymentData = JSON.parse(body);
    console.log('🎯 Parsed deployment data:', { 
      environmentSuffix: deploymentData.environmentSuffix,
      status: deploymentData.status
    });
    
    // Use the deployment history service to record the deployment
    const deploymentId = await components.deploymentHistoryService.recordDeployment(deploymentData);
    console.log('🎯 Deployment recorded with ID:', deploymentId);
    
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      deploymentId,
      message: 'Deployment record created successfully'
    }));
  } catch (error) {
    console.error('❌ Failed to create deployment record:', error);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error.message
    }));
  }
}

async function handleGetDeploymentHistory(req, res, components) {
  try {
    const { query } = url.parse(req.url, true);
    const environmentSuffix = query.environmentSuffix || 'default';
    const limit = parseInt(query.limit) || 10;
    const includeDetails = query.includeDetails !== 'false'; // Default to true
    
    console.log('🔧 DEBUG: handleGetDeploymentHistory called', { environmentSuffix, limit, includeDetails });
    
    // Get basic history from index
    const history = await components.deploymentHistoryService.getDeploymentHistory(environmentSuffix, limit);
    console.log('🔧 DEBUG: Basic history loaded:', history.length, 'deployments');
    
    // If details are requested, load full deployment records
    let enrichedHistory = history;
    if (includeDetails && history.length > 0) {
      console.log('🔧 DEBUG: Loading full deployment records...');
      enrichedHistory = [];
      for (const deployment of history) {
        try {
          // Load full deployment record
          const fullRecord = await components.deploymentHistoryService.getDeployment(deployment.deploymentId);
          console.log('🔧 DEBUG: Full record for', deployment.deploymentId, ':', !!fullRecord, fullRecord ? 'has solutionInfo:' + !!fullRecord.solutionInfo : '');
          if (fullRecord) {
            // Merge index data with full record data
            enrichedHistory.push({
              ...deployment,
              solutionInfo: fullRecord.solutionInfo || null,
              rollbackData: fullRecord.rollbackData || null,
              erdContent: fullRecord.erdContent || null,
              deploymentLogs: fullRecord.deploymentLogs || [],
              metadata: fullRecord.metadata || {}
            });
          } else {
            // Fallback to index data if full record not found
            enrichedHistory.push(deployment);
          }
        } catch (error) {
          console.warn(`Failed to load full record for deployment ${deployment.deploymentId}:`, error.message);
          enrichedHistory.push(deployment);
        }
      }
      console.log('🔧 DEBUG: Enriched history prepared with', enrichedHistory.length, 'deployments');
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      environmentSuffix,
      deployments: enrichedHistory,
      count: enrichedHistory.length
    }));
  } catch (error) {
    console.error('Failed to get deployment history:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error.message,
      deployments: []
    }));
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

async function handleStorageHealthCheck(req, res, components) {
  try {
    const startTime = Date.now();
    let storageHealth = {
      status: 'unknown',
      type: 'unknown',
      timestamp: new Date().toISOString(),
      responseTime: 0
    };

    // Check storage via deployment history service
    if (components.deploymentHistoryService) {
      try {
        // Test storage connectivity by checking storage type
        const isAzureStorage = process.env.USE_AZURE_STORAGE === 'true' || process.env.AZURE_STORAGE_ACCOUNT_NAME;
        
        if (isAzureStorage) {
          storageHealth.type = 'azure-blob';
          storageHealth.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'deployments';
          storageHealth.accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
        } else {
          storageHealth.type = 'local-filesystem';
          storageHealth.basePath = './data/deployments';
        }

        // Test storage by getting deployment history (should not fail even if empty)
        const testResult = await components.deploymentHistoryService.getDeploymentHistory('health-check', 1);
        storageHealth.status = 'healthy';
        storageHealth.testResult = 'accessible';
        storageHealth.testRecordsCount = testResult ? testResult.length : 0;
        
      } catch (error) {
        storageHealth.status = 'unhealthy';
        storageHealth.error = error.message;
        storageHealth.testResult = 'failed';
      }
    } else {
      storageHealth.status = 'unavailable';
      storageHealth.error = 'DeploymentHistoryService not available';
    }

    storageHealth.responseTime = Date.now() - startTime;

    const response = {
      storage: storageHealth,
      timestamp: new Date().toISOString()
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response, null, 2));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      storage: {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }, null, 2));
  }
}

// --- Server Startup -----------------------------------------------------
async function startServer() {
  try {
    const { server } = await createLayeredServer();
    
    const port = process.env.PORT !== undefined ? Number(process.env.PORT) : 8080;
    
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