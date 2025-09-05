/**
 * Validation Controller
 * Handles HTTP requests for ERD validation endpoints
 */
const { BaseController } = require('./base-controller');

class ValidationController extends BaseController {
    constructor(validationService) {
        super();
        this.validationService = validationService;
        
        if (!this.validationService) {
            throw new Error('ValidationController requires a validationService dependency');
        }
    }

    /**
     * Handle ERD validation request
     * POST /api/validate-erd
     */
    async validateERD(req, res) {
        this.log('validateERD', { method: req.method, url: req.url });

        try {
            // Parse request body
            const data = await this.parseRequestBody(req);
            
            // Validate required fields
            this.validateRequiredFields(data, ['mermaidContent']);
            
            // Call validation service
            const result = await this.validationService.validateERD({
                mermaidContent: data.mermaidContent,
                options: data.options || {}
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
                this.sendError(res, 422, result.message, {
                    errors: result.errors,
                    validation: result.validation
                });
            }

        } catch (error) {
            if (error.message.includes('Missing required')) {
                this.sendBadRequest(res, error.message);
            } else {
                this.sendInternalError(res, 'ERD validation failed', error);
            }
        }
    }

    /**
     * Get validation status or results
     * GET /api/validation-status?id=<validationId>
     */
    async getValidationStatus(req, res) {
        try {
            const url = require('url');
            const urlParts = url.parse(req.url, true);
            const validationId = urlParts.query.id;

            if (!validationId) {
                return this.sendBadRequest(res, 'Validation ID is required as query parameter');
            }

            const result = await this.validationService.getValidationStatus(validationId);
            
            if (result.success) {
                this.sendSuccess(res, result.data);
            } else {
                this.sendError(res, 404, result.message);
            }

        } catch (error) {
            this.sendInternalError(res, 'Failed to get validation status', error);
        }
    }

    /**
     * Get supported validation options
     * GET /api/validation-options
     */
    async getValidationOptions(req, res) {
        try {
            const options = await this.validationService.getSupportedOptions();
            this.sendSuccess(res, { options });
        } catch (error) {
            this.sendInternalError(res, 'Failed to get validation options', error);
        }
    }
}

module.exports = { ValidationController };
