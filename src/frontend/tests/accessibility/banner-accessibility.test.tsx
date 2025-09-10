import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FluentProvider, teamsLightTheme, teamsDarkTheme } from '@fluentui/react-components';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { WizardShell } from '../../src/components/wizard/WizardShell';
import { axe, toHaveNoViolations } from 'jest-axe';
import { vi } from 'vitest';

expect.extend(toHaveNoViolations);

// Mock the wizard steps that aren't relevant for banner testing
vi.mock('../../src/components/wizard/steps/FileUploadStep', () => ({
  FileUploadStep: () => <div data-testid="file-upload-step">File Upload Step</div>
}));

vi.mock('../../src/components/wizard/steps/SolutionSetupStep', () => ({
  SolutionSetupStep: () => <div data-testid="solution-setup-step">Solution Setup Step</div>
}));

vi.mock('../../src/components/wizard/steps/global-choices', () => ({
  GlobalChoicesStep: () => <div data-testid="global-choices-step">Global Choices Step</div>
}));

vi.mock('../../src/components/wizard/steps/deployment', () => ({
  DeploymentStep: () => <div data-testid="deployment-step">Deployment Step</div>
}));

const renderWithProviders = (theme: 'light' | 'dark' = 'light') => {
  const fluentTheme = theme === 'dark' ? teamsDarkTheme : teamsLightTheme;
  
  return render(
    <MemoryRouter initialEntries={['/wizard']}>
      <FluentProvider theme={fluentTheme}>
        <ThemeProvider>
          <div data-theme={theme}>
            <WizardShell />
          </div>
        </ThemeProvider>
      </FluentProvider>
    </MemoryRouter>
  );
};

describe('Banner/Header Accessibility Tests', () => {
  describe('Semantic Structure', () => {
    it('should have proper banner role and heading hierarchy', () => {
      renderWithProviders('light');
      
      // Check banner role
      const banner = screen.getByRole('banner');
      expect(banner).toBeInTheDocument();
      
      // Check heading hierarchy
      const mainHeading = screen.getByRole('heading', { level: 1 });
      expect(mainHeading).toHaveTextContent('Mermaid to Dataverse Converter');
      
      const subHeading = screen.getByRole('heading', { level: 2 });
      expect(subHeading).toHaveTextContent('Conversion Process');
    });

    it('should have descriptive text for the application purpose', () => {
      renderWithProviders('light');
      
      const description = screen.getByText(/Transform your Mermaid ERD diagrams into Microsoft Dataverse solutions/i);
      expect(description).toBeInTheDocument();
    });
  });

  describe('Color Contrast and Theme Variables', () => {
    it('should use banner-specific CSS variables in light mode', () => {
      renderWithProviders('light');
      
      const banner = screen.getByRole('banner');
      const styles = window.getComputedStyle(banner);
      
      // Should use CSS variables for theming
      expect(banner).toHaveStyle({
        backgroundColor: 'var(--color-banner-background)',
        color: 'var(--color-banner-text)'
      });
    });

    it('should use banner-specific CSS variables in dark mode', () => {
      renderWithProviders('dark');
      
      const banner = screen.getByRole('banner');
      const mainHeading = screen.getByRole('heading', { level: 1 });
      
      // Should use CSS variables for theming
      expect(banner).toHaveStyle({
        backgroundColor: 'var(--color-banner-background)',
        color: 'var(--color-banner-text)'
      });
      
      expect(mainHeading).toHaveStyle({
        color: 'var(--color-banner-text)'
      });
    });

    it('should have sufficient color contrast for banner text', async () => {
      // Test both light and dark modes
      const { rerender } = renderWithProviders('light');
      
      let banner = screen.getByRole('banner');
      let results = await axe(banner);
      expect(results).toHaveNoViolations();
      
      // Test dark mode
      rerender(
        <MemoryRouter initialEntries={['/wizard']}>
          <FluentProvider theme={teamsDarkTheme}>
            <ThemeProvider>
              <div data-theme="dark">
                <WizardShell />
              </div>
            </ThemeProvider>
          </FluentProvider>
        </MemoryRouter>
      );
      
      banner = screen.getByRole('banner');
      results = await axe(banner);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Theme Toggle Integration', () => {
    it('should have accessible theme toggle button in banner', () => {
      renderWithProviders('light');
      
      const themeToggle = screen.getByLabelText(/change theme/i);
      expect(themeToggle).toBeInTheDocument();
      expect(themeToggle).toHaveAttribute('aria-label');
      expect(themeToggle).toHaveAttribute('title');
    });

    it('should maintain banner accessibility across theme changes', async () => {
      const { rerender } = renderWithProviders('light');
      
      // Test light mode
      let banner = screen.getByRole('banner');
      let results = await axe(banner);
      expect(results).toHaveNoViolations();
      
      // Switch to dark mode
      rerender(
        <MemoryRouter initialEntries={['/wizard']}>
          <FluentProvider theme={teamsDarkTheme}>
            <ThemeProvider>
              <div data-theme="dark">
                <WizardShell />
              </div>
            </ThemeProvider>
          </FluentProvider>
        </MemoryRouter>
      );
      
      // Test dark mode
      banner = screen.getByRole('banner');
      results = await axe(banner);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Navigation and Landmarks', () => {
    it('should have proper landmark roles', () => {
      renderWithProviders('light');
      
      // Check for main landmarks
      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: /wizard progress/i })).toBeInTheDocument();
    });

    it('should have proper progress indication in banner context', () => {
      renderWithProviders('light');
      
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toBeInTheDocument();
      expect(progressBar).toHaveAttribute('aria-valuemin', '0');
      expect(progressBar).toHaveAttribute('aria-valuemax', '1');
      expect(progressBar).toHaveAttribute('aria-valuenow');
    });
  });

  describe('Responsive Design', () => {
    it('should maintain accessibility on smaller screens', async () => {
      // Simulate mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });
      
      renderWithProviders('light');
      
      const banner = screen.getByRole('banner');
      const results = await axe(banner);
      expect(results).toHaveNoViolations();
      
      // Reset viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });
    });
  });
});
