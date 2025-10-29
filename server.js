/**
 * Root server entry point for Azure App Service
 * Redirects to the actual server in backend/server.js
 */

// In Azure deployment: backend/ directory is at root level
// In local dev: backend is at src/backend/
const fs = require('fs');
const path = require('path');

// Detect deployment structure
const backendPath = fs.existsSync(path.join(__dirname, 'backend'))
  ? './backend/server.js'  // Azure deployment structure
  : './src/backend/server.js';  // Local dev structure

console.log(`🚀 Starting server from: ${backendPath}`);

// Start the actual server
require(backendPath);