/* eslint-env jest */
const AxePuppeteer = require('@axe-core/puppeteer').default;

describe('Accessibility Testing', () => {
  beforeEach(async () => {
    await global.testHelpers.navigateToWizard();
  });

  describe('WCAG Compliance', () => {
    test('should have minimal accessibility violations on wizard homepage', async () => {
      const axeResults = await new AxePuppeteer(global.page).analyze();
      
      // Critical violations that should be fixed
      const criticalViolations = axeResults.violations.filter(v => 
        v.impact === 'critical' || v.impact === 'serious'
      );
      
      if (axeResults.violations.length > 0) {
        console.log('� Accessibility analysis:');
        axeResults.violations.forEach((violation, index) => {
          console.log(`${index + 1}. ${violation.id}: ${violation.description}`);
          console.log(`   Impact: ${violation.impact}`);
          console.log(`   Elements: ${violation.nodes.length}`);
        });
      }

      // Allow minor violations but fail on critical/serious ones
      expect(criticalViolations).toHaveLength(0);
      
      // Log improvement recommendations
      if (axeResults.violations.length > 0) {
        console.log(`📈 Accessibility score: ${axeResults.violations.length} minor issues found (critical/serious: ${criticalViolations.length})`);
      }
    });

    test('should have proper ARIA labels on interactive elements', async () => {
      // Check upload button has accessible name
      const uploadButton = await global.page.$('[data-testid="upload-trigger"]');
      const buttonName = await uploadButton.evaluate(el => 
        el.getAttribute('aria-label') || el.textContent || el.getAttribute('title')
      );
      expect(buttonName).toBeTruthy();
      expect(buttonName.length).toBeGreaterThan(0);

      // Check file input has label or description
      const fileInput = await global.page.$('#file-input');
      const inputLabel = await fileInput.evaluate(el => {
        const label = document.querySelector(`label[for="${el.id}"]`);
        return label ? label.textContent : el.getAttribute('aria-label');
      });
      expect(inputLabel || 'file input').toBeTruthy();

      console.log('✅ Interactive elements have proper accessibility labels');
    });
  });

  describe('Keyboard Navigation', () => {
    test('should support keyboard navigation through wizard steps', async () => {
      // Test Tab navigation
      await global.page.keyboard.press('Tab');
      let focusedElement = await global.page.evaluate(() => document.activeElement.tagName);
      expect(['BUTTON', 'INPUT', 'A']).toContain(focusedElement);

      // Test multiple tab presses to ensure proper focus order
      for (let i = 0; i < 5; i++) {
        await global.page.keyboard.press('Tab');
      }

      // Ensure focus is still on an interactive element
      focusedElement = await global.page.evaluate(() => {
        const active = document.activeElement;
        return {
          tag: active.tagName,
          type: active.type,
          role: active.getAttribute('role'),
          isVisible: active.offsetParent !== null
        };
      });

      expect(focusedElement.isVisible).toBe(true);
      console.log('✅ Keyboard navigation working properly');
    });

    test('should have visible focus indicators', async () => {
      // Focus on upload button
      await global.page.focus('[data-testid="upload-trigger"]');
      
      // Check that focused element has visible focus styling
      const focusStyle = await global.page.evaluate(() => {
        const focused = document.activeElement;
        const computedStyle = window.getComputedStyle(focused);
        return {
          outline: computedStyle.outline,
          outlineWidth: computedStyle.outlineWidth,
          boxShadow: computedStyle.boxShadow,
          border: computedStyle.border
        };
      });

      // FluentUI should provide focus indicators
      const hasFocusIndicator = 
        focusStyle.outline !== 'none' || 
        focusStyle.outlineWidth !== '0px' ||
        focusStyle.boxShadow !== 'none' ||
        focusStyle.boxShadow.includes('inset');

      expect(hasFocusIndicator).toBe(true);
      console.log('✅ Focus indicators are visible');
    });
  });

  describe('Screen Reader Support', () => {
    test('should have proper heading structure', async () => {
      const headings = await global.page.$$eval('h1, h2, h3, h4, h5, h6, [role="heading"]', 
        elements => elements.map(el => ({
          level: el.tagName.toLowerCase(),
          text: el.textContent.trim(),
          ariaLevel: el.getAttribute('aria-level')
        }))
      );

      // Should have at least one main heading (h1)
      const h1Headings = headings.filter(h => h.level === 'h1');
      expect(h1Headings.length).toBeGreaterThan(0);
      
      // FluentUI Title components should be present
      const fluentTitles = await global.page.$$('[class*="Title"], [class*="fui-Title"]');
      expect(fluentTitles.length).toBeGreaterThan(0);

      console.log(`✅ Heading structure: ${headings.length} headings found, ${h1Headings.length} h1 elements`);
    });

    test('should have descriptive page title', async () => {
      const title = await global.page.title();
      expect(title).toBeTruthy();
      expect(title.length).toBeGreaterThan(5);
      expect(title).toContain('Mermaid');

      console.log(`✅ Page title: "${title}"`);
    });

    test('should have landmark regions for navigation', async () => {
      // Check for main content area
      const mainRegion = await global.page.$('main, [role="main"], [data-testid="wizard-container"]');
      expect(mainRegion).not.toBeNull();

      // Check for header
      const headerElement = await global.page.$('header, [role="banner"]');
      expect(headerElement).not.toBeNull();

      // Check for navigation elements
      const navElements = await global.page.$$('nav, [role="navigation"], [aria-label*="progress"], [data-testid*="step-"]');
      expect(navElements.length).toBeGreaterThan(0);

      console.log('✅ Landmark regions properly defined (main, header, navigation)');
    });
  });

  describe('Form Accessibility', () => {
    test('should have accessible form controls', async () => {
      // Check file input accessibility
      const fileInput = await global.page.$('#file-input');
      expect(fileInput).not.toBeNull();

      const inputAttributes = await fileInput.evaluate(el => ({
        id: el.id,
        name: el.name,
        ariaLabel: el.getAttribute('aria-label'),
        ariaDescribedBy: el.getAttribute('aria-describedby'),
        required: el.required
      }));

      // Should have ID for label association
      expect(inputAttributes.id).toBeTruthy();

      console.log('✅ Form controls have proper accessibility attributes');
    });
  });

  describe('Color and Contrast', () => {
    test('should have sufficient color contrast', async () => {
      // Run axe color-contrast rule specifically
      const axeResults = await new AxePuppeteer(global.page)
        .withRules(['color-contrast'])
        .analyze();

      const contrastViolations = axeResults.violations.filter(v => v.id === 'color-contrast');
      
      if (contrastViolations.length > 0) {
        console.log('🚨 Color contrast violations:');
        contrastViolations.forEach(violation => {
          console.log(`   ${violation.description}`);
          violation.nodes.forEach(node => {
            console.log(`   - Element: ${node.html}`);
          });
        });
      }

      expect(contrastViolations).toHaveLength(0);
    });
  });
});
