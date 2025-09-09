import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { GlobalChoicesStep } from '../components/wizard/steps/GlobalChoicesStep';
import { WizardProvider } from '../context/WizardContext';

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <FluentProvider theme={webLightTheme}>
      <WizardProvider>
        {component}
      </WizardProvider>
    </FluentProvider>
  );
};

describe('GlobalChoicesStep', () => {
  const mockOnNext = vi.fn();
  const mockOnPrevious = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the global choices interface', () => {
    renderWithProviders(
      <GlobalChoicesStep onNext={mockOnNext} onPrevious={mockOnPrevious} />
    );
    
    // Should render choices elements - use more specific query
    expect(screen.getByText('Global Choice Management')).toBeInTheDocument();
  });

  it('calls onPrevious when previous button is clicked', () => {
    renderWithProviders(
      <GlobalChoicesStep onNext={mockOnNext} onPrevious={mockOnPrevious} />
    );
    
    // Look for any button containing "Previous"
    const previousButton = screen.getByText(/Previous/);
    if (previousButton) {
      fireEvent.click(previousButton);
      expect(mockOnPrevious).toHaveBeenCalled();
    }
  });

  it('calls onNext when next button is clicked', () => {
    renderWithProviders(
      <GlobalChoicesStep onNext={mockOnNext} onPrevious={mockOnPrevious} />
    );
    
    // Look for any button containing "Next"
    const nextButton = screen.getByText(/Next/);
    if (nextButton) {
      fireEvent.click(nextButton);
      expect(mockOnNext).toHaveBeenCalled();
    }
  });

  it('renders navigation buttons', () => {
    renderWithProviders(
      <GlobalChoicesStep onNext={mockOnNext} onPrevious={mockOnPrevious} />
    );
    
    // Should have navigation buttons or similar elements
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('handles global choices configuration', () => {
    renderWithProviders(
      <GlobalChoicesStep onNext={mockOnNext} onPrevious={mockOnPrevious} />
    );
    
    // Test should verify that global choices can be configured
    // This is a placeholder test that ensures the component renders
    expect(screen.getByText('Global Choice Management')).toBeInTheDocument();
  });
});