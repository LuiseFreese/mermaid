/**
 * Base Repository Class
 * Provides common data access functionality and abstractions
 */
class BaseRepository {
    constructor(dependencies = {}) {
        this.name = this.constructor.name;
        this.dependencies = dependencies;
        this.logger = dependencies.logger || console;
    }

    /**
     * Log repository action
     * @param {string} action - Action being performed
     * @param {Object} details - Additional details
     */
    log(action, details = {}) {
        this.logger.log(`💾 ${this.name}.${action}`, details);
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
     * Execute a data operation with error handling and logging
     * @param {string} operationName - Name of the operation
     * @param {Function} operation - Operation function to execute
     * @param {Object} context - Operation context for logging
     * @returns {Promise<Object>} Operation result
     */
    async executeOperation(operationName, operation, context = {}) {
        const startTime = Date.now();
        this.log(operationName, { starting: true, ...context });

        try {
            const result = await operation();
            const duration = Date.now() - startTime;
            
            this.log(operationName, { 
                completed: true, 
                duration: `${duration}ms`,
                ...context 
            });
            
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            this.error(`${operationName} failed after ${duration}ms`, error);
            
            // Re-throw with additional context
            const enhancedError = new Error(`${this.name}.${operationName} failed: ${error.message}`);
            enhancedError.originalError = error;
            enhancedError.operation = operationName;
            enhancedError.context = context;
            
            throw enhancedError;
        }
    }

    /**
     * Create a standardized repository result
     * @param {boolean} success - Whether operation was successful
     * @param {Object} data - Result data
     * @param {string} message - Result message
     * @param {Object} metadata - Additional metadata
     * @returns {Object} Standardized result object
     */
    createResult(success, data = null, message = '', metadata = {}) {
        return {
            success,
            data,
            message,
            metadata: {
                timestamp: new Date().toISOString(),
                repository: this.name,
                ...metadata
            }
        };
    }

    /**
     * Create a success result
     * @param {Object} data - Result data
     * @param {string} message - Success message
     * @param {Object} metadata - Additional metadata
     * @returns {Object} Success result
     */
    createSuccess(data, message = 'Operation completed successfully', metadata = {}) {
        return this.createResult(true, data, message, metadata);
    }

    /**
     * Create an error result
     * @param {string} message - Error message
     * @param {Error} error - Original error
     * @param {Object} metadata - Additional metadata
     * @returns {Object} Error result
     */
    createError(message, error = null, metadata = {}) {
        const errorMetadata = {
            error: error?.message || error,
            ...metadata
        };
        return this.createResult(false, null, message, errorMetadata);
    }

    /**
     * Handle Dataverse API errors and create appropriate responses
     * @param {Error} error - API error
     * @param {string} operation - Operation that failed
     * @returns {Object} Error result object
     */
    handleApiError(error, operation) {
        let message = `${operation} failed`;
        let statusCode = 500;

        if (error.response) {
            // HTTP error response
            statusCode = error.response.status;
            const errorData = error.response.data;
            
            if (errorData?.error?.message) {
                message = errorData.error.message;
            } else if (typeof errorData === 'string') {
                message = errorData;
            }
        } else if (error.code === 'ECONNREFUSED') {
            message = 'Unable to connect to Dataverse service';
        } else if (error.code === 'ETIMEDOUT') {
            message = 'Request to Dataverse service timed out';
        }

        return this.createError(message, error, { statusCode, operation });
    }

    /**
     * Validate that the client is properly configured
     * @param {Object} client - Client instance to validate
     * @throws {Error} If client is not properly configured
     */
    validateClient(client) {
        if (!client) {
            throw new Error(`${this.name} client is not initialized`);
        }

        // Check for required configuration
        const requiredProperties = ['baseUrl', 'tenantId', 'clientId'];
        
        // Always use managed identity - require managed identity client ID
        requiredProperties.push('managedIdentityClientId');
        
        const missing = requiredProperties.filter(prop => !client[prop]);
        
        if (missing.length > 0) {
            throw new Error(`${this.name} client missing configuration: ${missing.join(', ')}`);
        }
    }

    /**
     * Execute operation with automatic retry for transient failures
     * @param {Function} operation - Operation to execute
     * @param {number} maxRetries - Maximum retry attempts
     * @param {number} baseDelay - Base delay between retries in ms
     * @returns {Promise} Operation result
     */
    async executeWithRetry(operation, maxRetries = 3, baseDelay = 1000) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                
                // Don't retry on certain error types
                if (this.isNonRetryableError(error)) {
                    break;
                }
                
                if (attempt === maxRetries) {
                    break;
                }
                
                const delay = baseDelay * Math.pow(2, attempt - 1);
                this.warn(`Operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms`, {
                    error: error.message
                });
                
                await this.sleep(delay);
            }
        }
        
        throw lastError;
    }

    /**
     * Check if error should not be retried
     * @param {Error} error - Error to check
     * @returns {boolean} True if error should not be retried
     */
    isNonRetryableError(error) {
        if (error.response) {
            const status = error.response.status;
            // Don't retry client errors (4xx) except 429 (rate limit)
            return status >= 400 && status < 500 && status !== 429;
        }
        return false;
    }

    /**
     * Sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise} Promise that resolves after delay
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = { BaseRepository };
