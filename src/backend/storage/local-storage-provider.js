/**
 * Local File Storage Provider
 * Implements storage operations using the local file system
 */
const { StorageProvider } = require('./storage-provider');
const fs = require('fs').promises;
const path = require('path');

class LocalStorageProvider extends StorageProvider {
    constructor(config = {}) {
        super({ ...config, type: 'local' });
        this.baseDir = config.baseDir || path.join(process.cwd(), 'data', 'deployments');
    }

    /**
     * Initialize storage - ensure directory exists
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            await fs.mkdir(this.baseDir, { recursive: true });
        } catch (error) {
            throw new Error(`Failed to initialize local storage directory: ${error.message}`);
        }
    }

    /**
     * Save data to local file
     * @param {string} key - File path relative to base directory
     * @param {Object|string} data - Data to store
     * @param {Object} options - Storage options
     * @returns {Promise<void>}
     */
    async save(key, data, options = {}) {
        const filePath = path.join(this.baseDir, key);
        const dirPath = path.dirname(filePath);
        
        // Ensure directory exists
        await fs.mkdir(dirPath, { recursive: true });
        
        // Convert data to JSON string if it's an object
        const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        
        // Write file with UTF-8 encoding
        await fs.writeFile(filePath, content, { encoding: 'utf8', ...options });
    }

    /**
     * Load data from local file
     * @param {string} key - File path relative to base directory
     * @param {Object} options - Load options
     * @returns {Promise<Object|string|null>}
     */
    async load(key, options = {}) {
        try {
            const filePath = path.join(this.baseDir, key);
            const content = await fs.readFile(filePath, { encoding: 'utf8', ...options });
            
            // Try to parse as JSON, return as string if parsing fails
            try {
                return JSON.parse(content);
            } catch {
                return content;
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                return null; // File doesn't exist
            }
            throw error;
        }
    }

    /**
     * Check if file exists
     * @param {string} key - File path relative to base directory
     * @returns {Promise<boolean>}
     */
    async exists(key) {
        try {
            const filePath = path.join(this.baseDir, key);
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Delete file
     * @param {string} key - File path relative to base directory
     * @returns {Promise<void>}
     */
    async delete(key) {
        try {
            const filePath = path.join(this.baseDir, key);
            await fs.unlink(filePath);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
            // File doesn't exist, consider it successfully deleted
        }
    }

    /**
     * List files in directory
     * @param {string} prefix - Directory prefix to search in
     * @param {Object} options - List options
     * @returns {Promise<string[]>}
     */
    async list(prefix = '', options = {}) {
        try {
            const searchDir = path.join(this.baseDir, prefix);
            const entries = await fs.readdir(searchDir, { withFileTypes: true });
            
            const files = entries
                .filter(entry => entry.isFile())
                .map(entry => path.join(prefix, entry.name))
                .filter(filePath => !options.extension || filePath.endsWith(options.extension));
            
            return files;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return []; // Directory doesn't exist
            }
            throw error;
        }
    }

    /**
     * Get absolute file path
     * @param {string} key - File path relative to base directory
     * @returns {string}
     */
    getAbsolutePath(key) {
        return path.join(this.baseDir, key);
    }

    /**
     * Get base directory
     * @returns {string}
     */
    getBaseDirectory() {
        return this.baseDir;
    }
}

module.exports = { LocalStorageProvider };