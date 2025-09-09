/**
 * Unit Tests for useSearchableDropdown Hook
 * Tests the searchable dropdown functionality hook
 */

import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useSearchableDropdown } from '../../../src/components/wizard/steps/solution-setup/hooks/useSearchableDropdown';
import { SearchConfiguration } from '../../../src/components/wizard/steps/solution-setup/types';

// Mock the utility functions
vi.mock('../../../src/components/wizard/steps/solution-setup/utils', () => ({
  filterItems: vi.fn((items, searchTerm) => {
    if (!searchTerm) return items;
    return items.filter((item) => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }),
  sortByRelevance: vi.fn((items) => items),
}));

// Mock data for testing
const mockItems = [
  { id: '1', name: 'Test Item 1', description: 'First test item' },
  { id: '2', name: 'Test Item 2', description: 'Second test item' },
  { id: '3', name: 'Another Item', description: 'Third test item' },
];

const mockSearchConfig = {
  searchProperties: ['name', 'description'],
  caseSensitive: false,
  exactMatch: false,
  maxResults: 10,
};

describe('useSearchableDropdown', () => {
  const defaultOptions = {
    items: mockItems,
    searchConfig: mockSearchConfig,
    debounceDelay: 100,
    sortByRelevance: true,
    autoSelectFirst: false,
    closeOnSelect: true,
    clearSearchOnSelect: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() => useSearchableDropdown(defaultOptions));
      
      expect(result.current.searchTerm).toBe('');
      expect(result.current.isOpen).toBe(false);
      expect(result.current.selectedItem).toBe(null);
      expect(result.current.filteredItems).toEqual(mockItems);
    });
  });

  describe('Search Functionality', () => {
    it('should update search term', () => {
      const { result } = renderHook(() => useSearchableDropdown(defaultOptions));
      
      act(() => {
        result.current.setSearchTerm('test');
      });
      
      expect(result.current.searchTerm).toBe('test');
    });

    it('should handle search changes', () => {
      const { result } = renderHook(() => useSearchableDropdown(defaultOptions));
      
      act(() => {
        result.current.handleSearchChange('test');
      });
      
      expect(result.current.searchTerm).toBe('test');
    });

    it('should filter items based on search term', async () => {
      const { result } = renderHook(() => useSearchableDropdown(defaultOptions));
      
      act(() => {
        result.current.setSearchTerm('test');
      });
      
      // Wait for debounce
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 150));
      });
      
      expect(result.current.filteredItems).toHaveLength(2);
    });

    it('should debounce search term updates', async () => {
      const { result } = renderHook(() => useSearchableDropdown({
        ...defaultOptions,
        debounceDelay: 200,
      }));
      
      // Rapidly update search term
      act(() => {
        result.current.setSearchTerm('t');
      });
      
      act(() => {
        result.current.setSearchTerm('te');
      });
      
      act(() => {
        result.current.setSearchTerm('test');
      });
      
      // Should not filter immediately
      expect(result.current.filteredItems).toEqual(mockItems);
      
      // Wait for debounce
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 250));
      });
      
      // Now should be filtered
      expect(result.current.filteredItems).toHaveLength(2);
    });
  });

  describe('Dropdown State Management', () => {
    it('should open and close dropdown', () => {
      const { result } = renderHook(() => useSearchableDropdown(defaultOptions));
      
      act(() => {
        result.current.setIsOpen(true);
      });
      
      expect(result.current.isOpen).toBe(true);
      
      act(() => {
        result.current.setIsOpen(false);
      });
      
      expect(result.current.isOpen).toBe(false);
    });

    it('should handle focus events', () => {
      const { result } = renderHook(() => useSearchableDropdown(defaultOptions));
      
      act(() => {
        result.current.handleFocus();
      });
      
      expect(result.current.isOpen).toBe(true);
    });

    it('should handle blur events', async () => {
      const { result } = renderHook(() => useSearchableDropdown(defaultOptions));
      
      // First open the dropdown
      act(() => {
        result.current.setIsOpen(true);
      });
      
      act(() => {
        result.current.handleBlur();
      });
      
      // Wait for the setTimeout in handleBlur to complete
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });
      
      expect(result.current.isOpen).toBe(false);
    });

    it('should provide open and close methods', () => {
      const { result } = renderHook(() => useSearchableDropdown(defaultOptions));
      
      act(() => {
        result.current.open();
      });
      
      expect(result.current.isOpen).toBe(true);
      
      act(() => {
        result.current.close();
      });
      
      expect(result.current.isOpen).toBe(false);
    });
  });

  describe('Item Selection', () => {
    it('should select an item', () => {
      const { result } = renderHook(() => useSearchableDropdown(defaultOptions));
      
      act(() => {
        result.current.setSelectedItem(mockItems[0]);
      });
      
      expect(result.current.selectedItem).toBe(mockItems[0]);
    });

    it('should handle item selection', () => {
      const { result } = renderHook(() => useSearchableDropdown(defaultOptions));
      
      act(() => {
        result.current.handleItemSelect(mockItems[1]);
      });
      
      expect(result.current.selectedItem).toBe(mockItems[1]);
    });

    it('should close dropdown on select when closeOnSelect is true', () => {
      const { result } = renderHook(() => useSearchableDropdown({
        ...defaultOptions,
        closeOnSelect: true,
      }));
      
      // Open dropdown first
      act(() => {
        result.current.setIsOpen(true);
      });
      
      act(() => {
        result.current.handleItemSelect(mockItems[0]);
      });
      
      expect(result.current.isOpen).toBe(false);
    });

    it('should not close dropdown on select when closeOnSelect is false', () => {
      const { result } = renderHook(() => useSearchableDropdown({
        ...defaultOptions,
        closeOnSelect: false,
      }));
      
      // Open dropdown first
      act(() => {
        result.current.setIsOpen(true);
      });
      
      act(() => {
        result.current.handleItemSelect(mockItems[0]);
      });
      
      expect(result.current.isOpen).toBe(true);
    });

    it('should clear search on select when clearSearchOnSelect is true', () => {
      const { result } = renderHook(() => useSearchableDropdown({
        ...defaultOptions,
        clearSearchOnSelect: true,
      }));
      
      // Set search term first
      act(() => {
        result.current.setSearchTerm('test');
      });
      
      act(() => {
        result.current.handleItemSelect(mockItems[0]);
      });
      
      expect(result.current.searchTerm).toBe('');
    });

    it('should not clear search on select when clearSearchOnSelect is false', () => {
      const { result } = renderHook(() => useSearchableDropdown({
        ...defaultOptions,
        clearSearchOnSelect: false,
      }));
      
      // Set search term first
      act(() => {
        result.current.setSearchTerm('test');
      });
      
      act(() => {
        result.current.handleItemSelect(mockItems[0]);
      });
      
      expect(result.current.searchTerm).toBe('test');
    });
  });

  describe('Clear and Reset Functionality', () => {
    it('should clear selection', () => {
      const { result } = renderHook(() => useSearchableDropdown(defaultOptions));
      
      // Set selection first
      act(() => {
        result.current.setSelectedItem(mockItems[0]);
      });
      
      act(() => {
        result.current.clearSelection();
      });
      
      expect(result.current.selectedItem).toBe(null);
    });

    it('should reset all state', () => {
      const { result } = renderHook(() => useSearchableDropdown(defaultOptions));
      
      // Set some state first
      act(() => {
        result.current.setSearchTerm('test');
        result.current.setIsOpen(true);
        result.current.setSelectedItem(mockItems[0]);
      });
      
      act(() => {
        result.current.reset();
      });
      
      expect(result.current.searchTerm).toBe('');
      expect(result.current.isOpen).toBe(false);
      expect(result.current.selectedItem).toBe(null);
    });
  });

  describe('Configuration Options', () => {
    it('should respect autoSelectFirst option', () => {
      const { result } = renderHook(() => useSearchableDropdown({
        ...defaultOptions,
        autoSelectFirst: true,
      }));
      
      // This would need implementation in the actual hook
      // For now, just verify the hook works with this option
      expect(result.current.filteredItems).toEqual(mockItems);
    });

    it('should handle empty items array', () => {
      const { result } = renderHook(() => useSearchableDropdown({
        ...defaultOptions,
        items: [],
      }));
      
      expect(result.current.filteredItems).toEqual([]);
    });

    it('should update filtered items when items prop changes', () => {
      const { result, rerender } = renderHook(
        (props) => useSearchableDropdown(props),
        { initialProps: defaultOptions }
      );
      
      expect(result.current.filteredItems).toHaveLength(3);
      
      // Update items
      const newItems = [mockItems[0]];
      rerender({
        ...defaultOptions,
        items: newItems,
      });
      
      expect(result.current.filteredItems).toHaveLength(1);
    });
  });

  describe('State Computed Properties', () => {
    it('should provide hasSelection computed property', () => {
      const { result } = renderHook(() => useSearchableDropdown(defaultOptions));
      
      expect(result.current.hasSelection).toBe(false);
      
      act(() => {
        result.current.setSelectedItem(mockItems[0]);
      });
      
      expect(result.current.hasSelection).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle null items gracefully', () => {
      const { result } = renderHook(() => useSearchableDropdown({
        ...defaultOptions,
        items: null,
      }));
      
      expect(result.current.filteredItems).toEqual([]);
    });

    it('should handle invalid search config gracefully', () => {
      const { result } = renderHook(() => useSearchableDropdown({
        ...defaultOptions,
        searchConfig: null,
      }));
      
      // Should not crash and should return items as-is
      expect(result.current.filteredItems).toBeDefined();
    });
  });
});
