/**
 * Storage Provider Abstraction
 * Provides a unified interface for both local file storage and Azure Storage
 */

class StorageProvider {
    /**
     * Initialize storage provider
     * @param {Object} config - Storage configuration
     */
    constructor(config = {}) {
        this.config = config;
        this.type = config.type || 'local'; // 'local' or 'azure'
    }

    /**
     * Save data to storage
     * @param {string} key - Storage key/path
     * @param {Object|string} data - Data to store
     * @param {Object} options - Storage options
     * @returns {Promise<void>}
     */
    // eslint-disable-next-line no-unused-vars
    async save(key, data, options = {}) {
        throw new Error('save() method must be implemented by subclass');
    }

    /**
     * Load data from storage
     * @param {string} key - Storage key/path
     * @param {Object} options - Load options
     * @returns {Promise<Object|string|null>}
     */
    // eslint-disable-next-line no-unused-vars
    async load(key, options = {}) {
        throw new Error('load() method must be implemented by subclass');
    }

    /**
     * Check if key exists in storage
     * @param {string} key - Storage key/path
     * @returns {Promise<boolean>}
     */
    // eslint-disable-next-line no-unused-vars
    async exists(key) {
        throw new Error('exists() method must be implemented by subclass');
    }

    /**
     * Delete data from storage
     * @param {string} key - Storage key/path
     * @returns {Promise<void>}
     */
    // eslint-disable-next-line no-unused-vars
    async delete(key) {
        throw new Error('delete() method must be implemented by subclass');
    }

    /**
     * List keys in storage
     * @param {string} prefix - Key prefix to filter by
     * @param {Object} options - List options
     * @returns {Promise<string[]>}
     */
    // eslint-disable-next-line no-unused-vars
    async list(prefix = '', options = {}) {
        throw new Error('list() method must be implemented by subclass');
    }

    /**
     * Initialize storage (create containers, directories, etc.)
     * @returns {Promise<void>}
     */
    async initialize() {
        throw new Error('initialize() method must be implemented by subclass');
    }

    /**
     * Get storage type
     * @returns {string}
     */
    getType() {
        return this.type;
    }

    /**
     * Get storage configuration
     * @returns {Object}
     */
    getConfig() {
        return { ...this.config };
    }
}

module.exports = { StorageProvider };