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
        this.wizardFile = dependencies.wizardFile || 'wizard-ui.html';
    }

    /**
     * Serve the wizard UI
     * GET /wizard
     */
    async serveWizard(req, res) {
        this.log('serveWizard', { method: req.method, url: req.url });

        try {
            const wizardPath = path.join(this.staticFilesPath, this.wizardFile);
            
            // Check if file exists
            if (!fs.existsSync(wizardPath)) {
                return this.sendError(res, 404, 'Wizard UI file not found', {
                    filePath: wizardPath
                });
            }

            // Read and serve the file
            const content = fs.readFileSync(wizardPath, 'utf8');
            
            res.writeHead(200, { 
                'Content-Type': 'text/html',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(content);

        } catch (error) {
            this.sendInternalError(res, 'Failed to serve wizard UI', error);
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
                // Return empty response for missing favicon
                res.writeHead(204);
                res.end();
            }
        } catch (error) {
            res.writeHead(204);
            res.end();
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
            const wizardPath = path.join(this.staticFilesPath, this.wizardFile);
            const wizardExists = fs.existsSync(wizardPath);
            
            const health = {
                status: wizardExists ? 'healthy' : 'unhealthy',
                wizardFile: {
                    path: wizardPath,
                    exists: wizardExists,
                    readable: false,
                    size: 0
                },
                staticFilesPath: {
                    path: this.staticFilesPath,
                    exists: fs.existsSync(this.staticFilesPath),
                    readable: false
                }
            };

            // Check wizard file details
            if (wizardExists) {
                try {
                    const stats = fs.statSync(wizardPath);
                    health.wizardFile.readable = true;
                    health.wizardFile.size = stats.size;
                    health.wizardFile.lastModified = stats.mtime.toISOString();
                } catch (error) {
                    health.wizardFile.error = error.message;
                }
            }

            // Check static files directory
            if (health.staticFilesPath.exists) {
                try {
                    fs.accessSync(this.staticFilesPath, fs.constants.R_OK);
                    health.staticFilesPath.readable = true;
                } catch (error) {
                    health.staticFilesPath.error = error.message;
                }
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
