/**
 * Storage Factory
 * Creates appropriate storage provider based on configuration
 */
const { LocalStorageProvider } = require('./local-storage-provider');
const { AzureStorageProvider } = require('./azure-storage-provider');

class StorageFactory {
    /**
     * Create storage provider based on configuration
     * @param {Object} config - Storage configuration
     * @returns {StorageProvider}
     */
    static create(config = {}) {
        // Determine storage type from config or environment
        const storageType = config.type || 
                           process.env.STORAGE_TYPE || 
                           (process.env.NODE_ENV === 'production' && process.env.AZURE_STORAGE_ACCOUNT_NAME ? 'azure' : 'local');

        switch (storageType) {
            case 'azure':
                return new AzureStorageProvider(config);
            case 'local':
            default:
                return new LocalStorageProvider(config);
        }
    }

    /**
     * Create local storage provider
     * @param {Object} config - Storage configuration
     * @returns {LocalStorageProvider}
     */
    static createLocal(config = {}) {
        return new LocalStorageProvider(config);
    }

    /**
     * Create Azure storage provider
     * @param {Object} config - Storage configuration
     * @returns {AzureStorageProvider}
     */
    static createAzure(config = {}) {
        return new AzureStorageProvider(config);
    }

    /**
     * Get available storage types
     * @returns {string[]}
     */
    static getAvailableTypes() {
        return ['local', 'azure'];
    }

    /**
     * Validate storage configuration
     * @param {Object} config - Storage configuration to validate
     * @returns {Object} Validation result
     */
    static validateConfig(config = {}) {
        const result = {
            valid: true,
            errors: [],
            warnings: []
        };

        const storageType = config.type || 'local';

        if (!this.getAvailableTypes().includes(storageType)) {
            result.valid = false;
            result.errors.push(`Invalid storage type: ${storageType}`);
        }

        if (storageType === 'azure') {
            if (!config.accountName && !config.connectionString && 
                !process.env.AZURE_STORAGE_ACCOUNT_NAME && !process.env.AZURE_STORAGE_CONNECTION_STRING) {
                result.valid = false;
                result.errors.push('Azure storage requires accountName or connectionString');
            }

            if (!config.containerName && !process.env.AZURE_STORAGE_CONTAINER_NAME) {
                result.warnings.push('No container name specified, using default: deployment-history');
            }
        }

        if (storageType === 'local') {
            if (!config.baseDir) {
                result.warnings.push('No base directory specified, using default: data/deployments');
            }
        }

        return result;
    }
}

module.exports = { StorageFactory };