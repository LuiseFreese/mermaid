/**
 * Deployment History Service
 * Manages deployment history tracking, storage, and retrieval
 */
const { BaseService } = require('./base-service');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class DeploymentHistoryService extends BaseService {
    constructor(dependencies = {}) {
        super(dependencies);
        
        // Storage configuration
        this.storageDir = path.join(process.cwd(), 'data', 'deployments');
        this.maxHistoryEntries = 50; // Keep last 50 deployments per environment
        
        // Ensure storage directory exists
        this.ensureStorageDirectory().catch(error => {
            console.error('Failed to ensure storage directory:', error);
        });
    }

    /**
     * Ensure the storage directory exists
     */
    async ensureStorageDirectory() {
        try {
            await fs.mkdir(this.storageDir, { recursive: true });
        } catch (error) {
            console.error('Failed to create deployment storage directory:', error);
        }
    }

    /**
     * Record a deployment in history
     * @param {Object} deploymentData - Deployment information
     * @returns {Promise<string>} Deployment ID
     */
    async recordDeployment(deploymentData) {
        return this.executeOperation('recordDeployment', async () => {
            const deploymentId = deploymentData.deploymentId || this.generateDeploymentId();
            const timestamp = new Date().toISOString();
            
            // Create deployment record
            const record = {
                deploymentId,
                timestamp,
                environmentSuffix: deploymentData.environmentSuffix || 'default',
                erdContent: deploymentData.erdContent,
                status: deploymentData.status || 'pending',
                summary: deploymentData.summary || this.generateDeploymentSummary(deploymentData),
                deploymentLogs: deploymentData.deploymentLogs || deploymentData.logs || [],
                duration: deploymentData.duration || null,
                solutionInfo: deploymentData.solutionInfo || {
                    solutionName: deploymentData.solutionName,
                    publisherName: deploymentData.publisherName,
                    version: deploymentData.version
                },
                // Add rollback data for undo functionality
                rollbackData: deploymentData.rollbackData || null,
                metadata: deploymentData.metadata || {
                    userAgent: deploymentData.userAgent,
                    deploymentMethod: 'web-ui',
                    previousDeploymentId: await this.getLatestDeploymentId(deploymentData.environmentSuffix)
                }
            };

            // Save deployment record
            await this.saveDeploymentRecord(record);
            
            // Update deployment list index
            await this.updateDeploymentIndex(record);
            
            // Cleanup old deployments
            await this.cleanupOldDeployments(deploymentData.environmentSuffix);
            
            console.log(`🔍 Deployment recorded: ${deploymentId} for environment: ${record.environmentSuffix}`);
            
            return deploymentId;
        });
    }

    /**
     * Update deployment status and final information
     * @param {string} deploymentId - Deployment ID
     * @param {Object} updateData - Update information
     */
    async updateDeployment(deploymentId, updateData) {
        return this.executeOperation('updateDeployment', async () => {
            const record = await this.getDeploymentById(deploymentId);
            if (!record) {
                throw new Error(`Deployment ${deploymentId} not found`);
            }

            // Update fields
            if (updateData.status) record.status = updateData.status;
            if (updateData.duration) record.duration = updateData.duration;
            if (updateData.logs) record.deploymentLogs = [...record.deploymentLogs, ...updateData.logs];
            if (updateData.error) record.error = updateData.error;
            if (updateData.summary) record.summary = { ...record.summary, ...updateData.summary };
            if (updateData.rollbackInfo) record.rollbackInfo = updateData.rollbackInfo;

            // Update completion timestamp
            if (updateData.status === 'success' || updateData.status === 'failed') {
                record.completedAt = new Date().toISOString();
            }

            // Save updated record
            await this.saveDeploymentRecord(record);
            
            console.log(`🔍 Deployment updated: ${deploymentId} status: ${record.status}`);
            
            return record;
        });
    }

    /**
     * Get deployment history for an environment
     * @param {string} environmentSuffix - Environment suffix
     * @param {number} limit - Maximum number of records to return
     * @returns {Promise<Array>} Deployment history
     */
    async getDeploymentHistory(environmentSuffix, limit = 20) {
        return this.executeOperation('getDeploymentHistory', async () => {
            const indexFile = path.join(this.storageDir, `${environmentSuffix || 'default'}_index.json`);
            console.log('🔍 DEBUG: Looking for index file:', indexFile);
            
            try {
                const indexData = await fs.readFile(indexFile, 'utf8');
                const index = JSON.parse(indexData);
                console.log('🔍 DEBUG: Index data loaded, deployments count:', index.deployments?.length);
                
                // Sort by timestamp (newest first) and limit
                const sortedDeployments = index.deployments
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                    .slice(0, limit);
                
                console.log('🔍 DEBUG: Sorted deployments after limit:', sortedDeployments.length);
                
                // Load full deployment data
                const fullDeployments = await Promise.all(
                    sortedDeployments.map(async (summary) => {
                        try {
                            console.log('🔍 DEBUG: Loading deployment:', summary.deploymentId);
                            const deployment = await this.getDeploymentById(summary.deploymentId);
                            console.log('🔍 DEBUG: Loaded deployment result:', deployment ? 'SUCCESS' : 'NULL');
                            return deployment;
                        } catch (error) {
                            console.warn(`Failed to load deployment ${summary.deploymentId}:`, error);
                            return summary; // Return summary if full record fails to load
                        }
                    })
                );
                
                const filtered = fullDeployments.filter(d => d !== null);
                console.log('🔍 DEBUG: Final deployments count after filtering:', filtered.length);
                return filtered;
                
            } catch (error) {
                if (error.code === 'ENOENT') {
                    console.log('🔍 DEBUG: Index file not found, returning empty array');
                    // No deployments yet
                    return [];
                }
                console.error('🔍 DEBUG: Error reading index file:', error);
                throw error;
            }
        });
    }

    /**
     * Get a specific deployment by ID
     * @param {string} deploymentId - Deployment ID
     * @returns {Promise<Object|null>} Deployment record
     */
    async getDeploymentById(deploymentId) {
        return this.executeOperation('getDeploymentById', async () => {
            const recordFile = path.join(this.storageDir, `${deploymentId}.json`);
            console.log('🔍 DEBUG: Looking for deployment file:', recordFile);
            
            try {
                const recordData = await fs.readFile(recordFile, 'utf8');
                const deployment = JSON.parse(recordData);
                console.log('🔍 DEBUG: Successfully loaded deployment:', deploymentId);
                return deployment;
            } catch (error) {
                if (error.code === 'ENOENT') {
                    console.log('🔍 DEBUG: Deployment file not found:', recordFile);
                    return null;
                }
                console.error('🔍 DEBUG: Error loading deployment file:', error);
                throw error;
            }
        });
    }

    /**
     * Compare two deployments and generate diff
     * @param {string} fromDeploymentId - Source deployment ID
     * @param {string} toDeploymentId - Target deployment ID
     * @returns {Promise<Object>} Comparison result
     */
    async compareDeployments(fromDeploymentId, toDeploymentId) {
        return this.executeOperation('compareDeployments', async () => {
            const fromDeployment = await this.getDeploymentById(fromDeploymentId);
            const toDeployment = await this.getDeploymentById(toDeploymentId);
            
            if (!fromDeployment || !toDeployment) {
                throw new Error('One or both deployments not found');
            }

            // Parse ERD content to compare entities
            const fromEntities = this.parseEntitiesFromERD(fromDeployment.erdContent);
            const toEntities = this.parseEntitiesFromERD(toDeployment.erdContent);
            
            const comparison = {
                fromDeployment: {
                    id: fromDeployment.deploymentId,
                    timestamp: fromDeployment.timestamp,
                    status: fromDeployment.status
                },
                toDeployment: {
                    id: toDeployment.deploymentId,
                    timestamp: toDeployment.timestamp,
                    status: toDeployment.status
                },
                changes: {
                    entitiesAdded: this.getAddedEntities(fromEntities, toEntities),
                    entitiesRemoved: this.getRemovedEntities(fromEntities, toEntities),
                    entitiesModified: this.getModifiedEntities(fromEntities, toEntities)
                }
            };
            
            return comparison;
        });
    }

    /**
     * Generate deployment ID
     * @returns {string} Unique deployment ID
     */
    generateDeploymentId() {
        return `deploy_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }

    /**
     * Generate deployment summary from deployment data
     * @param {Object} deploymentData - Deployment data
     * @returns {Object} Summary object
     */
    generateDeploymentSummary(deploymentData) {
        const entities = this.parseEntitiesFromERD(deploymentData.erdContent || '');
        
        const cdmEntities = entities.filter(e => e.isCdm);
        const customEntities = entities.filter(e => !e.isCdm);
        
        return {
            totalEntities: entities.length,
            entitiesAdded: [], // Will be filled in by comparison with previous deployment
            entitiesModified: [],
            entitiesRemoved: [],
            totalAttributes: entities.reduce((sum, entity) => sum + (entity.attributes || []).length, 0),
            cdmEntities: cdmEntities.length,
            customEntities: customEntities.length,
            cdmEntityNames: cdmEntities.map(e => e.name),
            customEntityNames: customEntities.map(e => e.name)
        };
    }

    /**
     * Save deployment record to file
     * @param {Object} record - Deployment record
     */
    async saveDeploymentRecord(record) {
        const recordFile = path.join(this.storageDir, `${record.deploymentId}.json`);
        await fs.writeFile(recordFile, JSON.stringify(record, null, 2), 'utf8');
    }

    /**
     * Update deployment index for faster queries
     * @param {Object} record - Deployment record
     */
    async updateDeploymentIndex(record) {
        const indexFile = path.join(this.storageDir, `${record.environmentSuffix}_index.json`);
        
        let index = { deployments: [] };
        
        try {
            const indexData = await fs.readFile(indexFile, 'utf8');
            index = JSON.parse(indexData);
        } catch (error) {
            // File doesn't exist yet, start with empty index
        }
        
        // Add or update deployment in index
        const existingIndex = index.deployments.findIndex(d => d.deploymentId === record.deploymentId);
        const summary = {
            deploymentId: record.deploymentId,
            timestamp: record.timestamp,
            status: record.status,
            summary: record.summary
        };
        
        if (existingIndex >= 0) {
            index.deployments[existingIndex] = summary;
        } else {
            index.deployments.push(summary);
        }
        
        await fs.writeFile(indexFile, JSON.stringify(index, null, 2), 'utf8');
    }

    /**
     * Get latest deployment ID for an environment
     * @param {string} environmentSuffix - Environment suffix
     * @returns {Promise<string|null>} Latest deployment ID
     */
    async getLatestDeploymentId(environmentSuffix) {
        try {
            const history = await this.getDeploymentHistory(environmentSuffix, 1);
            return history.length > 0 ? history[0].deploymentId : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Clean up old deployments beyond the retention limit
     * @param {string} environmentSuffix - Environment suffix
     */
    async cleanupOldDeployments(environmentSuffix) {
        try {
            const history = await this.getDeploymentHistory(environmentSuffix, this.maxHistoryEntries + 10);
            
            if (history.length > this.maxHistoryEntries) {
                const deploymentsToDelete = history.slice(this.maxHistoryEntries);
                
                for (const deployment of deploymentsToDelete) {
                    const recordFile = path.join(this.storageDir, `${deployment.deploymentId}.json`);
                    try {
                        await fs.unlink(recordFile);
                        console.log(`🧹 Cleaned up old deployment: ${deployment.deploymentId}`);
                    } catch (error) {
                        console.warn(`Failed to delete old deployment file: ${recordFile}`, error);
                    }
                }
                
                // Update index to remove deleted deployments
                const indexFile = path.join(this.storageDir, `${environmentSuffix}_index.json`);
                const indexData = await fs.readFile(indexFile, 'utf8');
                const index = JSON.parse(indexData);
                
                const deleteIds = new Set(deploymentsToDelete.map(d => d.deploymentId));
                index.deployments = index.deployments.filter(d => !deleteIds.has(d.deploymentId));
                
                await fs.writeFile(indexFile, JSON.stringify(index, null, 2), 'utf8');
            }
        } catch (error) {
            console.warn('Failed to cleanup old deployments:', error);
        }
    }

    /**
     * Parse entities from ERD content (basic implementation)
     * @param {string} erdContent - ERD content
     * @returns {Array} Parsed entities
     */
    parseEntitiesFromERD(erdContent) {
        // Basic entity parsing - extract entity names and structure
        const entities = [];
        const entityRegex = /(\w+)\s*\{([^}]*)\}/g;
        let match;
        
        while ((match = entityRegex.exec(erdContent)) !== null) {
            const [, entityName, attributesBlock] = match;
            const attributes = attributesBlock
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('//'))
                .map(line => {
                    const attrMatch = line.match(/(\w+)\s+(\w+)(?:\s+(\w+))?\s*(?:"([^"]*)")?/);
                    return attrMatch ? {
                        name: attrMatch[2],
                        type: attrMatch[1],
                        constraints: attrMatch[3] || '',
                        description: attrMatch[4] || ''
                    } : null;
                })
                .filter(attr => attr !== null);
            
            entities.push({
                name: entityName,
                attributes,
                isCdm: false // Will be determined by validation service
            });
        }
        
        return entities;
    }

    /**
     * Get entities that were added between deployments
     * @param {Array} fromEntities - Source entities
     * @param {Array} toEntities - Target entities
     * @returns {Array} Added entities
     */
    getAddedEntities(fromEntities, toEntities) {
        const fromNames = new Set(fromEntities.map(e => e.name));
        return toEntities.filter(e => !fromNames.has(e.name));
    }

    /**
     * Get entities that were removed between deployments
     * @param {Array} fromEntities - Source entities
     * @param {Array} toEntities - Target entities
     * @returns {Array} Removed entities
     */
    getRemovedEntities(fromEntities, toEntities) {
        const toNames = new Set(toEntities.map(e => e.name));
        return fromEntities.filter(e => !toNames.has(e.name));
    }

    /**
     * Get entities that were modified between deployments
     * @param {Array} fromEntities - Source entities
     * @param {Array} toEntities - Target entities
     * @returns {Array} Modified entities
     */
    getModifiedEntities(fromEntities, toEntities) {
        const modified = [];
        const fromEntitiesMap = new Map(fromEntities.map(e => [e.name, e]));
        
        for (const toEntity of toEntities) {
            const fromEntity = fromEntitiesMap.get(toEntity.name);
            if (fromEntity && this.entitiesAreDifferent(fromEntity, toEntity)) {
                modified.push({
                    name: toEntity.name,
                    changes: this.getEntityChanges(fromEntity, toEntity)
                });
            }
        }
        
        return modified;
    }

    /**
     * Check if two entities are different
     * @param {Object} entity1 - First entity
     * @param {Object} entity2 - Second entity
     * @returns {boolean} True if entities are different
     */
    entitiesAreDifferent(entity1, entity2) {
        return JSON.stringify(entity1.attributes) !== JSON.stringify(entity2.attributes);
    }

    /**
     * Get changes between two entities
     * @param {Object} fromEntity - Source entity
     * @param {Object} toEntity - Target entity
     * @returns {Object} Changes object
     */
    getEntityChanges(fromEntity, toEntity) {
        const fromAttrNames = new Set(fromEntity.attributes.map(a => a.name));
        const toAttrNames = new Set(toEntity.attributes.map(a => a.name));
        
        return {
            attributesAdded: toEntity.attributes.filter(a => !fromAttrNames.has(a.name)),
            attributesRemoved: fromEntity.attributes.filter(a => !toAttrNames.has(a.name)),
            attributesModified: [] // Could be enhanced to detect attribute changes
        };
    }
}

module.exports = { DeploymentHistoryService };