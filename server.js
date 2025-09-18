/**
 * Root server entry point for Azure App Service
 * Redirects to the actual server in src/backend/server.js
 */

// Change working directory to src for proper module resolution
process.chdir(__dirname + '/src');

// Start the actual server
require('./src/backend/server.js');