/* eslint-env jest */

describe('Page Content Inspection', () => {
  test('should inspect what content is available on the page', async () => {
    try {
      const port = global.__FRONTEND_PORT__ || '3002';
      console.log(`🔍 Connecting to http://localhost:${port}`);
      
      await global.page.goto(`http://localhost:${port}`, { waitUntil: 'networkidle0', timeout: 30000 });
      console.log('✅ Connected to frontend');
      
      const title = await global.page.title();
      console.log('📄 Page title:', title);
      
      // Get the page's HTML content to see what's there
      const bodyHTML = await global.page.evaluate(() => document.body.innerHTML);
      console.log('📝 Body HTML length:', bodyHTML.length);
      
      // Check for specific elements
      const elements = await global.page.evaluate(() => {
        const results = {
          hasWizardContainer: !!document.querySelector('[data-testid="wizard-container"]'),
          hasWizardApp: !!document.querySelector('#wizard-app'),
          hasRoot: !!document.querySelector('#root'),
          hasApp: !!document.querySelector('.App'),
          allDataTestIds: Array.from(document.querySelectorAll('[data-testid]')).map(el => el.getAttribute('data-testid')),
          mainElementIds: Array.from(document.querySelectorAll('[id]')).map(el => el.id),
          mainElementClasses: Array.from(document.querySelectorAll('[class]')).slice(0, 10).map(el => el.className),
        };
        return results;
      });
      
      console.log('🔍 Element inspection results:', JSON.stringify(elements, null, 2));
      
      // Take a screenshot
      await global.page.screenshot({ path: 'tests/e2e/page-inspection.png', fullPage: true });
      console.log('📸 Inspection screenshot saved');
      
    } catch (error) {
      console.error('❌ Inspection failed:', error.message);
      throw error;
    }
  });
});
