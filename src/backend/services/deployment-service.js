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
                const dataverseConfigResult = await this.configRepository.getDataverseConfig();
                const dataverseConfig = dataverseConfigResult?.data || dataverseConfigResult;
                
                console.log('🔧 DEBUG: DeploymentService dataverseConfig:', {
                    hasServerUrl: !!dataverseConfig?.serverUrl,
                    hasClientId: !!dataverseConfig?.clientId,
                    hasClientSecret: !!dataverseConfig?.clientSecret,
                    hasTenantId: !!dataverseConfig?.tenantId,
                    keys: Object.keys(dataverseConfig || {})
                });
                
                // Step 3: Ensure solution and publisher
                progress('publisher', config.useExistingSolution ? 'Using existing solution publisher...' : 'Creating (or reusing) Publisher...');
                const publisherResult = await this.ensurePublisher(config, dataverseConfig);
                
                console.log('🔧 DEBUG: publisherResult:', {
                    type: typeof publisherResult,
                    keys: Object.keys(publisherResult || {}),
                    hasData: !!publisherResult?.data,
                    publisherData: publisherResult?.data,
                    success: publisherResult?.success
                });
                
                progress('solution', config.useExistingSolution ? 'Using existing solution...' : 'Creating Solution...');
                // Extract the actual publisher data from the wrapped response
                const publisher = publisherResult?.data || publisherResult;
                const solutionResult = await this.ensureSolution(config, publisher, dataverseConfig);
                
                // Extract the actual solution data from the wrapped response
                const solution = solutionResult?.data || solutionResult;

                console.log('🔧 DEBUG: Final solution being used:', {
                    uniquename: solution?.uniquename,
                    friendlyname: solution?.friendlyname,
                    solutionid: solution?.solutionid,
                    publisher: solution?.publisherid?.uniquename || solution?.publisher?.uniquename
                });

                // Step 4: Determine entity processing strategy
                const cdmMatches = parseResult.cdmDetection?.detectedCDM || [];
                console.log('🔧 DEBUG: CDM detection results:', {
                    hasCdmDetection: !!parseResult.cdmDetection,
                    detectedCDMCount: cdmMatches.length,
                    cdmMatches: cdmMatches.map(m => ({
                        originalEntity: m.originalEntity?.name,
                        cdmEntity: m.cdmEntity?.logicalName,
                        matchType: m.matchType,
                        confidence: m.confidence
                    }))
                });
                
                const { cdmEntities, customEntities } = this.categorizeEntities(
                    parseResult.entities, 
                    cdmMatches
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
                    globalChoicesCreated: 0,
                    globalChoicesExistingAdded: 0,
                    message: 'Deployment completed successfully'
                };

                // Step 5: Process CDM entities if any
                if (cdmEntities.length > 0) {
                    // If CDM entities are detected, process them as CDM entities
                    // regardless of user choice (they can't be created as custom entities anyway)
                    progress('cdm', `Adding ${cdmEntities.length} CDM Tables...`);
                    console.log('🔧 DEBUG: Processing CDM entities:', {
                        count: cdmEntities.length,
                        entities: cdmEntities.map(e => e?.originalEntity?.name || e?.name),
                        userChoice: config.cdmChoice
                    });
                    
                    results.cdmResults = await this.processCDMEntities(
                        cdmEntities, 
                        solution.uniquename,
                        config,
                        dataverseConfig
                    );
                    
                    if (results.cdmResults.success) {
                        // Extract integrated entities from nested data structure
                        const cdmData = results.cdmResults.data || results.cdmResults;
                        results.cdmEntitiesIntegrated = cdmData.integratedEntities || [];
                        
                        // Also update relationship count from CDM
                        if (cdmData.summary?.relationshipsCreated) {
                            results.relationshipsCreated += cdmData.summary.relationshipsCreated;
                        }
                    }
                }

                // Step 6: Process custom entities if any
                if (customEntities.length > 0) {
                    progress('custom-entities', `Creating ${customEntities.length} Custom Tables...`);
                    results.customResults = await this.processCustomEntities(
                        customEntities,
                        parseResult.relationships,
                        solution,
                        publisherResult,
                        config,
                        dataverseConfig,
                        progress,
                        results.cdmEntitiesIntegrated // Pass the integrated CDM entities
                    );
                    
                    if (results.customResults.success) {
                        results.entitiesCreated += results.customResults.entitiesCreated || 0;
                        results.relationshipsCreated += results.customResults.relationshipsCreated || 0;
                        
                        console.log('🔍 DEBUG: Updated results after custom entities:', {
                            entitiesCreated: results.entitiesCreated,
                            relationshipsCreated: results.relationshipsCreated,
                            customResultsData: {
                                entitiesCreated: results.customResults.entitiesCreated,
                                relationshipsCreated: results.customResults.relationshipsCreated
                            }
                        });
                    }
                }

                // Step 7: Process global choices
                if (config.selectedChoices?.length > 0 || config.customChoices?.length > 0) {
                    progress('global-choices', 'Processing Global Choices...');
                    
                    // Determine the correct publisher prefix to use
                    let publisherPrefix;
                    const publisherData = publisherResult?.data || publisherResult;
                    
                    // If solution already exists, use its publisher prefix
                    if (solution.publisherid?.customizationprefix) {
                        publisherPrefix = solution.publisherid.customizationprefix;
                        console.log('🔧 DEBUG: Using existing solution publisher prefix:', publisherPrefix);
                    } else {
                        publisherPrefix = publisherData.prefix;
                        console.log('🔧 DEBUG: Using new publisher prefix:', publisherPrefix);
                    }
                    
                    results.globalChoicesResults = await this.processGlobalChoices(
                        config,
                        solution.uniquename,
                        publisherPrefix,
                        dataverseConfig,
                        progress
                    );
                    
                    if (results.globalChoicesResults.success) {
                        results.globalChoicesAdded = results.globalChoicesResults.totalAdded || 0;
                        results.globalChoicesCreated = results.globalChoicesResults.totalCreated || 0;
                        results.globalChoicesExistingAdded = results.globalChoicesResults.totalExistingAdded || 0;
                    }
                }

                // Step 8: Finalize deployment
                progress('finalizing', 'Finalizing deployment...');
                results.summary = this.generateDeploymentSummary(results);
                
                // Update deployment tracking
                this.updateDeploymentStatus(deploymentId, 'completed', results.summary);
                
                progress('complete', results.summary, { completed: true });
                
                // Use the generated summary as the success message
                return this.createSuccess(results, results.summary);

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
            warnings: parseResult.warnings || [],
            cdmDetection: parseResult.cdmDetection || null
        };
    }

    /**
     * Ensure publisher exists
     * @param {Object} config - Deployment configuration
     * @param {Object} dataverseConfig - Dataverse configuration
     * @returns {Promise<Object>} Publisher result
     */
    async ensurePublisher(config, dataverseConfig) {
        // If using existing solution with selected publisher, use that publisher
        if (config.useExistingSolution && config.selectedPublisher) {
            console.log('🔧 DEBUG: Using existing solution publisher:', config.selectedPublisher);
            return {
                success: true,
                data: {
                    publisherid: config.selectedPublisher.id,
                    uniquename: config.selectedPublisher.uniqueName,
                    friendlyname: config.selectedPublisher.displayName,
                    customizationprefix: config.selectedPublisher.prefix
                }
            };
        }

        // For new publishers or when creating new solution
        const publisherConfig = {
            uniqueName: config.publisherUniqueName || (config.publisherName || 'CustomMermaidPublisher').replace(/\s+/g, ''),
            friendlyName: config.publisherName || 'Custom Mermaid Publisher',
            prefix: config.publisherPrefix || 'cmmd'
        };

        console.log('🔧 DEBUG: Publisher config:', publisherConfig);

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
        // If using existing solution, use the selected solution
        if (config.useExistingSolution && config.selectedSolutionId) {
            console.log('🔧 DEBUG: Using existing solution:', config.selectedSolutionId);
            
            // Get the existing solution details
            const client = await this.dataverseRepository.getClient(dataverseConfig);
            const solution = await client.getSolutionById(config.selectedSolutionId);
            
            return {
                success: true,
                data: solution
            };
        }

        // For new solutions
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
        console.log('🔧 DEBUG: categorizeEntities input:', {
            entitiesCount: entities.length,
            entityNames: entities.map(e => e.name),
            cdmMatchesCount: cdmMatches.length,
            cdmMatchNames: cdmMatches.map(m => m?.originalEntity?.name)
        });
        
        const cdmEntityNames = cdmMatches.map(m => 
            m?.originalEntity?.name || m?.entity || ''
        ).filter(name => name);

        console.log('🔧 DEBUG: CDM entity names extracted:', cdmEntityNames);

        const cdmEntities = cdmMatches;
        const customEntities = entities.filter(entity => 
            !cdmEntityNames.includes(entity.name)
        );

        console.log('🔧 DEBUG: Categorization result:', {
            cdmEntitiesCount: cdmEntities.length,
            customEntitiesCount: customEntities.length,
            cdmEntityNames: cdmEntities.map(e => e?.originalEntity?.name || e?.name),
            customEntityNames: customEntities.map(e => e.name)
        });

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
     * @param {Array} integratedCdmEntities - Integrated CDM entities for relationship creation
     * @returns {Promise<Object>} Custom entities processing result
     */
    async processCustomEntities(customEntities, relationships, solution, publisher, config, dataverseConfig, progress, integratedCdmEntities = []) {
        try {
            // Extract actual data from wrapped response objects
            const publisherData = publisher?.data || publisher;
            const solutionData = solution?.data || solution;
            
            console.log('🔧 DEBUG: processCustomEntities data:', {
                publisherData: {
                    uniqueName: publisherData?.uniquename,
                    friendlyName: publisherData?.friendlyname,
                    prefix: publisherData?.customizationprefix
                },
                solutionData: {
                    uniqueName: solutionData?.uniquename,
                    friendlyName: solutionData?.friendlyname
                }
            });
            
            const customConfig = {
                publisherPrefix: publisherData?.customizationprefix,
                publisherName: publisherData?.friendlyname,
                publisherUniqueName: publisherData?.uniquename,
                solutionUniqueName: solutionData?.uniquename,
                solutionFriendlyName: solutionData?.friendlyname,
                relationships: relationships,
                cdmEntities: integratedCdmEntities, // Use integrated CDM entities instead of original matches
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
        let totalCreated = 0;
        let totalExistingAdded = 0;
        const results = { success: true, errors: [] };

        // Process selected global choices (existing ones added to solution)
        if (config.selectedChoices?.length > 0) {
            try {
                progress('global-choices-solution', 'Adding Global Choices to Solution...');
                const selectedResult = await this.dataverseRepository.addGlobalChoicesToSolution(
                    config.selectedChoices,
                    solutionName,
                    dataverseConfig
                );
                const addedCount = selectedResult.added || 0;
                totalAdded += addedCount;
                totalExistingAdded += addedCount;
                if (selectedResult.errors?.length > 0) {
                    results.errors.push(...selectedResult.errors);
                }
            } catch (error) {
                this.error('Selected global choices processing failed', error);
                results.errors.push(`Selected choices: ${error.message}`);
            }
        }

        // Process custom global choices (newly created)
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
                const createdCount = customResult.created || 0;
                const skippedCount = customResult.skipped || 0;
                
                totalAdded += createdCount;
                totalCreated += createdCount;
                totalExistingAdded += skippedCount; // Skipped means they already existed and were added to solution
                
                if (customResult.errors?.length > 0) {
                    results.errors.push(...customResult.errors);
                }
            } catch (error) {
                this.error('Custom global choices processing failed', error);
                results.errors.push(`Custom choices: ${error.message}`);
            }
        }

        results.totalAdded = totalAdded;
        results.totalCreated = totalCreated;
        results.totalExistingAdded = totalExistingAdded;
        return results;
    }

    /**
     * Generate deployment summary
     * @param {Object} results - Deployment results
     * @returns {string} Summary message
     */
    generateDeploymentSummary(results) {
        // Debug logging for summary generation
        console.log('🔍 DEBUG: Generating deployment summary with results:', {
            cdmEntitiesIntegratedCount: results.cdmEntitiesIntegrated?.length || 0,
            entitiesCreated: results.entitiesCreated || 0,
            relationshipsCreated: results.relationshipsCreated || 0,
            globalChoicesAdded: results.globalChoicesAdded || 0,
            globalChoicesCreated: results.globalChoicesCreated || 0,
            globalChoicesExistingAdded: results.globalChoicesExistingAdded || 0,
            solutionName: results.solutionName
        });
        
        const summaryParts = [];
        
        // Always include solution creation/update as the primary achievement
        if (results.solutionName) {
            summaryParts.push(`Solution deployed successfully`);
        }
        
        // CDM entities (added to existing solution)
        if (results.cdmEntitiesIntegrated?.length > 0) {
            summaryParts.push(`${results.cdmEntitiesIntegrated.length} CDM tables added`);
        }
        
        // Custom entities (newly created)
        if (results.entitiesCreated > 0) {
            summaryParts.push(`${results.entitiesCreated} custom tables created`);
        }
        
        // Relationships
        if (results.relationshipsCreated > 0) {
            summaryParts.push(`${results.relationshipsCreated} relationships created`);
        }
        
        // Global choices with detailed breakdown
        if (results.globalChoicesCreated > 0 || results.globalChoicesExistingAdded > 0) {
            const choicesParts = [];
            if (results.globalChoicesCreated > 0) {
                choicesParts.push(`${results.globalChoicesCreated} new`);
            }
            if (results.globalChoicesExistingAdded > 0) {
                choicesParts.push(`${results.globalChoicesExistingAdded} existing`);
            }
            summaryParts.push(`${results.globalChoicesAdded} global choices added (${choicesParts.join(', ')})`);
        }

        // Always return a success message for successful deployments
        const finalSummary = summaryParts.length > 0 
            ? `${summaryParts.join(', ')}`
            : 'Deployment completed successfully';
            
        console.log('🔍 DEBUG: Generated summary:', finalSummary);
        return finalSummary;
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
