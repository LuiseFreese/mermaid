/**
 * Request Logger Middleware
 * Logs all in        res.end = function(chunk, encoding) {
            if (chunk) {
                responseSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
            }

            const duration = Date.now() - start;
            const responseLogData = {
                requestId,
                statusCode: res.statusCode,
                duration: `${duration}ms`,
                responseSize: `${responseSize} bytes`,
                contentType: res.getHeader('content-type')
            };

            this.logger.log(`[${requestId}] REQUEST END: ${res.statusCode} (${duration}ms)`, responseLogData);
            
            originalEnd.call(res, chunk, encoding);
        }.bind(this);ts
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

        // Log request start
        const logData = {
            requestId,
            timestamp: new Date().toISOString(),
            method: req.method,
            url: req.url,
            userAgent: req.headers['user-agent'],
            remoteAddress: req.connection?.remoteAddress || req.socket?.remoteAddress,
            headers: this.sanitizeHeaders(req.headers)
        };

        this.logger.log(`[${requestId}] REQUEST START: ${req.method} ${req.url}`, logData);

        // Capture response details
        const originalEnd = res.end;
        const originalWrite = res.write;
        let responseSize = 0;
        const middlewareLogger = this.logger; // Capture logger reference

        res.write = function(chunk, encoding) {
            if (chunk) {
                responseSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
            }
            originalWrite.call(this, chunk, encoding);
        };

        res.end = function(chunk, encoding) {
            if (chunk) {
                responseSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
            }

            const duration = Date.now() - start;
            const responseLogData = {
                requestId,
                statusCode: res.statusCode,
                duration: `${duration}ms`,
                responseSize: `${responseSize} bytes`,
                contentType: res.getHeader('content-type')
            };

            middlewareLogger.log(`[${requestId}] REQUEST END: ${res.statusCode} (${duration}ms)`, responseLogData);
            
            originalEnd.call(res, chunk, encoding);
        };

        // Log request body if enabled
        if (this.includeBody && req.method !== 'GET' && req.method !== 'HEAD') {
            await this.logRequestBody(req, requestId);
        }

        next();
    }

    /**
     * Log request body
     * @param {IncomingMessage} req - HTTP request
     * @param {string} requestId - Request ID
     */
    async logRequestBody(req, requestId) {
        try {
            let body = '';
            req.on('data', (chunk) => {
                body += chunk.toString();
                if (body.length > this.maxBodySize) {
                    body = body.substring(0, this.maxBodySize) + '... [TRUNCATED]';
                }
            });

            req.on('end', () => {
                if (body) {
                    this.logger.log(`[${requestId}] REQUEST BODY:`, {
                        requestId,
                        body: body,
                        truncated: body.includes('[TRUNCATED]')
                    });
                }
            });
        } catch (error) {
            this.logger.error(`[${requestId}] Failed to log request body:`, error);
        }
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
