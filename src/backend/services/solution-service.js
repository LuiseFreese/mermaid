/**
 * Solution Service  
 * Business logic for solution management and status
 */
const { BaseService } = require('./base-service');

class SolutionService extends BaseService {
    constructor(dependencies = {}) {
        super(dependencies);
        
        this.validateDependencies(['dataverseRepository']);
        this.dataverseRepository = dependencies.dataverseRepository;
    }

    /**
     * Get solution status and components
     * @param {string} solutionName - Solution unique name
     * @returns {Promise<Object>} Solution status result
     */
    async getSolutionStatus(solutionName) {
        return this.executeOperation('getSolutionStatus', async () => {
            this.validateInput({ solutionName }, ['solutionName'], { solutionName: 'string' });

            const result = await this.dataverseRepository.getSolutionComponents(solutionName);
            
            if (result.success) {
                return this.createSuccess(result.data, 'Solution status retrieved successfully');
            } else {
                return this.createError('Solution not found or inaccessible', [result.message]);
            }
        });
    }

    /**
     * Get list of solutions
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Solutions result
     */
    async getSolutions(options = {}) {
        return this.executeOperation('getSolutions', async () => {
            const queryOptions = {
                includeManaged: options.includeManaged === true,
                includeUnmanaged: options.includeUnmanaged !== false,
                limit: options.limit
            };

            const result = await this.dataverseRepository.getSolutions(queryOptions);
            
            console.log('🔍 SolutionService DEBUG: Raw result from DataverseRepository:', {
                success: result.success,
                hasData: result.data ? true : false,
                dataType: typeof result.data,
                dataLength: Array.isArray(result.data) ? result.data.length : 'not array',
                resultKeys: Object.keys(result || {}),
                dataKeys: result.data ? Object.keys(result.data).slice(0, 5) : 'no data'
            });
            
            if (result.success) {
                const successResult = this.createSuccess(result.data, 'Solutions retrieved successfully');
                console.log('🔍 SolutionService DEBUG: Final success result:', {
                    success: successResult.success,
                    hasData: !!successResult.data,
                    dataType: typeof successResult.data,
                    dataLength: Array.isArray(successResult.data) ? successResult.data.length : 'not array'
                });
                return successResult;
            } else {
                return this.createError('Failed to retrieve solutions', [result.message]);
            }
        });
    }

    /**
     * Create a new solution
     * @param {Object} solutionData - Solution configuration
     * @returns {Promise<Object>} Creation result
     */
    async createSolution(solutionData) {
        return this.executeOperation('createSolution', async () => {
            this.validateInput(solutionData, ['uniqueName', 'friendlyName', 'publisherId'], {
                uniqueName: 'string',
                friendlyName: 'string',
                publisherId: 'string'
            });

            // Validate solution name format
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(solutionData.uniqueName)) {
                throw new Error('Solution unique name must start with letter/underscore and contain only letters, numbers, and underscores');
            }

            // Check if solution already exists
            const existingSolutions = await this.dataverseRepository.getSolutions({
                includeManaged: false,
                includeUnmanaged: true
            });

            if (existingSolutions.success) {
                const duplicate = existingSolutions.data.solutions?.find(sol => 
                    sol.uniquename === solutionData.uniqueName
                );
                
                if (duplicate) {
                    throw new Error(`Solution with unique name '${solutionData.uniqueName}' already exists`);
                }
            }

            const result = await this.dataverseRepository.createSolution(solutionData);
            
            if (result.success) {
                return this.createSuccess(result.data, 'Solution created successfully');
            } else {
                return this.createError('Failed to create solution', [result.message]);
            }
        });
    }

    /**
     * Update solution information
     * @param {string} solutionName - Solution unique name
     * @param {Object} updateData - Data to update
     * @returns {Promise<Object>} Update result
     */
    async updateSolution(solutionName, updateData) {
        return this.executeOperation('updateSolution', async () => {
            this.validateInput({ solutionName }, ['solutionName'], { solutionName: 'string' });

            // Only allow certain fields to be updated
            const allowedFields = ['friendlyName', 'description', 'version'];
            const filteredData = {};
            
            for (const field of allowedFields) {
                if (updateData[field] !== undefined) {
                    filteredData[field] = updateData[field];
                }
            }

            if (Object.keys(filteredData).length === 0) {
                throw new Error('No valid fields provided for update');
            }

            const result = await this.dataverseRepository.updateSolution(solutionName, filteredData);
            
            if (result.success) {
                return this.createSuccess(result.data, 'Solution updated successfully');
            } else {
                return this.createError('Failed to update solution', [result.message]);
            }
        });
    }

    /**
     * Delete solution
     * @param {string} solutionName - Solution unique name
     * @param {Object} options - Deletion options
     * @returns {Promise<Object>} Deletion result
     */
    async deleteSolution(solutionName, options = {}) {
        return this.executeOperation('deleteSolution', async () => {
            this.validateInput({ solutionName }, ['solutionName'], { solutionName: 'string' });

            // Check if solution has components
            if (!options.force) {
                const statusResult = await this.getSolutionStatus(solutionName);
                if (statusResult.success && statusResult.data.components?.totalCount > 0) {
                    return this.createError('Solution contains components and cannot be deleted', [
                        `Solution '${solutionName}' contains ${statusResult.data.components.totalCount} components`,
                        'Use force: true to delete anyway'
                    ]);
                }
            }

            const result = await this.dataverseRepository.deleteSolution(solutionName, options);
            
            if (result.success) {
                return this.createSuccess({
                    solutionName,
                    deleted: true
                }, 'Solution deleted successfully');
            } else {
                return this.createError('Failed to delete solution', [result.message]);
            }
        });
    }

    /**
     * Export solution
     * @param {string} solutionName - Solution unique name
     * @param {Object} exportOptions - Export configuration
     * @returns {Promise<Object>} Export result
     */
    async exportSolution(solutionName, exportOptions = {}) {
        return this.executeOperation('exportSolution', async () => {
            this.validateInput({ solutionName }, ['solutionName'], { solutionName: 'string' });

            const options = {
                managed: exportOptions.managed === true,
                includeVersionInfo: exportOptions.includeVersionInfo !== false,
                exportAutoNumberingSettings: exportOptions.exportAutoNumberingSettings === true,
                exportCalendarSettings: exportOptions.exportCalendarSettings === true,
                ...exportOptions
            };

            const result = await this.dataverseRepository.exportSolution(solutionName, options);
            
            if (result.success) {
                return this.createSuccess(result.data, 'Solution exported successfully');
            } else {
                return this.createError('Failed to export solution', [result.message]);
            }
        });
    }

    /**
     * Import solution
     * @param {Buffer|string} solutionData - Solution file data
     * @param {Object} importOptions - Import configuration
     * @returns {Promise<Object>} Import result
     */
    async importSolution(solutionData, importOptions = {}) {
        return this.executeOperation('importSolution', async () => {
            this.validateInput({ solutionData }, ['solutionData']);

            const options = {
                overwriteUnmanagedCustomizations: importOptions.overwriteUnmanagedCustomizations === true,
                publishWorkflows: importOptions.publishWorkflows !== false,
                convertToManaged: importOptions.convertToManaged === true,
                ...importOptions
            };

            const result = await this.dataverseRepository.importSolution(solutionData, options);
            
            if (result.success) {
                return this.createSuccess(result.data, 'Solution imported successfully');
            } else {
                return this.createError('Failed to import solution', [result.message]);
            }
        });
    }

    /**
     * Cleanup test entities and relationships
     * @param {Object} cleanupOptions - Cleanup configuration
     * @returns {Promise<Object>} Cleanup result
     */
    async cleanupTestEntities(cleanupOptions) {
        return this.executeOperation('cleanupTestEntities', async () => {
            // Validate Dataverse connection info if provided directly
            if (cleanupOptions.dataverseUrl) {
                this.validateInput(cleanupOptions, ['tenantId', 'clientId', 'managedIdentityClientId'], {
                    dataverseUrl: 'string',
                    tenantId: 'string',
                    clientId: 'string',
                    managedIdentityClientId: 'string'
                });
            }

            const options = {
                cleanupAll: cleanupOptions.cleanupAll === true,
                entityPrefixes: cleanupOptions.entityPrefixes || [],
                preserveCDM: cleanupOptions.preserveCDM !== false,
                deleteRelationshipsFirst: cleanupOptions.deleteRelationshipsFirst !== false
            };

            // Use provided Dataverse config or get from repository
            let dataverseConfig = null;
            if (cleanupOptions.dataverseUrl) {
                dataverseConfig = {
                    serverUrl: cleanupOptions.dataverseUrl,
                    tenantId: cleanupOptions.tenantId,
                    clientId: cleanupOptions.clientId,
                    managedIdentityClientId: cleanupOptions.managedIdentityClientId
                };
            }

            const result = await this.dataverseRepository.cleanupTestEntities(options, dataverseConfig);
            
            if (result.success) {
                return this.createSuccess(result.data, 'Cleanup completed successfully');
            } else {
                return this.createError('Cleanup failed', [result.message]);
            }
        });
    }

    /**
     * Get solution statistics
     * @returns {Promise<Object>} Statistics result
     */
    async getSolutionStatistics() {
        return this.executeOperation('getSolutionStatistics', async () => {
            const solutionsResult = await this.dataverseRepository.getSolutions({
                includeManaged: true,
                includeUnmanaged: true
            });
            
            if (!solutionsResult.success) {
                return this.createError('Failed to get solution statistics', [solutionsResult.message]);
            }

            const solutions = solutionsResult.data.solutions || [];
            const stats = {
                total: solutions.length,
                managed: solutions.filter(s => s.ismanaged).length,
                unmanaged: solutions.filter(s => !s.ismanaged).length,
                custom: solutions.filter(s => !this.isSystemSolution(s.uniquename)).length,
                system: solutions.filter(s => this.isSystemSolution(s.uniquename)).length,
                mostRecentCreated: solutions
                    .filter(s => s.createdon && !this.isSystemSolution(s.uniquename))
                    .sort((a, b) => new Date(b.createdon) - new Date(a.createdon))[0],
                largestSolutions: this.getLargestSolutions(solutions)
            };

            return this.createSuccess(stats, 'Solution statistics generated');
        });
    }

    /**
     * Check if solution is a system solution
     * @param {string} uniqueName - Solution unique name
     * @returns {boolean} True if system solution
     */
    isSystemSolution(uniqueName) {
        const systemSolutions = [
            'Active',
            'Basic',
            'Default',
            'System',
            'msdynce_',
            'Dynamics365',
            'Microsoft',
            'PowerPlatform'
        ];
        
        return systemSolutions.some(prefix => 
            uniqueName.toLowerCase().startsWith(prefix.toLowerCase())
        );
    }

    /**
     * Get largest solutions by component count
     * @param {Array} solutions - All solutions
     * @returns {Array} Largest solutions
     */
    getLargestSolutions(solutions) {
        // This would require additional queries to get component counts
        // For now, return placeholder based on solution data
        return solutions
            .filter(s => !this.isSystemSolution(s.uniquename))
            .sort((a, b) => (b.description?.length || 0) - (a.description?.length || 0))
            .slice(0, 5)
            .map(s => ({
                uniqueName: s.uniquename,
                friendlyName: s.friendlyname,
                componentCount: 'N/A', // Would be calculated from actual components
                isManaged: s.ismanaged
            }));
    }

    /**
     * Health check for solution service
     * @returns {Promise<Object>} Health check result
     */
    async healthCheck() {
        try {
            const result = await this.dataverseRepository.getSolutions({
                includeManaged: false,
                includeUnmanaged: true,
                limit: 1
            });
            
            if (result.success) {
                return this.createSuccess({
                    service: 'SolutionService',
                    dataverseConnection: 'healthy',
                    solutionsAccessible: true
                }, 'Solution service is healthy');
            } else {
                return this.createError('Solution service health check failed', [
                    'Unable to access solutions from Dataverse'
                ]);
            }
        } catch (error) {
            return this.createError('Solution service health check failed', [error.message]);
        }
    }
}

module.exports = { SolutionService };
