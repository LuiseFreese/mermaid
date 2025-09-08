import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WizardProvider } from '../context/WizardContext';
import { SolutionSetupStep } from '../components/wizard/steps/SolutionSetupStep';

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <MemoryRouter>
      <WizardProvider>
        {component}
      </WizardProvider>
    </MemoryRouter>
  );
};

describe('SolutionSetupStep', () => {
  it('renders without crashing', () => {
    renderWithProviders(<SolutionSetupStep />);
    
    // Check for solution setup content - use queryAllByText to handle multiple matches
    const solutionTexts = screen.queryAllByText(/solution/i);
    expect(solutionTexts.length).toBeGreaterThan(0);
  });

  it('shows setup configuration options', () => {
    renderWithProviders(<SolutionSetupStep />);
    
    // Should have form fields - count what we can find
    const textboxes = screen.queryAllByRole('textbox');
    const buttons = screen.queryAllByRole('button');
    const radios = screen.queryAllByRole('radio');
    
    // Should have at least some interactive elements
    const totalElements = textboxes.length + buttons.length + radios.length;
    expect(totalElements).toBeGreaterThan(0);
  });

  it('has navigation controls', () => {
    renderWithProviders(<SolutionSetupStep />);
    
    // Should have next/continue button
    const nextButton = screen.queryByRole('button', { name: /next/i });
    expect(nextButton).toBeTruthy();
  });
});
