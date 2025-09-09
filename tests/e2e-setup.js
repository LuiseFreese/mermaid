/**
 * E2E Test Setup for Jest-Puppeteer
 * Configures global test helpers and server startup
 */

const { spawn } = require('child_process');
const path = require('path');

// Configure environment
process.env.NODE_ENV = 'test';
process.env.PORT = '3002'; // Fixed port for E2E tests
process.env.LOG_LEVEL = 'error';

// Configure test timeout for E2E tests
jest.setTimeout(120000);

// Global server instance
let serverProcess = null;

// Helper functions for E2E tests
global.testHelpers = {
  async navigateToWizard() {
    const port = process.env.PORT || '3002';
    
    try {
      console.log(`🔍 Navigating to http://localhost:${port}/wizard`);
      await global.page.goto(`http://localhost:${port}/wizard`, { 
        waitUntil: 'networkidle0', 
        timeout: 30000 
      });
      console.log('✅ Successfully navigated to wizard');
    } catch (error) {
      console.error('❌ Navigation failed:', error.message);
      throw error;
    }
  },

  async startServer() {
    if (serverProcess) {
      console.log('Server already running');
      return;
    }

    return new Promise((resolve, reject) => {
      console.log('🚀 Starting test server...');
      
      serverProcess = spawn('node', ['src/backend/server.js'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let started = false;
      const timeout = setTimeout(() => {
        if (!started) {
          reject(new Error('Server startup timeout'));
        }
      }, 30000);

      serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('Server:', output.trim());
        
        if (output.includes('Server running') || output.includes('listening on port')) {
          if (!started) {
            started = true;
            clearTimeout(timeout);
            console.log('✅ Test server started successfully');
            resolve();
          }
        }
      });

      serverProcess.stderr.on('data', (data) => {
        console.error('Server Error:', data.toString().trim());
      });

      serverProcess.on('error', (error) => {
        console.error('❌ Failed to start server:', error);
        if (!started) {
          started = true;
          clearTimeout(timeout);
          reject(error);
        }
      });

      serverProcess.on('exit', (code) => {
        console.log(`Server process exited with code ${code}`);
        serverProcess = null;
      });
    });
  },

  async stopServer() {
    if (serverProcess) {
      console.log('🛑 Stopping test server...');
      serverProcess.kill('SIGTERM');
      
      // Wait for graceful shutdown
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (serverProcess) {
            serverProcess.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        if (serverProcess) {
          serverProcess.on('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        } else {
          clearTimeout(timeout);
          resolve();
        }
      });
      
      serverProcess = null;
      console.log('✅ Test server stopped');
    }
  }
};

// Start server before all tests
beforeAll(async () => {
  await global.testHelpers.startServer();
  
  // Wait a bit for server to fully initialize
  await new Promise(resolve => setTimeout(resolve, 2000));
});

// Stop server after all tests
afterAll(async () => {
  await global.testHelpers.stopServer();
});

// Suppress console output during tests unless debugging
if (!process.env.DEBUG_TESTS) {
  const originalLog = console.log;
  const originalError = console.error;
  
  global.console = {
    ...console,
    log: (...args) => {
      // Only show our test messages and server messages
      const message = args.join(' ');
      if (message.includes('🔍') || message.includes('✅') || message.includes('❌') || 
          message.includes('🚀') || message.includes('🛑') || message.includes('Server:')) {
        originalLog(...args);
      }
    },
    error: originalError, // Keep all errors visible
    debug: jest.fn(),
    info: jest.fn(),
    warn: console.warn
  };
}
