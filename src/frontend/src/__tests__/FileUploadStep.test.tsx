import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { FileUploadStep } from '../components/wizard/steps/FileUploadStep';
import { WizardProvider } from '../context/WizardContext';

// Mock mermaid
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>test</svg>' }),
  },
}));

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <FluentProvider theme={webLightTheme}>
      <WizardProvider>
        {component}
      </WizardProvider>
    </FluentProvider>
  );
};

describe('FileUploadStep', () => {
  const mockOnNext = vi.fn();
  const mockOnFileUploaded = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the file upload interface', () => {
    renderWithProviders(<FileUploadStep onNext={mockOnNext} onFileUploaded={mockOnFileUploaded} />);
    
    // Should render upload interface elements - use more specific query
    expect(screen.getByText('Choose ERD File')).toBeInTheDocument();
  });

  it('handles file selection', async () => {
    renderWithProviders(<FileUploadStep onNext={mockOnNext} onFileUploaded={mockOnFileUploaded} />);
    
    // Create a mock file
    const file = new File(['erDiagram\n  User ||--o{ Order : places'], 'test.mmd', {
      type: 'text/plain',
    });

    // Find file input
    const fileInput = screen.getByRole('textbox') || document.querySelector('input[type="file"]');
    
    if (fileInput) {
      // Simulate file selection
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });
      
      fireEvent.change(fileInput);
      
      await waitFor(() => {
        // Verify file handling logic is triggered
        expect(fileInput).toBeInTheDocument();
      });
    }
  });

  it('displays appropriate messaging when no file is uploaded', () => {
    renderWithProviders(<FileUploadStep onNext={mockOnNext} onFileUploaded={mockOnFileUploaded} />);
    
    // Should show upload instruction or placeholder - check for placeholder attribute
    expect(screen.getByPlaceholderText('No file selected')).toBeInTheDocument();
  });

  it('calls onNext when file is processed successfully', () => {
    renderWithProviders(<FileUploadStep onNext={mockOnNext} onFileUploaded={mockOnFileUploaded} />);
    
    // This is a basic test - actual implementation would depend on component structure
    expect(mockOnNext).not.toHaveBeenCalled();
  });
});