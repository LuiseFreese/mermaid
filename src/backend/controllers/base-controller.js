/**
 * Base Controller Class
 * Provides common HTTP handling functionality for all controllers
 */
class BaseController {
    constructor() {
        this.name = this.constructor.name;
    }

    /**
     * Send JSON response
     * @param {Object} res - HTTP response object
     * @param {number} statusCode - HTTP status code
     * @param {Object} data - Response data
     */
    sendJson(res, statusCode, data) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }

    /**
     * Send success response
     * @param {Object} res - HTTP response object
     * @param {Object} data - Response data
     */
    sendSuccess(res, data) {
        this.sendJson(res, 200, { success: true, ...data });
    }

    /**
     * Send error response
     * @param {Object} res - HTTP response object
     * @param {number} statusCode - HTTP status code
     * @param {string} message - Error message
     * @param {Object} details - Additional error details
     */
    sendError(res, statusCode, message, details = {}) {
        console.error(`❌ ${this.name} Error:`, message, details);
        this.sendJson(res, statusCode, { 
            success: false, 
            error: message, 
            ...details 
        });
    }

    /**
     * Send bad request error
     * @param {Object} res - HTTP response object
     * @param {string} message - Error message
     */
    sendBadRequest(res, message) {
        this.sendError(res, 400, message);
    }

    /**
     * Send internal server error
     * @param {Object} res - HTTP response object
     * @param {string} message - Error message
     * @param {Error} error - Original error object
     */
    sendInternalError(res, message, error = null) {
        const details = error ? { originalError: error.message } : {};
        this.sendError(res, 500, message, details);
    }

    /**
     * Parse request body as JSON
     * @param {Object} req - HTTP request object
     * @returns {Promise<Object>} Parsed JSON data
     */
    parseRequestBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = body ? JSON.parse(body) : {};
                    resolve(data);
                } catch (error) {
                    reject(new Error('Invalid JSON in request body'));
                }
            });
            req.on('error', reject);
        });
    }

    /**
     * Setup streaming response for progress updates
     * @param {Object} res - HTTP response object
     * @returns {Object} Streaming utilities
     */
    setupStreaming(res) {
        res.writeHead(200, { 
            'Content-Type': 'application/json', 
            'Transfer-Encoding': 'chunked' 
        });

        return {
            sendProgress: (step, message, details = {}) => {
                const progressData = JSON.stringify({
                    type: 'progress',
                    step,
                    message,
                    timestamp: new Date().toISOString(),
                    ...details
                }) + '\n';
                res.write(progressData);
            },

            sendLog: (message) => {
                const logData = JSON.stringify({
                    type: 'log',
                    message,
                    timestamp: new Date().toISOString()
                }) + '\n';
                res.write(logData);
            },

            sendFinal: (data) => {
                const finalData = JSON.stringify({
                    type: 'final',
                    data,
                    timestamp: new Date().toISOString()
                }) + '\n';
                res.write(finalData);
                res.end();
            }
        };
    }

    /**
     * Validate required fields in request data
     * @param {Object} data - Request data
     * @param {Array<string>} requiredFields - Required field names
     * @throws {Error} If any required fields are missing
     */
    validateRequiredFields(data, requiredFields) {
        const missing = requiredFields.filter(field => {
            const value = data[field];
            return value === undefined || value === null || value === '';
        });

        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }
    }

    /**
     * Log controller action
     * @param {string} action - Action being performed
     * @param {Object} details - Additional details
     */
    log(action, details = {}) {
        console.log(`📋 ${this.name}.${action}`, details);
    }

    /**
     * Async error wrapper for route handlers
     * @param {Function} handler - Route handler function
     * @returns {Function} Wrapped handler with error catching
     */
    asyncHandler(handler) {
        return async (req, res) => {
            try {
                await handler.call(this, req, res);
            } catch (error) {
                console.error(`❌ Unhandled error in ${this.name}:`, error);
                if (!res.headersSent) {
                    this.sendInternalError(res, 'An unexpected error occurred', error);
                }
            }
        };
    }
}

module.exports = { BaseController };
