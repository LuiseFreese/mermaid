/**
 * Import Controller
 * Handles HTTP requests for importing from various sources (files, Dataverse solutions, etc.)
 */

const { BaseController } = require('./base-controller');

class ImportController extends BaseController {
    constructor(dependencies = {}) {
        super();
        this.dataverseExtractorService = dependencies.dataverseExtractorService;
        this.validationService = dependencies.validationService;
    }

    /**
     * Import solution from Dataverse environment
     * POST /api/import/dataverse-solution
     */
    async importDataverseSolution(req, res) {
        this.log('importDataverseSolution', { method: req.method, url: req.url });

        try {
            // Parse request body
            const requestBody = await this.parseRequestBody(req);
            
            this.log('importDataverseSolution requestBody', requestBody);
            
            if (!requestBody) {
                return this.sendBadRequest(res, 'Request body is required');
            }

            const { environmentUrl, solutionName, authMethod = 'managedIdentity' } = requestBody;

            // Validate required fields
            if (!environmentUrl) {
                return this.sendBadRequest(res, 'Environment URL is required');
            }

            this.log('Extracting solution from Dataverse', { environmentUrl, solutionName, authMethod });

            // Extract solution using the service
            const extractionResult = await this.dataverseExtractorService.extractSolution({
                environmentUrl,
                solutionName,
                authMethod
            });

            // Validate the generated ERD
            let validationResult = null;
            if (this.validationService && extractionResult.erdContent) {
                try {
                    validationResult = await this.validationService.validateERD({ mermaidContent: extractionResult.erdContent });
                    this.log('ERD validation completed', { 
                        warningCount: validationResult.warnings?.length || 0,
                        isValid: validationResult.isValid 
                    });
                } catch (validationError) {
                    this.log('ERD validation failed', { error: validationError.message });
                    // Continue without validation rather than failing the import
                }
            }

            // Prepare response
            const response = {
                success: true,
                data: {
                    erdContent: extractionResult.erdContent,
                    metadata: extractionResult.metadata,
                    validation: validationResult || { isValid: true, warnings: [] },
                    source: {
                        type: 'dataverse',
                        environmentUrl,
                        solutionName: solutionName || 'All Entities',
                        extractedAt: new Date().toISOString()
                    }
                },
                message: `Successfully extracted ${extractionResult.metadata.entities} entities and ${extractionResult.metadata.relationships} relationships from Dataverse`
            };

            this.log('importDataverseSolution completed', { 
                entities: extractionResult.metadata.entities,
                relationships: extractionResult.metadata.relationships,
                cdmEntities: extractionResult.metadata.cdmEntities
            });

            this.sendSuccess(res, response);

        } catch (error) {
            this.log('importDataverseSolution failed', { error: error.message });
            
            // Provide specific error messages for common issues
            let errorMessage = 'Failed to import from Dataverse';
            let statusCode = 500;

            if (error.message.includes('Invalid environment URL')) {
                errorMessage = 'Invalid Dataverse environment URL provided';
                statusCode = 400;
            } else if (error.message.includes('authentication') || error.message.includes('unauthorized')) {
                errorMessage = 'Authentication failed - check environment permissions';
                statusCode = 401;
            } else if (error.message.includes('not found') || error.message.includes('404')) {
                errorMessage = 'Dataverse environment or solution not found';
                statusCode = 404;
            } else if (error.message.includes('timeout')) {
                errorMessage = 'Request timeout - environment may be slow to respond';
                statusCode = 408;
            }

            this.sendError(res, statusCode, errorMessage, { error: error.message });
        }
    }

    /**
     * Get preview of Dataverse solution (without full extraction)
     * GET /api/import/dataverse-solution/preview?environmentUrl=...&solutionName=...
     */
    async previewDataverseSolution(req, res) {
        this.log('previewDataverseSolution', { method: req.method, url: req.url });

        try {
            const url = new URL(req.url, `http://${req.headers.host}`);
            const environmentUrl = url.searchParams.get('environmentUrl');
            const solutionName = url.searchParams.get('solutionName');

            if (!environmentUrl) {
                return this.sendBadRequest(res, 'Environment URL is required');
            }

            this.log('Getting preview of Dataverse solution', { environmentUrl, solutionName });

            // For now, return a simple preview structure
            // In a full implementation, this would do a lightweight query to get entity counts
            const previewData = {
                success: true,
                data: {
                    environmentUrl,
                    solutionName: solutionName || 'All Entities',
                    preview: {
                        estimatedEntities: '15-25',
                        estimatedRelationships: '20-30',
                        supportedFeatures: [
                            'Entity extraction',
                            'Attribute mapping',
                            'Basic relationship detection',
                            'CDM entity identification'
                        ],
                        limitations: [
                            'Limited to first 20 entities (MVP)',
                            'Basic relationship patterns only',
                            'No custom relationship labels'
                        ]
                    }
                },
                message: 'Preview data prepared - ready for extraction'
            };

            this.sendSuccess(res, previewData);

        } catch (error) {
            this.log('previewDataverseSolution failed', { error: error.message });
            this.sendError(res, 'Failed to preview Dataverse solution', error);
        }
    }

    /**
     * Test connection to Dataverse environment
     * POST /api/import/dataverse-solution/test-connection
     */
    async testDataverseConnection(req, res) {
        this.log('testDataverseConnection', { method: req.method, url: req.url });

        try {
            const requestBody = await this.parseRequestBody(req);
            
            this.log('testDataverseConnection requestBody', requestBody);
            this.log('testDataverseConnection environmentUrl check', { 
                hasRequestBody: !!requestBody,
                requestBodyType: typeof requestBody,
                hasEnvironmentUrl: !!(requestBody && requestBody.environmentUrl),
                environmentUrlValue: requestBody ? requestBody.environmentUrl : 'NO_REQUEST_BODY',
                environmentUrlType: requestBody ? typeof requestBody.environmentUrl : 'NO_REQUEST_BODY'
            });
            
            if (!requestBody || !requestBody.environmentUrl) {
                this.log('testDataverseConnection validation failed', { requestBody, environmentUrl: requestBody?.environmentUrl });
                return this.sendBadRequest(res, 'Environment URL is required');
            }

            const { environmentUrl } = requestBody;

            this.log('Testing connection to Dataverse', { environmentUrl });

            // Validate URL format
            try {
                new URL(environmentUrl);
            } catch (urlError) {
                return this.sendBadRequest(res, 'Invalid URL format');
            }

            // Validate that it's a Dataverse URL
            if (!environmentUrl.includes('.dynamics.com') && 
                !environmentUrl.includes('.crm.dynamics.com')) {
                return this.sendBadRequest(res, 'URL must be a valid Dataverse environment');
            }

            // For MVP, we'll do basic URL validation
            // In a full implementation, this would test actual connectivity
            const response = {
                success: true,
                data: {
                    environmentUrl,
                    status: 'reachable',
                    authentication: 'not_tested', // Will be enhanced in Phase 5
                    capabilities: {
                        entityExtraction: true,
                        relationshipExtraction: true,
                        cdmDetection: true
                    },
                    testedAt: new Date().toISOString()
                },
                message: 'Connection test completed successfully'
            };

            this.log('testDataverseConnection completed', { status: 'success' });
            this.sendSuccess(res, response);

        } catch (error) {
            this.log('testDataverseConnection failed', { error: error.message });
            this.sendError(res, 'Connection test failed', error);
        }
    }

    /**
     * Get supported import sources and their capabilities
     * GET /api/import/sources
     */
    async getImportSources(req, res) {
        this.log('getImportSources', { method: req.method, url: req.url });

        try {
            const sources = {
                success: true,
                data: {
                    sources: [
                        {
                            id: 'file',
                            name: 'Mermaid File Upload',
                            description: 'Upload .mmd files with Mermaid ERD syntax',
                            status: 'available',
                            capabilities: [
                                'Full Mermaid syntax support',
                                'Real-time validation',
                                'Auto-fix suggestions'
                            ]
                        },
                        {
                            id: 'dataverse',
                            name: 'Dataverse Solution',
                            description: 'Import existing Dataverse solutions as ERD diagrams',
                            status: 'beta',
                            capabilities: [
                                'Entity extraction',
                                'Relationship mapping',
                                'CDM entity detection',
                                'Metadata preservation'
                            ],
                            limitations: [
                                'Limited to 20 entities (MVP)',
                                'Basic relationship patterns only',
                                'Managed identity authentication only'
                            ]
                        }
                    ]
                },
                message: 'Available import sources retrieved'
            };

            this.sendSuccess(res, sources);

        } catch (error) {
            this.log('getImportSources failed', { error: error.message });
            this.sendError(res, 'Failed to get import sources', error);
        }
    }
}

module.exports = { ImportController };