/**
 * Rollback Controller
 * Handles all rollback-related HTTP requests
 */

const { RollbackStatusTracker } = require('../services/rollback-status-tracker');

class RollbackController {
    constructor(rollbackService, dependencies = {}) {
        this.rollbackService = rollbackService;
        this.statusTracker = new RollbackStatusTracker();
        this.deploymentHistoryService = dependencies.deploymentHistoryService;
        this.environmentManager = dependencies.environmentManager;
        this.dataverseClientFactory = dependencies.dataverseClientFactory;
    }

    /**
     * Check if a deployment can be rolled back
     * GET /api/rollback/{deploymentId}/can-rollback
     */
    async checkRollbackCapability(req, res, deploymentId) {        
        try {
            const capability = await this.rollbackService.canRollback(deploymentId);
            
            const response = {
                success: true,
                data: capability,
                timestamp: new Date().toISOString()
            };

            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify(response));
            
        } catch (error) {
            console.error('❌ ROLLBACK CAPABILITY CHECK ERROR:', error);
            this.sendError(res, 500, error.message);
        }
    }

    /**
     * Execute a rollback for a specific deployment (async - returns immediately)
     * POST /api/rollback/{deploymentId}/execute
     */
    async executeRollback(req, res, deploymentId) {
        console.log('🎯 ROLLBACK CONTROLLER: Starting rollback for deployment', deploymentId);
        
        // Parse request body
        let body = {};
        if (req.rawBody) {
            try {
                body = JSON.parse(req.rawBody);
            } catch (e) {
                console.error('❌ Failed to parse request body:', e);
                return this.sendError(res, 400, 'Invalid JSON in request body');
            }
        }
        
        const { confirm, options, environmentId } = body;

        // Require explicit confirmation
        if (!confirm) {
            console.error('❌ ROLLBACK CONTROLLER: Confirmation not received');
            return this.sendError(res, 400, 'Rollback requires explicit confirmation. Set "confirm": true in request body.');
        }

        try {
            // Get deployment info to determine environment
            let deployment = null;
            let targetEnvironmentId = environmentId;
            
            if (this.deploymentHistoryService) {
                deployment = await this.deploymentHistoryService.getDeploymentById(deploymentId);
                if (deployment && !targetEnvironmentId) {
                    // Use environment from deployment if not provided
                    targetEnvironmentId = deployment.environmentId || deployment.environmentSuffix || 'default';
                }
            }
            
            // Check if rollback is possible
            const capability = await this.rollbackService.canRollback(deploymentId);
            
            if (!capability.canRollback) {
                return this.sendError(res, 400, capability.reason);
            }

            // Generate unique rollback ID
            const rollbackId = `rollback_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            
            // Create tracking entry
            this.statusTracker.create(rollbackId, deploymentId);
            
            // Start rollback in background (don't await)
            this.executeRollbackAsync(rollbackId, deploymentId, options, targetEnvironmentId);
            
            // Return immediately with 202 Accepted
            const response = {
                success: true,
                message: 'Rollback started. Poll /api/rollback/{rollbackId}/status for progress.',
                rollbackId,
                deploymentId,
                environmentId: targetEnvironmentId,
                statusUrl: `/api/rollback/${rollbackId}/status`,
                timestamp: new Date().toISOString()
            };

            res.writeHead(202, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify(response));
            
            console.log(`✅ ROLLBACK CONTROLLER: Started async rollback ${rollbackId}`);
            
        } catch (error) {
            console.error('❌ ROLLBACK ERROR:', error);
            this.sendError(res, 500, error.message);
        }
    }

    /**
     * Execute rollback asynchronously in the background
     * @param {string} rollbackId - Rollback identifier
     * @param {string} deploymentId - Deployment to rollback
     * @param {Object} options - Rollback options
     * @param {string} environmentId - Target environment ID
     */
    async executeRollbackAsync(rollbackId, deploymentId, options, environmentId) {
        try {
            console.log(`🚀 Starting background rollback ${rollbackId} for deployment ${deploymentId} in environment ${environmentId || 'default'}`);
            
            // Update status to in-progress
            this.statusTracker.updateStatus(rollbackId, 'in-progress');
            
            // Get environment-specific configuration if environmentId provided
            let rollbackConfig = { options };
            
            if (environmentId && environmentId !== 'default' && this.environmentManager) {
                try {
                    console.log(`🌍 Getting environment-specific configuration for: ${environmentId}`);
                    const environment = this.environmentManager.getEnvironment(environmentId);
                    
                    if (environment) {
                        console.log(`✅ Found environment: ${environment.name} (${environment.url})`);
                        
                        // Get environment-specific configuration
                        const envConfig = this.environmentManager.getEnvironmentConfig(environmentId);
                        console.log(`✅ Got environment configuration for ${environment.name}`);
                        
                        // Pass environment config to rollback service
                        // The service will pass this to the repository's getClient method
                        rollbackConfig.environmentConfig = envConfig;
                        
                        console.log(`✅ Will use environment-specific config for rollback`);
                    } else {
                        console.warn(`⚠️ Environment ${environmentId} not found, using default`);
                    }
                } catch (envError) {
                    console.error(`❌ Failed to get environment configuration:`, envError);
                    console.log(`   Falling back to default configuration`);
                }
            }
            
            // Progress callback to update tracker
            // Updated to handle new format: (type, message, progressData)
            const progressCallback = (type, message, progressData) => {
                console.log(`Rollback ${rollbackId}: ${type} - ${message}`);
                
                if (type === 'progress' && progressData) {
                    // Extract progress information from progressData
                    const percentage = progressData.percentage || 0;
                    const total = progressData.steps ? progressData.steps.length : 100;
                    const current = Math.round((percentage / 100) * total);
                    
                    // Update progress with enhanced data for the frontend
                    this.statusTracker.updateProgressWithData(rollbackId, current, total, message, progressData);
                } else {
                    // Fallback for any unexpected format
                    console.log(`Unexpected progress format: ${type}, ${message}`);
                }
            };
            
            // Execute the rollback with progress tracking and environment-specific config
            const result = await this.rollbackService.rollbackDeployment(
                deploymentId,
                progressCallback,
                rollbackConfig
            );
            
            // Store successful result
            this.statusTracker.setResult(rollbackId, {
                rollbackId: result.rollbackId,
                summary: result.summary,
                completedAt: new Date().toISOString()
            });
            
            console.log(`Background rollback ${rollbackId} completed successfully`);
            
        } catch (error) {
            console.error(`Background rollback ${rollbackId} failed:`, error);
            this.statusTracker.setError(rollbackId, error);
        }
    }

    /**
     * Get rollback status
     * GET /api/rollback/{rollbackId}/status
     */
    async getRollbackStatus(req, res, rollbackId) {        
        const status = this.statusTracker.get(rollbackId);
        
        if (!status) {
            return this.sendError(res, 404, `Rollback ${rollbackId} not found. It may have been completed more than 1 hour ago.`);
        }
        
        const response = {
            success: true,
            data: status,
            timestamp: new Date().toISOString()
        };

        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(response));
    }

    /**
     * Sends an error response
     */
    sendError(res, statusCode, message, rollbackId = null) {
        console.log(`❌ ROLLBACK CONTROLLER: Sending error response - Status: ${statusCode}, Message: ${message}`);
        const errorResponse = {
            success: false,
            error: message,
            rollbackId,
            timestamp: new Date().toISOString()
        };

        res.writeHead(statusCode, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(errorResponse));
    }
}

module.exports = RollbackController;
