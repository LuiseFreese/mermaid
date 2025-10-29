/**
 * Admin Controller
 * Handles HTTP requests for administrative endpoints (publishers, choices, status)
 */
const { BaseController } = require('./base-controller');

class AdminController extends BaseController {
    constructor(publisherService, globalChoicesService, solutionService, options = {}) {
        super();
        this.publisherService = publisherService;
        this.globalChoicesService = globalChoicesService;
        this.solutionService = solutionService;
        this.environmentManager = options.environmentManager;
        this.dataverseClientFactory = options.dataverseClientFactory;
        
        // Validate dependencies
        if (!this.publisherService || !this.globalChoicesService || !this.solutionService) {
            throw new Error('AdminController requires publisherService, globalChoicesService, and solutionService dependencies');
        }
    }

    /**
     * Get list of publishers
     * GET /api/publishers?environmentId=<id>
     */
    async getPublishers(req, res) {
        this.log('getPublishers', { method: req.method, url: req.url });

        try {
            const url = require('url');
            const urlParts = url.parse(req.url, true);
            
            console.log('🔍 AdminController.getPublishers - Request URL:', req.url);
            console.log('🔍 AdminController.getPublishers - Query params:', urlParts.query);
            
            // Extract environmentId from query parameters
            const environmentId = urlParts.query.environmentId;
            console.log('🔍 AdminController.getPublishers - environmentId:', environmentId);

            // If environmentId is provided, get environment-specific config
            let result;
            if (environmentId && this.environmentManager) {
                console.log('🎯 Using environment-specific client for:', environmentId);
                
                // Get environment configuration
                const environment = this.environmentManager.getEnvironment(environmentId);
                if (!environment) {
                    console.error('❌ Environment not found:', environmentId);
                    return this.sendError(res, 404, `Environment not found: ${environmentId}`);
                }
                
                console.log('✅ Found environment:', environment.name, environment.url);

                // Get environment configuration
                const envConfig = this.environmentManager.getEnvironmentConfig(environmentId);
                console.log('✅ Environment config:', { serverUrl: envConfig.serverUrl });
                
                // Get publishers with environment-specific config
                result = await this.publisherService.getPublishers(envConfig);
            } else {
                console.log('⚠️  No environmentId provided - returning empty publishers list');
                console.log('   Multi-environment mode requires an environmentId parameter');
                // In multi-environment mode, environment selection is required
                result = { 
                    success: true, 
                    data: { publishers: [] },
                    message: 'No environment selected' 
                };
            }
            
            console.log('📊 Publishers result:', result.success, 'Publishers count:', result.data?.publishers?.length || 0);
            
            if (result.success) {
                this.sendSuccess(res, { 
                    publishers: result.data.publishers || []
                });
            } else {
                this.sendError(res, 500, result.message, {
                    publishers: []
                });
            }

        } catch (error) {
            console.error('❌ AdminController.getPublishers error:', error);
            this.sendInternalError(res, 'Failed to get publishers', error);
        }
    }

    /**
     * Create a new publisher
     * POST /api/publishers
     */
    async createPublisher(req, res) {
        try {
            const data = await this.parseRequestBody(req);
            this.validateRequiredFields(data, ['uniqueName', 'friendlyName', 'prefix']);

            const result = await this.publisherService.createPublisher({
                uniqueName: data.uniqueName,
                friendlyName: data.friendlyName,
                prefix: data.prefix,
                description: data.description
            });
            
            if (result.success) {
                this.sendSuccess(res, { 
                    publisher: result.data,
                    message: 'Publisher created successfully'
                });
            } else {
                this.sendError(res, 400, result.message);
            }

        } catch (error) {
            if (error.message.includes('Missing required')) {
                this.sendBadRequest(res, error.message);
            } else {
                this.sendInternalError(res, 'Failed to create publisher', error);
            }
        }
    }

    /**
     * Get list of global choices
     * GET /api/global-choices-list
     */
    async getGlobalChoices(req, res) {
        this.log('getGlobalChoices', { method: req.method, url: req.url });

        try {
            const url = require('url');
            const urlParts = url.parse(req.url, true);
            
            // Extract environmentId from query params (required for multi-environment support)
            const environmentId = urlParts.query.environmentId;
            
            if (!environmentId) {
                return this.sendError(res, 400, 'Missing required parameter: environmentId', {
                    all: [],
                    grouped: { custom: [], builtIn: [] },
                    summary: { total: 0, custom: 0, builtIn: 0 }
                });
            }
            
            const options = {
                environmentId,  // Pass environmentId to service
                includeBuiltIn: urlParts.query.includeBuiltIn !== 'false',
                includeCustom: urlParts.query.includeCustom !== 'false',
                limit: parseInt(urlParts.query.limit) || undefined,
                filter: urlParts.query.filter || undefined
            };

            const result = await this.globalChoicesService.getGlobalChoices(options);
            
            if (result.success) {
                this.sendSuccess(res, result.data);
            } else {
                this.sendError(res, 500, result.message, {
                    all: [],
                    grouped: { custom: [], builtIn: [] },
                    summary: { total: 0, custom: 0, builtIn: 0 }
                });
            }

        } catch (error) {
            this.sendInternalError(res, 'Failed to get global choices', error);
        }
    }

    /**
     * Create custom global choice
     * POST /api/global-choices
     */
    async createGlobalChoice(req, res) {
        try {
            const data = await this.parseRequestBody(req);
            this.validateRequiredFields(data, ['name', 'options']);

            if (!Array.isArray(data.options) || data.options.length === 0) {
                return this.sendBadRequest(res, 'Options must be a non-empty array');
            }

            const result = await this.globalChoicesService.createCustomGlobalChoice({
                name: data.name,
                displayName: data.displayName || data.name,
                description: data.description,
                options: data.options,
                publisherPrefix: data.publisherPrefix
            });
            
            if (result.success) {
                this.sendSuccess(res, { 
                    globalChoice: result.data,
                    message: 'Global choice created successfully'
                });
            } else {
                this.sendError(res, 400, result.message);
            }

        } catch (error) {
            if (error.message.includes('Missing required') || error.message.includes('must be')) {
                this.sendBadRequest(res, error.message);
            } else {
                this.sendInternalError(res, 'Failed to create global choice', error);
            }
        }
    }

    /**
     * Get solution status and components
     * GET /api/solution-status?solution=<solutionName>
     */
    async getSolutionStatus(req, res) {
        this.log('getSolutionStatus', { method: req.method, url: req.url });

        try {
            const url = require('url');
            const urlParts = url.parse(req.url, true);
            const solutionName = urlParts.query.solution;

            if (!solutionName) {
                return this.sendBadRequest(res, 'Solution name is required as query parameter: ?solution=SolutionName');
            }

            const result = await this.solutionService.getSolutionStatus(solutionName);
            
            if (result.success) {
                this.sendSuccess(res, result.data);
            } else {
                this.sendError(res, 404, result.message);
            }

        } catch (error) {
            this.sendInternalError(res, 'Failed to get solution status', error);
        }
    }

    /**
     * Get list of solutions
     * GET /api/solutions?environmentId=<id>
     */
    async getSolutions(req, res) {
        try {
            const url = require('url');
            const urlParts = url.parse(req.url, true);
            
            console.log('🔍 AdminController.getSolutions - Request URL:', req.url);
            console.log('🔍 AdminController.getSolutions - Query params:', urlParts.query);
            
            const options = {
                includeManaged: urlParts.query.includeManaged === 'true',
                includeUnmanaged: urlParts.query.includeUnmanaged !== 'false',
                limit: parseInt(urlParts.query.limit) || undefined
            };

            // Extract environmentId from query parameters
            const environmentId = urlParts.query.environmentId;
            console.log('🔍 AdminController.getSolutions - environmentId:', environmentId);

            // If environmentId is provided, get environment-specific config
            let result;
            if (environmentId && this.environmentManager) {
                console.log('🎯 Using environment-specific client for:', environmentId);
                
                // Get environment configuration
                const environment = this.environmentManager.getEnvironment(environmentId);
                if (!environment) {
                    console.error('❌ Environment not found:', environmentId);
                    return this.sendError(res, 404, `Environment not found: ${environmentId}`);
                }
                
                console.log('✅ Found environment:', environment.name, environment.url);

                // Get environment configuration
                const envConfig = this.environmentManager.getEnvironmentConfig(environmentId);
                console.log('✅ Environment config:', { serverUrl: envConfig.serverUrl });
                
                // Pass environment config through options
                const optionsWithEnv = {
                    ...options,
                    environmentConfig: envConfig
                };

                // Get solutions with environment-specific config
                result = await this.solutionService.getSolutions(optionsWithEnv);
            } else {
                console.log('⚠️  No environmentId provided - returning empty solutions list');
                console.log('   Multi-environment mode requires an environmentId parameter');
                // In multi-environment mode, environment selection is required
                result = { 
                    success: true, 
                    data: [],
                    message: 'No environment selected' 
                };
            }
            
            console.log('📊 Solutions result:', result.success, 'Solutions count:', result.data?.length || 0);
            
            if (result.success) {
                // Send response in the format frontend expects: { success: true, solutions: [...] }
                this.sendSuccess(res, { solutions: result.data });
            } else {
                this.sendError(res, 500, result.message);
            }

        } catch (error) {
            console.error('❌ AdminController.getSolutions error:', error);
            this.sendInternalError(res, 'Failed to get solutions', error);
        }
    }

    /**
     * Delete solution (with confirmation)
     * DELETE /api/solutions/<solutionName>
     */
    async deleteSolution(req, res) {
        try {
            const pathParts = req.url.split('/');
            const solutionName = pathParts[pathParts.length - 1];

            if (!solutionName) {
                return this.sendBadRequest(res, 'Solution name is required in URL path');
            }

            const data = await this.parseRequestBody(req);
            if (data.confirm !== true) {
                return this.sendBadRequest(res, 'Deletion must be confirmed by setting confirm: true');
            }

            const result = await this.solutionService.deleteSolution(solutionName, {
                force: data.force === true
            });
            
            if (result.success) {
                this.sendSuccess(res, { 
                    message: `Solution '${solutionName}' deleted successfully`,
                    solutionName
                });
            } else {
                this.sendError(res, 400, result.message);
            }

        } catch (error) {
            this.sendInternalError(res, 'Failed to delete solution', error);
        }
    }

    /**
     * Clean up test entities and relationships
     * POST /cleanup
     */
    async cleanupTestEntities(req, res) {
        this.log('cleanupTestEntities', { method: req.method, url: req.url });

        try {
            const data = await this.parseRequestBody(req);
            
            const cleanupOptions = {
                cleanupAll: data.cleanupAll || false,
                entityPrefixes: data.entityPrefixes || [],
                preserveCDM: data.preserveCDM !== false,
                deleteRelationshipsFirst: data.deleteRelationshipsFirst !== false,
                dataverseUrl: data.dataverseUrl,
                tenantId: data.tenantId,
                clientId: data.clientId,
                managedIdentityClientId: data.managedIdentityClientId
            };

            const result = await this.solutionService.cleanupTestEntities(cleanupOptions);
            
            if (result.success) {
                this.sendSuccess(res, result.data);
            } else {
                this.sendError(res, 500, result.message);
            }

        } catch (error) {
            this.sendInternalError(res, 'Failed to cleanup test entities', error);
        }
    }

    /**
     * Get system health status
     * GET /health
     */
    async getHealthStatus(req, res) {
        try {
            const healthResult = await this.performHealthChecks();
            
            const statusCode = healthResult.healthy ? 200 : 503;
            this.sendJson(res, statusCode, healthResult);

        } catch (error) {
            this.sendJson(res, 503, {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Perform system health checks
     * @returns {Promise<Object>} Health status
     */
    async performHealthChecks() {
        const checks = {
            timestamp: new Date().toISOString(),
            status: 'healthy',
            healthy: true,
            services: {}
        };

        try {
            // Check publisher service
            const publisherCheck = await this.publisherService.healthCheck();
            checks.services.publisher = {
                status: publisherCheck.success ? 'healthy' : 'unhealthy',
                message: publisherCheck.message || 'OK'
            };

            // Check global choices service
            const choicesCheck = await this.globalChoicesService.healthCheck();
            checks.services.globalChoices = {
                status: choicesCheck.success ? 'healthy' : 'unhealthy',
                message: choicesCheck.message || 'OK'
            };

            // Check solution service
            const solutionCheck = await this.solutionService.healthCheck();
            checks.services.solution = {
                status: solutionCheck.success ? 'healthy' : 'unhealthy',
                message: solutionCheck.message || 'OK'
            };

            // Overall health
            const unhealthyServices = Object.values(checks.services)
                .filter(service => service.status === 'unhealthy');
            
            if (unhealthyServices.length > 0) {
                checks.healthy = false;
                checks.status = 'degraded';
            }

        } catch (error) {
            checks.healthy = false;
            checks.status = 'unhealthy';
            checks.error = error.message;
        }

        return checks;
    }

    /**
     * Get detailed system health for admin panel
     * GET /api/admin/health
     */
    async getDetailedHealth(req, res) {
        this.log('getDetailedHealth', { method: req.method, url: req.url });

        try {
            const detailedHealth = await this.performDetailedHealthChecks();
            this.sendSuccess(res, detailedHealth);

        } catch (error) {
            this.sendInternalError(res, 'Failed to get detailed health status', error);
        }
    }

    /**
     * Get basic health status for components
     * @returns {Promise<Object>} Basic health status
     */
    async getBasicHealth() {
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            components: {
                adminController: 'healthy',
                publisherService: 'healthy',
                globalChoicesService: 'healthy',
                solutionService: 'healthy'
            }
        };
    }

    /**
     * Get application logs
     * GET /api/admin/logs
     */
    async getLogs(req, res) {
        this.log('getLogs', { method: req.method, url: req.url });

        try {
            const url = require('url');
            const urlParts = url.parse(req.url, true);
            
            const limit = parseInt(urlParts.query.limit) || 50;
            const level = urlParts.query.level || 'all';
            
            // Get recent logs from console buffer
            const logs = console.getLastLogs ? console.getLastLogs() : [];
            
            let filteredLogs = logs;
            if (level !== 'all') {
                filteredLogs = logs.filter(log => log.toLowerCase().includes(`[${level.toUpperCase()}]`));
            }
            
            // Limit results
            const recentLogs = filteredLogs.slice(-limit);
            
            this.sendSuccess(res, {
                logs: recentLogs,
                total: recentLogs.length,
                level,
                limit,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.sendInternalError(res, 'Failed to get logs', error);
        }
    }

    /**
     * Perform detailed health checks for admin panel
     * @returns {Promise<Object>} Detailed health status
     */
    async performDetailedHealthChecks() {
        const health = {
            timestamp: new Date().toISOString(),
            status: 'healthy',
            overall: {
                healthy: true,
                uptime: process.uptime(),
                version: process.env.npm_package_version || '1.0.0',
                environment: process.env.NODE_ENV || 'production',
                memoryUsage: process.memoryUsage(),
                platform: process.platform,
                nodeVersion: process.version
            },
            services: {},
            dataverse: {
                connected: false,
                lastCheck: null,
                configuration: {
                    hasServerUrl: !!process.env.DATAVERSE_URL,
                    hasCredentials: !!(process.env.CLIENT_ID && process.env.MANAGED_IDENTITY_CLIENT_ID),
                    source: 'environment'
                }
            }
        };

        try {
            // Check each service
            health.services.publisher = await this.checkServiceHealth(this.publisherService);
            health.services.globalChoices = await this.checkServiceHealth(this.globalChoicesService);
            health.services.solution = await this.checkServiceHealth(this.solutionService);

            // Include services as components for API compatibility
            health.components = health.services;

            // Check overall health
            const unhealthyServices = Object.values(health.services)
                .filter(service => service.status === 'unhealthy');
            
            if (unhealthyServices.length > 0) {
                health.overall.healthy = false;
                health.status = 'degraded';
            }

        } catch (error) {
            health.overall.healthy = false;
            health.status = 'unhealthy';
            health.error = error.message;
        }

        return health;
    }

    /**
     * Check individual service health
     * @param {Object} service - Service to check
     * @returns {Promise<Object>} Service health status
     */
    async checkServiceHealth(service) {
        try {
            if (service && typeof service.healthCheck === 'function') {
                const result = await service.healthCheck();
                return {
                    status: result.success ? 'healthy' : 'unhealthy',
                    message: result.message || 'OK',
                    lastCheck: new Date().toISOString(),
                    details: result.details || {}
                };
            } else {
                return {
                    status: 'unknown',
                    message: 'Health check method not available',
                    lastCheck: new Date().toISOString()
                };
            }
        } catch (error) {
            return {
                status: 'unhealthy',
                message: error.message,
                lastCheck: new Date().toISOString(),
                error: error.name
            };
        }
    }
}

module.exports = { AdminController };
