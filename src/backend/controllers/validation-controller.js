/**
 * Validation Controller
 * Handles HTTP requests for ERD validation endpoints
 */
const { BaseController } = require('./base-controller');

class ValidationController extends BaseController {
    constructor(validationService) {
        super();
        
        if (!validationService) {
            throw new Error('ValidationController requires a validationService dependency');
        }
        
        this.validationService = validationService;
    }

    /**
     * Handle ERD validation request
     * POST /api/validate-erd
     */
    async validateERD(req, res) {
        this.log('validateERD', { method: req.method, url: req.url });

        // Validate HTTP method
        if (req.method !== 'POST') {
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

        try {
            // Parse request body
            const data = await this.parseRequestBody(req);
            
            // Validate required fields
            this.validateRequiredFields(data, ['mermaidContent']);
            
            // Call validation service
            const result = await this.validationService.validateERD({
                mermaidContent: data.mermaidContent,
                options: {
                    ...data.options || {},
                    entityChoice: data.entityChoice || null
                }
            });

            // Send response
            if (result.success) {
                this.sendSuccess(res, {
                    validation: result.validation,
                    entities: result.entities,
                    relationships: result.relationships,
                    warnings: result.warnings,
                    correctedERD: result.correctedERD,
                    summary: result.summary,
                    cdmDetection: result.cdmDetection
                });
            } else {
                // Return 422 for validation with warnings - include full validation data
                this.sendJson(res, 422, {
                    success: false,
                    message: result.message,
                    errors: result.errors,
                    validation: result.validation,
                    entities: result.entities,
                    relationships: result.relationships,
                    warnings: result.warnings,
                    correctedERD: result.correctedERD,
                    summary: result.summary,
                    cdmDetection: result.cdmDetection
                });
            }

        } catch (error) {
            if (error.message.includes('Missing required') || error.message.includes('is required')) {
                // Return 422 for missing required fields with message field
                this.sendJson(res, 422, {
                    success: false,
                    message: error.message
                });
            } else if (error.message.includes('Invalid JSON')) {
                // Return 400 for malformed JSON with message field
                this.sendJson(res, 400, {
                    success: false,
                    message: error.message
                });
            } else {
                this.sendInternalError(res, 'ERD validation failed', error);
            }
        }
    }

    /**
     * Handle validation status request
     * GET /api/validation/status/:validationId
     */
    async getValidationStatus(req, res) {
        this.log('getValidationStatus', { validationId: req.params.validationId });

        try {
            const validationId = req.params.validationId;
            
            if (!validationId) {
                return this.sendBadRequest(res, 'Validation ID is required');
            }

            const result = await this.validationService.getValidationStatus(validationId);

            if (result.success) {
                this.sendSuccess(res, {
                    status: result.status,
                    progress: result.progress,
                    result: result.result
                });
            } else {
                this.sendError(res, 404, result.message);
            }

        } catch (error) {
            this.sendInternalError(res, 'Failed to get validation status', error);
        }
    }

    /**
     * Handle validation options request
     * GET /api/validation/options
     */
    async getValidationOptions(req, res) {
        this.log('getValidationOptions');

        try {
            const result = await this.validationService.getValidationOptions();

            if (result.success) {
                this.sendSuccess(res, {
                    options: result.options,
                    defaults: result.defaults
                });
            } else {
                this.sendError(res, 500, result.message);
            }

        } catch (error) {
            this.sendInternalError(res, 'Failed to get validation options', error);
        }
    }

    /**
     * Handle bulk fix request
     * POST /api/validation/bulk-fix
     */
    async bulkFixWarnings(req, res) {
        this.log('bulkFixWarnings', { method: req.method, url: req.url });

        // Validate HTTP method
        if (req.method !== 'POST') {
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

        try {
            // Parse request body
            const data = await this.parseRequestBody(req);
            
            // Validate required fields
            this.validateRequiredFields(data, ['mermaidContent', 'warnings']);
            
            // Call bulk fix service
            const result = await this.validationService.bulkFixWarnings({
                mermaidContent: data.mermaidContent,
                warnings: data.warnings,
                fixTypes: data.fixTypes || 'all', // 'all', 'autoFixableOnly', or array of specific types
                options: data.options || {}
            });

            // Send response
            if (result.success) {
                this.sendSuccess(res, {
                    fixedContent: result.fixedContent,
                    appliedFixes: result.appliedFixes,
                    remainingWarnings: result.remainingWarnings,
                    summary: result.summary
                });
            } else {
                this.sendError(res, 422, result.message);
            }

        } catch (error) {
            if (error.message.includes('Missing required') || error.message.includes('is required')) {
                this.sendJson(res, 422, {
                    success: false,
                    message: error.message
                });
            } else if (error.message.includes('Invalid JSON')) {
                this.sendJson(res, 400, {
                    success: false,
                    message: error.message
                });
            } else {
                this.sendInternalError(res, 'Bulk fix failed', error);
            }
        }
    }

    /**
     * Validate ERD content (for route compatibility)
     */
    async validateERDData(data) {
        try {
            if (!this.validationService) {
                return {
                    success: false,
                    message: 'Validation service not available'
                };
            }

            const result = await this.validationService.validateERD(data);
            return result;
        } catch (error) {
            return {
                success: false,
                message: 'Validation failed',
                error: error.message
            };
        }
    }

    /**
     * Cleanup ERD content (for route compatibility)
     */
    async cleanupERD(data) {
        try {
            if (!this.validationService) {
                return {
                    success: false,
                    message: 'Validation service not available'
                };
            }

            const result = await this.validationService.cleanupERD(data);
            return result;
        } catch (error) {
            return {
                success: false,
                message: 'Cleanup failed',
                error: error.message
            };
        }
    }

    /**
     * Handle individual warning fix request
     * POST /api/validation/fix-warning
     */
    async fixWarning(req, res) {
        this.log('fixWarning', { method: req.method, url: req.url });

        if (req.method !== 'POST') {
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

        try {
            const data = await this.parseRequestBody(req);
            
            // Validate required fields
            this.validateRequiredFields(data, ['mermaidContent', 'warningId']);
            
            // Call validation service to fix individual warning
            const result = await this.validationService.fixIndividualWarning({
                mermaidContent: data.mermaidContent,
                warningId: data.warningId,
                options: data.options || {}
            });
            
            this.sendJson(res, 200, result);
        } catch (error) {
            this.log('fixWarning error', error);
            this.sendJson(res, 500, {
                success: false,
                message: 'Individual fix failed',
                error: error.message
            });
        }
    }
}

module.exports = ValidationController;
