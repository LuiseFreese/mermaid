/**
 * Unit Tests for useSolutionConfiguration Hook
 * Tests the solution configuration management hook
 */

import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useSolutionConfiguration } from '../../../src/components/wizard/steps/solution-setup/hooks/useSolutionConfiguration';

// Mock external dependencies
vi.mock('../../../src/components/wizard/steps/solution-setup/hooks/useNameGeneration', () => ({
  useNameGeneration: () => ({
    solutionInternalName: 'generated_internal_name'
  })
}));

vi.mock('../../../src/components/wizard/steps/solution-setup/hooks/useFormValidation', () => ({
  useFormValidation: () => ({
    validateField: vi.fn(),
    getFirstErrorForField: vi.fn(() => undefined),
    hasFieldError: vi.fn(() => false)
  })
}));

vi.mock('../../../src/components/wizard/steps/solution-setup/hooks/useSearchableDropdown', () => ({
  useSearchableDropdown: () => ({
    searchTerm: '',
    isOpen: false,
    selectedItem: null,
    filteredItems: [],
    hasSelection: false,
    setSearchTerm: vi.fn(),
    setIsOpen: vi.fn(),
    setSelectedItem: vi.fn(),
    clearSelection: vi.fn(),
    handleBlur: vi.fn(),
  })
}));

// Mock data for testing
const mockSolutions = [
  {
    id: 'sol1',
    friendlyname: 'Test Solution 1',
    uniquename: 'testsolution1',
    version: '1.0.0',
    description: 'First test solution',
  },
  {
    id: 'sol2',
    friendlyname: 'Test Solution 2',
    uniquename: 'testsolution2',
    version: '2.0.0',
    description: 'Second test solution',
  },
];

// Mock wizard context
const mockWizardData = {
  solutionType: 'existing' as const,
  solutionName: '',
  solutionInternalName: '',
  selectedSolution: null,
  includeRelatedTables: false,
};

const mockUpdateWizardData = vi.fn();

// Mock the wizard context and solutions hook
vi.mock('../../../src/components/wizard/steps/solution-setup/hooks/useSolutionConfiguration', async () => {
  const actual = await vi.importActual('../../../src/components/wizard/steps/solution-setup/hooks/useSolutionConfiguration');
  return {
    ...actual,
    // We'll override this in individual tests as needed
  };
});

describe('useSolutionConfiguration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock the context and external hooks
    vi.doMock('../../../src/components/wizard/steps/solution-setup/hooks/useSolutionConfiguration', () => ({
      useSolutionConfiguration: () => ({
        solutionType: 'existing',
        setSolutionType: vi.fn(),
        solutionName: '',
        setSolutionName: vi.fn(),
        solutionInternalName: '',
        setSolutionInternalName: vi.fn(),
        selectedSolution: null,
        setSelectedSolution: vi.fn(),
        includeRelatedTables: false,
        setIncludeRelatedTables: vi.fn(),
        isValid: true,
        errors: [],
        solutions: mockSolutions,
        loadingSolutions: false,
        solutionError: null,
        refreshSolutions: vi.fn(),
        searchSolutions: vi.fn(),
        solutionDropdown: {
          searchTerm: '',
          isOpen: false,
          selectedItem: null,
          filteredItems: mockSolutions,
          hasSelection: false,
          setSearchTerm: vi.fn(),
          setIsOpen: vi.fn(),
          setSelectedItem: vi.fn(),
          clearSelection: vi.fn(),
          handleBlur: vi.fn(),
        },
        getSelectedSolutionDisplay: vi.fn(() => ''),
        clearSolutionSelection: vi.fn(),
        getSolutionSummary: vi.fn(),
        validateSolutionConfig: vi.fn(() => ({ isValid: true, errors: [] })),
        hasNameError: false,
        hasInternalNameError: false,
        nameError: undefined,
        internalNameError: undefined,
      })
    }));
  });

  describe('Initial State', () => {
    it('should initialize with correct default values', () => {
      const { result } = renderHook(() => useSolutionConfiguration());
      
      expect(result.current.solutionType).toBe('existing');
      expect(result.current.solutionName).toBe('');
      expect(result.current.solutionInternalName).toBe('');
      expect(result.current.selectedSolution).toBe(null);
      expect(result.current.includeRelatedTables).toBe(false);
      // Initial state is invalid because no solution is selected for 'existing' type
      expect(result.current.isValid).toBe(false);
      expect(result.current.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Solution Type Management', () => {
    it('should have setSolutionType function', () => {
      const { result } = renderHook(() => useSolutionConfiguration());
      
      expect(typeof result.current.setSolutionType).toBe('function');
    });

    it('should have solution name management functions', () => {
      const { result } = renderHook(() => useSolutionConfiguration());
      
      expect(typeof result.current.setSolutionName).toBe('function');
      expect(typeof result.current.setSolutionInternalName).toBe('function');
    });
  });

  describe('Solution Selection', () => {
    it('should have setSelectedSolution function', () => {
      const { result } = renderHook(() => useSolutionConfiguration());
      
      expect(typeof result.current.setSelectedSolution).toBe('function');
    });

    it('should have clearSolutionSelection function', () => {
      const { result } = renderHook(() => useSolutionConfiguration());
      
      expect(typeof result.current.clearSolutionSelection).toBe('function');
    });
  });

  describe('External Data State', () => {
    it('should provide solutions data and loading states', () => {
      const { result } = renderHook(() => useSolutionConfiguration());
      
      expect(Array.isArray(result.current.solutions)).toBe(true);
      expect(typeof result.current.loadingSolutions).toBe('boolean');
      expect(result.current.solutionError).toBeNull();
    });

    it('should have refreshSolutions function', () => {
      const { result } = renderHook(() => useSolutionConfiguration());
      
      expect(typeof result.current.refreshSolutions).toBe('function');
    });
  });

  describe('Search Functionality', () => {
    it('should provide search functionality', () => {
      const { result } = renderHook(() => useSolutionConfiguration());
      
      expect(typeof result.current.searchSolutions).toBe('function');
      expect(result.current.solutionDropdown).toBeDefined();
      expect(typeof result.current.solutionDropdown.setSearchTerm).toBe('function');
    });
  });

  describe('Validation', () => {
    it('should provide validation state and functions', () => {
      const { result } = renderHook(() => useSolutionConfiguration());
      
      expect(typeof result.current.isValid).toBe('boolean');
      expect(Array.isArray(result.current.errors)).toBe(true);
      expect(typeof result.current.validateSolutionConfig).toBe('function');
    });

    it('should provide field-specific error checking', () => {
      const { result } = renderHook(() => useSolutionConfiguration());
      
      expect(typeof result.current.hasNameError).toBe('boolean');
      expect(typeof result.current.hasInternalNameError).toBe('boolean');
    });
  });

  describe('Helper Methods', () => {
    it('should provide helper methods', () => {
      const { result } = renderHook(() => useSolutionConfiguration());
      
      expect(typeof result.current.getSelectedSolutionDisplay).toBe('function');
      expect(typeof result.current.getSolutionSummary).toBe('function');
    });
  });

  describe('Related Tables Configuration', () => {
    it('should manage includeRelatedTables setting', () => {
      const { result } = renderHook(() => useSolutionConfiguration());
      
      expect(typeof result.current.includeRelatedTables).toBe('boolean');
      expect(typeof result.current.setIncludeRelatedTables).toBe('function');
    });
  });
});
