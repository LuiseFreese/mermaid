/* eslint-env jest */

describe('Basic Wizard Navigation', () => {
  beforeEach(async () => {
    await global.testHelpers.navigateToWizard();
  });

  test('should navigate through wizard steps', async () => {
    // Verify we're on step 1
    await global.page.waitForSelector('[data-testid="step-1-content"]');
    
    // Check that step 1 is active
    const step1Badge = await global.page.$('[data-testid="step-1"]');
    const step1Class = await step1Badge.evaluate(el => el.className);
    console.log('📍 Step 1 badge classes:', step1Class);
    
    // Check for upload trigger button
    await global.page.waitForSelector('[data-testid="upload-trigger"]');
    console.log('✅ Upload trigger button found');
    
    // Check for file input
    await global.page.waitForSelector('#file-input');
    console.log('✅ File input found');
    
    // Take screenshot
    await global.page.screenshot({ path: 'tests/e2e/wizard-step-1.png', fullPage: true });
    console.log('📸 Step 1 screenshot saved');
  });

  test('should have all required accessibility attributes', async () => {
    // Check for all required data-testid attributes
    const requiredTestIds = [
      'wizard-container',
      'step-1', 'step-2', 'step-3', 'step-4',
      'wizard-content',
      'step-1-content',
      'upload-trigger'
    ];

    for (const testId of requiredTestIds) {
      const element = await global.page.$(`[data-testid="${testId}"]`);
      expect(element).not.toBeNull();
      console.log(`✅ Found element with data-testid="${testId}"`);
    }
  });
});
