/**
 * Response Streaming Middleware
 * Handles streaming of large responses and SSE (Server-Sent Events)
 */
class StreamingMiddleware {
    constructor(dependencies = {}) {
        this.logger = dependencies.logger || console;
        this.chunkSize = dependencies.chunkSize || 8192; // 8KB default
        this.compressionEnabled = dependencies.compressionEnabled || false;
    }

    /**
     * Stream JSON response in chunks
     * @param {ServerResponse} res - HTTP response
     * @param {Object} data - Data to stream
     * @param {Object} options - Streaming options
     */
    async streamJson(res, data, options = {}) {
        const requestId = res.req?.requestId || 'unknown';
        
        try {
            // Set streaming headers
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Transfer-Encoding': 'chunked',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            const jsonString = JSON.stringify(data, null, options.pretty ? 2 : 0);
            
            if (jsonString.length <= this.chunkSize) {
                // Small response - send all at once
                res.end(jsonString);
                return;
            }

            // Large response - stream in chunks
            this.logger.log(`[${requestId}] Streaming JSON response (${jsonString.length} bytes)`);
            
            for (let i = 0; i < jsonString.length; i += this.chunkSize) {
                const chunk = jsonString.slice(i, i + this.chunkSize);
                
                await new Promise((resolve, reject) => {
                    res.write(chunk, (error) => {
                        if (error) reject(error);
                        else resolve();
                    });
                });

                // Small delay to prevent overwhelming the client
                if (options.delay) {
                    await new Promise(resolve => setTimeout(resolve, options.delay));
                }
            }

            res.end();
            
        } catch (error) {
            this.logger.error(`[${requestId}] JSON streaming error:`, error);
            
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Streaming failed' }));
            }
        }
    }

    /**
     * Create Server-Sent Events stream
     * @param {ServerResponse} res - HTTP response
     * @param {Object} options - SSE options
     * @returns {Object} SSE controller
     */
    createEventStream(res, options = {}) {
        const requestId = res.req?.requestId || 'unknown';
        
        // Set SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        });

        // Send initial connection
        res.write('data: {"type":"connected","timestamp":"' + new Date().toISOString() + '"}\n\n');

        const controller = {
            /**
             * Send event to client
             * @param {string} type - Event type
             * @param {Object} data - Event data
             * @param {string} id - Optional event ID
             */
            sendEvent: (type, data, id = null) => {
                try {
                    const event = {
                        type,
                        data,
                        timestamp: new Date().toISOString()
                    };

                    if (id) {
                        res.write(`id: ${id}\n`);
                    }
                    
                    res.write(`event: ${type}\n`);
                    res.write(`data: ${JSON.stringify(event)}\n\n`);
                    
                } catch (error) {
                    this.logger.error(`[${requestId}] SSE send error:`, error);
                }
            },

            /**
             * Send progress update
             * @param {number} current - Current progress
             * @param {number} total - Total items
             * @param {string} message - Progress message
             */
            sendProgress: (current, total, message = '') => {
                controller.sendEvent('progress', {
                    current,
                    total,
                    percentage: total > 0 ? Math.round((current / total) * 100) : 0,
                    message
                });
            },

            /**
             * Send error event
             * @param {Error} error - Error object
             */
            sendError: (error) => {
                controller.sendEvent('error', {
                    message: error.message,
                    code: error.code || 'UNKNOWN_ERROR'
                });
            },

            /**
             * Send completion event
             * @param {Object} result - Final result
             */
            sendComplete: (result = {}) => {
                controller.sendEvent('complete', result);
            },

            /**
             * Close the stream
             */
            close: () => {
                try {
                    controller.sendEvent('close', { reason: 'Server closed stream' });
                    res.end();
                } catch (error) {
                    this.logger.error(`[${requestId}] SSE close error:`, error);
                }
            }
        };

        // Handle client disconnect
        res.on('close', () => {
            this.logger.log(`[${requestId}] SSE client disconnected`);
        });

        res.on('error', (error) => {
            this.logger.error(`[${requestId}] SSE stream error:`, error);
        });

        // Send keep-alive pings
        if (options.keepAlive !== false) {
            const pingInterval = setInterval(() => {
                try {
                    res.write(': ping\n\n');
                } catch (error) {
                    clearInterval(pingInterval);
                }
            }, options.pingInterval || 30000); // 30 seconds

            res.on('close', () => clearInterval(pingInterval));
        }

        this.logger.log(`[${requestId}] SSE stream created`);
        
        return controller;
    }

    /**
     * Stream file download
     * @param {ServerResponse} res - HTTP response
     * @param {string} filePath - Path to file
     * @param {Object} options - Download options
     */
    async streamFileDownload(res, filePath, options = {}) {
        const fs = require('fs');
        const path = require('path');
        const requestId = res.req?.requestId || 'unknown';

        try {
            const stats = fs.statSync(filePath);
            const fileName = options.fileName || path.basename(filePath);
            
            // Set download headers
            res.writeHead(200, {
                'Content-Type': options.contentType || 'application/octet-stream',
                'Content-Length': stats.size,
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Cache-Control': 'no-cache'
            });

            // Create read stream
            const readStream = fs.createReadStream(filePath, {
                highWaterMark: this.chunkSize
            });

            // Handle stream events
            readStream.on('error', (error) => {
                this.logger.error(`[${requestId}] File stream error:`, error);
                if (!res.headersSent) {
                    res.writeHead(500);
                    res.end('File streaming failed');
                }
            });

            readStream.on('end', () => {
                this.logger.log(`[${requestId}] File stream completed: ${fileName}`);
            });

            // Pipe file to response
            readStream.pipe(res);

        } catch (error) {
            this.logger.error(`[${requestId}] File download error:`, error);
            
            if (!res.headersSent) {
                res.writeHead(404);
                res.end('File not found');
            }
        }
    }

    /**
     * Check if response should be streamed
     * @param {*} data - Response data
     * @param {Object} options - Options
     * @returns {boolean} True if should stream
     */
    shouldStream(data, options = {}) {
        if (options.forceStream) {
            return true;
        }

        if (options.noStream) {
            return false;
        }

        // Stream large JSON responses
        if (typeof data === 'object') {
            const jsonString = JSON.stringify(data);
            return jsonString.length > this.chunkSize * 2;
        }

        return false;
    }
}

module.exports = { StreamingMiddleware };
