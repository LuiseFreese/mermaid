/**
 * Integration test for modular GlobalChoicesStep
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { GlobalChoicesStep } from '../../../src/components/wizard/steps/global-choices';

// Mock the global choices hook
vi.mock('../../../src/hooks/useGlobalChoices', () => ({
  useGlobalChoices: () => ({
    builtInChoices: [
      { 
        id: 'builtin1', 
        name: 'StatusCode', 
        displayName: 'Status', 
        logicalName: 'statuscode',
        options: [{ value: 1, label: 'Active' }],
        isCustom: false
      }
    ],
    customChoices: [
      { 
        id: 'custom1', 
        name: 'Priority', 
        displayName: 'Priority Level', 
        logicalName: 'priority',
        options: [{ value: 1, label: 'High' }],
        isCustom: true
      }
    ],
    loading: false,
    error: null,
    refetch: vi.fn()
  })
}));

const mockWizardData = {
  globalChoicesSearchTerm: '',
  selectedGlobalChoices: [],
  uploadedGlobalChoices: []
};

// Mock the wizard context hook
vi.mock('../../../src/context/WizardContext', () => ({
  useWizardContext: () => ({
    wizardData: mockWizardData,
    updateWizardData: vi.fn(),
    resetWizard: vi.fn()
  })
}));

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <FluentProvider theme={webLightTheme}>
      {component}
    </FluentProvider>
  );
};

describe('GlobalChoicesStep Integration', () => {
  it('renders global choices step correctly', () => {
    renderWithProviders(<GlobalChoicesStep />);

    // Check main heading
    expect(screen.getByText('Global Choices (Optional)')).toBeInTheDocument();

    // Check accordion sections
    expect(screen.getByText('Global Choice Sets')).toBeInTheDocument();
    expect(screen.getByText('Upload Custom Choices')).toBeInTheDocument();
  });

  it('renders search functionality', () => {
    renderWithProviders(<GlobalChoicesStep />);

    // Check search field
    expect(screen.getByText('Search')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search by name, logical name, or prefix...')).toBeInTheDocument();
  });

  it('displays built-in and custom choices', () => {
    renderWithProviders(<GlobalChoicesStep />);

    // Check if choices are displayed
    expect(screen.getByText('Built-in Choices (1)')).toBeInTheDocument();
    expect(screen.getByText('Custom Choices (1)')).toBeInTheDocument();
  });

  it('renders file upload section', () => {
    renderWithProviders(<GlobalChoicesStep />);

    expect(screen.getByText('Choose File')).toBeInTheDocument();
    expect(screen.getByText('No file selected')).toBeInTheDocument();
  });

  it('renders navigation buttons', () => {
    const mockOnNext = vi.fn();
    const mockOnPrevious = vi.fn();
    
    renderWithProviders(
      <GlobalChoicesStep onNext={mockOnNext} onPrevious={mockOnPrevious} />
    );

    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Next: Deployment Summary')).toBeInTheDocument();
  });

  it('shows modular components are working', () => {
    renderWithProviders(<GlobalChoicesStep />);

    // Verify that the modular components are working
    // (The fact that these sections render means the components are properly integrated)
    expect(screen.getByText('Global Choice Sets')).toBeInTheDocument();
    expect(screen.getByText('Upload Custom Choices')).toBeInTheDocument();
    expect(screen.getByText('Choose File')).toBeInTheDocument();
    expect(screen.getByText('Search')).toBeInTheDocument();
  });
});
