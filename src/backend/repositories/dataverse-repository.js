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
    }

    /**
     * Get or create DataverseClient instance
     * @param {Object} config - Optional Dataverse configuration
     * @returns {Promise<Object>} DataverseClient instance
     */
    async getClient(config = null) {
        console.log('🔗 DataverseRepository.getClient: Creating real Dataverse client', {
            useClientSecret: process.env.USE_CLIENT_SECRET === 'true',
            useManagedIdentity: process.env.USE_MANAGED_IDENTITY === 'true'
        });
        
        try {
            // Use provided config or get from config repository
            let dataverseConfig = config;
            
            if (!dataverseConfig) {
                const configResult = await this.configRepository?.getDataverseConfig();
                console.log('🔍 DEBUG: configResult from repository:', {
                    type: typeof configResult,
                    keys: Object.keys(configResult || {}),
                    hasData: !!configResult?.data,
                    dataKeys: Object.keys(configResult?.data || {}),
                    dataContent: configResult?.data
                });
                // Extract the actual config data from the wrapped response
                dataverseConfig = configResult?.data || configResult;
                
                // If still wrapped (has success property), extract data again
                if (dataverseConfig?.success && dataverseConfig?.data) {
                    dataverseConfig = dataverseConfig.data;
                }
            }
            
            if (!dataverseConfig) {
                throw new Error('Dataverse configuration not available');
            }

            console.log('🔍 DEBUG: dataverseConfig:', {
                hasServerUrl: !!dataverseConfig.serverUrl,
                hasClientId: !!dataverseConfig.clientId,
                hasTenantId: !!dataverseConfig.tenantId,
                hasManagedIdentity: !!dataverseConfig.managedIdentityClientId,
                rawConfig: Object.keys(dataverseConfig)
            });

            // Create cache key
            const cacheKey = `${dataverseConfig.serverUrl}_${dataverseConfig.clientId}`;
            
            // Return cached client if available
            if (this.clientCache.has(cacheKey)) {
                const cachedClient = this.clientCache.get(cacheKey);
                console.log('🔍 DEBUG: returning cached client:', {
                    type: typeof cachedClient,
                    constructor: cachedClient?.constructor?.name,
                    hasEnsurePublisher: typeof cachedClient?.ensurePublisher
                });
                return cachedClient;
            }

            console.log('🔍 DEBUG: Creating new DataverseClient with:', {
                DataverseClientType: typeof this.DataverseClient,
                DataverseClientName: this.DataverseClient?.name
            });

            // Create new client
            console.log('🔍 DEBUG: About to create DataverseClient with credentials:', {
                dataverseUrl: dataverseConfig.serverUrl?.substring(0, 30) + '...',
                tenantId: dataverseConfig.tenantId?.substring(0, 10) + '...',
                clientId: dataverseConfig.clientId?.substring(0, 10) + '...',
                hasClientSecret: !!dataverseConfig.clientSecret, // Log client secret availability
                managedIdentityClientId: dataverseConfig.managedIdentityClientId?.substring(0, 10) + '...',
                hasServerUrl: !!dataverseConfig.serverUrl,
                hasTenantId: !!dataverseConfig.tenantId,
                hasClientId: !!dataverseConfig.clientId,
                hasManagedIdentity: !!dataverseConfig.managedIdentityClientId,
                authMode: process.env.AUTH_MODE
            });
            
            const client = new this.DataverseClient({
                dataverseUrl: dataverseConfig.serverUrl,
                tenantId: dataverseConfig.tenantId,
                clientId: dataverseConfig.clientId,
                clientSecret: dataverseConfig.clientSecret, // Pass client secret
                managedIdentityClientId: dataverseConfig.managedIdentityClientId,
                verbose: true
            });

            console.log('🔍 DEBUG: Created client:', {
                type: typeof client,
                constructor: client?.constructor?.name,
                hasEnsurePublisher: typeof client?.ensurePublisher,
                methods: Object.getOwnPropertyNames(client).filter(name => typeof client[name] === 'function'),
                prototypeMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(client)).filter(name => typeof client[name] === 'function')
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
            
            console.log('🔧 DEBUG: DataverseRepository.createPublisher client result:', result);
            const successResult = this.createSuccess(result, 'Publisher created successfully');
            console.log('🔧 DEBUG: DataverseRepository.createPublisher final result:', successResult);
            
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
