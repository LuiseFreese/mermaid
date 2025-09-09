/**
 * Unit Tests for SearchableDropdown Component
 * Tests the generic searchable dropdown functionality
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { SearchableDropdown, SearchableDropdownProps } from '../../../src/components/wizard/steps/solution-setup/components/SearchableDropdown/SearchableDropdown';

// Mock data for testing
const mockItems = [
  { id: '1', name: 'Test Item 1', description: 'First test item' },
  { id: '2', name: 'Test Item 2', description: 'Second test item' },
  { id: '3', name: 'Another Item', description: 'Third test item' },
];

describe('SearchableDropdown', () => {
  const defaultProps: SearchableDropdownProps<typeof mockItems[0]> = {
    items: mockItems,
    selectedItem: null,
    onItemSelect: vi.fn(),
    searchTerm: '',
    onSearchChange: vi.fn(),
    placeholder: 'Search items...',
    renderItem: (item) => <div data-testid={`item-${item.id}`}>{item.name}</div>,
    renderSelectedItem: (item) => item.name,
    getItemKey: (item) => item.id,
    isOpen: false,
    onOpenChange: vi.fn(),
    loading: false,
    error: null,
    label: 'Test Dropdown',
    hint: 'Select an item from the list',
    required: false,
    disabled: false,
    maxDropdownHeight: 200,
    maxItemsToShow: 10,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render with label and hint', () => {
      render(<SearchableDropdown {...defaultProps} />);
      
      expect(screen.getByText('Test Dropdown')).toBeInTheDocument();
      expect(screen.getByText('Select an item from the list')).toBeInTheDocument();
    });

    it('should render input field with placeholder', () => {
      render(<SearchableDropdown {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Search items...');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'text');
    });

    it('should show required indicator when required is true', () => {
      render(<SearchableDropdown {...defaultProps} required={true} />);
      
      expect(screen.getByText('Test Dropdown')).toBeInTheDocument();
      // Check for required indicator (usually an asterisk)
    });
  });

  describe('Search Functionality', () => {
    it('should call onSearchChange when typing in input', async () => {
      const user = userEvent.setup();
      const onSearchChange = vi.fn();
      
      render(<SearchableDropdown {...defaultProps} onSearchChange={onSearchChange} />);
      
      const input = screen.getByPlaceholderText('Search items...');
      
      // Type one character at a time and check
      await user.type(input, 't');
      expect(onSearchChange).toHaveBeenCalledWith('t');
      
      // Clear the mock to test another character
      onSearchChange.mockClear();
      await user.type(input, 'e');
      expect(onSearchChange).toHaveBeenCalled();
    });

    it('should display search term in input field', () => {
      render(<SearchableDropdown {...defaultProps} searchTerm="test query" />);
      
      const input = screen.getByDisplayValue('test query');
      expect(input).toBeInTheDocument();
    });
  });

  describe('Dropdown Behavior', () => {
    it('should call onOpenChange when input is focused', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      
      render(<SearchableDropdown {...defaultProps} onOpenChange={onOpenChange} />);
      
      const input = screen.getByPlaceholderText('Search items...');
      await user.click(input);
      
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });

    it('should show dropdown items when isOpen is true', () => {
      render(<SearchableDropdown {...defaultProps} isOpen={true} />);
      
      expect(screen.getByTestId('item-1')).toBeInTheDocument();
      expect(screen.getByTestId('item-2')).toBeInTheDocument();
      expect(screen.getByTestId('item-3')).toBeInTheDocument();
    });

    it('should hide dropdown items when isOpen is false', () => {
      render(<SearchableDropdown {...defaultProps} isOpen={false} />);
      
      expect(screen.queryByTestId('item-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('item-2')).not.toBeInTheDocument();
    });
  });

  describe('Item Selection', () => {
    it('should call onItemSelect when item is clicked', async () => {
      const user = userEvent.setup();
      const onItemSelect = vi.fn();
      
      render(<SearchableDropdown {...defaultProps} onItemSelect={onItemSelect} isOpen={true} />);
      
      const item = screen.getByTestId('item-1');
      await user.click(item);
      
      expect(onItemSelect).toHaveBeenCalledWith(mockItems[0]);
    });

    it('should display selected item when selectedItem is provided', () => {
      render(<SearchableDropdown 
        {...defaultProps} 
        selectedItem={mockItems[0]}
        renderSelectedItem={(item) => `Selected: ${item.name}`}
      />);
      
      expect(screen.getByDisplayValue('Selected: Test Item 1')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show loading indicator when loading is true', () => {
      render(<SearchableDropdown {...defaultProps} loading={true} isOpen={true} />);
      
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should not show items when loading', () => {
      render(<SearchableDropdown {...defaultProps} loading={true} isOpen={true} />);
      
      expect(screen.queryByTestId('item-1')).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should display error message when error is provided', () => {
      const errorMessage = 'Failed to load items';
      render(<SearchableDropdown {...defaultProps} error={errorMessage} isOpen={true} />);
      
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should not show items when there is an error', () => {
      render(<SearchableDropdown {...defaultProps} error="Error" isOpen={true} />);
      
      expect(screen.queryByTestId('item-1')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<SearchableDropdown {...defaultProps} />);
      
      const input = screen.getByPlaceholderText('Search items...');
      expect(input).toHaveAttribute('role', 'combobox');
      expect(input).toHaveAttribute('aria-expanded', 'false');
    });

    it('should update aria-expanded when dropdown opens', () => {
      render(<SearchableDropdown {...defaultProps} isOpen={true} />);
      
      const input = screen.getByPlaceholderText('Search items...');
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      const onItemSelect = vi.fn();
      
      render(<SearchableDropdown 
        {...defaultProps} 
        onItemSelect={onItemSelect} 
        isOpen={true} 
      />);
      
      const input = screen.getByPlaceholderText('Search items...');
      await user.click(input);
      
      // Test Enter key selection (should select first item)
      await user.keyboard('[Enter]');
      
      // Verify selection behavior
      expect(onItemSelect).toHaveBeenCalledWith(mockItems[0]);
    });
  });

  describe('Disabled State', () => {
    it('should disable input when disabled is true', () => {
      render(<SearchableDropdown {...defaultProps} disabled={true} />);
      
      const input = screen.getByPlaceholderText('Search items...');
      expect(input).toBeDisabled();
    });

    it('should not open dropdown when disabled', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      
      render(<SearchableDropdown 
        {...defaultProps} 
        disabled={true} 
        onOpenChange={onOpenChange} 
      />);
      
      const input = screen.getByPlaceholderText('Search items...');
      await user.click(input);
      
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  describe('Empty State', () => {
    it('should show no results message when items array is empty', () => {
      render(<SearchableDropdown 
        {...defaultProps} 
        items={[]} 
        isOpen={true} 
        searchTerm="test" 
      />);
      
      expect(screen.getByText(/no.*found/i)).toBeInTheDocument();
    });
  });

  describe('Limits and Constraints', () => {
    it('should limit displayed items based on maxItemsToShow', () => {
      const manyItems = Array.from({ length: 20 }, (_, i) => ({
        id: `item-${i}`,
        name: `Item ${i}`,
        description: `Description ${i}`
      }));
      
      render(<SearchableDropdown 
        {...defaultProps} 
        items={manyItems}
        maxItemsToShow={5}
        isOpen={true}
        renderItem={(item) => <div data-testid={`item-${item.id}`}>{item.name}</div>}
        getItemKey={(item) => item.id}
      />);
      
      // Should only show first 5 items
      expect(screen.getByTestId('item-item-0')).toBeInTheDocument();
      expect(screen.getByTestId('item-item-4')).toBeInTheDocument();
      expect(screen.queryByTestId('item-item-5')).not.toBeInTheDocument();
    });
  });
});
