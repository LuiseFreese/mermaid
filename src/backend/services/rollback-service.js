/**
 * Rollback Service
 * Handles deployment rollback operations with proper dependency management
 */
const { BaseService } = require('./base-service');
const { performanceMonitor } = require('../performance-monitor');

class RollbackService extends BaseService {
    constructor(dependencies = {}) {
        super(dependencies);
        
        // Validate required dependencies
        this.validateDependencies(['dataverseRepository', 'deploymentHistoryService']);
        
        this.dataverseRepository = dependencies.dataverseRepository;
        this.deploymentHistoryService = dependencies.deploymentHistoryService;
        
        // Track active rollbacks
        this.activeRollbacks = new Map();
        
        // Performance monitoring
        this.performanceMonitor = performanceMonitor;
    }

    /**
     * Execute rollback of a deployment
     * @param {string} deploymentId - Deployment ID to rollback
     * @param {Function} progressCallback - Progress update callback
     * @returns {Promise<Object>} Rollback result
     */
    async rollbackDeployment(deploymentId, progressCallback) {
        const rollbackId = this.generateRollbackId();
        
        // Start performance monitoring
        this.performanceMonitor.startOperation(rollbackId, 'rollback', {
            deploymentId
        });
        
        try {
            this.validateInput({ deploymentId }, ['deploymentId'], {
                deploymentId: 'string'
            });

            // Track rollback
            this.activeRollbacks.set(rollbackId, {
                deploymentId,
                status: 'starting',
                startTime: Date.now()
            });

            const progress = progressCallback || (() => {});
            
            console.log(`🏗️ ROLLBACK SERVICE: Starting rollback for ${deploymentId}`);
            progress('starting', 'Initializing rollback...');
            
            // Step 1: Get deployment record
            console.log(`📋 ROLLBACK SERVICE: Loading deployment record...`);
            const deployment = await this.deploymentHistoryService.getDeploymentById(deploymentId);
            if (!deployment) {
                throw new Error(`Deployment ${deploymentId} not found`);
            }
            console.log(`✅ ROLLBACK SERVICE: Deployment record loaded successfully`);

            // Validate that deployment has rollback data
            console.log(`🔍 ROLLBACK SERVICE: Validating rollback data...`);
            if (!deployment.rollbackData) {
                throw new Error('Deployment does not contain rollback data. This deployment cannot be rolled back.');
            }

            // Check if deployment was successful
            if (deployment.status !== 'success') {
                throw new Error('Only successful deployments can be rolled back');
            }
            console.log(`✅ ROLLBACK SERVICE: Validation passed`);

            progress('validating', 'Validating rollback requirements...');
            
            // Step 2: Validate rollback preconditions
            console.log(`🔐 ROLLBACK SERVICE: Validating preconditions...`);
            await this.validateRollbackPreconditions(deployment);
            console.log(`✅ ROLLBACK SERVICE: Preconditions validated`);
            
            // Step 3: Execute rollback using dataverse client
            console.log(`🚀 ROLLBACK SERVICE: Starting dataverse rollback execution...`);
            progress('executing', 'Executing rollback...');
            
            this.updateRollbackStatus(rollbackId, 'executing');
            
            console.log(`🔗 ROLLBACK SERVICE: About to call dataverse rollback...`);
            const rollbackResponse = await this.dataverseRepository.rollbackDeployment(
                deployment, 
                (status, message) => {
                    console.log(`📊 ROLLBACK PROGRESS: ${status} - ${message}`);
                    progress(status, message);
                }
            );
            console.log(`✅ ROLLBACK SERVICE: Dataverse rollback completed!`);

            // Extract the actual results from the repository response
            const rollbackResults = rollbackResponse.data || rollbackResponse;

            // Step 4: Record rollback in deployment history
            console.log(`📝 ROLLBACK SERVICE: Recording rollback...`);
            progress('recording', 'Recording rollback...');
            
            await this.recordRollback(deployment, rollbackResults, rollbackId);

            // Step 5: Update deployment status
            await this.deploymentHistoryService.updateDeployment(deploymentId, {
                status: 'rolled-back',
                rollbackInfo: {
                    rollbackId,
                    rollbackTimestamp: new Date().toISOString(),
                    rollbackResults
                }
            });

            progress('completed', 'Rollback completed successfully');
            
            this.updateRollbackStatus(rollbackId, 'completed');
            
            // End performance monitoring
            this.performanceMonitor.endOperation(rollbackId, rollbackResults);
            
            return {
                rollbackId,
                deploymentId,
                status: 'success',
                results: rollbackResults,
                summary: `Rollback completed: ${rollbackResults.relationshipsDeleted} relationships, ${rollbackResults.entitiesDeleted} entities, ${rollbackResults.globalChoicesDeleted} choices deleted, solution ${rollbackResults.solutionDeleted ? 'deleted' : 'not deleted'}`
            };

        } catch (error) {
            this.updateRollbackStatus(rollbackId, 'failed', error.message);
            
            // End performance monitoring with error
            this.performanceMonitor.endOperation(rollbackId, null, error);
            
            throw this.createError('RollbackError', error.message, {
                rollbackId,
                deploymentId,
                originalError: error
            });
        } finally {
            // Cleanup tracking
            this.activeRollbacks.delete(rollbackId);
        }
    }

    /**
     * Validate rollback preconditions
     * @param {Object} deployment - Deployment record
     */
    async validateRollbackPreconditions(deployment) {
        // Check if the solution still exists
        if (deployment.solutionInfo && deployment.solutionInfo.solutionId) {
            try {
                const solution = await this.dataverseRepository.getSolutionById(deployment.solutionInfo.solutionId);
                if (!solution) {
                    throw new Error(`Solution ${deployment.solutionInfo.solutionName} no longer exists in Dataverse`);
                }
            } catch (error) {
                if (error.response && error.response.status === 404) {
                    throw new Error(`Solution ${deployment.solutionInfo.solutionName} no longer exists in Dataverse`);
                }
                throw error;
            }
        }

        // Validate that custom entities still exist
        if (deployment.rollbackData && deployment.rollbackData.customEntities) {
            const missingEntities = [];
            
            for (const entity of deployment.rollbackData.customEntities) {
                try {
                    const entityQuery = `/EntityDefinitions?$filter=LogicalName eq '${entity.logicalName || entity.name}'`;
                    const response = await this.dataverseRepository._get(entityQuery);
                    
                    if (!response.value || response.value.length === 0) {
                        missingEntities.push(entity.name);
                    }
                } catch (error) {
                    // If we can't check, we'll try to delete and handle the error there
                    console.warn(`Could not verify existence of entity ${entity.name}: ${error.message}`);
                }
            }

            if (missingEntities.length > 0) {
                console.warn(`Some entities may already be deleted: ${missingEntities.join(', ')}`);
            }
        }
    }

    /**
     * Record rollback operation in history
     * @param {Object} originalDeployment - Original deployment record
     * @param {Object} rollbackResults - Rollback operation results
     * @param {string} rollbackId - Rollback operation ID
     */
    async recordRollback(originalDeployment, rollbackResults, rollbackId) {
        const rollbackRecord = {
            deploymentId: rollbackId,
            originalDeploymentId: originalDeployment.deploymentId,
            environmentSuffix: originalDeployment.environmentSuffix,
            status: 'success',
            erdContent: originalDeployment.erdContent,
            summary: {
                operationType: 'rollback',
                originalDeployment: originalDeployment.summary,
                rollbackResults: {
                    relationshipsDeleted: rollbackResults.relationshipsDeleted,
                    entitiesDeleted: rollbackResults.entitiesDeleted,
                    globalChoicesDeleted: rollbackResults.globalChoicesDeleted,
                    solutionDeleted: rollbackResults.solutionDeleted,
                    errors: rollbackResults.errors || [],
                    warnings: rollbackResults.warnings || []
                }
            },
            solutionInfo: {
                ...originalDeployment.solutionInfo,
                operation: 'rollback'
            },
            metadata: {
                deploymentMethod: 'rollback',
                originalDeploymentId: originalDeployment.deploymentId,
                rollbackTimestamp: new Date().toISOString()
            }
        };

        await this.deploymentHistoryService.recordDeployment(rollbackRecord);
    }

    /**
     * Get active rollback operations
     * @returns {Array} Active rollback operations
     */
    getActiveRollbacks() {
        return Array.from(this.activeRollbacks.entries()).map(([id, rollback]) => ({
            rollbackId: id,
            ...rollback
        }));
    }

    /**
     * Update rollback status
     * @param {string} rollbackId - Rollback ID
     * @param {string} status - New status
     * @param {string} error - Error message if failed
     */
    updateRollbackStatus(rollbackId, status, error = null) {
        if (this.activeRollbacks.has(rollbackId)) {
            const rollback = this.activeRollbacks.get(rollbackId);
            rollback.status = status;
            rollback.lastUpdate = Date.now();
            if (error) {
                rollback.error = error;
            }
            this.activeRollbacks.set(rollbackId, rollback);
        }
    }

    /**
     * Generate unique rollback ID
     * @returns {string} Rollback ID
     */
    generateRollbackId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 11);
        return `rollback_${timestamp}_${random}`;
    }

    /**
     * Check if deployment can be rolled back
     * @param {string} deploymentId - Deployment ID
     * @returns {Promise<Object>} Rollback capability info
     */
    async canRollback(deploymentId) {
        try {
            const deployment = await this.deploymentHistoryService.getDeploymentById(deploymentId);
            
            if (!deployment) {
                return {
                    canRollback: false,
                    reason: 'Deployment not found'
                };
            }

            if (deployment.status !== 'success') {
                return {
                    canRollback: false,
                    reason: 'Only successful deployments can be rolled back'
                };
            }

            if (!deployment.rollbackData) {
                return {
                    canRollback: false,
                    reason: 'Deployment does not contain rollback data'
                };
            }

            // Check if already rolled back
            if (deployment.status === 'rolled-back') {
                return {
                    canRollback: false,
                    reason: 'Deployment has already been rolled back'
                };
            }

            return {
                canRollback: true,
                deploymentInfo: {
                    solutionName: deployment.solutionInfo?.solutionName,
                    entitiesCount: deployment.rollbackData?.customEntities?.length || 0,
                    relationshipsCount: deployment.rollbackData?.relationships?.length || 0,
                    globalChoicesCount: deployment.rollbackData?.globalChoicesCreated?.length || 0
                }
            };

        } catch (error) {
            return {
                canRollback: false,
                reason: `Error checking rollback capability: ${error.message}`
            };
        }
    }
}

module.exports = { RollbackService };