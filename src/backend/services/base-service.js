/**
 * Base Service Class
 * Provides common functionality for all business logic services
 */
class BaseService {
    constructor(dependencies = {}) {
        this.name = this.constructor.name;
        this.dependencies = dependencies;
        
        // Extract common dependencies
        this.dataverseRepository = dependencies.dataverseRepository;
        this.configRepository = dependencies.configRepository;
        this.logger = dependencies.logger || console;
    }

    /**
     * Log service action (disabled to reduce log noise)
     * @param {string} action - Action being performed
     * @param {Object} details - Additional details
     */
    log(action, details = {}) {
        // Disabled to reduce excessive logging
    }

    /**
     * Log warning
     * @param {string} message - Warning message
     * @param {Object} details - Additional details
     */
    warn(message, details = {}) {
        this.logger.warn(`⚠️ ${this.name}: ${message}`, details);
    }

    /**
     * Log error
     * @param {string} message - Error message
     * @param {Error} error - Error object
     */
    error(message, error = null) {
        this.logger.error(`❌ ${this.name}: ${message}`, error?.message || error);
    }

    /**
     * Validate service dependencies
     * @param {Array<string>} requiredDependencies - Required dependency names
     * @throws {Error} If any required dependencies are missing
     */
    validateDependencies(requiredDependencies) {
        const missing = requiredDependencies.filter(dep => !this.dependencies[dep]);
        
        if (missing.length > 0) {
            throw new Error(`${this.name} missing required dependencies: ${missing.join(', ')}`);
        }
    }

    /**
     * Execute an operation with error handling and logging
     * @param {string} operationName - Name of the operation
     * @param {Function} operation - Operation function to execute
     * @param {Object} context - Operation context for logging
     * @returns {Promise<Object>} Operation result
     */
    async executeOperation(operationName, operation) {
        try {
            const result = await operation();
            return result;
        } catch (error) {
            this.error(`${operationName} failed`, error);
            throw new Error(`${operationName} failed: ${error.message}`);
        }
    }

    /**
     * Create a standardized service result
     * @param {boolean} success - Whether operation was successful
     * @param {Object} data - Result data
     * @param {string} message - Result message
     * @param {Array} errors - Any errors that occurred
     * @returns {Object} Standardized result object
     */
    createResult(success, data = null, message = '', errors = []) {
        return {
            success,
            data,
            message,
            errors,
            timestamp: new Date().toISOString(),
            service: this.name
        };
    }

    /**
     * Create a success result
     * @param {Object} data - Result data
     * @param {string} message - Success message
     * @returns {Object} Success result
     */
    createSuccess(data = null, message = 'Operation completed successfully') {
        return this.createResult(true, data, message);
    }

    /**
     * Create an error result
     * @param {string} message - Error message
     * @param {Array} errors - Error details
     * @param {Object} data - Additional data
     * @returns {Object} Error result
     */
    createError(message, errors = [], data = null) {
        return this.createResult(false, data, message, errors);
    }

    /**
     * Validate input parameters
     * @param {Object} input - Input parameters
     * @param {Array<string>} required - Required parameter names
     * @param {Object} schema - Optional parameter schema for validation
     * @throws {Error} If validation fails
     */
    validateInput(input, required = [], schema = {}) {
        // Check required fields
        const missing = required.filter(field => {
            const value = input[field];
            return value === undefined || value === null || value === '';
        });

        if (missing.length > 0) {
            throw new Error(`Missing required parameters: ${missing.join(', ')}`);
        }

        // Basic schema validation
        for (const [field, type] of Object.entries(schema)) {
            if (input[field] !== undefined) {
                const actualType = typeof input[field];
                if (actualType !== type) {
                    throw new Error(`Parameter '${field}' must be of type ${type}, got ${actualType}`);
                }
            }
        }
    }

    /**
     * Sleep for specified milliseconds (for retry logic)
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise} Promise that resolves after delay
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Retry an operation with exponential backoff
     * @param {Function} operation - Operation to retry
     * @param {number} maxRetries - Maximum number of retries
     * @param {number} baseDelay - Base delay in milliseconds
     * @returns {Promise} Operation result
     */
    async retry(operation, maxRetries = 3, baseDelay = 1000) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                
                if (attempt === maxRetries) {
                    break;
                }
                
                const delay = baseDelay * Math.pow(2, attempt - 1);
                this.warn(`Operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms`, {
                    error: error.message,
                    attempt,
                    maxRetries
                });
                
                await this.sleep(delay);
            }
        }
        
        throw lastError;
    }
}

module.exports = { BaseService };
