import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DeploymentStep } from '../components/wizard/steps/DeploymentStep';
import { WizardProvider } from '../context/WizardContext';

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <FluentProvider theme={webLightTheme}>
      <MemoryRouter>
        <WizardProvider>
          {component}
        </WizardProvider>
      </MemoryRouter>
    </FluentProvider>
  );
};

describe('DeploymentStep', () => {
  const mockOnPrevious = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the deployment interface', () => {
    renderWithProviders(
      <DeploymentStep onPrevious={mockOnPrevious} />
    );
    
    // Should render deployment elements - use more specific query
    expect(screen.getByText('Deployment Summary & Options')).toBeInTheDocument();
  });

  it('calls onPrevious when previous button is clicked', () => {
    renderWithProviders(
      <DeploymentStep onPrevious={mockOnPrevious} />
    );
    
    // Look for any button containing "Previous"
    const previousButton = screen.getByText(/Previous/);
    if (previousButton) {
      fireEvent.click(previousButton);
      expect(mockOnPrevious).toHaveBeenCalled();
    }
  });

  it('renders navigation buttons', () => {
    renderWithProviders(
      <DeploymentStep onPrevious={mockOnPrevious} />
    );
    
    // Should have at least a previous button
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('displays deployment summary information', () => {
    renderWithProviders(
      <DeploymentStep onPrevious={mockOnPrevious} />
    );
    
    // Should display summary or deployment-related content
    expect(screen.getByText('Deployment Summary & Options')).toBeInTheDocument();
  });

  it('handles deployment process', () => {
    renderWithProviders(
      <DeploymentStep onPrevious={mockOnPrevious} />
    );
    
    // This is the final step, so it should handle the deployment
    // This is a placeholder test that ensures the component renders
    expect(screen.getByText('Deployment Summary & Options')).toBeInTheDocument();
  });
});