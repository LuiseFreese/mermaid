/**
 * Dataverse Repository
 * Data access abstraction layer over DataverseClient
 */
const { BaseRepository } = require('./base-repository');

class DataverseRepository extends BaseRepository {
    constructor(dependencies = {}) {
        super(dependencies);
        
        this.DataverseClient = dependencies.DataverseClient;
        this.configRepository = dependencies.configRepository || dependencies.configurationRepository;
        
        if (!this.DataverseClient) {
            throw new Error('DataverseRepository requires DataverseClient dependency');
        }
        
        // Cache for client instances
        this.clientCache = new Map();
        
        // Clear cache on startup to ensure fresh clients with latest methods
        this.clearClientCache();
    }

    /**
     * Clear the client cache
     */
    clearClientCache() {
        console.log('🗑️ DataverseRepository: Clearing client cache');
        this.clientCache.clear();
    }

    /**
     * Get or create DataverseClient instance
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} DataverseClient instance
     */
    async getClient(config = null) {
        console.log('🔗 DataverseRepository.getClient: Creating real Dataverse client', {
            useClientSecret: process.env.USE_CLIENT_SECRET === 'true',
            useManagedIdentity: process.env.USE_MANAGED_IDENTITY === 'true',
            configProvided: !!config,
            configServerUrl: config?.serverUrl || config?.dataverseUrl
        });
        
        try {
            // Use provided config or get from config repository
            let dataverseConfig = config;
            
            if (!dataverseConfig) {
                console.log('⚠️ No config provided to getClient(), fetching default from ConfigurationRepository');
                const configResult = await this.configRepository?.getDataverseConfig();
                // Extract the actual config data from the wrapped response
                dataverseConfig = configResult?.data || configResult;
                
                // If still wrapped (has success property), extract data again
                if (dataverseConfig?.success && dataverseConfig?.data) {
                    dataverseConfig = dataverseConfig.data;
                }
            } else {
                // Normalize config: ensure serverUrl is set (some configs use dataverseUrl)
                if (dataverseConfig.dataverseUrl && !dataverseConfig.serverUrl) {
                    dataverseConfig.serverUrl = dataverseConfig.dataverseUrl;
                }
                console.log('✅ Using provided config with serverUrl:', dataverseConfig.serverUrl);
            }
            
            if (!dataverseConfig) {
                throw new Error('Dataverse configuration not available');
            }

            console.log(`🔗 DataverseRepository.getClient: Creating client for URL: ${dataverseConfig.serverUrl}`);

            // Create cache key
            const cacheKey = `${dataverseConfig.serverUrl}_${dataverseConfig.clientId}`;
            
            // Return cached client if available
            if (this.clientCache.has(cacheKey)) {
                console.log(`✅ Using cached client for: ${dataverseConfig.serverUrl}`);
                const cachedClient = this.clientCache.get(cacheKey);
                return cachedClient;
            }

            console.log(`🆕 Creating NEW client for: ${dataverseConfig.serverUrl}`);

            // Create new client
            const client = new this.DataverseClient({
                dataverseUrl: dataverseConfig.serverUrl,
                tenantId: dataverseConfig.tenantId,
                clientId: dataverseConfig.clientId,
                clientSecret: dataverseConfig.clientSecret, // Pass client secret
                managedIdentityClientId: dataverseConfig.managedIdentityClientId,
                verbose: process.env.NODE_ENV === 'development' || process.env.DATAVERSE_VERBOSE === 'true'
            });

            // Validate client configuration
            this.validateClient(client);
            
            // Cache client
            this.clientCache.set(cacheKey, client);
            
            return client;
        } catch (error) {
            // Log the error and throw it instead of returning error object
            this.error('getClient failed', error);
            throw error;
        }
    }

    /**
     * Get list of publishers
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Publishers result
     */
    async getPublishers(config = null) {
        return this.executeOperation('getPublishers', async () => {
            const client = await this.getClient(config);
            const publishers = await client.getPublishers();
            
            return this.createSuccess(publishers, 'Publishers retrieved successfully');
        });
    }

    /**
     * Create a new publisher
     * @param {Object} publisherData - Publisher configuration
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Creation result
     */
    async createPublisher(publisherData, config = null) {
        return this.executeOperation('createPublisher', async () => {
            const client = await this.getClient(config);
            const result = await client.createPublisher(publisherData);
            
            const successResult = this.createSuccess(result, 'Publisher created successfully');
            
            return successResult;
        });
    }

    /**
     * Get publisher by identifier
     * @param {string} identifier - Publisher unique name or ID
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Publisher result
     */
    async getPublisher(identifier, config = null) {
        return this.executeOperation('getPublisher', async () => {
            const client = await this.getClient(config);
            const result = await client.getPublisher(identifier);
            
            return this.createSuccess(result, 'Publisher retrieved successfully');
        });
    }

    /**
     * Update publisher
     * @param {string} identifier - Publisher unique name or ID
     * @param {Object} updateData - Data to update
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Update result
     */
    async updatePublisher(identifier, updateData, config = null) {
        return this.executeOperation('updatePublisher', async () => {
            const client = await this.getClient(config);
            const result = await client.updatePublisher(identifier, updateData);
            
            return this.createSuccess(result, 'Publisher updated successfully');
        });
    }

    /**
     * Ensure publisher exists (create if not found)
     * @param {Object} publisherConfig - Publisher configuration
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Publisher result
     */
    async ensurePublisher(publisherConfig, config = null) {
        return this.executeOperation('ensurePublisher', async () => {
            const client = await this.getClient(config);
            
            // Debug the client object
            console.log('🔍 DEBUG: client object:', {
                type: typeof client,
                isNull: client === null,
                isUndefined: client === undefined,
                hasEnsurePublisher: typeof client?.ensurePublisher,
                constructor: client?.constructor?.name,
                methods: Object.getOwnPropertyNames(client || {}).filter(name => typeof client[name] === 'function'),
                prototype: client ? Object.getOwnPropertyNames(Object.getPrototypeOf(client)).filter(name => typeof client[name] === 'function') : []
            });
            
            const result = await client.ensurePublisher(publisherConfig);
            
            return this.createSuccess(result, 'Publisher ensured successfully');
        });
    }

    /**
     * Get global choice sets
     * @param {Object} options - Query options
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Global choices result
     */
    async getGlobalChoiceSets(options = {}, config = null) {
        return this.executeOperation('getGlobalChoiceSets', async () => {
            const client = await this.getClient(config);
            const result = await client.getGlobalChoiceSets(options);
            
            return this.createSuccess(result, 'Global choice sets retrieved successfully');
        });
    }

    /**
     * Create global choice set
     * @param {Object} choiceData - Choice set configuration
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Creation result
     */
    async createGlobalChoiceSet(choiceData, config = null) {
        return this.executeOperation('createGlobalChoiceSet', async () => {
            const client = await this.getClient(config);
            const result = await client.createGlobalChoiceSet(choiceData);
            
            return this.createSuccess(result, 'Global choice set created successfully');
        });
    }

    /**
     * Get global choice set by name
     * @param {string} choiceName - Choice set name
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Choice set result
     */
    async getGlobalChoiceSet(choiceName, config = null) {
        return this.executeOperation('getGlobalChoiceSet', async () => {
            const client = await this.getClient(config);
            const result = await client.getGlobalChoiceSet(choiceName);
            
            return this.createSuccess(result, 'Global choice set retrieved successfully');
        });
    }

    /**
     * Update global choice set
     * @param {string} choiceName - Choice set name
     * @param {Object} updateData - Data to update
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Update result
     */
    async updateGlobalChoiceSet(choiceName, updateData, config = null) {
        return this.executeOperation('updateGlobalChoiceSet', async () => {
            const client = await this.getClient(config);
            const result = await client.updateGlobalChoiceSet(choiceName, updateData);
            
            return this.createSuccess(result, 'Global choice set updated successfully');
        });
    }

    /**
     * Delete global choice set
     * @param {string} choiceName - Choice set name
     * @param {Object} options - Deletion options
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Deletion result
     */
    async deleteGlobalChoiceSet(choiceName, options = {}, config = null) {
        return this.executeOperation('deleteGlobalChoiceSet', async () => {
            const client = await this.getClient(config);
            const result = await client.deleteGlobalChoiceSet(choiceName, options);
            
            return this.createSuccess(result, 'Global choice set deleted successfully');
        });
    }

    /**
     * Add global choices to solution
     * @param {Array} choiceNames - Choice set names
     * @param {string} solutionName - Solution unique name
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Addition result
     */
    async addGlobalChoicesToSolution(choiceNames, solutionName, config = null) {
        return this.executeOperation('addGlobalChoicesToSolution', async () => {
            const client = await this.getClient(config);
            const result = await client.addGlobalChoicesToSolution(choiceNames, solutionName);
            
            return this.createSuccess(result, 'Global choices added to solution successfully');
        });
    }

    /**
     * Create and add custom global choices to solution
     * @param {Array} customChoices - Custom choice definitions
     * @param {string} solutionName - Solution unique name
     * @param {string} publisherPrefix - Publisher prefix
     * @param {Object} config - Optional Dataverse configuration
     * @param {Function} progressCallback - Progress callback
     * @returns {Promise<Object>} Creation and addition result
     */
    async createAndAddCustomGlobalChoices(customChoices, solutionName, publisherPrefix, config = null, progressCallback = null) {
        return this.executeOperation('createAndAddCustomGlobalChoices', async () => {
            const client = await this.getClient(config);
            const result = await client.createAndAddCustomGlobalChoices(
                customChoices, 
                solutionName, 
                publisherPrefix,
                progressCallback
            );
            
            return this.createSuccess(result, 'Custom global choices created and added successfully');
        });
    }

    /**
     * Check global choice usage
     * @param {string} choiceName - Choice set name
     * @returns {Promise<Object>} Usage check result
     */
    async checkGlobalChoiceUsage(choiceName) {
        return this.executeOperation('checkGlobalChoiceUsage', async () => {
            // Note: This would need to be implemented in DataverseClient
            // For now, return placeholder indicating usage check is not implemented
            const result = {
                choiceName,
                inUse: false,
                usedBy: [],
                note: 'Usage checking not yet implemented in DataverseClient'
            };
            
            return this.createSuccess(result, 'Global choice usage check completed (placeholder)');
        });
    }

    /**
     * Get solutions
     * @param {Object} options - Query options
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Solutions result
     */
    async getSolutions(options = {}, config = null) {
        return this.executeOperation('getSolutions', async () => {
            const client = await this.getClient(config);
            const result = await client.getSolutions(options);
            
            console.log('🔍 DataverseRepository DEBUG: result from client:', {
                success: result.success,
                hasSolutions: !!result.solutions,
                solutionsType: typeof result.solutions,
                solutionsLength: Array.isArray(result.solutions) ? result.solutions.length : 'not array'
            });
            
            if (result.success) {
                const successResult = this.createSuccess(result.solutions || [], 'Solutions retrieved successfully');
                console.log('🔍 DataverseRepository createSuccess result:', {
                    hasData: !!successResult.data,
                    dataType: typeof successResult.data,
                    dataLength: Array.isArray(successResult.data) ? successResult.data.length : 'not array'
                });
                return successResult;
            } else {
                throw new Error(result.message || 'Failed to retrieve solutions');
            }
        });
    }

    /**
     * Get solution by ID
     * @param {string} solutionId - Solution ID
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Solution result
     */
    async getSolutionById(solutionId, config = null) {
        return this.executeOperation('getSolutionById', async () => {
            const client = await this.getClient(config);
            const result = await client.getSolutions({ filter: `solutionid eq ${solutionId}` });
            
            if (result.success && result.solutions && result.solutions.length > 0) {
                return this.createSuccess(result.solutions[0], 'Solution retrieved successfully');
            } else if (result.success) {
                return this.createSuccess(null, 'Solution not found');
            } else {
                throw new Error(result.message || 'Failed to retrieve solution');
            }
        });
    }

    /**
     * Create solution
     * @param {Object} solutionData - Solution configuration
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Creation result
     */
    async createSolution(solutionData, config = null) {
        return this.executeOperation('createSolution', async () => {
            const client = await this.getClient(config);
            const result = await client.createSolution(
                solutionData.uniqueName,
                solutionData.friendlyName,
                { 
                    publisherId: solutionData.publisherId, 
                    description: solutionData.description || `Solution for ${solutionData.uniqueName}` 
                }
            );
            
            return this.createSuccess(result, 'Solution created successfully');
        });
    }

    /**
     * Update solution
     * @param {string} solutionName - Solution unique name
     * @param {Object} updateData - Data to update
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Update result
     */
    async updateSolution(solutionName, updateData, config = null) {
        return this.executeOperation('updateSolution', async () => {
            const client = await this.getClient(config);
            const result = await client.updateSolution(solutionName, updateData);
            
            return this.createSuccess(result, 'Solution updated successfully');
        });
    }

    /**
     * Delete solution
     * @param {string} solutionName - Solution unique name
     * @param {Object} options - Deletion options
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Deletion result
     */
    async deleteSolution(solutionName, options = {}, config = null) {
        return this.executeOperation('deleteSolution', async () => {
            const client = await this.getClient(config);
            const result = await client.deleteSolution(solutionName, options);
            
            return this.createSuccess(result, 'Solution deleted successfully');
        });
    }

    /**
     * Rollback a deployment
     * @param {Object} deploymentData - Deployment data containing entities, relationships, etc.
     * @param {Function} progressCallback - Optional callback for progress updates
     * @param {Object} config - Rollback configuration (granular options) or environment config
     * @param {Object} rollbackOptions - Optional rollback options when config is environment config
     * @returns {Promise<Object>} Rollback result
     */
    async rollbackDeployment(deploymentData, progressCallback = null, config = null, rollbackOptions = null) {
        return this.executeOperation('rollbackDeployment', async () => {
            // If rollbackOptions is provided, config is environment config
            // Otherwise, config is the rollback options
            let environmentConfig = null;
            let actualRollbackConfig = null;
            
            if (rollbackOptions) {
                // 4th parameter provided - 3rd is environment config, 4th is rollback options
                environmentConfig = config;
                actualRollbackConfig = rollbackOptions;
            } else if (config && (config.dataverseUrl || config.serverUrl)) {
                // No 4th parameter, but 3rd has URL - it's environment config, no rollback options
                environmentConfig = config;
                actualRollbackConfig = null;
            } else {
                // 3rd parameter is rollback options, no environment override
                environmentConfig = null;
                actualRollbackConfig = config;
            }
            
            const client = await this.getClient(environmentConfig);
            const result = await client.rollbackDeployment(deploymentData, progressCallback, actualRollbackConfig);
            
            // The rollback client returns a results object with detailed information
            // Consider it successful if there are no fatal errors (errors array can have non-fatal warnings)
            // Or if the solution was deleted (main goal achieved)
            if (result.solutionDeleted || result.errors.length === 0) {
                return this.createSuccess(result, 'Rollback completed successfully');
            } else {
                // Return the result with error details
                return this.createSuccess({
                    ...result,
                    partialSuccess: true
                }, `Rollback completed with ${result.errors.length} errors`);
            }
        });
    }

    /**
     * Ensure solution exists
     * @param {Object} solutionConfig - Solution configuration
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Solution result
     */
    async ensureSolution(solutionConfig, config = null) {
        return this.executeOperation('ensureSolution', async () => {
            const client = await this.getClient(config);
            const result = await client.ensureSolution(
                solutionConfig.uniqueName,
                solutionConfig.friendlyName,
                { publisherid: solutionConfig.publisherId }
            );
            
            return this.createSuccess(result, 'Solution ensured successfully');
        });
    }

    /**
     * Get solution components
     * @param {string} solutionName - Solution unique name
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Components result
     */
    async getSolutionComponents(solutionName, config = null) {
        return this.executeOperation('getSolutionComponents', async () => {
            const client = await this.getClient(config);
            const result = await client.getSolutionComponents(solutionName);
            
            return this.createSuccess(result, 'Solution components retrieved successfully');
        });
    }

    /**
     * Export solution
     * @param {string} solutionName - Solution unique name
     * @param {Object} options - Export options
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Export result
     */
    async exportSolution(solutionName, options = {}, config = null) {
        return this.executeOperation('exportSolution', async () => {
            const client = await this.getClient(config);
            const result = await client.exportSolution(solutionName, options);
            
            return this.createSuccess(result, 'Solution exported successfully');
        });
    }

    /**
     * Import solution
     * @param {Buffer|string} solutionData - Solution file data
     * @param {Object} options - Import options
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Import result
     */
    async importSolution(solutionData, options = {}, config = null) {
        return this.executeOperation('importSolution', async () => {
            const client = await this.getClient(config);
            const result = await client.importSolution(solutionData, options);
            
            return this.createSuccess(result, 'Solution imported successfully');
        });
    }

    /**
     * Integrate CDM entities
     * @param {Array} cdmEntities - CDM entities to integrate
     * @param {string} solutionName - Solution unique name
     * @param {boolean} includeRelatedEntities - Include related entities
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Integration result
     */
    async integrateCDMEntities(cdmEntities, solutionName, includeRelatedEntities, config = null) {
        return this.executeOperation('integrateCDMEntities', async () => {
            const client = await this.getClient(config);
            const result = await client.integrateCDMEntities(cdmEntities, solutionName, includeRelatedEntities);
            
            return this.createSuccess(result, 'CDM entities integrated successfully');
        });
    }

    /**
     * Create custom entities
     * @param {Array} customEntities - Custom entities to create
     * @param {Object} customConfig - Creation configuration
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Creation result
     */
    async createCustomEntities(customEntities, customConfig, config = null) {
        return this.executeOperation('createCustomEntities', async () => {
            const client = await this.getClient(config);
            const result = await client.createCustomEntities(customEntities, customConfig);
            
            return this.createSuccess(result, 'Custom entities created successfully');
        });
    }

    /**
     * Cleanup test entities and relationships
     * @param {Object} options - Cleanup options
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} Cleanup result
     */
    async cleanupTestEntities(options, config = null) {
        return this.executeOperation('cleanupTestEntities', async () => {
            const client = await this.getClient(config);
            const result = await client.cleanupTestEntities(options);
            
            return this.createSuccess(result, 'Test entities cleaned up successfully');
        });
    }

    /**
     * Clear client cache
     */
    clearCache() {
        this.clientCache.clear();
        this.log('clearCache', { cacheCleared: true });
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return {
            cachedClients: this.clientCache.size,
            cacheKeys: Array.from(this.clientCache.keys())
        };
    }
}

module.exports = { DataverseRepository };
