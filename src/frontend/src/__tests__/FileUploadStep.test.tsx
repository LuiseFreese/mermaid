import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WizardProvider } from '../context/WizardContext';
import { FileUploadStep } from '../components/wizard/steps/FileUploadStep';

// Test helper to wrap components with required providers
const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <MemoryRouter>
      <WizardProvider>
        {component}
      </WizardProvider>
    </MemoryRouter>
  );
};

describe('FileUploadStep', () => {
  it('renders without crashing', () => {
    renderWithProviders(<FileUploadStep />);
    
    // Check for file upload content - should find browse button or input text
    const uploadContent = screen.queryByText(/browse/i) || screen.queryByRole('textbox');
    expect(uploadContent).toBeTruthy();
  });

  it('displays file upload area', () => {
    renderWithProviders(<FileUploadStep />);
    
    // Should have file input or browse button
    const fileInput = screen.queryByRole('textbox');
    const browseButton = screen.queryByText(/browse/i);
    expect(fileInput || browseButton).toBeTruthy();
  });

  it('has next button that can be found', () => {
    renderWithProviders(<FileUploadStep />);
    
    // Should have next button (might be disabled initially)
    const nextButton = screen.queryByRole('button', { name: /next/i });
    expect(nextButton).toBeTruthy();
  });
});
