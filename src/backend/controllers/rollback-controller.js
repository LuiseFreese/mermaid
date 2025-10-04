/**
 * Rollback Controller
 * Handles all rollback-related HTTP requests
 */

const path = require('path');

class RollbackController {
    constructor(rollbackService) {
        this.rollbackService = rollbackService;
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
     * Execute a rollback for a specific deployment
     * POST /api/rollback/{deploymentId}/execute
     */
    async executeRollback(req, res, deploymentId) {
        console.log('🎯 ROLLBACK CONTROLLER: Starting rollback for deployment', deploymentId);
        
        // Parse request body - body is in req.rawBody, not req.body
        let body = {};
        if (req.rawBody) {
            try {
                console.log('📝 Parsing JSON from req.rawBody:', req.rawBody);
                body = JSON.parse(req.rawBody);
            } catch (e) {
                console.error('❌ Failed to parse request body:', e);
                return this.sendError(res, 400, 'Invalid JSON in request body');
            }
        }
        
        const { confirm, options } = body;
        console.log('🎯 ROLLBACK CONTROLLER: Parsed body =', JSON.stringify(body));
        console.log('🎯 ROLLBACK CONTROLLER: confirm value =', confirm, 'type:', typeof confirm);
        console.log('🎯 ROLLBACK CONTROLLER: options value =', JSON.stringify(options));

        // Require explicit confirmation
        if (!confirm) {
            console.log('🎯 ROLLBACK CONTROLLER: No confirmation, returning error');
            return this.sendError(res, 400, 'Rollback requires explicit confirmation. Set "confirm": true in request body.');
        }

        try {
            console.log('🎯 ROLLBACK CONTROLLER: Checking rollback capability...');
            // Check if rollback is possible
            const capability = await this.rollbackService.canRollback(deploymentId);
            console.log('🎯 ROLLBACK CONTROLLER: Capability check result:', JSON.stringify(capability));
            
            if (!capability.canRollback) {
                console.log('🎯 ROLLBACK CONTROLLER: Rollback not possible, returning error');
                return this.sendError(res, 400, capability.reason);
            }

            console.log('🎯 ROLLBACK CONTROLLER: Received options from request:', JSON.stringify(options, null, 2));
            console.log('🎯 ROLLBACK CONTROLLER: Starting rollback service call with options...');
            const result = await this.rollbackService.rollbackDeployment(
                deploymentId,
                null,  // No progress callback in controller (using JSON response, not SSE)
                { options }  // Pass rollback options
            );
            console.log('🎯 ROLLBACK CONTROLLER: Rollback service call completed!');
            
            const response = {
                success: true,
                message: 'Rollback completed successfully',
                rollbackId: result.rollbackId,
                summary: result.summary,
                timestamp: new Date().toISOString()
            };

            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify(response));
            
        } catch (error) {
            console.error('❌ ROLLBACK ERROR:', error);
            this.sendError(res, 500, error.message);
        }
    }

    /**
     * Sends an error response
     */
    sendError(res, statusCode, message, rollbackId = null) {
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
