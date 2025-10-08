/**
 * Rollback Controller
 * Handles all rollback-related HTTP requests
 */

const { RollbackStatusTracker } = require('../services/rollback-status-tracker');

class RollbackController {
    constructor(rollbackService) {
        this.rollbackService = rollbackService;
        this.statusTracker = new RollbackStatusTracker();
    }

    /**
     * Check if a deployment can be rolled back
     * GET /api/rollback/{deploymentId}/can-rollback
     */
    async checkRollbackCapability(req, res, deploymentId) {
        console.log('🔍 ROLLBACK CONTROLLER: Checking rollback capability for deployment', deploymentId);
        
        try {
            const capability = await this.rollbackService.canRollback(deploymentId);
            console.log('🔍 ROLLBACK CONTROLLER: Capability check result:', JSON.stringify(capability));
            
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
        console.log('🎯 ROLLBACK CONTROLLER: Starting async rollback for deployment', deploymentId);
        
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
        
        const { confirm, options } = body;

        // Require explicit confirmation
        if (!confirm) {
            return this.sendError(res, 400, 'Rollback requires explicit confirmation. Set "confirm": true in request body.');
        }

        try {
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
            this.executeRollbackAsync(rollbackId, deploymentId, options);
            
            // Return immediately with 202 Accepted
            const response = {
                success: true,
                message: 'Rollback started. Poll /api/rollback/{rollbackId}/status for progress.',
                rollbackId,
                deploymentId,
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
     */
    async executeRollbackAsync(rollbackId, deploymentId, options) {
        try {
            console.log(`🚀 Starting background rollback ${rollbackId} for deployment ${deploymentId}`);
            
            // Update status to in-progress
            this.statusTracker.updateStatus(rollbackId, 'in-progress');
            
            // Track progress phases
            const phases = ['relationships', 'entities', 'globalChoices', 'solution', 'publisher'];
            let currentPhaseIndex = 0;
            
            // Progress callback to update tracker
            // Receives (status, message) where status is the phase name
            const progressCallback = (status, message) => {
                console.log(`Rollback ${rollbackId}: ${status} - ${message}`);
                
                // Update current phase
                const phaseIndex = phases.indexOf(status);
                if (phaseIndex >= 0) {
                    currentPhaseIndex = phaseIndex + 1;
                }
                
                // Calculate progress (each phase is a step)
                const total = phases.length;
                const current = currentPhaseIndex;
                
                // Just pass the message without phase numbers
                this.statusTracker.updateProgress(rollbackId, current, total, message);
            };
            
            // Execute the rollback with progress tracking
            const result = await this.rollbackService.rollbackDeployment(
                deploymentId,
                progressCallback,
                { options }
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
        console.log(`📊 ROLLBACK CONTROLLER: Getting status for rollback ${rollbackId}`);
        
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
