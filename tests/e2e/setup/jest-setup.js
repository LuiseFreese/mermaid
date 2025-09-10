// Global test timeout
jest.setTimeout(120000);

// Set up a page for each test
beforeEach(async () => {
  global.page = await global.__BROWSER__.newPage();
  await global.page.setViewport({ width: 1280, height: 720 });
  
  // Set up page logging for debugging
  global.page.on('console', (msg) => {
    if (process.env.DEBUG_E2E) {
      console.log('🖥️ Browser console:', msg.text());
    }
  });
  
  global.page.on('pageerror', (error) => {
    console.error('❌ Page error:', error.message);
  });
});

// Clean up after each test
afterEach(async () => {
  if (global.page) {
    await global.page.close();
  }
});

// Helper functions for tests
global.testHelpers = {
  // Navigate to app
  async navigateToWizard() {
    const port = global.__FRONTEND_PORT__ || '3002';
    await global.page.goto(`http://localhost:${port}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await global.page.waitForSelector('[data-testid="wizard-container"]', { timeout: 15000 });
  },

  // Upload a test file
  async uploadTestFile(filename) {
    const testFilePath = require('path').resolve(__dirname, '../fixtures', filename);
    const fileInput = await global.page.$('input[type="file"]');
    await fileInput.uploadFile(testFilePath);
  },

  // Wait for loading to complete
  async waitForLoading() {
    await global.page.waitForFunction(
      () => !document.querySelector('[data-testid="loading-spinner"]'),
      { timeout: 30000 }
    );
  },

  // Take screenshot for debugging
  async screenshot(name) {
    if (process.env.DEBUG_E2E) {
      await global.page.screenshot({ 
        path: `tests/e2e/screenshots/${name}-${Date.now()}.png`,
        fullPage: true 
      });
    }
  },

  // Mock Dataverse API responses
  async mockDataverseAPI() {
    await global.page.setRequestInterception(true);
    
    global.page.on('request', (request) => {
      if (request.url().includes('/api/dataverse')) {
        // Mock successful responses
        request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: 'mocked' })
        });
      } else {
        request.continue();
      }
    });
  }
};
