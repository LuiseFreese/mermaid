/**
 * Dataverse Client
 * Handles authentication and API interactions with Microsoft Dataverse
 */
const { DefaultAzureCredential, ClientSecretCredential } = require('@azure/identity');
const axios = require('axios');
const logger = require('../utils/logger');

class DataverseClient {
    constructor(config) {
        if (!config || Object.keys(config).length === 0) {
            throw new Error('Dataverse configuration is required');
        }

        // Validate required configuration
        if (!config.dataverseUrl) {
            throw new Error('Dataverse URL is required');
        }

        // Validate URL format
        try {
            new URL(config.dataverseUrl);
        } catch (error) {
            throw new Error('Invalid Dataverse URL');
        }

        this.dataverseUrl = config.dataverseUrl;
        this.tenantId = config.tenantId;
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
        this.managedIdentityClientId = config.managedIdentityClientId;
        this.timeout = config.timeout;

        // Initialize appropriate Azure credential based on environment
        this.authMode = this._determineAuthMode();
        this.credential = this._initializeCredential();
        
        // Token cache
        this.cachedToken = null;
        this.tokenExpiry = null;

        logger.info(`DataverseClient initialized with ${this.authMode} authentication`);
    }

    /**
     * Determine authentication mode based on environment variables
     */
    _determineAuthMode() {
        // Check if client secret is provided (local development)
        if (this.clientId && this.clientSecret && this.tenantId) {
            return 'client-secret';
        }
        
        // Check environment variable for auth mode
        const envAuthMode = process.env.AUTH_MODE;
        if (envAuthMode === 'client-secret' && process.env.CLIENT_ID && process.env.CLIENT_SECRET && process.env.TENANT_ID) {
            return 'client-secret';
        }
        
        // Default to managed identity (Azure production environment)
        return 'managed-identity';
    }

    /**
     * Initialize appropriate credential based on auth mode
     */
    _initializeCredential() {
        if (this.authMode === 'client-secret') {
            const tenantId = this.tenantId || process.env.TENANT_ID;
            const clientId = this.clientId || process.env.CLIENT_ID;
            const clientSecret = this.clientSecret || process.env.CLIENT_SECRET;
            
            if (!tenantId || !clientId || !clientSecret) {
                throw new Error('Client secret authentication requires TENANT_ID, CLIENT_ID, and CLIENT_SECRET');
            }

            logger.info('Using ClientSecretCredential for authentication');
            return new ClientSecretCredential(tenantId, clientId, clientSecret);
        } else {
            logger.info('Using DefaultAzureCredential (managed identity) for authentication');
            return new DefaultAzureCredential();
        }
    }

    /**
     * Get access token for Dataverse API
     */
    async getAccessToken() {
        try {
            // Check if we have a valid cached token
            if (this.cachedToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
                return this.cachedToken;
            }

            const scope = `${this.dataverseUrl}/.default`;
            const tokenResponse = await this.credential.getToken(scope);
            
            this.cachedToken = tokenResponse.token;
            this.tokenExpiry = tokenResponse.expiresOnTimestamp;
            
            return tokenResponse.token;
        } catch (error) {
            logger.error('Authentication failed:', error);
            throw error;
        }
    }

    /**
     * Make API request with exponential backoff retry logic
     * @param {Function} requestFn - Async function that makes the API request
     * @param {Object} options - Retry options
     * @returns {Promise<any>} API response
     */
    async makeRequestWithRetry(requestFn, options = {}) {
        const {
            maxRetries = 5,
            initialDelayMs = 1000,
            maxDelayMs = 16000,
            retryableStatuses = [429, 500, 502, 503, 504]
        } = options;

        let lastError = null;
        let delay = initialDelayMs;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const response = await requestFn();
                
                // Log successful retry
                if (attempt > 0) {
                    logger.info(`Request succeeded after ${attempt} retry attempt(s)`);
                }
                
                return response;
            } catch (error) {
                lastError = error;
                
                // Don't retry if not an HTTP error
                if (!error.response) {
                    throw error;
                }

                const status = error.response.status;
                
                // Don't retry if status is not retryable
                if (!retryableStatuses.includes(status)) {
                    throw error;
                }

                // Don't retry if we've exhausted attempts
                if (attempt >= maxRetries) {
                    logger.warn(`Max retries (${maxRetries}) exceeded for ${status} error`);
                    throw error;
                }

                // Check for Retry-After header (rate limiting)
                let retryAfterMs = delay;
                const retryAfter = error.response.headers['retry-after'];
                
                if (retryAfter) {
                    // Retry-After can be in seconds (integer) or HTTP date
                    if (/^\d+$/.test(retryAfter)) {
                        retryAfterMs = parseInt(retryAfter) * 1000;
                        logger.info(`Rate limited (${status}). Retry-After: ${retryAfter}s. Waiting ${retryAfterMs}ms...`);
                    } else {
                        // Parse HTTP date and calculate delay
                        const retryDate = new Date(retryAfter);
                        retryAfterMs = Math.max(retryDate.getTime() - Date.now(), delay);
                        logger.info(`Rate limited (${status}). Retry-After date: ${retryAfter}. Waiting ${retryAfterMs}ms...`);
                    }
                } else {
                    logger.info(`Request failed with ${status} (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`);
                }

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, Math.min(retryAfterMs, maxDelayMs)));
                
                // Exponential backoff (only if no Retry-After header)
                if (!retryAfter) {
                    delay = Math.min(delay * 2, maxDelayMs);
                }
            }
        }

        throw lastError;
    }

    /**
     * Test connection to Dataverse
     */
    async testConnection() {
        try {
            const token = await this.getAccessToken();
            
            const response = await axios.get(
                `${this.dataverseUrl}/api/data/v9.2/WhoAmI`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'OData-MaxVersion': '4.0',
                        'OData-Version': '4.0'
                    }
                }
            );

            if (response.status === 200) {
                return {
                    success: true,
                    message: 'Successfully connected to Dataverse',
                    data: response.data
                };
            } else {
                return {
                    success: false,
                    message: 'Failed to connect to Dataverse',
                    statusCode: response.status
                };
            }
        } catch (error) {
            logger.error('Connection test failed:', error);
            
            // Handle timeout errors
            if (error.code === 'ECONNABORTED') {
                return {
                    success: false,
                    message: 'Connection timeout',
                    error: error.message
                };
            }
            
            // Handle HTTP errors
            if (error.response && error.response.status) {
                return {
                    success: false,
                    message: `HTTP ${error.response.status} error`,
                    statusCode: error.response.status
                };
            }
            
            return {
                success: false,
                message: 'Connection failed',
                error: error.message
            };
        }
    }

    /**
     * Get publishers from Dataverse
     */
    async getPublishers() {
        try {
            const token = await this.getAccessToken();
            
            const response = await this.makeRequestWithRetry(async () => {
                return await axios.get(
                    `${this.dataverseUrl}/api/data/v9.2/publishers`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'OData-MaxVersion': '4.0',
                            'OData-Version': '4.0'
                        }
                    }
                );
            });

            return {
                success: true,
                publishers: response.data.value || []
            };
        } catch (error) {
            logger.error('Failed to get publishers:', error);
            
            // Handle service unavailable
            if (error.response && error.response.status === 503) {
                return {
                    success: false,
                    message: 'Service temporarily unavailable',
                    error: error.message
                };
            }
            
            return {
                success: false,
                message: 'Failed to fetch publishers',
                error: error.message
            };
        }
    }

    /**
     * Create a new publisher
     * @param {Object} publisherData - Publisher configuration
     * @returns {Promise<Object>} Publisher result
     */
    async createPublisher(publisherData) {
        try {
            const token = await this.getAccessToken();
            
            const publisherPayload = {
                uniquename: publisherData.uniqueName,
                friendlyname: publisherData.friendlyName,
                customizationprefix: publisherData.prefix,
                description: publisherData.description || ''
            };

            const response = await axios.post(
                `${this.dataverseUrl}/api/data/v9.2/publishers`,
                publisherPayload,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'OData-MaxVersion': '4.0',
                        'OData-Version': '4.0'
                    },
                    timeout: this.timeout
                }
            );

            console.log('🔧 DEBUG: DataverseClient.createPublisher response:', {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                data: response.data
            });

            // Extract the created publisher's ID from the location header
            const locationHeader = response.headers.location || response.headers.Location;
            console.log('🔧 DEBUG: Location header:', locationHeader);
            
            let publisherId = null;
            if (locationHeader) {
                const match = locationHeader.match(/publishers\(([^)]+)\)/);
                console.log('🔧 DEBUG: Location header match:', match);
                if (match) {
                    publisherId = match[1];
                }
            }

            console.log('🔧 DEBUG: Extracted publisherId:', publisherId);

            // Return the created publisher with consistent structure
            const publisherResult = {
                id: publisherId,
                publisherid: publisherId,
                uniquename: publisherData.uniqueName,
                friendlyname: publisherData.friendlyName,
                customizationprefix: publisherData.prefix,
                description: publisherData.description || ''
            };
            
            console.log('🔧 DEBUG: DataverseClient.createPublisher returning:', publisherResult);
            return publisherResult;

        } catch (error) {
            logger.error('Failed to create publisher:', error);
            throw new Error(`Failed to create publisher: ${error.message}`);
        }
    }

    /**
     * Ensure publisher exists (create if not found)
     * @param {Object} publisherConfig - Publisher configuration
     * @returns {Promise<Object>} Publisher result
     */
    async ensurePublisher(publisherConfig) {
        try {
            // First try to get existing publishers
            const existingPublishers = await this.getPublishers();
            if (!existingPublishers.success) {
                throw new Error(existingPublishers.message);
            }

            // Check if publisher already exists
            const existingPublisher = existingPublishers.publishers.find(pub => 
                pub.uniquename === publisherConfig.uniqueName || 
                pub.customizationprefix === publisherConfig.prefix
            );

            if (existingPublisher) {
                // Return existing publisher with consistent id field
                return {
                    ...existingPublisher,
                    id: existingPublisher.publisherid || existingPublisher.id
                };
            }

            // Create new publisher using the createPublisher method
            return await this.createPublisher(publisherConfig);

        } catch (error) {
            logger.error('Failed to ensure publisher:', error);
            throw new Error(`Failed to ensure publisher: ${error.message}`);
        }
    }

    /**
     * Get solutions from Dataverse
     */
    async getSolutions(options = {}) {
        try {
            const token = await this.getAccessToken();
            
            // Build query parameters
            const queryParams = new URLSearchParams();
            
            // Filter by managed/unmanaged if specified
            if (options.includeManaged === false || options.includeUnmanaged === false) {
                if (options.includeManaged === false && options.includeUnmanaged !== false) {
                    queryParams.append('$filter', 'ismanaged eq false');
                } else if (options.includeUnmanaged === false && options.includeManaged !== false) {
                    queryParams.append('$filter', 'ismanaged eq true');
                }
            }
            
            // Add limit if specified
            if (options.limit && options.limit > 0) {
                queryParams.append('$top', options.limit.toString());
            }
            
            // Select specific fields to reduce response size
            queryParams.append('$select', 'solutionid,uniquename,friendlyname,version,ismanaged,_publisherid_value,description,installedon,modifiedon');
            
            const url = `${this.dataverseUrl}/api/data/v9.2/solutions${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
            
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'OData-MaxVersion': '4.0',
                    'OData-Version': '4.0'
                }
            });

            return {
                success: true,
                solutions: response.data.value || []
            };
        } catch (error) {
            logger.error('Failed to get solutions:', error);
            return {
                success: false,
                message: 'Failed to retrieve solutions',
                error: error.message
            };
        }
    }

    /**
     * Create a new solution in Dataverse
     */
    async createSolution(solutionData) {
        try {
            if (!solutionData || !solutionData.uniquename) {
                throw new Error('Solution data with uniquename is required');
            }

            const token = await this.getAccessToken();
            
            const response = await axios.post(
                `${this.dataverseUrl}/api/data/v9.2/solutions`,
                solutionData,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'OData-MaxVersion': '4.0',
                        'OData-Version': '4.0'
                    }
                }
            );

            return {
                success: true,
                data: response.data,
                solutionId: response.data.solutionid
            };
        } catch (error) {
            logger.error('Failed to create solution:', error);
            
            // Handle solution already exists
            if (error.response && error.response.status === 409) {
                return {
                    success: false,
                    message: 'Solution already exists',
                    error: error.message
                };
            }
            
            return {
                success: false,
                message: 'Failed to create solution',
                error: error.message
            };
        }
    }

    /**
     * Create a new entity in Dataverse
     */
    async createEntity(entityData) {
        try {
            if (!entityData || !entityData.LogicalName) {
                throw new Error('Entity data with LogicalName is required');
            }

            const token = await this.getAccessToken();
            
            const response = await axios.post(
                `${this.dataverseUrl}/api/data/v9.2/EntityDefinitions`,
                entityData,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'OData-MaxVersion': '4.0',
                        'OData-Version': '4.0'
                    }
                }
            );

            return {
                success: true,
                data: response.data,
                entityId: response.data.MetadataId
            };
        } catch (error) {
            logger.error('Failed to create entity:', error);
            
            // Handle rate limiting
            if (error.response && error.response.status === 429) {
                return {
                    success: false,
                    message: 'Rate limit exceeded - too many requests',
                    error: error.message
                };
            }
            
            // Handle validation errors
            if (error.response && error.response.status === 400) {
                return {
                    success: false,
                    message: 'Validation failed',
                    error: error.message
                };
            }
            
            return {
                success: false,
                message: 'Failed to create entity',
                error: error.message
            };
        }
    }

    /**
     * Create an attribute for an entity
     */
    async createAttribute(entityLogicalName, attributeData) {
        try {
            if (!entityLogicalName || !attributeData) {
                throw new Error('Entity logical name and attribute data are required');
            }

            const token = await this.getAccessToken();
            
            const response = await axios.post(
                `${this.dataverseUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes`,
                attributeData,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'OData-MaxVersion': '4.0',
                        'OData-Version': '4.0'
                    }
                }
            );

            return {
                success: true,
                data: response.data,
                attributeId: response.data.MetadataId
            };
        } catch (error) {
            logger.error('Failed to create attribute:', error);
            return {
                success: false,
                message: 'Failed to create attribute',
                error: error.message
            };
        }
    }

    /**
     * Create a relationship between entities
     */
    async createRelationship(relationshipData) {
        try {
            if (!relationshipData) {
                throw new Error('Relationship data is required');
            }

            const token = await this.getAccessToken();
            
            const response = await axios.post(
                `${this.dataverseUrl}/api/data/v9.2/RelationshipDefinitions`,
                relationshipData,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'OData-MaxVersion': '4.0',
                        'OData-Version': '4.0'
                    }
                }
            );

            return {
                success: true,
                data: response.data,
                relationshipId: response.data.MetadataId
            };
        } catch (error) {
            logger.error('Failed to create relationship:', error);
            return {
                success: false,
                message: 'Failed to create relationship',
                error: error.message
            };
        }
    }

    /**
     * Create a many-to-many relationship between entities
     */
    async createManyToManyRelationship(relationshipData) {
        try {
            if (!relationshipData) {
                throw new Error('Many-to-many relationship data is required');
            }

            const token = await this.getAccessToken();
            
            const response = await axios.post(
                `${this.dataverseUrl}/api/data/v9.2/ManyToManyRelationships`,
                relationshipData,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'OData-MaxVersion': '4.0',
                        'OData-Version': '4.0'
                    }
                }
            );

            return {
                success: true,
                data: response.data,
                relationshipId: response.data.MetadataId
            };
        } catch (error) {
            logger.error('Failed to create many-to-many relationship:', error);
            return {
                success: false,
                message: 'Failed to create many-to-many relationship',
                error: error.message
            };
        }
    }

    /**
     * Get global choices from Dataverse
     */
    async getGlobalChoices() {
        try {
            const token = await this.getAccessToken();
            
            const response = await axios.get(
                `${this.dataverseUrl}/api/data/v9.2/GlobalOptionSetDefinitions`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'OData-MaxVersion': '4.0',
                        'OData-Version': '4.0'
                    }
                }
            );

            return {
                success: true,
                all: response.data.value || [],
                grouped: {
                    custom: (response.data.value || []).filter(choice => choice.IsCustom),
                    builtIn: (response.data.value || []).filter(choice => !choice.IsCustom)
                },
                summary: {
                    total: (response.data.value || []).length,
                    custom: (response.data.value || []).filter(choice => choice.IsCustom).length,
                    builtIn: (response.data.value || []).filter(choice => !choice.IsCustom).length
                }
            };
        } catch (error) {
            logger.error('Failed to get global choices:', error);
            return {
                success: false,
                message: 'Failed to retrieve global choices',
                error: error.message
            };
        }
    }

    /**
     * Create a global choice
     */
    async createGlobalChoice(choiceData) {
        try {
            if (!choiceData) {
                throw new Error('Global choice data is required');
            }

            const token = await this.getAccessToken();
            
            const response = await axios.post(
                `${this.dataverseUrl}/api/data/v9.2/GlobalOptionSetDefinitions`,
                choiceData,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'OData-MaxVersion': '4.0',
                        'OData-Version': '4.0'
                    }
                }
            );

            return {
                success: true,
                data: response.data,
                choiceId: response.data.MetadataId
            };
        } catch (error) {
            logger.error('Failed to create global choice:', error);
            return {
                success: false,
                message: 'Failed to create global choice',
                error: error.message
            };
        }
    }

    /**
     * Build API URL for a given endpoint
     */
    buildApiUrl(endpoint) {
        return `${this.dataverseUrl}/api/data/v9.2/${endpoint}`;
    }

    /**
     * Extract entity ID from OData response
     */
    extractEntityId(odataId) {
        if (!odataId) return null;
        
        const match = odataId.match(/\(([^)]+)\)/);
        return match ? match[1] : null;
    }

    /**
     * Validate GUID format
     */
    isValidGuid(guid) {
        if (!guid || typeof guid !== 'string') return false;
        
        const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return guidRegex.test(guid);
    }
}

module.exports = DataverseClient;
