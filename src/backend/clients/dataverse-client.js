/**
 * Dataverse Client
 * Handles authentication and API interactions with Microsoft Dataverse
 */
const { DefaultAzureCredential } = require('@azure/identity');
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
        this.timeout = config.timeout;

        // Initialize Azure credential
        this.credential = new DefaultAzureCredential();
        
        // Token cache
        this.cachedToken = null;
        this.tokenExpiry = null;
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
            
            const response = await axios.get(
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
    async getSolutions() {
        try {
            const token = await this.getAccessToken();
            
            const response = await axios.get(
                `${this.dataverseUrl}/api/data/v9.2/solutions`,
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
