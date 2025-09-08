/**
 * CORS Middleware
 * Handles Cross-Origin Resource Sharing headers
 */
class CorsMiddleware {
    constructor(options = {}) {
        this.allowedOrigins = options.allowedOrigins || ['*'];
        this.allowedMethods = options.allowedMethods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
        this.allowedHeaders = options.allowedHeaders || [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'Accept',
            'Origin'
        ];
        this.exposedHeaders = options.exposedHeaders || [];
        this.credentials = options.credentials || false;
        this.maxAge = options.maxAge || 86400; // 24 hours
        this.optionsSuccessStatus = options.optionsSuccessStatus || 204;
    }

    /**
     * Handle CORS headers
     * @param {IncomingMessage} req - HTTP request
     * @param {ServerResponse} res - HTTP response
     * @param {Function} next - Next middleware function
     */
    async handle(req, res, next) {
        const origin = req.headers.origin;
        
        // Set Access-Control-Allow-Origin
        if (this.isOriginAllowed(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin || '*');
        } else if (this.allowedOrigins.includes('*')) {
            res.setHeader('Access-Control-Allow-Origin', '*');
        }

        // Always set basic CORS headers for all requests
        res.setHeader('Access-Control-Allow-Methods', this.allowedMethods.join(', '));
        res.setHeader('Access-Control-Allow-Headers', this.allowedHeaders.join(', '));

        // Set credentials header
        if (this.credentials) {
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }

        // Set exposed headers
        if (this.exposedHeaders.length > 0) {
            res.setHeader('Access-Control-Expose-Headers', this.exposedHeaders.join(', '));
        }

        // Handle preflight requests
        if (req.method === 'OPTIONS') {
            await this.handlePreflight(req, res);
            return; // Don't call next() for OPTIONS
        }

        next();
    }

    /**
     * Handle preflight OPTIONS requests
     * @param {IncomingMessage} req - HTTP request
     * @param {ServerResponse} res - HTTP response
     */
    async handlePreflight(req, res) {
        // Set allowed methods
        res.setHeader('Access-Control-Allow-Methods', this.allowedMethods.join(', '));

        // Set allowed headers
        const requestedHeaders = req.headers['access-control-request-headers'];
        if (requestedHeaders) {
            const headers = requestedHeaders.split(',').map(h => h.trim());
            const allowedRequestHeaders = headers.filter(header => 
                this.isHeaderAllowed(header)
            );
            
            if (allowedRequestHeaders.length > 0) {
                res.setHeader('Access-Control-Allow-Headers', allowedRequestHeaders.join(', '));
            }
        } else {
            res.setHeader('Access-Control-Allow-Headers', this.allowedHeaders.join(', '));
        }

        // Set max age for preflight cache
        res.setHeader('Access-Control-Max-Age', this.maxAge.toString());

        // Send successful preflight response
        res.writeHead(this.optionsSuccessStatus);
        res.end();
    }

    /**
     * Check if origin is allowed
     * @param {string} origin - Request origin
     * @returns {boolean} True if origin is allowed
     */
    isOriginAllowed(origin) {
        if (!origin) {
            return true; // Allow same-origin requests
        }

        if (this.allowedOrigins.includes('*')) {
            return true;
        }

        return this.allowedOrigins.some(allowedOrigin => {
            if (allowedOrigin === origin) {
                return true;
            }

            // Support wildcard subdomains (e.g., "*.example.com")
            if (allowedOrigin.startsWith('*.')) {
                const domain = allowedOrigin.substring(2);
                return origin.endsWith('.' + domain) || origin === domain;
            }

            return false;
        });
    }

    /**
     * Check if header is allowed
     * @param {string} header - Header name
     * @returns {boolean} True if header is allowed
     */
    isHeaderAllowed(header) {
        const normalizedHeader = header.toLowerCase();
        
        return this.allowedHeaders.some(allowedHeader => 
            allowedHeader.toLowerCase() === normalizedHeader
        );
    }

    /**
     * Create CORS middleware with default web app settings
     * @returns {CorsMiddleware} CORS middleware instance
     */
    static createWebAppCors() {
        return new CorsMiddleware({
            allowedOrigins: ['*'], // Allow all origins for development
            allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: [
                'Content-Type',
                'Authorization',
                'X-Requested-With',
                'Accept',
                'Origin',
                'X-CSRF-Token'
            ],
            credentials: false,
            maxAge: 86400
        });
    }

    /**
     * Create CORS middleware with strict settings
     * @param {string[]} allowedOrigins - Allowed origins
     * @returns {CorsMiddleware} CORS middleware instance
     */
    static createStrictCors(allowedOrigins) {
        return new CorsMiddleware({
            allowedOrigins,
            allowedMethods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            credentials: true,
            maxAge: 3600 // 1 hour
        });
    }
}

module.exports = { CorsMiddleware };
