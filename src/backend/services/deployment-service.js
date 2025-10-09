/**
 * Deployment Service
 * Business logic for solution deployment orchestration
 */
const { BaseService } = require('./base-service');
const { performanceMonitor } = require('../performance-monitor');
const { ProgressTracker } = require('../utils/progress-tracker');

class DeploymentService extends BaseService {
    constructor(dependencies = {}) {
        super(dependencies);
        
        // Validate required dependencies
        this.validateDependencies(['dataverseRepository', 'configRepository']);
        
        this.dataverseRepository = dependencies.dataverseRepository;
        this.configRepository = dependencies.configRepository;
        this.validationService = dependencies.validationService;
        this.publisherService = dependencies.publisherService;
        this.solutionService = dependencies.solutionService;
        this.globalChoicesService = dependencies.globalChoicesService;
        this.deploymentHistoryService = dependencies.deploymentHistoryService;
        this.mermaidParser = dependencies.mermaidParser;
        this.cdmRegistry = dependencies.cdmRegistry;
        
        // Track active deployments
        this.activeDeployments = new Map();
        
        // Performance monitoring
        this.performanceMonitor = performanceMonitor;
    }

    /**
     * Deploy solution to Dataverse with streaming progress
     * @param {Object} config - Deployment configuration
     * @param {Function} progressCallback - Progress update callback
     * @returns {Promise<Object>} Deployment result
     */
    async deploySolution(config, progressCallback) {
        const deploymentId = this.generateDeploymentId();
        
        // Initialize enhanced progress tracker
        const progressTracker = new ProgressTracker('deployment', progressCallback);
        
        // Start performance monitoring
        this.performanceMonitor.startOperation(deploymentId, 'deployment', {
            entityCount: 0, // Will be updated when we parse the ERD
            solutionName: config.solutionName
        });
        
        try {
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

            // Legacy progress function for backward compatibility
            const progress = (step, message, details = {}) => {
                this.updateDeploymentStatus(deploymentId, step, message);
                if (progressCallback) {
                    progressCallback(step, message, details);
                }
            };

            try {
                // Step 1: Parse and validate ERD content
                progressTracker.startStep('validation', 'Parsing and validating ERD content...');
                
                const parseResult = await this.parseERDContent(config.mermaidContent);
                
                // Validate ERD content
                if (this.validationService) {
                    progressTracker.updateStep('validation', 'Running ERD validation checks...');
                    const validationResult = await this.validationService.validateERD({
                        mermaidContent: config.mermaidContent,
                        options: {}
                    });
                    if (!validationResult.success) {
                        progressTracker.failStep('validation', 'ERD validation failed', validationResult.message);
                        throw new Error(validationResult.message || 'Invalid ERD syntax');
                    }
                }
                
                progressTracker.completeStep('validation', 'ERD content validated successfully');

                // Step 2: Setup Dataverse connection
                progressTracker.startStep('publisher', 'Connecting to Dataverse...');
                const dataverseConfigResult = await this.configRepository.getDataverseConfig();
                const dataverseConfig = dataverseConfigResult?.data || dataverseConfigResult;
                
                console.log('🔧 DEBUG: DeploymentService dataverseConfig:', {
                    hasServerUrl: !!dataverseConfig?.serverUrl,
                    hasClientId: !!dataverseConfig?.clientId,
                    hasManagedIdentity: !!dataverseConfig?.managedIdentityClientId,
                    hasTenantId: !!dataverseConfig?.tenantId,
                    keys: Object.keys(dataverseConfig || {})
                });
                
                // Step 3: Ensure publisher
                progressTracker.updateStep('publisher', config.useExistingSolution ? 'Using existing solution publisher' : 'Creating publisher...');
                const publisherResult = await this.ensurePublisher(config, dataverseConfig);
                
                console.log('🔧 DEBUG: publisherResult:', {
                    type: typeof publisherResult,
                    keys: Object.keys(publisherResult || {}),
                    hasData: !!publisherResult?.data,
                    publisherData: publisherResult?.data,
                    success: publisherResult?.success
                });
                
                progressTracker.completeStep('publisher', 'Publisher setup completed');
                
                // Step 4: Ensure solution
                progressTracker.startStep('solution', config.useExistingSolution ? 'Using existing solution' : 'Creating solution...');
                // Extract the actual publisher data from the wrapped response
                const publisher = publisherResult?.data || publisherResult;
                const solutionResult = await this.ensureSolution(config, publisher, dataverseConfig);
                
                // Extract the actual solution data from the wrapped response
                const solution = solutionResult?.data || solutionResult;
                
                progressTracker.completeStep('solution', 'Solution setup completed');

                console.log('🔧 DEBUG: Final solution being used:', {
                    uniquename: solution?.uniquename,
                    friendlyname: solution?.friendlyname,
                    solutionid: solution?.solutionid,
                    publisher: solution?.publisherid?.uniquename || solution?.publisher?.uniquename
                });

                // Step 5: Determine entity processing strategy
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

                // Update performance monitoring metadata with entity counts
                const totalEntities = cdmEntities.length + customEntities.length;
                const totalAttributes = parseResult.entities.reduce((sum, entity) => 
                    sum + (entity.attributes?.length || 0), 0);
                
                this.performanceMonitor.startTimes.get(deploymentId).metadata = {
                    ...this.performanceMonitor.startTimes.get(deploymentId).metadata,
                    entityCount: totalEntities,
                    attributeCount: totalAttributes,
                    cdmEntityCount: cdmEntities.length,
                    customEntityCount: customEntities.length
                };

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
                    customGlobalChoicesCreated: 0,
                    warnings: [],
                    message: 'Deployment completed successfully'
                };

                // Step 5: Process CDM entities if any
                if (cdmEntities.length > 0) {
                    progressTracker.startStep('entities', `Processing ${cdmEntities.length} CDM Tables...`);
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
                        
                        progressTracker.updateStep('entities', `Successfully processed ${cdmEntities.length} CDM entities`);
                    } else {
                        progressTracker.updateStep('entities', `CDM entities processing completed with warnings`);
                    }
                }

                // Step 6: Process custom entities if any
                if (customEntities.length > 0) {
                    if (cdmEntities.length === 0) {
                        progressTracker.startStep('entities', `Creating ${customEntities.length} Custom Tables...`);
                    } else {
                        progressTracker.updateStep('entities', `Creating ${customEntities.length} Custom Tables...`);
                    }
                    
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
                        
                        // Collect warnings from custom entities creation
                        if (results.customResults.warnings && results.customResults.warnings.length > 0) {
                            results.warnings.push(...results.customResults.warnings);
                        }
                        
                        progressTracker.updateStep('entities', `Successfully created ${results.customResults.entitiesCreated} custom entities`);
                        
                        console.log('🔍 DEBUG: Updated results after custom entities:', {
                            entitiesCreated: results.entitiesCreated,
                            relationshipsCreated: results.relationshipsCreated,
                            warningsCount: results.warnings.length,
                            customResultsData: {
                                entitiesCreated: results.customResults.entitiesCreated,
                                relationshipsCreated: results.customResults.relationshipsCreated,
                                warnings: results.customResults.warnings?.length || 0
                            }
                        });
                    } else {
                        progressTracker.updateStep('entities', `Custom entities creation completed with warnings`);
                    }
                }
                
                if (cdmEntities.length > 0 || customEntities.length > 0) {
                    progressTracker.completeStep('entities', `Entity creation completed - ${results.entitiesCreated} entities created`);
                }

                // Step 7: Process global choices
                if (config.selectedChoices?.length > 0 || config.customChoices?.length > 0) {
                    progressTracker.startStep('globalChoices', 'Processing Global Choices...');
                    
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
                        
                        progressTracker.completeStep('globalChoices', `Global choices processed - ${results.globalChoicesCreated} created, ${results.globalChoicesAdded} added`);
                    } else {
                        progressTracker.completeStep('globalChoices', 'Global choices processing completed with warnings');
                    }
                } else {
                    progressTracker.startStep('globalChoices', 'No global choices to process');
                    progressTracker.completeStep('globalChoices', 'Skipped global choices - none specified');
                }

                // Step 8: Process relationships (this happens during entity creation but we track it separately)
                progressTracker.startStep('relationships', `Setting up ${parseResult.relationships?.length || 0} relationships...`);
                progressTracker.completeStep('relationships', `${results.relationshipsCreated} relationships created successfully`);

                // Step 9: Finalize deployment
                progressTracker.startStep('finalization', 'Finalizing deployment...');
                results.summary = this.generateDeploymentSummary(results);
                
                // Step 10: Record deployment in history
                if (this.deploymentHistoryService) {
                    try {
                        // Extract publisher and solution information
                        const publisherData = publisherResult?.data || publisherResult;
                        const solutionData = solution;
                        
                        // Create deployment summary with actual CDM/custom entity information
                        const deploymentSummary = {
                            totalEntities: cdmEntities.length + customEntities.length,
                            entitiesAdded: [...cdmEntities.map(e => e.name || e.originalEntity?.name), ...customEntities.map(e => e.name)],
                            entitiesModified: [],
                            entitiesRemoved: [],
                            totalAttributes: parseResult.entities.reduce((sum, entity) => sum + (entity.attributes?.length || 0), 0),
                            cdmEntities: cdmEntities.length,
                            customEntities: customEntities.length,
                            cdmEntityNames: cdmEntities.map(e => e.name || e.originalEntity?.name),
                            customEntityNames: customEntities.map(e => e.name),
                            // Add global choices information from deployment results
                            globalChoicesAdded: await this.extractGlobalChoiceNames(config.selectedChoices || [], 'selected'),
                            globalChoicesCreated: await this.extractGlobalChoiceNames(config.customChoices || [], 'custom'),
                            // Add relationship information for rollback
                            relationshipsCreated: results.relationshipsCreated || 0,
                            totalRelationships: parseResult.relationships?.length || 0
                        };
                        
                        // Include relationship details for rollback capability
                        const rollbackData = {
                            relationships: parseResult.relationships || [],
                            customEntities: customEntities.map(e => ({
                                name: e.name,
                                logicalName: e.logicalName || e.name,
                                displayName: e.displayName || e.name
                            })),
                            globalChoicesCreated: await this.extractGlobalChoiceNames(config.customChoices || [], 'custom')
                        };
                        
                        await this.deploymentHistoryService.recordDeployment({
                            deploymentId: deploymentId,
                            environmentSuffix: 'default',
                            status: 'success',
                            erdContent: config.mermaidContent,
                            summary: deploymentSummary,
                            rollbackData: rollbackData, // Add rollback data
                            solutionInfo: {
                                solutionName: solutionData?.friendlyname || config.solutionDisplayName || config.solutionName,
                                publisherName: publisherData?.friendlyname || publisherData?.displayname || 'Default Publisher',
                                publisherPrefix: publisherData?.customizationprefix || publisherData?.prefix,
                                solutionId: solutionData?.solutionid
                            },
                            deploymentLogs: [], // Could be enhanced to include actual logs
                            metadata: {
                                deploymentMethod: 'web-ui'
                            }
                        });
                        console.log(`✅ Deployment ${deploymentId} recorded in history with solution: ${solutionData?.friendlyname}`);
                    } catch (historyError) {
                        console.warn(`⚠️ Failed to record deployment history: ${historyError.message}`);
                        // Don't fail the deployment if history recording fails
                    }
                }
                
                // Update deployment tracking
                this.updateDeploymentStatus(deploymentId, 'completed', results.summary);
                
                // End performance monitoring
                this.performanceMonitor.endOperation(deploymentId, results);
                
                // Complete the final step and the overall operation
                progressTracker.completeStep('finalization', 'Deployment recorded and finalized');
                progressTracker.complete(results.summary);
                
                // Use the generated summary as the success message
                return this.createSuccess(results, results.summary);

            } catch (error) {
                this.error('Deployment failed', error);
                this.updateDeploymentStatus(deploymentId, 'failed', error.message);
                
                // Fail the progress tracker
                progressTracker.fail('Deployment failed', error);
                
                // End performance monitoring for failed deployment
                this.performanceMonitor.endOperation(deploymentId, {
                    success: false,
                    error: error.message,
                    entitiesCreated: 0,
                    relationshipsCreated: 0
                });
                
                const errorResult = {
                    success: false,
                    deploymentId,
                    message: error.message, // Use original error message instead of generic "Deployment failed"
                    error: error.message,
                    entitiesCreated: 0,
                    relationshipsCreated: 0,
                    cdmEntitiesIntegrated: [],
                    globalChoicesAdded: 0
                };
                
                return errorResult; // Return error result directly instead of wrapping
            } finally {
                // Clean up active deployment after some time
                setTimeout(() => {
                    this.activeDeployments.delete(deploymentId);
                }, 300000); // 5 minutes
            }
        } catch (error) {
            // Handle deployment errors with preserved error messages
            this.updateDeploymentStatus(deploymentId, 'failed', error.message);
            
            return {
                success: false,
                message: error.message,
                deploymentId,
                error: error.message
            };
        }
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

        if (this.publisherService) {
            return await this.publisherService.createPublisher(publisherConfig, dataverseConfig);
        }
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
            friendlyName: config.solutionDisplayName,
            publisherId: publisher.id || publisher.publisherid
        };

        // Always use ensureSolution to get the complete solution object
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
     * Create entities in Dataverse
     * @param {Array} entities - Array of entity definitions
     * @param {string} solutionName - Solution name
     * @param {string} prefix - Entity prefix
     * @returns {Promise<Object>} Creation result
     */
    async _createEntities(entities, solutionName, prefix) {
        const results = {
            entitiesCreated: 0,
            entitiesFailed: 0,
            entityMap: {},
            errors: []
        };

        for (const entity of entities) {
            try {
                const logicalName = `${prefix}_${entity.name.toLowerCase()}`;
                const entityConfig = {
                    logicalName,
                    displayName: entity.name,
                    description: entity.description || `${entity.name} entity`,
                    attributes: entity.attributes || []
                };

                const createdEntity = await this.dataverseRepository.createEntity(
                    entityConfig,
                    solutionName
                );

                results.entitiesCreated++;
                results.entityMap[entity.name] = createdEntity;

            } catch (error) {
                results.entitiesFailed++;
                results.errors.push(`Entity ${entity.name} failed: ${error.message}`);
            }
        }

        return results;
    }

    /**
     * Create relationships between entities
     * @param {Array} relationships - Array of relationship definitions
     * @param {Object} entityMap - Map of entity names to created entities
     * @param {string} solutionName - Solution name
     * @returns {Promise<Object>} Creation result
     */
    async _createRelationships(relationships, entityMap, solutionName) {
        const results = {
            relationshipsCreated: 0,
            relationshipsFailed: 0,
            relationshipMap: {},
            errors: [],
            warnings: []
        };

        for (const relationship of relationships) {
            try {
                // Skip if entities don't exist
                if (!entityMap[relationship.from] || !entityMap[relationship.to]) {
                    results.relationshipsFailed++;
                    results.warnings.push(`Missing entity ${relationship.to} in entity map`);
                    continue;
                }

                const relationshipConfig = {
                    fromEntity: entityMap[relationship.from].logicalName,
                    toEntity: entityMap[relationship.to].logicalName,
                    type: relationship.type,
                    schemaName: `${entityMap[relationship.from].logicalName}_${entityMap[relationship.to].logicalName}s`,
                    label: relationship.label || `${relationship.from} to ${relationship.to}`
                };

                const createdRelationship = await this.dataverseRepository.createRelationship(
                    relationshipConfig,
                    solutionName
                );

                results.relationshipsCreated++;
                results.relationshipMap[`${relationship.from}->${relationship.to}`] = createdRelationship;

            } catch (error) {
                results.relationshipsFailed++;
                results.errors.push({
                    relationship: `${relationship.from} -> ${relationship.to}`,
                    error: error.message
                });
            }
        }

        return results;
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

    /**
     * Extract global choice names with display names from configuration
     * @param {Array} choices - Array of choice configurations
     * @param {string} type - Type of choices ('selected' for existing, 'custom' for new)
     * @returns {Promise<Array>} Array of choice display names
     */
    async extractGlobalChoiceNames(choices, type = 'selected') {
        if (!choices || !Array.isArray(choices)) {
            return [];
        }

        const results = [];

        for (const choice of choices) {
            try {
                let choiceName;
                let displayName;

                if (typeof choice === 'string') {
                    choiceName = choice;
                } else if (choice && typeof choice === 'object') {
                    choiceName = choice.name || choice.displayName || choice.logicalName || choice.label || choice.id;
                }

                if (!choiceName) {
                    continue;
                }

                if (type === 'selected') {
                    // For selected (existing) choices, fetch from Dataverse to get display name
                    try {
                        const choiceResult = await this.globalChoicesService.getGlobalChoice(choiceName);
                        
                        if (choiceResult.success && choiceResult.data) {
                            displayName = choiceResult.data.displayName || choiceResult.data.DisplayName || choiceName;
                        } else {
                            // If we can't fetch from Dataverse, format the technical name nicely
                            displayName = this.formatTechnicalName(choiceName);
                        }
                    } catch (error) {
                        this.log('Warning: Could not get display name for choice', { choiceName, error: error.message });
                        // If API fails, format the technical name nicely as fallback
                        displayName = this.formatTechnicalName(choiceName);
                    }
                } else {
                    // For custom choices, use the display name from the configuration
                    displayName = choice.displayName || choice.DisplayName || choiceName;
                }

                results.push(displayName);
            } catch (error) {
                this.log('Error processing choice for display name', { choice, error: error.message });
                // Add fallback name
                const fallbackName = typeof choice === 'string' ? choice : (choice?.name || 'Unknown Choice');
                results.push(fallbackName);
            }
        }

        return results;
    }

    /**
     * Format technical names to be more human-readable
     * @param {string} technicalName - Technical name to format
     * @returns {string} Formatted display name
     */
    formatTechnicalName(technicalName) {
        if (!technicalName || typeof technicalName !== 'string') {
            return technicalName;
        }

        // Handle common patterns:
        // goal_fiscalperiod -> Goal Fiscal Period
        // teamchoice -> Team Choice
        // new_customchoice -> New Custom Choice
        
        return technicalName
            .split(/[_-]/) // Split on underscores and hyphens
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Title case each word
            .join(' '); // Join with spaces
    }
}

module.exports = { DeploymentService };
