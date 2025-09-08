import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WizardProvider } from '../context/WizardContext';
import { GlobalChoicesStep } from '../components/wizard/steps/GlobalChoicesStep';

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <MemoryRouter>
      <WizardProvider>
        {component}
      </WizardProvider>
    </MemoryRouter>
  );
};

describe('GlobalChoicesStep', () => {
  it('renders without crashing', () => {
    renderWithProviders(<GlobalChoicesStep />);
    
    // Check for global choices content
    const globalTexts = screen.queryAllByText(/global|choice/i);
    expect(globalTexts.length).toBeGreaterThan(0);
  });

  it('shows choice selection interface', () => {
    renderWithProviders(<GlobalChoicesStep />);
    
    // Should have some form of selection mechanism - count what exists
    const buttons = screen.queryAllByRole('button');
    const radios = screen.queryAllByRole('radio');
    const checkboxes = screen.queryAllByRole('checkbox');
    
    // Should have interactive elements for choices
    const totalElements = buttons.length + radios.length + checkboxes.length;
    expect(totalElements).toBeGreaterThan(0);
  });

  it('has navigation controls', () => {
    renderWithProviders(<GlobalChoicesStep />);
    
    // Should have next/back buttons
    const navButtons = screen.queryByRole('button', { name: /next|back|continue/i });
    expect(navButtons).toBeTruthy();
  });
});
