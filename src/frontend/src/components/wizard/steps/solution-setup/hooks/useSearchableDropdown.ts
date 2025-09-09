/**
 * Custom hook for searchable dropdown functionality
 * Generic hook that can be used for both solutions and publishers
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  UseSearchableDropdownResult,
  SearchConfiguration,
} from '../types';
import {
  filterItems,
  sortByRelevance,
} from '../utils';

interface UseSearchableDropdownOptions<T> {
  items: T[];
  searchConfig: SearchConfiguration<T>;
  debounceDelay?: number;
  sortByRelevance?: boolean;
  autoSelectFirst?: boolean;
  closeOnSelect?: boolean;
  clearSearchOnSelect?: boolean;
}

/**
 * Generic hook for searchable dropdown functionality
 * Can be used for any type of items with configurable search properties
 */
export const useSearchableDropdown = <T>({
  items,
  searchConfig,
  debounceDelay = 300,
  sortByRelevance: shouldSort = true,
  autoSelectFirst = false,
  closeOnSelect = true,
  clearSearchOnSelect = true,
}: UseSearchableDropdownOptions<T>): UseSearchableDropdownResult<T> => {
  // State management
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);

  // Ref for debounce cleanup
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search term update
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, debounceDelay);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchTerm, debounceDelay]);

  // Filter items based on search term
  const filteredItems = useMemo(() => {
    let filtered = filterItems(items || [], debouncedSearchTerm, searchConfig);

    // Sort by relevance if requested
    if (shouldSort && debouncedSearchTerm.trim()) {
      filtered = sortByRelevance(
        filtered,
        debouncedSearchTerm,
        searchConfig.searchProperties,
        false // case insensitive
      );
    }

    return filtered;
  }, [items, debouncedSearchTerm, searchConfig, shouldSort]);

  // Auto-select first item if enabled and no item is selected
  useEffect(() => {
    if (autoSelectFirst && filteredItems.length > 0 && !selectedItem) {
      setSelectedItem(filteredItems[0]);
    }
  }, [autoSelectFirst, filteredItems, selectedItem]);

  /**
   * Handles search term changes
   */
  const handleSearchChange = useCallback((newSearchTerm: string) => {
    setSearchTerm(newSearchTerm);
    if (!isOpen) {
      setIsOpen(true);
    }
  }, [isOpen]);

  /**
   * Handles item selection
   */
  const handleItemSelect = useCallback((item: T) => {
    setSelectedItem(item);
    
    if (clearSearchOnSelect) {
      setSearchTerm('');
      setDebouncedSearchTerm('');
    }
    
    if (closeOnSelect) {
      setIsOpen(false);
    }
  }, [clearSearchOnSelect, closeOnSelect]);

  /**
   * Handles focus events
   */
  const handleFocus = useCallback(() => {
    setIsOpen(true);
  }, []);

  /**
   * Handles blur events
   */
  const handleBlur = useCallback(() => {
    // Delay closing to allow for item clicks
    setTimeout(() => {
      setIsOpen(false);
    }, 150);
  }, []);

  /**
   * Clears the current selection
   */
  const clearSelection = useCallback(() => {
    setSelectedItem(null);
    setSearchTerm('');
    setDebouncedSearchTerm('');
  }, []);

  /**
   * Resets the dropdown to initial state
   */
  const reset = useCallback(() => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setSelectedItem(null);
    setIsOpen(false);
  }, []);

  /**
   * Opens the dropdown manually
   */
  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  /**
   * Closes the dropdown manually
   */
  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  /**
   * Gets additional state information
   */
  const state = useMemo(() => ({
    hasSelection: selectedItem !== null,
    hasFilteredItems: (filteredItems?.length || 0) > 0,
    isSearching: debouncedSearchTerm.trim().length > 0,
    isEmpty: (items?.length || 0) === 0,
    isFiltered: debouncedSearchTerm.trim().length > 0 && (filteredItems?.length || 0) !== (items?.length || 0),
  }), [selectedItem, filteredItems, debouncedSearchTerm, items]);

  return {
    // Core state
    searchTerm,
    setSearchTerm,
    filteredItems,
    isOpen,
    setIsOpen,
    selectedItem,
    setSelectedItem,
    
    // Event handlers
    handleItemSelect,
    handleSearchChange,
    handleFocus,
    handleBlur,
    
    // Additional methods
    clearSelection,
    reset,
    open,
    close,
    
    // Computed state
    ...state,
  };
};
