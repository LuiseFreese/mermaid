/**
 * Deployment Service
 * Business logic for solution deployment orchestration
 */
const { BaseService } = require('./base-service');

class DeploymentService extends BaseService {
    constructor(dependencies = {}) {
        super(dependencies);
        
        // Validate required dependencies
        this.validateDependencies(['dataverseRepository', 'configRepository']);
        
        this.dataverseRepository = dependencies.dataverseRepository;
        this.configRepository = dependencies.configRepository;
        this.mermaidParser = dependencies.mermaidParser;
        this.cdmRegistry = dependencies.cdmRegistry;
        
        // Track active deployments
        this.activeDeployments = new Map();
    }

    /**
     * Deploy solution to Dataverse with streaming progress
     * @param {Object} config - Deployment configuration
     * @param {Function} progressCallback - Progress update callback
     * @returns {Promise<Object>} Deployment result
     */
    async deploySolution(config, progressCallback) {
        const deploymentId = this.generateDeploymentId();
        
        return this.executeOperation('deploySolution', async () => {
            this.validateInput(config, ['mermaidContent', 'solutionName'], {
                mermaidContent: 'string',
                solutionName: 'string',
                solutionDisplayName: 'string'
            });

            // Track deployment
            this.activeDeployments.set(deploymentId, {
                id: deploymentId,
                status: 'starting',
                startTime: new Date(),
                config: { ...config, mermaidContent: '[REDACTED]' } // Don't store full content
            });

            const progress = (step, message, details = {}) => {
                this.updateDeploymentStatus(deploymentId, step, message);
                if (progressCallback) {
                    progressCallback(step, message, details);
                }
            };

            try {
                progress('initialization', 'Initializing deployment...');

                // Step 1: Parse ERD content
                progress('parsing', 'Parsing ERD content...');
                const parseResult = await this.parseERDContent(config.mermaidContent);
                
                // Step 2: Setup Dataverse client
                progress('configuration', 'Connecting to Dataverse...');
                const dataverseConfig = await this.configRepository.getDataverseConfig();
                
                // Step 3: Ensure solution and publisher
                progress('publisher', 'Creating (or reusing) Publisher...');
                const publisherResult = await this.ensurePublisher(config, dataverseConfig);
                
                progress('solution', 'Creating Solution...');
                const solutionResult = await this.ensureSolution(config, publisherResult, dataverseConfig);

                // Step 4: Determine entity processing strategy
                const { cdmEntities, customEntities } = this.categorizeEntities(
                    parseResult.entities, 
                    config.cdmMatches
                );

                let results = {
                    success: true,
                    deploymentId,
                    cdmResults: null,
                    customResults: null,
                    globalChoicesResults: null,
                    summary: '',
                    entitiesCreated: 0,
                    relationshipsCreated: 0,
                    cdmEntitiesIntegrated: [],
                    globalChoicesAdded: 0,
                    message: 'Deployment completed successfully'
                };

                // Step 5: Process CDM entities if any
                if (cdmEntities.length > 0 && config.cdmChoice === 'cdm') {
                    progress('cdm', `Adding ${cdmEntities.length} CDM Tables...`);
                    results.cdmResults = await this.processCDMEntities(
                        cdmEntities, 
                        solutionResult.uniquename,
                        config,
                        dataverseConfig
                    );
                    
                    if (results.cdmResults.success) {
                        results.cdmEntitiesIntegrated = results.cdmResults.integratedEntities || [];
                    }
                }

                // Step 6: Process custom entities if any
                if (customEntities.length > 0) {
                    progress('custom-entities', `Creating ${customEntities.length} Custom Tables...`);
                    results.customResults = await this.processCustomEntities(
                        customEntities,
                        parseResult.relationships,
                        solutionResult,
                        publisherResult,
                        config,
                        dataverseConfig,
                        progress
                    );
                    
                    if (results.customResults.success) {
                        results.entitiesCreated += results.customResults.entitiesCreated || 0;
                        results.relationshipsCreated += results.customResults.relationshipsCreated || 0;
                    }
                }

                // Step 7: Process global choices
                if (config.selectedChoices?.length > 0 || config.customChoices?.length > 0) {
                    progress('global-choices', 'Processing Global Choices...');
                    results.globalChoicesResults = await this.processGlobalChoices(
                        config,
                        solutionResult.uniquename,
                        publisherResult.prefix,
                        dataverseConfig,
                        progress
                    );
                    
                    if (results.globalChoicesResults.success) {
                        results.globalChoicesAdded = results.globalChoicesResults.totalAdded || 0;
                    }
                }

                // Step 8: Finalize deployment
                progress('finalizing', 'Finalizing deployment...');
                results.summary = this.generateDeploymentSummary(results);
                
                // Update deployment tracking
                this.updateDeploymentStatus(deploymentId, 'completed', 'Deployment completed successfully');
                
                progress('complete', 'Deployment completed successfully', { completed: true });
                
                return this.createSuccess(results, 'Solution deployed successfully');

            } catch (error) {
                this.error('Deployment failed', error);
                this.updateDeploymentStatus(deploymentId, 'failed', error.message);
                
                const errorResult = {
                    success: false,
                    deploymentId,
                    message: 'Deployment failed',
                    error: error.message,
                    entitiesCreated: 0,
                    relationshipsCreated: 0,
                    cdmEntitiesIntegrated: [],
                    globalChoicesAdded: 0
                };
                
                return this.createError('Deployment failed', [error.message], errorResult);
            } finally {
                // Clean up active deployment after some time
                setTimeout(() => {
                    this.activeDeployments.delete(deploymentId);
                }, 300000); // 5 minutes
            }
        });
    }

    /**
     * Parse ERD content using Mermaid parser
     * @param {string} mermaidContent - ERD content to parse
     * @returns {Promise<Object>} Parse result
     */
    async parseERDContent(mermaidContent) {
        if (!this.mermaidParser) {
            throw new Error('Mermaid parser not available');
        }

        const parseResult = this.mermaidParser.parse(mermaidContent);
        
        if (!parseResult || parseResult.errors?.length > 0) {
            throw new Error(`ERD parsing failed: ${parseResult?.errors?.join(', ') || 'Unknown error'}`);
        }

        return {
            entities: parseResult.entities || [],
            relationships: parseResult.relationships || [],
            warnings: parseResult.warnings || []
        };
    }

    /**
     * Ensure publisher exists
     * @param {Object} config - Deployment configuration
     * @param {Object} dataverseConfig - Dataverse configuration
     * @returns {Promise<Object>} Publisher result
     */
    async ensurePublisher(config, dataverseConfig) {
        const publisherConfig = {
            uniqueName: (config.publisherName || 'MermaidPublisher').replace(/\s+/g, ''),
            friendlyName: config.publisherName || 'Mermaid Publisher',
            prefix: config.publisherPrefix || 'mmd'
        };

        return await this.dataverseRepository.ensurePublisher(publisherConfig, dataverseConfig);
    }

    /**
     * Ensure solution exists
     * @param {Object} config - Deployment configuration
     * @param {Object} publisher - Publisher result
     * @param {Object} dataverseConfig - Dataverse configuration
     * @returns {Promise<Object>} Solution result
     */
    async ensureSolution(config, publisher, dataverseConfig) {
        const solutionConfig = {
            uniqueName: config.solutionName,
            displayName: config.solutionDisplayName,
            publisher: publisher
        };

        return await this.dataverseRepository.ensureSolution(solutionConfig, dataverseConfig);
    }

    /**
     * Categorize entities into CDM and custom
     * @param {Array} entities - All entities
     * @param {Array} cdmMatches - CDM matches
     * @returns {Object} Categorized entities
     */
    categorizeEntities(entities, cdmMatches = []) {
        const cdmEntityNames = cdmMatches.map(m => 
            m?.originalEntity?.name || m?.entity || ''
        ).filter(name => name);

        const cdmEntities = cdmMatches;
        const customEntities = entities.filter(entity => 
            !cdmEntityNames.includes(entity.name)
        );

        return { cdmEntities, customEntities };
    }

    /**
     * Process CDM entities
     * @param {Array} cdmEntities - CDM entities to integrate
     * @param {string} solutionName - Solution unique name
     * @param {Object} config - Deployment configuration
     * @param {Object} dataverseConfig - Dataverse configuration
     * @returns {Promise<Object>} CDM processing result
     */
    async processCDMEntities(cdmEntities, solutionName, config, dataverseConfig) {
        try {
            return await this.dataverseRepository.integrateCDMEntities(
                cdmEntities,
                solutionName,
                config.includeRelatedEntities,
                dataverseConfig
            );
        } catch (error) {
            this.error('CDM integration failed', error);
            return {
                success: false,
                error: error.message,
                integratedEntities: []
            };
        }
    }

    /**
     * Process custom entities
     * @param {Array} customEntities - Custom entities to create
     * @param {Array} relationships - Entity relationships
     * @param {Object} solution - Solution information
     * @param {Object} publisher - Publisher information
     * @param {Object} config - Deployment configuration
     * @param {Object} dataverseConfig - Dataverse configuration
     * @param {Function} progress - Progress callback
     * @returns {Promise<Object>} Custom entities processing result
     */
    async processCustomEntities(customEntities, relationships, solution, publisher, config, dataverseConfig, progress) {
        try {
            const customConfig = {
                publisherPrefix: publisher.prefix,
                publisherName: publisher.friendlyName,
                publisherUniqueName: publisher.uniqueName,
                solutionUniqueName: solution.uniquename,
                solutionFriendlyName: solution.friendlyname,
                relationships: relationships,
                cdmEntities: config.cdmMatches || [],
                includeRelatedEntities: config.includeRelatedEntities,
                progressCallback: progress
            };

            return await this.dataverseRepository.createCustomEntities(
                customEntities,
                customConfig,
                dataverseConfig
            );
        } catch (error) {
            this.error('Custom entity creation failed', error);
            return {
                success: false,
                error: error.message,
                entitiesCreated: 0,
                relationshipsCreated: 0,
                customEntitiesFound: customEntities.map(e => e.name)
            };
        }
    }

    /**
     * Process global choices
     * @param {Object} config - Deployment configuration
     * @param {string} solutionName - Solution unique name
     * @param {string} publisherPrefix - Publisher prefix
     * @param {Object} dataverseConfig - Dataverse configuration
     * @param {Function} progress - Progress callback
     * @returns {Promise<Object>} Global choices processing result
     */
    async processGlobalChoices(config, solutionName, publisherPrefix, dataverseConfig, progress) {
        let totalAdded = 0;
        const results = { success: true, errors: [] };

        // Process selected global choices
        if (config.selectedChoices?.length > 0) {
            try {
                progress('global-choices-solution', 'Adding Global Choices to Solution...');
                const selectedResult = await this.dataverseRepository.addGlobalChoicesToSolution(
                    config.selectedChoices,
                    solutionName,
                    dataverseConfig
                );
                totalAdded += selectedResult.added || 0;
                if (selectedResult.errors?.length > 0) {
                    results.errors.push(...selectedResult.errors);
                }
            } catch (error) {
                this.error('Selected global choices processing failed', error);
                results.errors.push(`Selected choices: ${error.message}`);
            }
        }

        // Process custom global choices
        if (config.customChoices?.length > 0) {
            try {
                progress('custom-choices', 'Creating Custom Global Choices...');
                const customResult = await this.dataverseRepository.createAndAddCustomGlobalChoices(
                    config.customChoices,
                    solutionName,
                    publisherPrefix,
                    dataverseConfig,
                    progress
                );
                totalAdded += customResult.created || 0;
                if (customResult.errors?.length > 0) {
                    results.errors.push(...customResult.errors);
                }
            } catch (error) {
                this.error('Custom global choices processing failed', error);
                results.errors.push(`Custom choices: ${error.message}`);
            }
        }

        results.totalAdded = totalAdded;
        return results;
    }

    /**
     * Generate deployment summary
     * @param {Object} results - Deployment results
     * @returns {string} Summary message
     */
    generateDeploymentSummary(results) {
        const summaryParts = [];
        
        if (results.cdmResults?.success) {
            const count = results.cdmResults.summary?.successfulIntegrations || 0;
            if (count > 0) {
                summaryParts.push(`${count} CDM entities integrated`);
            }
        }
        
        if (results.customResults?.success) {
            const entities = results.customResults.entitiesCreated || 0;
            const relationships = results.customResults.relationshipsCreated || 0;
            
            if (entities > 0) {
                summaryParts.push(`${entities} custom entities created`);
            }
            if (relationships > 0) {
                summaryParts.push(`${relationships} relationships created`);
            }
        }
        
        if (results.globalChoicesAdded > 0) {
            summaryParts.push(`${results.globalChoicesAdded} global choices added`);
        }

        return summaryParts.length > 0 
            ? `Successfully processed: ${summaryParts.join(', ')}`
            : 'No entities were processed';
    }

    /**
     * Get deployment status
     * @param {string} deploymentId - Deployment ID
     * @returns {Promise<Object>} Status result
     */
    async getDeploymentStatus(deploymentId) {
        return this.executeOperation('getDeploymentStatus', async () => {
            const deployment = this.activeDeployments.get(deploymentId);
            
            if (!deployment) {
                return this.createError('Deployment not found or has expired');
            }

            return this.createSuccess({
                deploymentId,
                status: deployment.status,
                message: deployment.message,
                startTime: deployment.startTime,
                duration: Date.now() - deployment.startTime.getTime()
            });
        });
    }

    /**
     * Cancel deployment
     * @param {string} deploymentId - Deployment ID to cancel
     * @returns {Promise<Object>} Cancellation result
     */
    async cancelDeployment(deploymentId) {
        return this.executeOperation('cancelDeployment', async () => {
            const deployment = this.activeDeployments.get(deploymentId);
            
            if (!deployment) {
                return this.createError('Deployment not found or has expired');
            }

            if (deployment.status === 'completed' || deployment.status === 'failed') {
                return this.createError('Deployment cannot be cancelled - already completed');
            }

            this.updateDeploymentStatus(deploymentId, 'cancelled', 'Deployment cancelled by user');
            
            return this.createSuccess({
                deploymentId,
                status: 'cancelled',
                message: 'Deployment cancelled successfully'
            });
        });
    }

    /**
     * Get deployment history
     * @param {Object} options - Query options
     * @returns {Promise<Object>} History result
     */
    async getDeploymentHistory(options = {}) {
        return this.executeOperation('getDeploymentHistory', async () => {
            // For now, return active deployments
            // In the future, this could query a persistent store
            
            const activeDeployments = Array.from(this.activeDeployments.values())
                .sort((a, b) => b.startTime - a.startTime)
                .slice(options.offset || 0, (options.offset || 0) + (options.limit || 50));

            return this.createSuccess({
                deployments: activeDeployments,
                total: this.activeDeployments.size,
                offset: options.offset || 0,
                limit: options.limit || 50
            });
        });
    }

    /**
     * Generate unique deployment ID
     * @returns {string} Deployment ID
     */
    generateDeploymentId() {
        return `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Update deployment status
     * @param {string} deploymentId - Deployment ID
     * @param {string} status - New status
     * @param {string} message - Status message
     */
    updateDeploymentStatus(deploymentId, status, message) {
        const deployment = this.activeDeployments.get(deploymentId);
        if (deployment) {
            deployment.status = status;
            deployment.message = message;
            deployment.lastUpdate = new Date();
        }
    }
}

module.exports = { DeploymentService };
