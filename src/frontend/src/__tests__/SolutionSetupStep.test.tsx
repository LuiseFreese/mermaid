import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { SolutionSetupStep } from '../components/wizard/steps/SolutionSetupStep';
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

describe('SolutionSetupStep', () => {
  const mockOnNext = vi.fn();
  const mockOnPrevious = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the solution setup interface', () => {
    renderWithProviders(
      <SolutionSetupStep onNext={mockOnNext} onPrevious={mockOnPrevious} />
    );
    
    // Should render setup elements - use more specific query
    expect(screen.getByText('Solution & Publisher Setup')).toBeInTheDocument();
  });

  it('calls onPrevious when previous button is clicked', () => {
    renderWithProviders(
      <SolutionSetupStep onNext={mockOnNext} onPrevious={mockOnPrevious} />
    );
    
    // Look for any button containing "Previous"
    const previousButton = screen.getByText(/Previous/);
    if (previousButton) {
      fireEvent.click(previousButton);
      expect(mockOnPrevious).toHaveBeenCalled();
    }
  });

  it('calls onNext when next button is clicked', async () => {
    renderWithProviders(
      <SolutionSetupStep onNext={mockOnNext} onPrevious={mockOnPrevious} />
    );
    
    // Fill out the form to make the Next button enabled
    // First, select "Create New Solution"
    const newSolutionRadio = screen.getByLabelText(/Create New Solution/i);
    fireEvent.click(newSolutionRadio);
    
    // Fill in solution name
    const solutionNameInput = screen.getByPlaceholderText(/e\.g\., Customer Management Solution/i);
    fireEvent.change(solutionNameInput, { target: { value: 'Test Solution' } });
    
    // Select "Create New Publisher"
    const newPublisherRadio = screen.getByLabelText(/Create New Publisher/i);
    fireEvent.click(newPublisherRadio);
    
    // Fill in publisher details
    const publisherNameInput = screen.getByPlaceholderText(/e\.g\., Fancy New Publisher/i);
    fireEvent.change(publisherNameInput, { target: { value: 'Test Publisher' } });
    
    // Now the Next button should be enabled
    const nextButton = screen.getByText(/Next/);
    expect(nextButton).not.toBeDisabled();
    
    fireEvent.click(nextButton);
    expect(mockOnNext).toHaveBeenCalled();
  });

  it('renders navigation buttons', () => {
    renderWithProviders(
      <SolutionSetupStep onNext={mockOnNext} onPrevious={mockOnPrevious} />
    );
    
    // Should have navigation buttons or similar elements
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });
});