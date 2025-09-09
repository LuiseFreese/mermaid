/* eslint-env jest */

describe('Basic E2E Connection Test', () => {
  test('should be able to connect to the frontend server', async () => {
    const port = global.__FRONTEND_PORT__ || '3002';
    console.log(`🔍 Testing connection to http://localhost:${port}`);
    
    try {
      await global.page.goto(`http://localhost:${port}`, { waitUntil: 'networkidle0', timeout: 30000 });
      console.log('✅ Successfully connected to frontend');
      
      const title = await global.page.title();
      console.log('📄 Page title:', title);
      
      // Take a screenshot for debugging
      await global.page.screenshot({ path: 'tests/e2e/debug-screenshot.png', fullPage: true });
      console.log('📸 Screenshot saved');
      
    } catch (error) {
      console.error('❌ Connection failed:', error.message);
      throw error;
    }
  });
});
