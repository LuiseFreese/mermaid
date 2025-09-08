/**
 * Deployment Controller
 * Handles HTTP requests for solution deployment endpoints
 */
const { BaseController } = require('./base-controller');

class DeploymentController extends BaseController {
    constructor(dependencies = {}) {
        super();
        
        // Handle both old style (single parameter) and new style (dependencies object)
        if (dependencies.deploymentService) {
            this.deploymentService = dependencies.deploymentService;
            this.streamingMiddleware = dependencies.streamingMiddleware;
        } else {
            // Fallback for old style initialization
            this.deploymentService = dependencies;
        }
        
        // Don't throw error if no service provided (for testing)
        if (!this.deploymentService) {
            console.warn('DeploymentController initialized without deploymentService - some functionality may be limited');
        }
    }

    /**
     * Handle solution deployment request with streaming progress
     * POST /upload
     */
    async deploySolution(req, res) {
        this.log('deploySolution', { method: req.method, url: req.url });

        try {
            // Setup streaming response
            const streaming = this.setupStreaming(res);
            
            // Parse request body
            const data = await this.parseRequestBody(req);
            
            // Validate required fields
            this.validateRequiredFields(data, ['mermaidContent']);
            
            // Create deployment configuration
            const deploymentConfig = {
                mermaidContent: data.mermaidContent,
                solutionName: data.solutionName || 'MermaidSolution',
                solutionDisplayName: data.solutionDisplayName || data.solutionName || 'Mermaid Solution',
                useExistingSolution: data.useExistingSolution || false,
                selectedSolutionId: data.selectedSolutionId,
                selectedPublisher: data.selectedPublisher,
                createNewPublisher: data.createNewPublisher || false,
                publisherName: data.publisherName || 'Mermaid Publisher',
                publisherUniqueName: data.publisherUniqueName,
                publisherPrefix: data.publisherPrefix || 'mmd',
                cdmChoice: data.cdmChoice,
                cdmMatches: data.cdmMatches || [],
                selectedChoices: data.selectedChoices || [],
                customChoices: data.customChoices || [],
                includeRelatedEntities: data.includeRelatedEntities,
                entities: data.entities || [],
                relationships: data.relationships || []
            };

            // Create progress callback
            const progressCallback = (step, message, details = {}) => {
                streaming.sendProgress(step, message, details);
            };

            // Call deployment service with streaming
            const result = await this.deploymentService.deploySolution(
                deploymentConfig, 
                progressCallback
            );

            // Send final result
            streaming.sendFinal(result);

        } catch (error) {
            // If streaming not started, send regular error response
            if (!res.headersSent) {
                if (error.message.includes('Missing required')) {
                    this.sendBadRequest(res, error.message);
                } else {
                    this.sendInternalError(res, 'Solution deployment failed', error);
                }
            } else {
                // Send error through stream
                const streaming = { sendFinal: (data) => {
                    res.write(JSON.stringify({ type: 'final', data }) + '\n');
                    res.end();
                }};
                streaming.sendFinal({
                    success: false,
                    message: 'Deployment failed',
                    error: error.message
                });
            }
        }
    }

    /**
     * Get deployment status
     * GET /api/deployment-status?id=<deploymentId>
     */
    async getDeploymentStatus(req, res) {
        try {
            const url = require('url');
            const urlParts = url.parse(req.url, true);
            const deploymentId = urlParts.query.id;

            if (!deploymentId) {
                return this.sendBadRequest(res, 'Deployment ID is required as query parameter');
            }

            const result = await this.deploymentService.getDeploymentStatus(deploymentId);
            
            if (result.success) {
                this.sendSuccess(res, result.data);
            } else {
                this.sendError(res, 404, result.message);
            }

        } catch (error) {
            this.sendInternalError(res, 'Failed to get deployment status', error);
        }
    }

    /**
     * Cancel an ongoing deployment
     * POST /api/cancel-deployment
     */
    async cancelDeployment(req, res) {
        try {
            const data = await this.parseRequestBody(req);
            this.validateRequiredFields(data, ['deploymentId']);

            const result = await this.deploymentService.cancelDeployment(data.deploymentId);
            
            if (result.success) {
                this.sendSuccess(res, { 
                    message: 'Deployment cancelled successfully',
                    deploymentId: data.deploymentId 
                });
            } else {
                this.sendError(res, 400, result.message);
            }

        } catch (error) {
            if (error.message.includes('Missing required')) {
                this.sendBadRequest(res, error.message);
            } else {
                this.sendInternalError(res, 'Failed to cancel deployment', error);
            }
        }
    }

    /**
     * Get deployment history
     * GET /api/deployment-history
     */
    async getDeploymentHistory(req, res) {
        try {
            const url = require('url');
            const urlParts = url.parse(req.url, true);
            const limit = parseInt(urlParts.query.limit) || 50;
            const offset = parseInt(urlParts.query.offset) || 0;

            const result = await this.deploymentService.getDeploymentHistory({ limit, offset });
            
            if (result.success) {
                this.sendSuccess(res, result.data);
            } else {
                this.sendError(res, 500, result.message);
            }

        } catch (error) {
            this.sendInternalError(res, 'Failed to get deployment history', error);
        }
    }

    /**
     * Get publishers (for route compatibility)
     */
    async getPublishers() {
        try {
            if (!this.deploymentService) {
                return { success: false, message: 'Deployment service not available' };
            }
            const result = await this.deploymentService.getPublishers();
            return result;
        } catch (error) {
            return { success: false, message: 'Failed to fetch publishers', error: error.message };
        }
    }

    /**
     * Get solutions (for route compatibility)
     */
    async getSolutions() {
        try {
            if (!this.deploymentService) {
                return { success: false, message: 'Deployment service not available' };
            }
            const result = await this.deploymentService.getSolutions();
            return result;
        } catch (error) {
            return { success: false, message: 'Failed to fetch solutions', error: error.message };
        }
    }

    /**
     * Get global choices (for route compatibility)
     */
    async getGlobalChoices() {
        try {
            if (!this.deploymentService) {
                return { success: false, message: 'Deployment service not available' };
            }
            const result = await this.deploymentService.getGlobalChoices();
            return result;
        } catch (error) {
            return { success: false, message: 'Failed to fetch global choices', error: error.message };
        }
    }

    /**
     * Deploy solution (for route compatibility)
     */
    async deploySolutionAPI(data) {
        try {
            if (!this.deploymentService) {
                return { success: false, message: 'Deployment service not available' };
            }
            const result = await this.deploymentService.deploySolution(data);
            return result;
        } catch (error) {
            return { success: false, message: 'Deployment failed', error: error.message };
        }
    }

    /**
     * Test connection (for route compatibility)
     */
    async testConnection(data) {
        try {
            if (!this.deploymentService) {
                return { success: false, message: 'Deployment service not available' };
            }
            const result = await this.deploymentService.testConnection(data);
            return result;
        } catch (error) {
            return { success: false, message: 'Connection test failed', error: error.message };
        }
    }
}

module.exports = DeploymentController;
