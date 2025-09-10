/**
 * Tests for Global Choices Step Components
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { 
  ChoiceSearch, 
  CustomChoicesUpload, 
  UploadedChoicesPreview,
  GlobalChoicesNavigation 
} from '../../../src/components/wizard/steps/global-choices/components';

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <FluentProvider theme={webLightTheme}>
      {component}
    </FluentProvider>
  );
};

describe('ChoiceSearch', () => {
  it('renders search input correctly', () => {
    const mockOnChange = vi.fn();
    
    renderWithProviders(
      <ChoiceSearch value="" onChange={mockOnChange} />
    );

    expect(screen.getByText('Search')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search by name, logical name, or prefix...')).toBeInTheDocument();
  });
});

describe('CustomChoicesUpload', () => {
  it('renders upload button', () => {
    const mockOnFileUpload = vi.fn();
    
    renderWithProviders(
      <CustomChoicesUpload 
        onFileUpload={mockOnFileUpload}
        uploadedFile={null}
        isUploading={false}
        error={null}
      />
    );

    expect(screen.getByText('Choose File')).toBeInTheDocument();
    expect(screen.getByText('No file selected')).toBeInTheDocument();
  });

  it('shows uploading state', () => {
    const mockOnFileUpload = vi.fn();
    
    renderWithProviders(
      <CustomChoicesUpload 
        onFileUpload={mockOnFileUpload}
        uploadedFile={null}
        isUploading={true}
        error={null}
      />
    );

    expect(screen.getByText('Uploading...')).toBeInTheDocument();
  });

  it('shows success message when file uploaded', () => {
    const mockOnFileUpload = vi.fn();
    const mockFile = new File(['{}'], 'test.json', { type: 'application/json' });
    
    renderWithProviders(
      <CustomChoicesUpload 
        onFileUpload={mockOnFileUpload}
        uploadedFile={mockFile}
        isUploading={false}
        error={null}
      />
    );

    expect(screen.getByText('File uploaded successfully!')).toBeInTheDocument();
    expect(screen.getByText(/test.json/)).toBeInTheDocument();
  });
});

describe('UploadedChoicesPreview', () => {
  it('renders uploaded choices correctly', () => {
    const choices = [
      { id: 'choice1', name: 'Status', displayName: 'Status Code', logicalName: 'statuscode', options: [] },
      { id: 'choice2', name: 'Priority', displayName: 'Priority Level', logicalName: 'priority', options: [{ value: 1, label: 'High' }] }
    ];
    
    renderWithProviders(
      <UploadedChoicesPreview choices={choices} />
    );

    expect(screen.getByText('Uploaded Global Choices (2):')).toBeInTheDocument();
    expect(screen.getByText('Status Code')).toBeInTheDocument();
    expect(screen.getByText('Priority Level')).toBeInTheDocument();
    expect(screen.getByText('Options: High')).toBeInTheDocument();
  });

  it('renders nothing when no choices', () => {
    renderWithProviders(
      <UploadedChoicesPreview choices={[]} />
    );

    // Should not render the "Uploaded Global Choices" text when no choices
    expect(screen.queryByText(/Uploaded Global Choices/)).not.toBeInTheDocument();
  });
});

describe('GlobalChoicesNavigation', () => {
  it('renders navigation buttons', () => {
    const mockOnNext = vi.fn();
    const mockOnPrevious = vi.fn();
    
    renderWithProviders(
      <GlobalChoicesNavigation 
        onNext={mockOnNext}
        onPrevious={mockOnPrevious}
        isValid={true}
      />
    );

    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Next: Deployment Summary')).toBeInTheDocument();
  });

  it('disables next button when invalid', () => {
    const mockOnNext = vi.fn();
    const mockOnPrevious = vi.fn();
    
    renderWithProviders(
      <GlobalChoicesNavigation 
        onNext={mockOnNext}
        onPrevious={mockOnPrevious}
        isValid={false}
      />
    );

    const nextButton = screen.getByText('Next: Deployment Summary');
    expect(nextButton).toBeDisabled();
  });
});
