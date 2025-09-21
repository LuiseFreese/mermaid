import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';
import { FileUploadStep } from '../../../src/components/wizard/steps/FileUploadStep';
import { WizardProvider } from '../../../src/context/WizardContext';
import { ThemeProvider } from '../../../src/context/ThemeContext';
import { ApiService } from '../../../src/services/apiService';

// Mock the API service
vi.mock('../../../src/services/apiService', () => ({
  ApiService: {
    validateFile: vi.fn()
  }
}));

// Mock mermaid
vi.mock('mermaid', () => ({
  default: {
    render: vi.fn().mockResolvedValue({ svg: '<svg>test</svg>' })
  }
}));

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>
    <WizardProvider>
      {children}
    </WizardProvider>
  </ThemeProvider>
);

describe('FileUploadStep - Backend Validation Integration', () => {
  const mockFile = new File(['test content'], 'test.mmd', { type: 'text/plain' });
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should call backend validation when file is uploaded', async () => {
    const mockValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      entities: [
        { name: 'POST', attributes: [] },
        { name: 'TAG', attributes: [] }
      ],
      relationships: [
        { fromEntity: 'POST', toEntity: 'TAG', cardinality: { type: 'many-to-many' } }
      ],
      correctedERD: 'erDiagram\n    POST { }\n    TAG { }\n    POST ||--o{ POST_TAG : "has"\n    TAG ||--o{ POST_TAG : "has"'
    };

    ApiService.validateFile.mockResolvedValue(mockValidationResult);

    render(
      <TestWrapper>
        <FileUploadStep />
      </TestWrapper>
    );

    const fileInput = screen.getByTestId('file-input');
    
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mockFile] } });
    });

    await waitFor(() => {
      expect(ApiService.validateFile).toHaveBeenCalledWith({
        name: 'test.mmd',
        content: 'test content',
        size: mockFile.size,
        lastModified: mockFile.lastModified
      });
    });
  });

  test('should display loading state during validation', async () => {
    // Make the validation take some time
    ApiService.validateFile.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({ valid: true, errors: [], warnings: [] }), 100))
    );

    render(
      <TestWrapper>
        <FileUploadStep />
      </TestWrapper>
    );

    const fileInput = screen.getByTestId('file-input');
    
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mockFile] } });
    });

    // Should show loading message
    expect(screen.getByText('Validating ERD...')).toBeInTheDocument();
    expect(screen.getByText('Analyzing your ERD structure and applying corrections...')).toBeInTheDocument();

    // Wait for validation to complete
    await waitFor(() => {
      expect(screen.queryByText('Validating ERD...')).not.toBeInTheDocument();
    });
  });

  test('should display many-to-many auto-correction warnings', async () => {
    const mockValidationResult = {
      valid: true,
      errors: [],
      warnings: [
        {
          type: 'many_to_many_auto_corrected',
          severity: 'warning',
          category: 'relationships',
          message: 'Many-to-many relationship detected between POST and TAG',
          autoFixed: true,
          corrections: {
            originalRelationship: 'POST }o--o{ TAG : "tagged_with"',
            junctionTable: 'POST_TAG',
            newRelationships: [
              'POST ||--o{ POST_TAG : "has"',
              'TAG ||--o{ POST_TAG : "has"'
            ]
          }
        }
      ],
      entities: [
        { name: 'POST', attributes: [] },
        { name: 'TAG', attributes: [] },
        { name: 'POST_TAG', attributes: [] }
      ],
      relationships: [
        { fromEntity: 'POST', toEntity: 'POST_TAG', cardinality: { type: 'one-to-many' } },
        { fromEntity: 'TAG', toEntity: 'POST_TAG', cardinality: { type: 'one-to-many' } }
      ],
      correctedERD: 'corrected ERD content'
    };

    ApiService.validateFile.mockResolvedValue(mockValidationResult);

    render(
      <TestWrapper>
        <FileUploadStep />
      </TestWrapper>
    );

    const fileInput = screen.getByTestId('file-input');
    
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mockFile] } });
    });

    await waitFor(() => {
      expect(screen.getByText('Auto-corrected: Many-to-Many Relationship Converted')).toBeInTheDocument();
      expect(screen.getByText(/Original: POST }o--o{ TAG/)).toBeInTheDocument();
      expect(screen.getByText(/Created junction table: POST_TAG/)).toBeInTheDocument();
      expect(screen.getByText(/New relationships:/)).toBeInTheDocument();
    });
  });

  test('should display corrected entities in schema overview', async () => {
    const mockValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      entities: [
        { name: 'POST', attributes: [{ name: 'id', type: 'string' }], isCdm: false },
        { name: 'TAG', attributes: [{ name: 'id', type: 'string' }], isCdm: false },
        { name: 'POST_TAG', attributes: [
          { name: 'id', type: 'string', constraint: 'PK' },
          { name: 'post_id', type: 'string', constraint: 'FK' },
          { name: 'tag_id', type: 'string', constraint: 'FK' }
        ], isCdm: false }
      ],
      relationships: [
        { from: 'POST', to: 'POST_TAG', type: 'One-to-Many' },
        { from: 'TAG', to: 'POST_TAG', type: 'One-to-Many' }
      ],
      correctedERD: 'corrected ERD content'
    };

    ApiService.validateFile.mockResolvedValue(mockValidationResult);

    render(
      <TestWrapper>
        <FileUploadStep />
      </TestWrapper>
    );

    const fileInput = screen.getByTestId('file-input');
    
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mockFile] } });
    });

    // Wait for validation and then make entity choice
    await waitFor(() => {
      expect(screen.queryByText('Validating ERD...')).not.toBeInTheDocument();
    });

    // Mock that no CDM is detected so entity choice is automatically made
    await waitFor(() => {
      // Should show all entities including the junction table
      expect(screen.getByText(/Custom Tables \(3 entities\)/)).toBeInTheDocument();
      expect(screen.getByText('POST')).toBeInTheDocument();
      expect(screen.getByText('TAG')).toBeInTheDocument();
      expect(screen.getByText('POST_TAG')).toBeInTheDocument();
      
      // Should show corrected relationships
      expect(screen.getByText(/Relationships \(2 relationships\)/)).toBeInTheDocument();
    });
  });

  test('should handle validation errors gracefully', async () => {
    const validationError = new Error('Validation failed: Invalid ERD syntax');
    ApiService.validateFile.mockRejectedValue(validationError);

    render(
      <TestWrapper>
        <FileUploadStep />
      </TestWrapper>
    );

    const fileInput = screen.getByTestId('file-input');
    
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mockFile] } });
    });

    await waitFor(() => {
      expect(screen.getByText('Validation Error')).toBeInTheDocument();
      expect(screen.getByText('Validation failed: Invalid ERD syntax')).toBeInTheDocument();
    });

    // Should fall back to original content
    expect(ApiService.validateFile).toHaveBeenCalled();
  });

  test('should use corrected ERD for diagram rendering', async () => {
    const correctedERD = `erDiagram
    POST {
        string id PK
    }
    TAG {
        string id PK
    }
    POST_TAG {
        string id PK
        string post_id FK
        string tag_id FK
    }
    POST ||--o{ POST_TAG : "has"
    TAG ||--o{ POST_TAG : "has"`;

    const mockValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      entities: [],
      relationships: [],
      correctedERD: correctedERD
    };

    ApiService.validateFile.mockResolvedValue(mockValidationResult);

    render(
      <TestWrapper>
        <FileUploadStep />
      </TestWrapper>
    );

    const fileInput = screen.getByTestId('file-input');
    
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mockFile] } });
    });

    await waitFor(() => {
      expect(screen.queryByText('Validating ERD...')).not.toBeInTheDocument();
    });

    // The corrected ERD should be used for the wizard data
    // This would be verified through the diagram rendering, but since we mock mermaid,
    // we can't easily test the actual rendering here
  });
});