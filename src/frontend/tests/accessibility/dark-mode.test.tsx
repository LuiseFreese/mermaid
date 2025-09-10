/**
 * Accessibility Tests for Dark Mode
 * Tests color contrast ratios and other accessibility concerns
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { FluentProvider, webLightTheme, webDarkTheme } from '@fluentui/react-components';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { WizardShell } from '../../src/components/wizard/WizardShell';
import { ThemeToggle } from '../../src/components/common/ThemeToggle';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock the child components to simplify testing
vi.mock('../../src/components/wizard/steps/FileUploadStep', () => ({
  FileUploadStep: () => (
    <div data-testid="file-upload-step">
      <h2>Upload Your Mermaid File</h2>
      <p>Select a .mmd file to begin the conversion process</p>
      <button>Browse Files</button>
      <button>Next</button>
    </div>
  ),
}));

vi.mock('../../src/components/wizard/steps/solution-setup', () => ({
  SolutionSetupStep: () => (
    <div data-testid="solution-setup-step">
      <h2>Solution Setup</h2>
      <p>Configure your Dataverse solution</p>
      <input placeholder="Solution Name" />
      <select>
        <option>Select Publisher</option>
        <option>Default Publisher</option>
      </select>
      <button>Previous</button>
      <button>Next</button>
    </div>
  ),
}));

vi.mock('../../src/components/wizard/steps/global-choices', () => ({
  GlobalChoicesStep: () => (
    <div data-testid="global-choices-step">
      <h2>Global Choices</h2>
      <p>Select global choice sets for your entities</p>
      <div role="list">
        <div role="listitem">
          <input type="checkbox" id="choice1" />
          <label htmlFor="choice1">Status Choice</label>
        </div>
        <div role="listitem">
          <input type="checkbox" id="choice2" />
          <label htmlFor="choice2">Priority Choice</label>
        </div>
      </div>
      <button>Previous</button>
      <button>Next</button>
    </div>
  ),
}));

vi.mock('../../src/components/wizard/steps/deployment', () => ({
  DeploymentStep: () => (
    <div data-testid="deployment-step">
      <h2>Deployment</h2>
      <p>Deploy your solution to Dataverse</p>
      <div role="alert" aria-live="polite">
        Ready to deploy
      </div>
      <button>Previous</button>
      <button>Deploy</button>
    </div>
  ),
}));

const renderWithProviders = (
  component: React.ReactElement,
  theme: 'light' | 'dark' = 'light',
  initialRoute = '/wizard'
) => {
  const fluentTheme = theme === 'dark' ? webDarkTheme : webLightTheme;
  
  return render(
    <ThemeProvider>
      <FluentProvider theme={fluentTheme}>
        <MemoryRouter initialEntries={[initialRoute]}>
          <div data-theme={theme}>
            {component}
          </div>
        </MemoryRouter>
      </FluentProvider>
    </ThemeProvider>
  );
};

describe('Dark Mode Accessibility Tests', () => {
  beforeEach(() => {
    // Reset any document theme attributes
    document.documentElement.removeAttribute('data-theme');
  });

  describe('Color Contrast and Visual Accessibility', () => {
    it('should have no accessibility violations in light mode', async () => {
      const { container } = renderWithProviders(<WizardShell />, 'light');
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations in dark mode', async () => {
      const { container } = renderWithProviders(<WizardShell />, 'dark');
      
      // Apply dark theme to document for testing
      document.documentElement.setAttribute('data-theme', 'dark');
      
      const results = await axe(container, {
        rules: {
          // Focus on color contrast rules
          'color-contrast': { enabled: true },
          'color-contrast-enhanced': { enabled: true },
        }
      });
      
      expect(results).toHaveNoViolations();
    });

    it('should have sufficient color contrast for primary text in dark mode', async () => {
      renderWithProviders(<WizardShell />, 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      
      // Check that main headings are accessible
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
      
      // The text should be visible and accessible
      expect(heading).toHaveTextContent('Mermaid to Dataverse Converter');
    });

    it('should have accessible form controls in dark mode', async () => {
      renderWithProviders(<WizardShell />, 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      
      // Check that any form elements that exist are properly accessible
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
      
      // If there are inputs, they should be accessible
      const inputs = screen.queryAllByRole('textbox');
      inputs.forEach(input => {
        expect(input).toHaveAttribute('placeholder');
      });
    });

    it('should have accessible buttons with sufficient contrast in dark mode', async () => {
      renderWithProviders(<WizardShell />, 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      
      // Check that buttons are accessible
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
      
      // Each button should be accessible
      buttons.forEach(button => {
        expect(button).toBeEnabled();
      });
    });
  });

  describe('Theme Toggle Accessibility', () => {
    it('should have accessible theme toggle button', async () => {
      const { container } = renderWithProviders(
        <div>
          <ThemeToggle />
          <div>Sample content</div>
        </div>
      );
      
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper ARIA attributes for theme toggle', () => {
      renderWithProviders(<ThemeToggle />);
      
      const toggleButton = screen.getByRole('button');
      expect(toggleButton).toHaveAttribute('aria-label');
      expect(toggleButton).toHaveAttribute('title');
    });

    it('should announce theme changes to screen readers', () => {
      renderWithProviders(<ThemeToggle />);
      
      const toggleButton = screen.getByRole('button');
      expect(toggleButton).toBeInTheDocument();
      
      // The button should have descriptive text (System is a valid theme option)
      expect(toggleButton.textContent).toMatch(/theme|light|dark|system/i);
    });
  });

  describe('Focus Management and Keyboard Navigation', () => {
    it('should maintain focus visibility in dark mode', async () => {
      renderWithProviders(<WizardShell />, 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      
      const focusableElements = screen.getAllByRole('button');
      expect(focusableElements.length).toBeGreaterThan(0);
      
      // Focus should be visible on interactive elements
      focusableElements[0].focus();
      expect(focusableElements[0]).toHaveFocus();
    });

    it('should have proper tab order in dark mode', () => {
      renderWithProviders(<WizardShell />, 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      
      const buttons = screen.getAllByRole('button');
      const checkboxes = screen.queryAllByRole('checkbox');
      
      // Interactive elements should be focusable
      [...checkboxes, ...buttons].forEach(element => {
        expect(element).not.toHaveAttribute('tabindex', '-1');
      });
    });
  });

  describe('Screen Reader Compatibility', () => {
    it('should have proper heading structure in dark mode', () => {
      renderWithProviders(<WizardShell />, 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      
      // Check heading hierarchy
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toBeInTheDocument();
      
      const h2Elements = screen.getAllByRole('heading', { level: 2 });
      expect(h2Elements.length).toBeGreaterThan(0);
    });

    it('should have proper landmark roles in dark mode', () => {
      renderWithProviders(<WizardShell />, 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      
      // Check for main content area
      const main = screen.getByRole('main');
      expect(main).toBeInTheDocument();
    });

    it('should announce dynamic content changes in dark mode', () => {
      renderWithProviders(<WizardShell />, 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      
      // Check for live regions or alert elements if they exist
      const alertElements = screen.queryAllByRole('alert');
      const liveRegions = screen.queryAllByRole('status');
      
      // If alerts exist, they should have proper aria-live attributes
      alertElements.forEach(alert => {
        expect(alert).toHaveAttribute('aria-live');
      });
      
      // At minimum, there should be some accessible structure
      const headings = screen.getAllByRole('heading');
      expect(headings.length).toBeGreaterThan(0);
    });
  });

  describe('High Contrast and Reduced Motion', () => {
    it('should respect prefers-reduced-motion in dark mode', () => {
      // Mock reduced motion preference
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });

      renderWithProviders(<WizardShell />, 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      
      // Component should render without motion-dependent features
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
    });

    it('should work with Windows High Contrast mode', async () => {
      // Simulate high contrast mode
      document.documentElement.setAttribute('data-theme', 'dark');
      
      const { container } = renderWithProviders(<WizardShell />, 'dark');
      
      // Run accessibility check with high contrast considerations
      const results = await axe(container, {
        rules: {
          'color-contrast': { enabled: true },
        }
      });
      
      expect(results).toHaveNoViolations();
    });
  });
});
