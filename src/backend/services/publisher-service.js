/**
 * Publisher Service
 * Business logic for publisher management
 */
const { BaseService } = require('./base-service');

class PublisherService extends BaseService {
    constructor(dependencies = {}) {
        super(dependencies);
        
        this.validateDependencies(['dataverseRepository']);
        this.dataverseRepository = dependencies.dataverseRepository;
    }

    /**
     * Get list of all publishers
     * @returns {Promise<Object>} Publishers result
     */
    async getPublishers() {
        return this.executeOperation('getPublishers', async () => {
            const result = await this.dataverseRepository.getPublishers();
            
            if (result.success) {
                return this.createSuccess({
                    publishers: result.data || [],
                    count: result.data?.length || 0
                }, 'Publishers retrieved successfully');
            } else {
                return this.createError('Failed to retrieve publishers', [result.message]);
            }
        });
    }

    /**
     * Create a new publisher
     * @param {Object} publisherData - Publisher configuration
     * @param {Object} dataverseConfig - Optional Dataverse configuration
     * @returns {Promise<Object>} Creation result
     */
    async createPublisher(publisherData, dataverseConfig = null) {
        return this.executeOperation('createPublisher', async () => {
            this.validateInput(publisherData, ['uniqueName', 'friendlyName', 'prefix'], {
                uniqueName: 'string',
                friendlyName: 'string',
                prefix: 'string'
            });

            // Validate prefix format
            if (!/^[a-z]{2,8}$/.test(publisherData.prefix)) {
                throw new Error('Publisher prefix must be 2-8 lowercase letters');
            }

            // Check if publisher already exists
            const existingPublishers = await this.dataverseRepository.getPublishers(dataverseConfig);
            if (existingPublishers.success) {
                const duplicate = existingPublishers.data.find(pub => 
                    pub.uniquename === publisherData.uniqueName || 
                    pub.customizationprefix === publisherData.prefix
                );
                
                if (duplicate) {
                    throw new Error(`Publisher with unique name '${publisherData.uniqueName}' or prefix '${publisherData.prefix}' already exists`);
                }
            }

            const result = await this.dataverseRepository.createPublisher(publisherData, dataverseConfig);
            
            if (result.success) {
                return this.createSuccess(result.data, 'Publisher created successfully');
            } else {
                return this.createError('Failed to create publisher', [result.message]);
            }
        });
    }

    /**
     * Get publisher by unique name or ID
     * @param {string} identifier - Publisher unique name or ID
     * @returns {Promise<Object>} Publisher result
     */
    async getPublisher(identifier) {
        return this.executeOperation('getPublisher', async () => {
            this.validateInput({ identifier }, ['identifier'], { identifier: 'string' });

            const result = await this.dataverseRepository.getPublisher(identifier);
            
            if (result.success) {
                return this.createSuccess(result.data, 'Publisher retrieved successfully');
            } else {
                return this.createError('Publisher not found', [result.message]);
            }
        });
    }

    /**
     * Update publisher information
     * @param {string} identifier - Publisher unique name or ID
     * @param {Object} updateData - Data to update
     * @returns {Promise<Object>} Update result
     */
    async updatePublisher(identifier, updateData) {
        return this.executeOperation('updatePublisher', async () => {
            this.validateInput({ identifier }, ['identifier'], { identifier: 'string' });

            // Only allow certain fields to be updated
            const allowedFields = ['friendlyName', 'description'];
            const filteredData = {};
            
            for (const field of allowedFields) {
                if (updateData[field] !== undefined) {
                    filteredData[field] = updateData[field];
                }
            }

            if (Object.keys(filteredData).length === 0) {
                throw new Error('No valid fields provided for update');
            }

            const result = await this.dataverseRepository.updatePublisher(identifier, filteredData);
            
            if (result.success) {
                return this.createSuccess(result.data, 'Publisher updated successfully');
            } else {
                return this.createError('Failed to update publisher', [result.message]);
            }
        });
    }

    /**
     * Ensure publisher exists (create if not found)
     * @param {Object} publisherConfig - Publisher configuration
     * @returns {Promise<Object>} Publisher result
     */
    async ensurePublisher(publisherConfig) {
        return this.executeOperation('ensurePublisher', async () => {
            this.validateInput(publisherConfig, ['uniqueName', 'friendlyName', 'prefix']);

            const result = await this.dataverseRepository.ensurePublisher(publisherConfig);
            
            if (result.success) {
                return this.createSuccess(result.data, 'Publisher ensured successfully');
            } else {
                return this.createError('Failed to ensure publisher', [result.message]);
            }
        });
    }

    /**
     * Validate publisher prefix availability
     * @param {string} prefix - Prefix to validate
     * @returns {Promise<Object>} Validation result
     */
    async validatePrefix(prefix) {
        return this.executeOperation('validatePrefix', async () => {
            this.validateInput({ prefix }, ['prefix'], { prefix: 'string' });

            // Check format
            if (!/^[a-z]{2,8}$/.test(prefix)) {
                return this.createError('Invalid prefix format', [
                    'Prefix must be 2-8 lowercase letters'
                ]);
            }

            // Check availability
            const existingPublishers = await this.dataverseRepository.getPublishers();
            if (existingPublishers.success) {
                const isUsed = existingPublishers.data.some(pub => 
                    pub.customizationprefix === prefix
                );
                
                if (isUsed) {
                    return this.createError('Prefix already in use', [
                        `Prefix '${prefix}' is already used by another publisher`
                    ]);
                }
            }

            return this.createSuccess({
                prefix,
                available: true
            }, 'Prefix is available');
        });
    }

    /**
     * Get publisher statistics
     * @returns {Promise<Object>} Statistics result
     */
    async getPublisherStatistics() {
        return this.executeOperation('getPublisherStatistics', async () => {
            const publishersResult = await this.dataverseRepository.getPublishers();
            
            if (!publishersResult.success) {
                return this.createError('Failed to get publisher statistics', [publishersResult.message]);
            }

            const publishers = publishersResult.data || [];
            const stats = {
                total: publishers.length,
                microsoft: publishers.filter(p => p.uniquename === 'MicrosoftCorporation').length,
                custom: publishers.filter(p => p.uniquename !== 'MicrosoftCorporation').length,
                prefixes: publishers.map(p => p.customizationprefix).filter(Boolean),
                mostRecentCreated: publishers
                    .filter(p => p.createdon)
                    .sort((a, b) => new Date(b.createdon) - new Date(a.createdon))[0]
            };

            return this.createSuccess(stats, 'Publisher statistics generated');
        });
    }

    /**
     * Health check for publisher service
     * @returns {Promise<Object>} Health check result
     */
    async healthCheck() {
        try {
            const result = await this.dataverseRepository.getPublishers();
            
            if (result.success) {
                return this.createSuccess({
                    service: 'PublisherService',
                    dataverseConnection: 'healthy',
                    publishersAccessible: true
                }, 'Publisher service is healthy');
            } else {
                return this.createError('Publisher service health check failed', [
                    'Unable to access publishers from Dataverse'
                ]);
            }
        } catch (error) {
            return this.createError('Publisher service health check failed', [error.message]);
        }
    }
}

module.exports = { PublisherService };
