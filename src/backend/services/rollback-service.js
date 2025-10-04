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
     * Validate rollback configuration against dependency rules
     * @param {Object} options - Rollback options
     * @param {Object} rollbackData - Current deployment rollback data
     * @returns {Object} Validation result with errors and warnings
     */
    validateRollbackConfiguration(options, rollbackData) {
        const errors = [];
        const warnings = [];

        console.log('🔍 VALIDATE: Received options:', JSON.stringify(options, null, 2));

        // Ensure options has all required properties with defaults
        const config = {
            relationships: options.relationships !== undefined ? options.relationships : true,
            customEntities: options.customEntities !== undefined ? options.customEntities : true,
            cdmEntities: options.cdmEntities !== undefined ? options.cdmEntities : true,
            customGlobalChoices: options.customGlobalChoices !== undefined ? options.customGlobalChoices : true,
            addedGlobalChoices: options.addedGlobalChoices !== undefined ? options.addedGlobalChoices : true,
            solution: options.solution !== undefined ? options.solution : true,
            publisher: options.publisher !== undefined ? options.publisher : true
        };

        console.log('🔍 VALIDATE: Created config:', JSON.stringify(config, null, 2));

        // Rule 1: Cannot delete custom tables without deleting relationships first
        if (config.customEntities && !config.relationships) {
            const relationshipCount = rollbackData.relationships?.length || 0;
            if (relationshipCount > 0) {
                errors.push(
                    `Cannot delete custom tables without deleting relationships first. ` +
                    `Found ${relationshipCount} relationship(s) that must be deleted.`
                );
            }
        }

        // Rule 2: Cannot delete solution if entities still exist
        if (config.solution) {
            const hasCustomEntities = !config.customEntities && 
                                     rollbackData.customEntities?.length > 0;
            const hasCdmEntities = !config.cdmEntities && 
                                  rollbackData.cdmEntities?.length > 0;
            
            if (hasCustomEntities || hasCdmEntities) {
                const entityTypes = [];
                if (hasCustomEntities) entityTypes.push('custom entities');
                if (hasCdmEntities) entityTypes.push('CDM entities');
                
                errors.push(
                    `Cannot delete solution while it contains ${entityTypes.join(' and ')}. ` +
                    `All entities must be removed first.`
                );
            }
        }

        // Rule 3: Cannot delete publisher if solution still exists
        if (config.publisher && !config.solution) {
            if (rollbackData.solutionName) {
                errors.push(
                    `Cannot delete publisher without deleting solution first. ` +
                    `Solution "${rollbackData.solutionName}" must be deleted.`
                );
            }
        }

        // Rule 4: Custom global choices may be referenced by entities (warning only)
        if (config.customGlobalChoices && (!config.customEntities || !config.cdmEntities)) {
            warnings.push(
                'Deleting custom global choices while entities still exist may cause references to break. ' +
                'Consider removing all entities first.'
            );
        }
        
        // Note: addedGlobalChoices are just removed from solution, not deleted, so no dependency warning needed

        // Check if at least one component is selected
        const hasSelection = Object.values(config).some(v => v === true);
        if (!hasSelection) {
            errors.push('At least one component must be selected for rollback');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            config
        };
    }

    /**
     * Determine if a rollback is complete (everything deleted) or partial (some items kept)
     * @param {Object} options - Rollback options selected by user
     * @param {Object} rollbackData - Deployment rollback data
     * @param {Object} solutionInfo - Solution and publisher information
     * @param {Array} rollbackHistory - Previous rollback operations (optional)
     * @returns {boolean} True if complete rollback, false if partial
     */
    isCompleteRollback(options, rollbackData, solutionInfo, rollbackHistory = []) {
        // First, determine what components are still available (not yet rolled back)
        const alreadyRolledBack = {
            relationships: false,
            customEntities: false,
            cdmEntities: false,
            customGlobalChoices: false,
            solution: false,
            publisher: false
        };
        
        // Check rollback history to see what's already been removed
        rollbackHistory.forEach(rb => {
            const opts = rb.rollbackOptions || {};
            if (opts.relationships) alreadyRolledBack.relationships = true;
            if (opts.customEntities) alreadyRolledBack.customEntities = true;
            if (opts.cdmEntities) alreadyRolledBack.cdmEntities = true;
            if (opts.customGlobalChoices) alreadyRolledBack.customGlobalChoices = true;
            if (opts.solution) alreadyRolledBack.solution = true;
            if (opts.publisher) alreadyRolledBack.publisher = true;
        });
        
        // Check if components exist AND haven't been rolled back yet
        const hasRelationships = rollbackData.relationships && rollbackData.relationships.length > 0 && !alreadyRolledBack.relationships;
        const hasCustomEntities = rollbackData.customEntities && rollbackData.customEntities.length > 0 && !alreadyRolledBack.customEntities;
        const hasCdmEntities = rollbackData.cdmEntities && rollbackData.cdmEntities.length > 0 && !alreadyRolledBack.cdmEntities;
        const hasCustomGlobalChoices = rollbackData.globalChoicesCreated && rollbackData.globalChoicesCreated.length > 0 && !alreadyRolledBack.customGlobalChoices;
        const hasSolution = !!solutionInfo?.solutionName && !alreadyRolledBack.solution;
        const hasPublisher = !!solutionInfo?.publisherName && !alreadyRolledBack.publisher;

        // If a component still exists and wasn't selected in THIS rollback, it's partial
        if (hasRelationships && !options.relationships) {
            return false;
        }
        if (hasCustomEntities && !options.customEntities) {
            return false;
        }
        if (hasCdmEntities && !options.cdmEntities) {
            return false;
        }
        if (hasCustomGlobalChoices && !options.customGlobalChoices) {
            return false;
        }
        if (hasSolution && !options.solution) {
            return false;
        }
        if (hasPublisher && !options.publisher) {
            return false;
        }

        // If we get here, all remaining components were selected for deletion
        return true;
    }

    /**
     * Execute rollback of a deployment
     * @param {string} deploymentId - Deployment ID to rollback
     * @param {Function} progressCallback - Progress update callback
     * @param {Object} rollbackOptions - Optional granular rollback options
     * @returns {Promise<Object>} Rollback result
     */
    async rollbackDeployment(deploymentId, progressCallback, rollbackOptions = {}) {
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

            // Check if deployment was successful or modified (partially rolled back)
            if (deployment.status !== 'success' && deployment.status !== 'modified') {
                throw new Error('Only successful or partially rolled back deployments can be rolled back');
            }
            console.log(`✅ ROLLBACK SERVICE: Validation passed`);

            progress('validating', 'Validating rollback requirements...');
            
            // Step 2: Filter deployment data FIRST to exclude already-rolled-back components
            console.log(`🔍 ROLLBACK SERVICE: Checking for previous rollbacks...`);
            const rollbackHistory = deployment.rollbackInfo?.rollbacks || [];
            let filteredRollbackData = { ...deployment.rollbackData };
            
            // Track what has already been rolled back (always initialize)
            const alreadyRolledBack = {
                relationships: false,
                customEntities: false,
                cdmEntities: false,
                customGlobalChoices: false,
                solution: false,
                publisher: false
            };
            
            if (rollbackHistory.length > 0) {
                console.log(`📜 ROLLBACK SERVICE: Found ${rollbackHistory.length} previous rollback(s)`);
                
                // Update alreadyRolledBack flags based on history
                
                rollbackHistory.forEach((rb, idx) => {
                    console.log(`  Rollback ${idx + 1}: ${Object.keys(rb.rollbackOptions || {}).filter(k => rb.rollbackOptions[k]).join(', ')}`);
                    const opts = rb.rollbackOptions || {};
                    if (opts.relationships) alreadyRolledBack.relationships = true;
                    if (opts.customEntities) alreadyRolledBack.customEntities = true;
                    if (opts.cdmEntities) alreadyRolledBack.cdmEntities = true;
                    if (opts.customGlobalChoices) alreadyRolledBack.customGlobalChoices = true;
                    if (opts.solution) alreadyRolledBack.solution = true;
                    if (opts.publisher) alreadyRolledBack.publisher = true;
                });
                
                console.log(`🚫 ROLLBACK SERVICE: Already rolled back:`, Object.keys(alreadyRolledBack).filter(k => alreadyRolledBack[k]).join(', '));
                
                // Filter rollbackData to only include components not yet rolled back
                if (alreadyRolledBack.relationships) {
                    console.log(`  ⏭️  Skipping relationships (already rolled back)`);
                    filteredRollbackData.relationships = [];
                }
                if (alreadyRolledBack.customEntities) {
                    console.log(`  ⏭️  Skipping custom entities (already rolled back)`);
                    filteredRollbackData.customEntities = [];
                }
                if (alreadyRolledBack.cdmEntities) {
                    console.log(`  ⏭️  Skipping CDM entities (already rolled back)`);
                    filteredRollbackData.cdmEntities = [];
                }
                if (alreadyRolledBack.customGlobalChoices) {
                    console.log(`  ⏭️  Skipping custom global choices (already rolled back)`);
                    filteredRollbackData.globalChoicesCreated = [];
                }
                
                console.log(`✅ ROLLBACK SERVICE: Filtered deployment data prepared`);
            }
            
            // Step 3: Validate rollback configuration AFTER filtering
            console.log(`🔍 ROLLBACK SERVICE: Validating rollback configuration...`);
            // Create a COPY of the options to prevent mutation of the original
            const selectedOptions = JSON.parse(JSON.stringify(rollbackOptions.options || {
                relationships: true,
                customEntities: true,
                cdmEntities: true,
                globalChoices: true,
                solution: true,
                publisher: true
            }));

            // Validate against FILTERED data (not original data)
            const validation = this.validateRollbackConfiguration(
                selectedOptions,
                filteredRollbackData  // Use filtered data here!
            );

            if (!validation.valid) {
                const errorMessage = `Invalid rollback configuration: ${validation.errors.join('; ')}`;
                console.error(`❌ ROLLBACK SERVICE: ${errorMessage}`);
                throw new Error(errorMessage);
            }

            // Log warnings if any
            if (validation.warnings.length > 0) {
                console.warn(`⚠️ ROLLBACK SERVICE: Warnings: ${validation.warnings.join('; ')}`);
            }

            console.log(`✅ ROLLBACK SERVICE: Configuration validated`);
            console.log(`📋 ROLLBACK SERVICE: Using options:`, validation.config);
            
            // Clear solution/publisher from config if already rolled back
            if (alreadyRolledBack.solution) {
                console.log(`  ⏭️  Clearing solution flag (already rolled back)`);
                validation.config.solution = false;
            }
            if (alreadyRolledBack.publisher) {
                console.log(`  ⏭️  Clearing publisher flag (already rolled back)`);
                validation.config.publisher = false;
            }
            
            // Step 4: Validate rollback preconditions
            console.log(`🔐 ROLLBACK SERVICE: Validating preconditions...`);
            await this.validateRollbackPreconditions(deployment);
            console.log(`✅ ROLLBACK SERVICE: Preconditions validated`);

            
            // Step 5: Execute rollback using dataverse client
            console.log(`🚀 ROLLBACK SERVICE: Starting dataverse rollback execution...`);
            progress('executing', 'Executing rollback...');
            
            this.updateRollbackStatus(rollbackId, 'executing');
            
            console.log(`🔗 ROLLBACK SERVICE: About to call dataverse rollback with options...`);
            
            // Use filtered deployment data if there were previous rollbacks, otherwise use original
            const deploymentToRollback = rollbackHistory.length > 0 
                ? { ...deployment, rollbackData: filteredRollbackData }
                : deployment;
            
            const rollbackResponse = await this.dataverseRepository.rollbackDeployment(
                deploymentToRollback, 
                (status, message) => {
                    console.log(`📊 ROLLBACK PROGRESS: ${status} - ${message}`);
                    progress(status, message);
                },
                validation.config  // Pass validated configuration to repository
            );
            console.log(`✅ ROLLBACK SERVICE: Dataverse rollback completed!`);

            // Extract the actual results from the repository response
            const rollbackResults = rollbackResponse.data || rollbackResponse;

            // Step 6: Record rollback in deployment history
            console.log(`📝 ROLLBACK SERVICE: Recording rollback...`);
            progress('recording', 'Recording rollback...');
            
            await this.recordRollback(deployment, rollbackResults, rollbackId, validation.config);

            // Determine if this was a complete or partial rollback
            // Pass rollback history to check what's already been rolled back
            // Use validation.config (normalized options) instead of selectedOptions
            const wasCompleteRollback = this.isCompleteRollback(validation.config, deployment.rollbackData, deployment.solutionInfo, rollbackHistory);
            const newStatus = wasCompleteRollback ? 'rolled-back' : 'modified';

            console.log(`📊 ROLLBACK TYPE: ${wasCompleteRollback ? 'Complete' : 'Partial'} - Setting status to '${newStatus}'`);

            // Step 7: Update deployment status
            const updateData = {
                status: newStatus,
                rollbackInfo: deployment.rollbackInfo || { rollbacks: [] }
            };

            // Add this rollback to the history
            if (!updateData.rollbackInfo.rollbacks) {
                updateData.rollbackInfo.rollbacks = [];
            }
            
            updateData.rollbackInfo.rollbacks.push({
                rollbackId,
                rollbackTimestamp: new Date().toISOString(),
                rollbackResults,
                rollbackOptions: validation.config  // Store the validated/normalized config that was actually used
            });

            // Store the latest rollback at the top level for easy access
            updateData.rollbackInfo.lastRollback = {
                rollbackId,
                rollbackTimestamp: new Date().toISOString(),
                rollbackResults,
                rollbackOptions: validation.config
            };

            await this.deploymentHistoryService.updateDeployment(deploymentId, updateData);

            progress('completed', 'Rollback completed successfully');
            
            this.updateRollbackStatus(rollbackId, 'completed');
            
            // End performance monitoring
            this.performanceMonitor.endOperation(rollbackId, rollbackResults);
            
            return {
                rollbackId,
                deploymentId,
                status: 'success',
                isCompleteRollback: wasCompleteRollback,
                newDeploymentStatus: newStatus,
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
    async recordRollback(originalDeployment, rollbackResults, rollbackId, selectedOptions = {}) {
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
                },
                componentsSelected: {
                    relationships: selectedOptions.relationships || false,
                    customEntities: selectedOptions.customEntities || false,
                    cdmEntities: selectedOptions.cdmEntities || false,
                    customGlobalChoices: selectedOptions.customGlobalChoices || false,
                    addedGlobalChoices: selectedOptions.addedGlobalChoices || false,
                    solution: selectedOptions.solution || false,
                    publisher: selectedOptions.publisher || false
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

            // Allow rollback for 'success' and 'modified' deployments
            if (deployment.status !== 'success' && deployment.status !== 'modified') {
                return {
                    canRollback: false,
                    reason: 'Only successful or partially rolled back deployments can be rolled back'
                };
            }

            if (!deployment.rollbackData) {
                return {
                    canRollback: false,
                    reason: 'Deployment does not contain rollback data'
                };
            }

            // Check if already completely rolled back
            if (deployment.status === 'rolled-back') {
                return {
                    canRollback: false,
                    reason: 'Deployment has already been completely rolled back'
                };
            }

            // Structure rollback data for granular selection UI
            const rollbackData = deployment.rollbackData || {};
            const solutionInfo = deployment.solutionInfo || {};
            const summary = deployment.summary || {};
            
            // Fallback: If cdmEntities not in rollbackData, try to extract from summary
            let cdmEntities = rollbackData.cdmEntities || [];
            if (cdmEntities.length === 0 && summary.cdmEntityNames && summary.cdmEntityNames.length > 0) {
                // Legacy deployment - extract CDM entities from summary
                cdmEntities = summary.cdmEntityNames.map(name => ({
                    name: name,
                    logicalName: name.toLowerCase(),
                    displayName: name
                }));
            }
            
            // Check what has already been rolled back (for partial rollbacks)
            const rollbackHistory = deployment.rollbackInfo?.rollbacks || [];
            let alreadyRolledBack = {
                relationships: false,
                customEntities: false,
                cdmEntities: false,
                customGlobalChoices: false,
                solution: false,
                publisher: false
            };
            
            // Aggregate what has been rolled back across all previous rollback operations
            rollbackHistory.forEach(rollback => {
                const options = rollback.rollbackOptions || {};
                if (options.relationships) alreadyRolledBack.relationships = true;
                if (options.customEntities) alreadyRolledBack.customEntities = true;
                if (options.cdmEntities) alreadyRolledBack.cdmEntities = true;
                if (options.customGlobalChoices) alreadyRolledBack.customGlobalChoices = true;
                if (options.solution) alreadyRolledBack.solution = true;
                if (options.publisher) alreadyRolledBack.publisher = true;
            });
            
            // Filter out components that have already been rolled back
            const availableRelationships = alreadyRolledBack.relationships ? [] : (rollbackData.relationships || []);
            const availableCustomEntities = alreadyRolledBack.customEntities ? [] : (rollbackData.customEntities || []);
            const availableCdmEntities = alreadyRolledBack.cdmEntities || alreadyRolledBack.solution ? [] : cdmEntities;
            const availableCustomGlobalChoices = alreadyRolledBack.customGlobalChoices ? [] : (rollbackData.globalChoicesCreated || []);
            const availableSolution = alreadyRolledBack.solution ? null : (solutionInfo.solutionId ? {
                solutionId: solutionInfo.solutionId,
                uniqueName: solutionInfo.uniqueName || solutionInfo.solutionName,
                displayName: solutionInfo.solutionName
            } : null);
            const availablePublisher = alreadyRolledBack.publisher ? null : (rollbackData.publisher || (solutionInfo.publisherName ? {
                publisherId: rollbackData.publisher?.publisherId || null,
                uniqueName: solutionInfo.publisherPrefix || solutionInfo.publisherName,
                displayName: solutionInfo.publisherName
            } : null));
            
            return {
                canRollback: true,
                deploymentInfo: {
                    // Original counts for backward compatibility
                    solutionName: solutionInfo.solutionName,
                    entitiesCount: availableCustomEntities.length,
                    relationshipsCount: availableRelationships.length,
                    globalChoicesCount: availableCustomGlobalChoices.length,
                    
                    // Full data for granular selection (only showing what's still available)
                    relationships: availableRelationships,
                    entities: {
                        custom: availableCustomEntities,
                        cdm: availableCdmEntities
                    },
                    globalChoices: {
                        custom: availableCustomGlobalChoices,
                        added: rollbackData.globalChoicesAdded || [] // Note: added choices were never actually rolled back in the removed code
                    },
                    // Solution and publisher info - null if already rolled back
                    solution: availableSolution,
                    publisher: availablePublisher
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