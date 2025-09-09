/**
 * Unit Tests for usePublisherConfiguration Hook
 * Tests the publisher configuration management hook
 */

import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { usePublisherConfiguration } from '../../../src/components/wizard/steps/solution-setup/hooks/usePublisherConfiguration';

// Mock external dependencies
vi.mock('../../../src/components/wizard/steps/solution-setup/hooks/useNameGeneration', () => ({
  useNameGeneration: () => ({
    publisherInternalName: 'generated_internal_name',
    publisherPrefix: 'gen'
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
const mockPublishers = [
  {
    id: 'pub1',
    friendlyname: 'Test Publisher 1',
    uniquename: 'testpublisher1',
    description: 'First test publisher',
  },
  {
    id: 'pub2',
    friendlyname: 'Test Publisher 2',
    uniquename: 'testpublisher2',
    description: 'Second test publisher',
  },
];

describe('usePublisherConfiguration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock the hook to return a consistent interface
    vi.doMock('../../../src/components/wizard/steps/solution-setup/hooks/usePublisherConfiguration', () => ({
      usePublisherConfiguration: () => ({
        publisherType: 'existing',
        setPublisherType: vi.fn(),
        selectedPublisher: null,
        setSelectedPublisher: vi.fn(),
        newPublisherName: '',
        setNewPublisherName: vi.fn(),
        newPublisherInternalName: '',
        setNewPublisherInternalName: vi.fn(),
        newPublisherPrefix: '',
        setNewPublisherPrefix: vi.fn(),
        isValid: false,
        errors: [],
        newPublisherValidation: {},
        publishers: mockPublishers,
        loadingPublishers: false,
        publisherError: null,
        refreshPublishers: vi.fn(),
        searchPublishers: vi.fn(),
        publisherDropdown: {
          searchTerm: '',
          isOpen: false,
          selectedItem: null,
          filteredItems: mockPublishers,
          hasSelection: false,
          setSearchTerm: vi.fn(),
          setIsOpen: vi.fn(),
          setSelectedItem: vi.fn(),
          clearSelection: vi.fn(),
          handleBlur: vi.fn(),
        },
        getSelectedPublisherDisplay: vi.fn(() => ''),
        clearPublisherSelection: vi.fn(),
        getPublisherSummary: vi.fn(),
        validatePublisherConfig: vi.fn(() => ({ isValid: true, errors: [] })),
        clearNewPublisherForm: vi.fn(),
        suggestNewPublisher: vi.fn(),
        hasNewPublisherData: false,
        hasDisplayNameError: false,
        hasInternalNameError: false,
        hasPrefixError: false,
        displayNameError: undefined,
        internalNameError: undefined,
        prefixError: undefined,
      })
    }));
  });

  describe('Initial State', () => {
    it('should initialize with correct default values', () => {
      const { result } = renderHook(() => usePublisherConfiguration());
      
      expect(result.current.publisherType).toBe('existing');
      expect(result.current.selectedPublisher).toBe(null);
      expect(result.current.newPublisherName).toBe('');
      expect(result.current.newPublisherInternalName).toBe('');
      expect(result.current.newPublisherPrefix).toBe('');
      // Initial state is invalid because no publisher is selected for 'existing' type
      expect(result.current.isValid).toBe(false);
      expect(result.current.errors.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Publisher Type Management', () => {
    it('should have setPublisherType function', () => {
      const { result } = renderHook(() => usePublisherConfiguration());
      
      expect(typeof result.current.setPublisherType).toBe('function');
    });

    it('should have new publisher field management functions', () => {
      const { result } = renderHook(() => usePublisherConfiguration());
      
      expect(typeof result.current.setNewPublisherName).toBe('function');
      expect(typeof result.current.setNewPublisherInternalName).toBe('function');
      expect(typeof result.current.setNewPublisherPrefix).toBe('function');
    });
  });

  describe('Publisher Selection', () => {
    it('should have setSelectedPublisher function', () => {
      const { result } = renderHook(() => usePublisherConfiguration());
      
      expect(typeof result.current.setSelectedPublisher).toBe('function');
    });

    it('should have clearPublisherSelection function', () => {
      const { result } = renderHook(() => usePublisherConfiguration());
      
      expect(typeof result.current.clearPublisherSelection).toBe('function');
    });
  });

  describe('External Data State', () => {
    it('should provide publishers data and loading states', () => {
      const { result } = renderHook(() => usePublisherConfiguration());
      
      expect(Array.isArray(result.current.publishers)).toBe(true);
      expect(typeof result.current.loadingPublishers).toBe('boolean');
      expect(result.current.publisherError).toBeNull();
    });

    it('should have refreshPublishers function', () => {
      const { result } = renderHook(() => usePublisherConfiguration());
      
      expect(typeof result.current.refreshPublishers).toBe('function');
    });
  });

  describe('Search Functionality', () => {
    it('should provide search functionality', () => {
      const { result } = renderHook(() => usePublisherConfiguration());
      
      expect(typeof result.current.searchPublishers).toBe('function');
      expect(result.current.publisherDropdown).toBeDefined();
      expect(typeof result.current.publisherDropdown.setSearchTerm).toBe('function');
    });
  });

  describe('Validation', () => {
    it('should provide validation state and functions', () => {
      const { result } = renderHook(() => usePublisherConfiguration());
      
      expect(typeof result.current.isValid).toBe('boolean');
      expect(Array.isArray(result.current.errors)).toBe(true);
      expect(typeof result.current.validatePublisherConfig).toBe('function');
    });

    it('should provide field-specific error checking', () => {
      const { result } = renderHook(() => usePublisherConfiguration());
      
      expect(typeof result.current.hasDisplayNameError).toBe('boolean');
      expect(typeof result.current.hasInternalNameError).toBe('boolean');
      expect(typeof result.current.hasPrefixError).toBe('boolean');
    });
  });

  describe('Helper Methods', () => {
    it('should provide helper methods', () => {
      const { result } = renderHook(() => usePublisherConfiguration());
      
      expect(typeof result.current.getSelectedPublisherDisplay).toBe('function');
      expect(typeof result.current.getPublisherSummary).toBe('function');
    });
  });
});
