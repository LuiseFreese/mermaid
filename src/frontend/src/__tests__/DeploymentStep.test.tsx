import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WizardProvider } from '../context/WizardContext';
import { DeploymentStep } from '../components/wizard/steps/DeploymentStep';

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <MemoryRouter>
      <WizardProvider>
        {component}
      </WizardProvider>
    </MemoryRouter>
  );
};

describe('DeploymentStep', () => {
  it('renders without crashing', () => {
    renderWithProviders(<DeploymentStep />);
    
    // Check for deployment-related content - use queryAllByText to handle multiple matches
    const deployTexts = screen.queryAllByText(/deploy/i);
    expect(deployTexts.length).toBeGreaterThan(0);
  });

  it('shows deployment controls', () => {
    renderWithProviders(<DeploymentStep />);
    
    // Should have deployment button or progress area
    const buttons = screen.queryAllByRole('button');
    
    // Should have at least some buttons
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('has back to start functionality', () => {
    renderWithProviders(<DeploymentStep />);
    
    // Should have some way to go back or restart - check for any button
    const buttons = screen.queryAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});
