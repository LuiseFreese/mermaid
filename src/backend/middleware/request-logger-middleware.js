/**
 * Request Logger Middleware
 * Logs all incoming requests and responses with timing and metadata
 */
class RequestLoggerMiddleware {
    constructor(dependencies = {}) {
        this.logger = dependencies.logger || console;
        this.includeBody = dependencies.includeBody || false;
        this.maxBodySize = dependencies.maxBodySize || 1024; // 1KB default
    }

    /**
     * Handle request logging
     * @param {IncomingMessage} req - HTTP request
     * @param {ServerResponse} res - HTTP response
     * @param {Function} next - Next middleware function
     */
    async handle(req, res, next) {
        const start = Date.now();
        const requestId = this.generateRequestId();
        
        // Add request ID to request object
        req.requestId = requestId;

        // Log request start (concise for status polls, detailed for others)
        const isStatusPoll = req.url.includes('/status') || req.url.includes('/rollback/');
        
        if (isStatusPoll) {
            // Minimal logging for frequent status checks
            this.logger.log(`[${requestId}] ${req.method} ${req.url}`);
        } else {
            // Simplified logging for other requests
            this.logger.log(`[${requestId}] REQUEST START: ${req.method} ${req.url}`);
        }

        // Capture response details
        const originalEnd = res.end;
        const middlewareLogger = this.logger; // Capture logger reference

        res.end = function(chunk, encoding) {

            const duration = Date.now() - start;
            
            if (isStatusPoll) {
                // Minimal logging for status polls
                middlewareLogger.log(`[${requestId}] ${res.statusCode} (${duration}ms)`);
            } else {
                // Simplified logging for other requests
                middlewareLogger.log(`[${requestId}] REQUEST END: ${res.statusCode} (${duration}ms)`);
            }
            
            originalEnd.call(res, chunk, encoding);
        };

        // Always read body for POST/PUT/PATCH - required for req.rawBody
        // Log it only if includeBody is enabled
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            try {
                await this.readRequestBody(req, requestId);
                next();
            } catch (error) {
                middlewareLogger.error(`[${requestId}] Failed to read request body:`, error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to read request body' }));
            }
        } else {
            next();
        }
    }

    /**
     * Read request body and store in req.rawBody
     * @param {IncomingMessage} req - HTTP request
     * @param {string} requestId - Request ID
     */
    async readRequestBody(req, requestId) {
        return new Promise((resolve, reject) => {
            let body = '';
            
            req.on('data', (chunk) => {
                try {
                    body += chunk.toString();
                    if (body.length > this.maxBodySize) {
                        body = body.substring(0, this.maxBodySize) + '... [TRUNCATED]';
                    }
                } catch (error) {
                    this.logger.error(`[${requestId}] Error reading chunk:`, error);
                    reject(error);
                }
            });

            req.on('end', () => {
                // Store the body on the request object for later use
                req.rawBody = body;
                
                // Only log if includeBody is enabled
                if (this.includeBody && body) {
                    this.logger.log(`[${requestId}] REQUEST BODY:`, {
                        requestId,
                        body: body,
                        truncated: body.includes('[TRUNCATED]')
                    });
                }
                resolve();
            });

            req.on('error', (error) => {
                this.logger.error(`[${requestId}] Failed to read request body:`, error);
                reject(error);
            });
        });
    }

    /**
     * Sanitize headers for logging
     * @param {Object} headers - Request headers
     * @returns {Object} Sanitized headers
     */
    sanitizeHeaders(headers) {
        const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
        const sanitized = {};

        for (const [key, value] of Object.entries(headers)) {
            if (sensitiveHeaders.includes(key.toLowerCase())) {
                sanitized[key] = '[REDACTED]';
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    }

    /**
     * Generate unique request ID
     * @returns {string} Request ID
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

module.exports = { RequestLoggerMiddleware };
