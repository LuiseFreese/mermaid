import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { WizardShell } from '../components/wizard/WizardShell';
import { ThemeProvider } from '../context/ThemeContext';

// Mock the child components
vi.mock('../components/wizard/steps/FileUploadStep', () => ({
  FileUploadStep: ({ onNext }: { onNext: () => void }) => (
    <div data-testid="file-upload-step">
      <button onClick={onNext}>Next</button>
    </div>
  ),
}));

vi.mock('../components/wizard/steps/SolutionSetupStep', () => ({
  SolutionSetupStep: ({ onNext, onPrevious }: { onNext: () => void; onPrevious: () => void }) => (
    <div data-testid="solution-setup-step">
      <button onClick={onPrevious}>Previous</button>
      <button onClick={onNext}>Next</button>
    </div>
  ),
}));

vi.mock('../components/wizard/steps/global-choices', () => ({
  GlobalChoicesStep: ({ onNext, onPrevious }: { onNext: () => void; onPrevious: () => void }) => (
    <div data-testid="global-choices-step">
      <button onClick={onPrevious}>Previous</button>
      <button onClick={onNext}>Next</button>
    </div>
  ),
}));

vi.mock('../components/wizard/steps/deployment', () => ({
  DeploymentStep: ({ onPrevious }: { onPrevious: () => void }) => (
    <div data-testid="deployment-step">
      <button onClick={onPrevious}>Previous</button>
    </div>
  ),
}));

const renderWithProviders = (component: React.ReactElement, initialRoute = '/wizard') => {
  return render(
    <ThemeProvider>
      <FluentProvider theme={webLightTheme}>
        <MemoryRouter initialEntries={[initialRoute]}>
          {component}
        </MemoryRouter>
      </FluentProvider>
    </ThemeProvider>
  );
};

describe('WizardShell', () => {
  it('renders the main title and description', () => {
    renderWithProviders(<WizardShell />);
    
    expect(screen.getByText('Mermaid to Dataverse Converter')).toBeInTheDocument();
    expect(screen.getByText('Transform your Mermaid ERD diagrams into Microsoft Dataverse solutions')).toBeInTheDocument();
  });

  it('shows correct progress for step 1', () => {
    renderWithProviders(<WizardShell />);
    
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
    // The component shows step 1 by default, so we should see File Upload in the route
    expect(screen.getByText('File Upload')).toBeInTheDocument();
  });

  it('displays all step labels in the progress section', () => {
    renderWithProviders(<WizardShell />);
    
    expect(screen.getByText('File Upload')).toBeInTheDocument();
    expect(screen.getByText('Solution & Publisher')).toBeInTheDocument();
    expect(screen.getByText('Global Choices')).toBeInTheDocument();
    expect(screen.getByText('Deployment Summary')).toBeInTheDocument();
  });

  it('shows the conversion process title', () => {
    renderWithProviders(<WizardShell />);
    
    expect(screen.getByText('Conversion Process')).toBeInTheDocument();
  });
});