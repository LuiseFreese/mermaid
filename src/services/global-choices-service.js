/**
 * Global Choices Service
 * Business logic for global choice set management
 */
const { BaseService } = require('./base-service');

class GlobalChoicesService extends BaseService {
    constructor(dependencies = {}) {
        super(dependencies);
        
        this.validateDependencies(['dataverseRepository']);
        this.dataverseRepository = dependencies.dataverseRepository;
    }

    /**
     * Get list of global choice sets
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Global choices result
     */
    async getGlobalChoices(options = {}) {
        return this.executeOperation('getGlobalChoices', async () => {
            const queryOptions = {
                includeBuiltIn: options.includeBuiltIn !== false,
                includeCustom: options.includeCustom !== false,
                limit: options.limit,
                filter: options.filter
            };

            const result = await this.dataverseRepository.getGlobalChoiceSets(queryOptions);
            
            if (result.success) {
                return this.createSuccess(result.data, 'Global choices retrieved successfully');
            } else {
                return this.createError('Failed to retrieve global choices', [result.message]);
            }
        });
    }

    /**
     * Create a custom global choice set
     * @param {Object} choiceData - Choice set configuration
     * @returns {Promise<Object>} Creation result
     */
    async createCustomGlobalChoice(choiceData) {
        return this.executeOperation('createCustomGlobalChoice', async () => {
            this.validateInput(choiceData, ['name', 'options'], {
                name: 'string',
                displayName: 'string',
                options: 'object'
            });

            // Validate options array
            if (!Array.isArray(choiceData.options) || choiceData.options.length === 0) {
                throw new Error('Options must be a non-empty array');
            }

            // Validate each option
            choiceData.options.forEach((option, index) => {
                if (!option.label || typeof option.label !== 'string') {
                    throw new Error(`Option at index ${index} must have a string label`);
                }
                if (option.value !== undefined && typeof option.value !== 'number') {
                    throw new Error(`Option at index ${index} value must be a number if provided`);
                }
            });

            // Check for duplicate choice name
            const existingChoices = await this.dataverseRepository.getGlobalChoiceSets({
                includeBuiltIn: false,
                includeCustom: true
            });

            if (existingChoices.success) {
                const duplicate = existingChoices.data.all?.find(choice => 
                    choice.LogicalName === choiceData.name ||
                    choice.Name === choiceData.name
                );
                
                if (duplicate) {
                    throw new Error(`Global choice set with name '${choiceData.name}' already exists`);
                }
            }

            const result = await this.dataverseRepository.createGlobalChoiceSet(choiceData);
            
            if (result.success) {
                return this.createSuccess(result.data, 'Global choice set created successfully');
            } else {
                return this.createError('Failed to create global choice set', [result.message]);
            }
        });
    }

    /**
     * Get global choice set by name
     * @param {string} choiceName - Choice set name
     * @returns {Promise<Object>} Choice set result
     */
    async getGlobalChoice(choiceName) {
        return this.executeOperation('getGlobalChoice', async () => {
            this.validateInput({ choiceName }, ['choiceName'], { choiceName: 'string' });

            const result = await this.dataverseRepository.getGlobalChoiceSet(choiceName);
            
            if (result.success) {
                return this.createSuccess(result.data, 'Global choice set retrieved successfully');
            } else {
                return this.createError('Global choice set not found', [result.message]);
            }
        });
    }

    /**
     * Update global choice set options
     * @param {string} choiceName - Choice set name
     * @param {Object} updateData - Data to update
     * @returns {Promise<Object>} Update result
     */
    async updateGlobalChoice(choiceName, updateData) {
        return this.executeOperation('updateGlobalChoice', async () => {
            this.validateInput({ choiceName }, ['choiceName'], { choiceName: 'string' });

            // Validate update data
            if (updateData.options) {
                if (!Array.isArray(updateData.options)) {
                    throw new Error('Options must be an array');
                }
                
                updateData.options.forEach((option, index) => {
                    if (!option.label || typeof option.label !== 'string') {
                        throw new Error(`Option at index ${index} must have a string label`);
                    }
                });
            }

            const result = await this.dataverseRepository.updateGlobalChoiceSet(choiceName, updateData);
            
            if (result.success) {
                return this.createSuccess(result.data, 'Global choice set updated successfully');
            } else {
                return this.createError('Failed to update global choice set', [result.message]);
            }
        });
    }

    /**
     * Add global choice sets to solution
     * @param {Array} choiceNames - Array of choice set names
     * @param {string} solutionName - Solution unique name
     * @returns {Promise<Object>} Addition result
     */
    async addChoicesToSolution(choiceNames, solutionName) {
        return this.executeOperation('addChoicesToSolution', async () => {
            this.validateInput({ choiceNames, solutionName }, ['choiceNames', 'solutionName'], {
                solutionName: 'string'
            });

            if (!Array.isArray(choiceNames) || choiceNames.length === 0) {
                throw new Error('Choice names must be a non-empty array');
            }

            const result = await this.dataverseRepository.addGlobalChoicesToSolution(
                choiceNames, 
                solutionName
            );
            
            if (result.success) {
                return this.createSuccess({
                    added: result.data.added || 0,
                    failed: result.data.failed || 0,
                    errors: result.data.errors || [],
                    solutionName
                }, `Added ${result.data.added || 0} global choices to solution`);
            } else {
                return this.createError('Failed to add global choices to solution', [result.message]);
            }
        });
    }

    /**
     * Create and add custom global choices to solution
     * @param {Array} customChoices - Array of custom choice definitions
     * @param {string} solutionName - Solution unique name
     * @param {string} publisherPrefix - Publisher prefix for naming
     * @returns {Promise<Object>} Creation and addition result
     */
    async createAndAddCustomChoices(customChoices, solutionName, publisherPrefix) {
        return this.executeOperation('createAndAddCustomChoices', async () => {
            this.validateInput({ customChoices, solutionName, publisherPrefix }, 
                ['customChoices', 'solutionName', 'publisherPrefix'], {
                solutionName: 'string',
                publisherPrefix: 'string'
            });

            if (!Array.isArray(customChoices) || customChoices.length === 0) {
                throw new Error('Custom choices must be a non-empty array');
            }

            // Validate each custom choice
            customChoices.forEach((choice, index) => {
                if (!choice.name && !choice.logicalName) {
                    throw new Error(`Custom choice at index ${index} must have a name or logicalName`);
                }
                if (!choice.options || !Array.isArray(choice.options) || choice.options.length === 0) {
                    throw new Error(`Custom choice at index ${index} must have a non-empty options array`);
                }
            });

            const result = await this.dataverseRepository.createAndAddCustomGlobalChoices(
                customChoices,
                solutionName,
                publisherPrefix
            );
            
            if (result.success) {
                return this.createSuccess({
                    created: result.data.created || 0,
                    failed: result.data.failed || 0,
                    errors: result.data.errors || [],
                    solutionName
                }, `Created and added ${result.data.created || 0} custom global choices`);
            } else {
                return this.createError('Failed to create and add custom global choices', [result.message]);
            }
        });
    }

    /**
     * Delete global choice set
     * @param {string} choiceName - Choice set name
     * @param {Object} options - Deletion options
     * @returns {Promise<Object>} Deletion result
     */
    async deleteGlobalChoice(choiceName, options = {}) {
        return this.executeOperation('deleteGlobalChoice', async () => {
            this.validateInput({ choiceName }, ['choiceName'], { choiceName: 'string' });

            // Check if choice is in use
            if (!options.force) {
                const usageCheck = await this.checkChoiceUsage(choiceName);
                if (usageCheck.inUse) {
                    return this.createError('Global choice is in use and cannot be deleted', [
                        `Choice '${choiceName}' is used by: ${usageCheck.usedBy.join(', ')}`,
                        'Use force: true to delete anyway'
                    ]);
                }
            }

            const result = await this.dataverseRepository.deleteGlobalChoiceSet(choiceName, options);
            
            if (result.success) {
                return this.createSuccess({
                    choiceName,
                    deleted: true
                }, 'Global choice set deleted successfully');
            } else {
                return this.createError('Failed to delete global choice set', [result.message]);
            }
        });
    }

    /**
     * Check if global choice set is in use
     * @param {string} choiceName - Choice set name
     * @returns {Promise<Object>} Usage check result
     */
    async checkChoiceUsage(choiceName) {
        return this.executeOperation('checkChoiceUsage', async () => {
            this.validateInput({ choiceName }, ['choiceName'], { choiceName: 'string' });

            const result = await this.dataverseRepository.checkGlobalChoiceUsage(choiceName);
            
            if (result.success) {
                return this.createSuccess(result.data, 'Choice usage checked successfully');
            } else {
                return this.createError('Failed to check choice usage', [result.message]);
            }
        });
    }

    /**
     * Get global choices statistics
     * @returns {Promise<Object>} Statistics result
     */
    async getGlobalChoicesStatistics() {
        return this.executeOperation('getGlobalChoicesStatistics', async () => {
            const choicesResult = await this.dataverseRepository.getGlobalChoiceSets({
                includeBuiltIn: true,
                includeCustom: true
            });
            
            if (!choicesResult.success) {
                return this.createError('Failed to get global choices statistics', [choicesResult.message]);
            }

            const data = choicesResult.data;
            const stats = {
                total: data.summary?.total || 0,
                builtIn: data.summary?.builtIn || 0,
                custom: data.summary?.custom || 0,
                mostUsedChoices: this.getMostUsedChoices(data.all || []),
                recentlyCreated: this.getRecentlyCreatedChoices(data.grouped?.custom || [])
            };

            return this.createSuccess(stats, 'Global choices statistics generated');
        });
    }

    /**
     * Get most used global choices (placeholder)
     * @param {Array} choices - All choices
     * @returns {Array} Most used choices
     */
    getMostUsedChoices(choices) {
        // This would require additional queries to determine usage
        // For now, return first 5 as placeholder
        return choices.slice(0, 5).map(choice => ({
            name: choice.LogicalName || choice.Name,
            displayName: choice.DisplayName?.UserLocalizedLabel?.Label || choice.LogicalName,
            usageCount: 'N/A' // Would be calculated from actual usage
        }));
    }

    /**
     * Get recently created custom choices
     * @param {Array} customChoices - Custom choices
     * @returns {Array} Recently created choices
     */
    getRecentlyCreatedChoices(customChoices) {
        return customChoices
            .filter(choice => choice.CreatedOn)
            .sort((a, b) => new Date(b.CreatedOn) - new Date(a.CreatedOn))
            .slice(0, 5)
            .map(choice => ({
                name: choice.LogicalName || choice.Name,
                displayName: choice.DisplayName?.UserLocalizedLabel?.Label || choice.LogicalName,
                createdOn: choice.CreatedOn
            }));
    }

    /**
     * Health check for global choices service
     * @returns {Promise<Object>} Health check result
     */
    async healthCheck() {
        try {
            const result = await this.dataverseRepository.getGlobalChoiceSets({
                includeBuiltIn: false,
                includeCustom: true,
                limit: 1
            });
            
            if (result.success) {
                return this.createSuccess({
                    service: 'GlobalChoicesService',
                    dataverseConnection: 'healthy',
                    globalChoicesAccessible: true
                }, 'Global choices service is healthy');
            } else {
                return this.createError('Global choices service health check failed', [
                    'Unable to access global choices from Dataverse'
                ]);
            }
        } catch (error) {
            return this.createError('Global choices service health check failed', [error.message]);
        }
    }
}

module.exports = { GlobalChoicesService };
