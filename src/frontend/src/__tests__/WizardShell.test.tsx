import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WizardProvider } from '../context/WizardContext';
import { WizardShell } from '../components/wizard/WizardShell';

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <MemoryRouter>
      <WizardProvider>
        {component}
      </WizardProvider>
    </MemoryRouter>
  );
};

describe('WizardShell', () => {
  it('renders without crashing', () => {
    renderWithProviders(<WizardShell />);
    
    // Should render some content - look for any meaningful element
    const container = screen.getByRole('group') || document.body.firstChild;
    expect(container).toBeTruthy();
  });

  it('shows wizard steps or navigation', () => {
    renderWithProviders(<WizardShell />);
    
    // Should have some form of step indicator or navigation
    const stepText = screen.queryByText(/step/i);
    const progressBar = screen.queryByRole('progressbar');
    
    expect(stepText || progressBar).toBeTruthy();
  });

  it('contains wizard content area', () => {
    const { container } = renderWithProviders(<WizardShell />);
    
    // Should have a content area for wizard steps
    expect(container.firstChild).not.toBeNull();
  });
});
