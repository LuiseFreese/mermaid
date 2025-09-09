/**
 * Wizard Controller
 * Handles HTTP requests for wizard UI and static file serving
 */
const { BaseController } = require('./base-controller');
const fs = require('fs');
const path = require('path');

class WizardController extends BaseController {
    constructor(dependencies = {}) {
        super();
        
        this.staticFilesPath = dependencies.staticFilesPath || path.join(__dirname, '../../');
        this.reactDistPath = path.join(__dirname, '../../frontend/dist');
    }

    /**
     * Serve the React app (New Frontend)
     * GET /wizard, /wizard/*
     */
    async serveReactApp(req, res) {
        this.log('serveReactApp', { method: req.method, url: req.url });

        try {
            const indexPath = path.join(this.reactDistPath, 'index.html');
            
            // Check if React build exists
            if (!fs.existsSync(indexPath)) {
                // Fallback to development message
                const devMessage = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Development Mode</title>
                        <style>
                            body { font-family: 'Segoe UI', sans-serif; margin: 40px; }
                            .dev-notice { padding: 20px; background: #f0f8ff; border: 1px solid #0078d4; border-radius: 8px; }
                        </style>
                    </head>
                    <body>
                        <div class="dev-notice">
                            <h2>🚧 Development Mode</h2>
                            <p>The React frontend is not built yet. To use the new React wizard:</p>
                            <ol>
                                <li>Run: <code>cd src/frontend && npm run build</code></li>
                                <li>Or start development mode: <code>cd src/frontend && npm run dev</code> (port 3000)</li>
                            </ol>
                        </div>
                    </body>
                    </html>
                `;
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(devMessage);
                return;
            }

            // Serve React app
            const content = fs.readFileSync(indexPath, 'utf8');
            res.writeHead(200, { 
                'Content-Type': 'text/html',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(content);

        } catch (error) {
            this.sendInternalError(res, 'Failed to serve React app', error);
        }
    }

    /**
     * Serve static files (JS, CSS, etc.)
     * GET /static/*
     */
    async serveStaticFile(req, res) {
        try {
            // Extract file path from URL
            const urlPath = req.url.replace(/^\/static\//, '');
            const filePath = path.join(this.staticFilesPath, urlPath);
            
            // Security check: prevent directory traversal
            const resolvedPath = path.resolve(filePath);
            const basePath = path.resolve(this.staticFilesPath);
            
            if (!resolvedPath.startsWith(basePath)) {
                return this.sendError(res, 403, 'Access denied');
            }

            // Check if file exists
            if (!fs.existsSync(resolvedPath)) {
                return this.sendError(res, 404, 'File not found');
            }

            // Get file stats
            const stats = fs.statSync(resolvedPath);
            if (!stats.isFile()) {
                return this.sendError(res, 403, 'Not a file');
            }

            // Determine content type
            const contentType = this.getContentType(path.extname(resolvedPath));
            
            // Set headers
            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Length': stats.size,
                'Cache-Control': 'public, max-age=3600' // 1 hour cache for static files
            });

            // Stream file
            const readStream = fs.createReadStream(resolvedPath);
            readStream.pipe(res);

        } catch (error) {
            this.sendInternalError(res, 'Failed to serve static file', error);
        }
    }

    /**
     * Serve React build assets
     * GET /assets/*
     */
    async serveReactAsset(req, res) {
        try {
            // Extract asset path from URL
            const assetPath = req.url.replace(/^\/assets\//, '');
            const filePath = path.join(this.reactDistPath, 'assets', assetPath);
            
            // Security check: prevent directory traversal
            const resolvedPath = path.resolve(filePath);
            const basePath = path.resolve(this.reactDistPath);
            
            if (!resolvedPath.startsWith(basePath)) {
                this.logError('serveReactAsset', 'Access denied', { resolvedPath, basePath });
                return this.sendError(res, 403, 'Access denied');
            }

            // Check if file exists
            if (!fs.existsSync(resolvedPath)) {
                this.logError('serveReactAsset', 'File not found', { filePath: resolvedPath });
                return this.sendError(res, 404, 'Asset not found');
            }

            // Get file stats
            const stats = fs.statSync(resolvedPath);
            if (!stats.isFile()) {
                this.logError('serveReactAsset', 'Not a file', { filePath: resolvedPath });
                return this.sendError(res, 403, 'Not a file');
            }

            // Determine content type
            const contentType = this.getContentType(path.extname(resolvedPath));
            
            // Set headers with longer cache for production assets
            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Length': stats.size,
                'Cache-Control': 'public, max-age=31536000', // 1 year cache for hashed assets
                'ETag': `"${stats.mtime.getTime()}-${stats.size}"`
            });

            // Stream file
            const readStream = fs.createReadStream(resolvedPath);
            readStream.pipe(res);

        } catch (error) {
            this.sendInternalError(res, 'Failed to serve React asset', error);
        }
    }

    /**
     * Redirect root to wizard
     * GET /
     */
    async redirectToWizard(req, res) {
        this.log('redirectToWizard', { method: req.method, url: req.url });
        
        res.writeHead(302, { 
            'Location': '/wizard',
            'Cache-Control': 'no-cache'
        });
        res.end();
    }

    /**
     * Serve favicon
     * GET /favicon.ico
     */
    async serveFavicon(req, res) {
        try {
            const faviconPath = path.join(this.staticFilesPath, 'favicon.ico');
            
            if (fs.existsSync(faviconPath)) {
                const content = fs.readFileSync(faviconPath);
                res.writeHead(200, { 
                    'Content-Type': 'image/x-icon',
                    'Cache-Control': 'public, max-age=86400' // 24 hours
                });
                res.end(content);
            } else {
                // Return 404 for missing favicon
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Favicon not found');
            }
        } catch (error) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Favicon not found');
        }
    }

    /**
     * Get content type for file extension
     * @param {string} ext - File extension
     * @returns {string} Content type
     */
    getContentType(ext) {
        const types = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.txt': 'text/plain',
            '.md': 'text/markdown'
        };

        return types[ext.toLowerCase()] || 'application/octet-stream';
    }

    /**
     * Get wizard health status
     * @returns {Promise<Object>} Health status
     */
    async getWizardHealth() {
        try {
            const health = {
                status: 'healthy',
                staticFilesPath: {
                    path: this.staticFilesPath,
                    exists: fs.existsSync(this.staticFilesPath),
                    readable: false
                }
            };

            // Check static files directory
            if (health.staticFilesPath.exists) {
                try {
                    fs.accessSync(this.staticFilesPath, fs.constants.R_OK);
                    health.staticFilesPath.readable = true;
                } catch (error) {
                    health.staticFilesPath.error = error.message;
                    health.status = 'unhealthy';
                }
            } else {
                health.status = 'unhealthy';
            }

            return health;
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }
}

module.exports = { WizardController };
