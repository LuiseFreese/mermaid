/* eslint-env jest */

describe('Wizard Workflow Tests', () => {
  beforeEach(async () => {
    await global.testHelpers.navigateToWizard();
  });

  describe('Step 1: ERD Upload & Interface', () => {
    test('should display file upload interface', async () => {
      // Verify step 1 is active
      await global.page.waitForSelector('[data-testid="step-1-content"]');
      
      // Check upload elements are present
      await global.page.waitForSelector('[data-testid="upload-trigger"]');
      await global.page.waitForSelector('#file-input');
      
      console.log('✅ File upload interface is ready');
    });

    test('should show upload button with correct text', async () => {
      const uploadButton = await global.page.$('[data-testid="upload-trigger"]');
      expect(uploadButton).not.toBeNull();
      
      const buttonText = await uploadButton.evaluate(el => el.textContent);
      expect(buttonText).toBe('Browse');
      
      console.log('✅ Upload button configured correctly');
    });
  });

  describe('Step Navigation', () => {
    test('should have all step badges present', async () => {
      const stepBadges = ['step-1', 'step-2', 'step-3', 'step-4'];
      
      for (const stepId of stepBadges) {
        const badge = await global.page.$(`[data-testid="${stepId}"]`);
        expect(badge).not.toBeNull();
        
        const badgeText = await badge.evaluate(el => el.textContent);
        const expectedStepNumber = stepId.split('-')[1];
        expect(badgeText).toBe(expectedStepNumber);
      }
      
      console.log('✅ All step navigation badges are present and correctly labeled');
    });

    test('should show current step as step 1', async () => {
      // Check that we're currently on step 1
      await global.page.waitForSelector('[data-testid="step-1-content"]');
      
      // Step 1 badge should be present and accessible
      const step1Badge = await global.page.$('[data-testid="step-1"]');
      expect(step1Badge).not.toBeNull();
      
      // Check that step 1 content is visible (this indicates we're on step 1)
      const stepContent = await global.page.$('[data-testid="step-1-content"]');
      const isVisible = await stepContent.evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      expect(isVisible).toBe(true);
      
      console.log('✅ Step 1 is correctly marked as active');
    });
  });

  describe('Page Structure', () => {
    test('should have proper wizard container structure', async () => {
      // Check main container
      const wizardContainer = await global.page.$('[data-testid="wizard-container"]');
      expect(wizardContainer).not.toBeNull();
      
      // Check content area
      const wizardContent = await global.page.$('[data-testid="wizard-content"]');
      expect(wizardContent).not.toBeNull();
      
      // Check step content
      const stepContent = await global.page.$('[data-testid="step-1-content"]');
      expect(stepContent).not.toBeNull();
      
      console.log('✅ Wizard structure is properly organized');
    });
  });
});

describe('Accessibility & Test Coverage', () => {
  test('should have all required data-testid attributes for e2e testing', async () => {
    await global.testHelpers.navigateToWizard();
    
    const requiredTestIds = [
      'wizard-container',
      'step-1', 'step-2', 'step-3', 'step-4',
      'wizard-content',
      'step-1-content',
      'upload-trigger'
    ];

    console.log('🔍 Checking for required test attributes...');
    for (const testId of requiredTestIds) {
      const element = await global.page.$(`[data-testid="${testId}"]`);
      expect(element).not.toBeNull();
      console.log(`  ✅ Found: [data-testid="${testId}"]`);
    }
    
    console.log('✅ All required test attributes are present for e2e automation');
  });

  test('should have semantic HTML structure', async () => {
    await global.testHelpers.navigateToWizard();
    
    // Check for FluentUI components that provide semantic structure
    const titleElements = await global.page.$$('[class*="Title"], [class*="fui-Title"]');
    expect(titleElements.length).toBeGreaterThan(0);
    
    const buttonElements = await global.page.$$('button, [role="button"]');
    expect(buttonElements.length).toBeGreaterThan(0);
    
    const inputElements = await global.page.$$('input, [role="textbox"]');
    expect(inputElements.length).toBeGreaterThan(0);
    
    console.log('✅ Page has proper semantic structure with FluentUI components');
  });
});
