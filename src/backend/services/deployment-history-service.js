/**
 * Deployment History Service (Enhanced with Storage Abstraction)
 * Manages deployment history tracking, storage, and retrieval with configurable storage backends
 */
const { BaseService } = require('./base-service');
const { StorageFactory } = require('../storage');
const crypto = require('crypto');

class DeploymentHistoryService extends BaseService {
    constructor(dependencies = {}) {
        super(dependencies);
        
        // Configuration
        this.maxHistoryEntries = 50; // Keep last 50 deployments per environment
        
        // Initialize storage provider
        this.storage = dependencies.storage || StorageFactory.create({
            type: process.env.STORAGE_TYPE || (process.env.NODE_ENV === 'production' ? 'azure' : 'local'),
            baseDir: dependencies.storageDir,
            accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME,
            containerName: process.env.AZURE_STORAGE_CONTAINER_NAME || 'deployment-history',
            connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING
        });
        
        // Initialize storage on construction
        this.initializeStorage().catch(error => {
            console.error('Failed to initialize storage:', error);
        });
    }

    /**
     * Initialize storage provider
     */
    async initializeStorage() {
        try {
            await this.storage.initialize();
            console.log(`✅ Deployment history storage initialized: ${this.storage.getType()}`);
        } catch (error) {
            console.error('Failed to initialize deployment history storage:', error);
            throw error;
        }
    }

    /**
     * Record a deployment in history
     * @param {Object} deploymentData - Deployment information
     * @returns {Promise<string>} Deployment ID
     */
    async recordDeployment(deploymentData) {
        return this.executeOperation('recordDeployment', async () => {
            console.log('🎯 DeploymentHistoryService.recordDeployment - Input:', {
                hasEnvironmentId: !!deploymentData.environmentId,
                environmentId: deploymentData.environmentId,
                environmentName: deploymentData.environmentName,
                environmentUrl: deploymentData.environmentUrl,
                storageType: this.storage.getType()
            });
            
            const deploymentId = deploymentData.deploymentId || this.generateDeploymentId();
            const timestamp = new Date().toISOString();
            
            // Create deployment record
            const record = {
                deploymentId,
                timestamp,
                environmentSuffix: deploymentData.environmentSuffix || 'default',
                // Multi-environment support
                environmentId: deploymentData.environmentId || deploymentData.environmentSuffix || 'default',
                environmentName: deploymentData.environmentName || deploymentData.environmentSuffix || 'Default',
                environmentUrl: deploymentData.environmentUrl || null,
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
                    previousDeploymentId: await this.getLatestDeploymentId(deploymentData.environmentSuffix),
                    storageType: this.storage.getType(),
                    storedAt: timestamp
                }
            };
            
            console.log('🎯 DeploymentHistoryService.recordDeployment - Record to save:', {
                deploymentId: record.deploymentId,
                environmentId: record.environmentId,
                environmentName: record.environmentName,
                environmentUrl: record.environmentUrl,
                storageType: this.storage.getType()
            });

            // Save deployment record using storage abstraction
            await this.saveDeploymentRecord(record);
            
            // Update deployment list index
            await this.updateDeploymentIndex(record);
            
            // Cleanup old deployments
            await this.cleanupOldDeployments(deploymentData.environmentSuffix);
            
            return deploymentId;
        });
    }

    /**
     * Update deployment status
     * @param {string} deploymentId - Deployment ID
     * @param {string} status - New status
     * @param {Object} additionalData - Additional data to update
     * @returns {Promise<void>}
     */
    async updateDeployment(deploymentId, status, additionalData = {}) {
        return this.executeOperation('updateDeployment', async () => {
            // Load existing record
            const record = await this.getDeployment(deploymentId);
            if (!record) {
                throw new Error(`Deployment not found: ${deploymentId}`);
            }

            // Update record
            record.status = status;
            record.lastUpdated = new Date().toISOString();
            
            // Merge additional data
            Object.assign(record, additionalData);
            
            // Save updated record
            await this.saveDeploymentRecord(record);
            
            // Update index
            await this.updateDeploymentIndex(record);
        });
    }

    /**
     * Save deployment record using storage abstraction
     * @param {Object} record - Deployment record
     */
    async saveDeploymentRecord(record) {
        const recordKey = `deployments/${record.deploymentId}.json`;
        await this.storage.save(recordKey, record);
    }

    /**
     * Load deployment record using storage abstraction
     * @param {string} deploymentId - Deployment ID
     * @returns {Promise<Object|null>}
     */
    async loadDeploymentRecord(deploymentId) {
        const recordKey = `deployments/${deploymentId}.json`;
        return await this.storage.load(recordKey);
    }

    /**
     * Update deployment index for faster queries
     * @param {Object} record - Deployment record
     */
    async updateDeploymentIndex(record) {
        const indexKey = `indexes/${record.environmentSuffix}_index.json`;
        
        let index = { deployments: [] };
        
        try {
            const existingIndex = await this.storage.load(indexKey);
            if (existingIndex) {
                index = existingIndex;
            }
        } catch (error) {
            // Index doesn't exist yet, start with empty index
            console.log('Creating new deployment index for environment:', record.environmentSuffix);
        }
        
        // Add or update deployment in index
        const existingIndex = index.deployments.findIndex(d => d.deploymentId === record.deploymentId);
        const summary = {
            deploymentId: record.deploymentId,
            timestamp: record.timestamp,
            status: record.status,
            summary: record.summary,
            environmentId: record.environmentId,
            environmentName: record.environmentName
        };
        
        if (existingIndex >= 0) {
            index.deployments[existingIndex] = summary;
        } else {
            index.deployments.push(summary);
        }
        
        // Sort by timestamp (newest first)
        index.deployments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        await this.storage.save(indexKey, index);
    }

    /**
     * Get deployment history for an environment
     * @param {string} environmentSuffix - Environment suffix
     * @param {number} limit - Number of deployments to return
     * @returns {Promise<Array>}
     */
    async getDeploymentHistory(environmentSuffix, limit = 10) {
        return this.executeOperation('getDeploymentHistory', async () => {
            const indexKey = `indexes/${environmentSuffix}_index.json`;
            
            try {
                const index = await this.storage.load(indexKey);
                if (!index || !index.deployments) {
                    return [];
                }
                
                // Return limited results
                return index.deployments.slice(0, limit);
            } catch (error) {
                console.warn(`Failed to load deployment history for ${environmentSuffix}:`, error);
                return [];
            }
        });
    }

    /**
     * Get specific deployment
     * @param {string} deploymentId - Deployment ID
     * @returns {Promise<Object|null>}
     */
    async getDeployment(deploymentId) {
        return this.executeOperation('getDeployment', async () => {
            return await this.loadDeploymentRecord(deploymentId);
        });
    }

    /**
     * Get deployment by ID (alias for backward compatibility)
     * @param {string} deploymentId - Deployment ID
     * @returns {Promise<Object|null>}
     */
    async getDeploymentById(deploymentId) {
        return this.getDeployment(deploymentId);
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
                    const recordKey = `deployments/${deployment.deploymentId}.json`;
                    try {
                        await this.storage.delete(recordKey);
                    } catch (error) {
                        console.warn(`Failed to delete old deployment: ${deployment.deploymentId}`, error);
                    }
                }
                
                // Update index to remove deleted deployments
                const indexKey = `indexes/${environmentSuffix}_index.json`;
                const indexData = await this.storage.load(indexKey);
                
                if (indexData) {
                    const deleteIds = new Set(deploymentsToDelete.map(d => d.deploymentId));
                    indexData.deployments = indexData.deployments.filter(d => !deleteIds.has(d.deploymentId));
                    
                    await this.storage.save(indexKey, indexData);
                }
            }
        } catch (error) {
            console.warn('Failed to cleanup old deployments:', error);
        }
    }

    /**
     * Delete specific deployment
     * @param {string} deploymentId - Deployment ID
     * @param {string} environmentSuffix - Environment suffix
     * @returns {Promise<void>}
     */
    async deleteDeployment(deploymentId, environmentSuffix) {
        return this.executeOperation('deleteDeployment', async () => {
            // Delete deployment record
            const recordKey = `deployments/${deploymentId}.json`;
            await this.storage.delete(recordKey);
            
            // Update index
            const indexKey = `indexes/${environmentSuffix}_index.json`;
            const indexData = await this.storage.load(indexKey);
            
            if (indexData) {
                indexData.deployments = indexData.deployments.filter(d => d.deploymentId !== deploymentId);
                await this.storage.save(indexKey, indexData);
            }
        });
    }

    /**
     * Get all environments with deployment history
     * @returns {Promise<Array>} List of environments with deployment counts
     */
    async getAllEnvironments() {
        return this.executeOperation('getAllEnvironments', async () => {
            try {
                // List all index files
                const indexFiles = await this.storage.list('indexes/', { extension: '_index.json' });
                
                const environments = [];
                for (const indexFile of indexFiles) {
                    // Extract environment suffix from filename - handle both Windows and Unix path separators
                    const filename = indexFile.split(/[/\\]/).pop(); // Get just the filename without path
                    const environmentSuffix = filename.replace('_index.json', '');
                    
                    const index = await this.storage.load(indexFile);
                    
                    if (index && index.deployments) {
                        environments.push({
                            environmentSuffix,
                            deploymentCount: index.deployments.length,
                            lastDeployment: index.deployments[0] || null
                        });
                    }
                }
                
                return environments;
            } catch (error) {
                console.warn('Failed to get all environments:', error);
                return [];
            }
        });
    }

    /**
     * Migrate data from local storage to new storage backend
     * @param {string} sourcePath - Source directory path
     * @returns {Promise<Object>} Migration result
     */
    async migrateFromLocalStorage(sourcePath) {
        return this.executeOperation('migrateFromLocalStorage', async () => {
            const fs = require('fs').promises;
            const path = require('path');
            
            const result = {
                migratedDeployments: 0,
                migratedIndexes: 0,
                errors: []
            };
            
            try {
                // Get all files in source directory
                const files = await fs.readdir(sourcePath);
                
                for (const file of files) {
                    const filePath = path.join(sourcePath, file);
                    
                    try {
                        if (file.endsWith('.json')) {
                            const content = await fs.readFile(filePath, 'utf8');
                            const data = JSON.parse(content);
                            
                            if (file.endsWith('_index.json')) {
                                // Index file
                                const indexKey = `indexes/${file}`;
                                await this.storage.save(indexKey, data);
                                result.migratedIndexes++;
                            } else {
                                // Deployment record
                                const deploymentKey = `deployments/${file}`;
                                await this.storage.save(deploymentKey, data);
                                result.migratedDeployments++;
                            }
                        }
                    } catch (error) {
                        result.errors.push(`Failed to migrate ${file}: ${error.message}`);
                    }
                }
            } catch (error) {
                throw new Error(`Migration failed: ${error.message}`);
            }
            
            return result;
        });
    }

    /**
     * Generate deployment ID
     * @returns {string}
     */
    generateDeploymentId() {
        const timestamp = Date.now();
        const random = crypto.randomBytes(4).toString('hex');
        return `dep_${timestamp}_${random}`;
    }

    /**
     * Generate deployment summary
     * @param {Object} deploymentData - Deployment data
     * @returns {string}
     */
    generateDeploymentSummary(deploymentData) {
        if (deploymentData.summary) {
            return deploymentData.summary;
        }
        
        const entityCount = deploymentData.entityCount || 0;
        const relationshipCount = deploymentData.relationshipCount || 0;
        
        return `Deployed ${entityCount} entities and ${relationshipCount} relationships`;
    }

    /**
     * Get deployments filtered by environment
     * @param {string} environmentId - Environment ID to filter by (or 'all' for all environments)
     * @returns {Promise<Array>} Filtered deployment records
     */
    async getDeploymentsByEnvironment(environmentId) {
        return this.executeOperation('getDeploymentsByEnvironment', async () => {
            // If 'all' or no environmentId specified, get deployments from all environments
            if (!environmentId || environmentId === 'all') {
                return await this.getAllDeploymentsFromAllEnvironments();
            }
            
            // For specific environment, use environmentId as the suffix
            const deployments = await this.getDeploymentHistory(environmentId, 1000);
            
            // Double-check filtering by environmentId in case index has mixed data
            return deployments.filter(deployment => {
                const deploymentEnvId = deployment.environmentId || deployment.environmentSuffix;
                return deploymentEnvId && deploymentEnvId === environmentId;
            });
        });
    }

    /**
     * Get all deployments from all environment index files
     * @returns {Promise<Array>} All deployment records from all environments
     */
    async getAllDeploymentsFromAllEnvironments() {
        return this.executeOperation('getAllDeploymentsFromAllEnvironments', async () => {
            const allEnvironments = await this.getAllEnvironments();
            const allDeployments = [];
            
            for (const env of allEnvironments) {
                const deployments = await this.getDeploymentHistory(env.environmentSuffix, 1000);
                allDeployments.push(...deployments);
            }
            
            // Sort by timestamp (newest first)
            return allDeployments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        });
    }

    /**
     * Get storage provider information
     * @returns {Object}
     */
    getStorageInfo() {
        return {
            type: this.storage.getType(),
            config: this.storage.getConfig()
        };
    }
}

module.exports = { DeploymentHistoryService };