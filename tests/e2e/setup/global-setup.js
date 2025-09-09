const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');

module.exports = async function globalSetup() {
  console.log('🚀 Starting E2E test environment...');
  
  // Start the backend server
  const serverProcess = spawn('node', ['src/backend/server.js'], {
    cwd: path.resolve(__dirname, '../../..'),
    env: { 
      ...process.env, 
      NODE_ENV: 'test',
      PORT: '3001' // Use different port for testing
    },
    stdio: 'pipe'
  });

  // Wait for server to start
  await new Promise((resolve) => {
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('Backend output:', output);
      if (output.includes('Server running')) {
        console.log('✅ Backend server started on port 3001');
        resolve();
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      console.error('Backend error:', data.toString());
    });
    
    // Fallback timeout
    setTimeout(() => {
      console.log('⚠️ Backend server timeout - continuing anyway');
      resolve();
    }, 5000);
  });

  // Start the frontend dev server using PowerShell-compatible command
  const isWindows = process.platform === 'win32';
  const npmCommand = isWindows ? 'npm.cmd' : 'npm';
  
  const frontendProcess = spawn(npmCommand, ['run', 'dev:fast', '--', '--port', '3002', '--strictPort'], {
    cwd: path.resolve(__dirname, '../../../src/frontend'),
    env: { 
      ...process.env,
      PORT: '3002' // Use different port for testing
    },
    stdio: 'pipe',
    shell: isWindows
  });

  // Wait for frontend to start
  let frontendPort = null;
  await new Promise((resolve) => {
    frontendProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('Frontend output:', output);
      
      // Extract port from Vite output like "Local: http://localhost:3004/"
      const portMatch = output.match(/Local:\s*http:\/\/localhost:(\d+)/);
      if (portMatch) {
        frontendPort = portMatch[1];
        console.log(`✅ Frontend dev server started on port ${frontendPort}`);
        resolve();
      }
    });
    
    frontendProcess.stderr.on('data', (data) => {
      console.error('Frontend error:', data.toString());
    });
    
    // Fallback timeout
    setTimeout(() => {
      console.log('⚠️ Frontend server timeout - continuing anyway');
      frontendPort = '3002'; // fallback
      resolve();
    }, 15000);
  });

  // Store the port for tests to use
  global.__FRONTEND_PORT__ = frontendPort;

  // Launch browser
  const browser = await puppeteer.launch({
    headless: process.env.CI ? true : false, // Show browser in local development
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // Store references for cleanup
  global.__BROWSER__ = browser;
  global.__SERVER_PROCESS__ = serverProcess;
  global.__FRONTEND_PROCESS__ = frontendProcess;

  console.log('🎭 Browser launched for E2E tests');
};
