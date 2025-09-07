/**
 * Error Handler Middleware
 * Centralized error handling for HTTP requests
 */
class ErrorHandlerMiddleware {
    constructor(dependencies = {}) {
        this.logger = dependencies.logger || console;
        this.includeStack = dependencies.includeStack || false;
        this.environment = dependencies.environment || 'production';
    }

    /**
     * Handle errors and send appropriate response
     * @param {Error} error - Error object
     * @param {IncomingMessage} req - HTTP request
     * @param {ServerResponse} res - HTTP response
     */
    async handle(error, req, res) {
        const requestId = req.requestId || 'unknown';
        const timestamp = new Date().toISOString();

        // Log error details
        const errorLog = {
            requestId,
            timestamp,
            method: req.method,
            url: req.url,
            error: {
                message: error.message,
                name: error.name,
                code: error.code,
                statusCode: error.statusCode || 500
            }
        };

        // Include stack trace in development
        if (this.environment === 'development' || this.includeStack) {
            errorLog.error.stack = error.stack;
        }

        this.logger.error(`[${requestId}] ERROR: ${error.message}`, errorLog);

        // Don't send response if already sent
        if (res.headersSent) {
            this.logger.warn(`[${requestId}] Cannot send error response - headers already sent`);
            return;
        }

        // Determine status code
        let statusCode = 500;
        if (error.statusCode && typeof error.statusCode === 'number') {
            statusCode = error.statusCode;
        } else if (error.name === 'ValidationError') {
            statusCode = 400;
        } else if (error.name === 'UnauthorizedError') {
            statusCode = 401;
        } else if (error.name === 'ForbiddenError') {
            statusCode = 403;
        } else if (error.name === 'NotFoundError') {
            statusCode = 404;
        } else if (error.name === 'ConflictError') {
            statusCode = 409;
        } else if (error.name === 'TooManyRequestsError') {
            statusCode = 429;
        }

        // Prepare error response
        const errorResponse = {
            error: {
                message: this.getSafeErrorMessage(error, statusCode),
                code: error.code || 'INTERNAL_ERROR',
                requestId,
                timestamp
            }
        };

        // Include additional details in development
        if (this.environment === 'development') {
            errorResponse.error.details = {
                name: error.name,
                originalMessage: error.message
            };

            if (this.includeStack && error.stack) {
                errorResponse.error.stack = error.stack.split('\n');
            }
        }

        // Send error response
        try {
            res.writeHead(statusCode, {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            });
            res.end(JSON.stringify(errorResponse, null, 2));
        } catch (sendError) {
            this.logger.error(`[${requestId}] Failed to send error response:`, sendError);
            
            // Fallback response
            try {
                res.writeHead(500);
                res.end('Internal Server Error');
            } catch (fallbackError) {
                this.logger.error(`[${requestId}] Failed to send fallback error response:`, fallbackError);
            }
        }
    }

    /**
     * Get safe error message for client
     * @param {Error} error - Error object
     * @param {number} statusCode - HTTP status code
     * @returns {string} Safe error message
     */
    getSafeErrorMessage(error, statusCode) {
        // Return specific messages for client errors
        if (statusCode >= 400 && statusCode < 500) {
            return error.message || this.getDefaultErrorMessage(statusCode);
        }

        // Return generic message for server errors in production
        if (this.environment === 'production' && statusCode >= 500) {
            return 'An internal server error occurred';
        }

        // Return actual message in development
        return error.message || this.getDefaultErrorMessage(statusCode);
    }

    /**
     * Get default error message for status code
     * @param {number} statusCode - HTTP status code
     * @returns {string} Default error message
     */
    getDefaultErrorMessage(statusCode) {
        const messages = {
            400: 'Bad Request',
            401: 'Unauthorized',
            403: 'Forbidden',
            404: 'Not Found',
            409: 'Conflict',
            429: 'Too Many Requests',
            500: 'Internal Server Error',
            501: 'Not Implemented',
            502: 'Bad Gateway',
            503: 'Service Unavailable',
            504: 'Gateway Timeout'
        };

        return messages[statusCode] || 'Unknown Error';
    }

    /**
     * Create middleware wrapper for async routes
     * @param {Function} asyncFn - Async route handler
     * @returns {Function} Wrapped handler
     */
    wrapAsync(asyncFn) {
        return (req, res, next) => {
            Promise.resolve(asyncFn(req, res, next))
                .catch((error) => this.handle(error, req, res));
        };
    }

    /**
     * Handle 404 Not Found
     * @param {IncomingMessage} req - HTTP request
     * @param {ServerResponse} res - HTTP response
     */
    async handle404(req, res) {
        const requestId = req.requestId || 'unknown';
        
        this.logger.warn(`[${requestId}] 404 Not Found: ${req.method} ${req.url}`);

        if (res.headersSent) {
            return;
        }

        const errorResponse = {
            error: {
                message: 'Resource not found',
                code: 'NOT_FOUND',
                requestId,
                timestamp: new Date().toISOString(),
                path: req.url,
                method: req.method
            }
        };

        res.writeHead(404, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
        });
        res.end(JSON.stringify(errorResponse, null, 2));
    }
}

module.exports = { ErrorHandlerMiddleware };
