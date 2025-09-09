/**
 * SearchableDropdown Component
 * Generic reusable dropdown with search functionality
 * Used for both solutions and publishers in solution setup
 */

import React, { useRef } from 'react';
import {
  Field,
  Input,
  Button,
  MessageBar,
  MessageBarBody,
  Spinner,
} from '@fluentui/react-components';
import { ChevronDownRegular, DismissRegular } from '@fluentui/react-icons';
import { UseSearchableDropdownResult } from '../../types';
import styles from './SearchableDropdown.module.css';

export interface SearchableDropdownProps<T> {
  // Data and selection
  items: T[];
  selectedItem: T | null;
  onItemSelect: (item: T) => void;
  
  // Search configuration
  searchTerm: string;
  onSearchChange: (term: string) => void;
  placeholder?: string;
  
  // Display configuration
  renderItem: (item: T) => React.ReactNode;
  renderSelectedItem?: (item: T) => string;
  getItemKey: (item: T) => string;
  
  // State
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  loading?: boolean;
  error?: string | null;
  
  // UI configuration
  label?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  maxDropdownHeight?: number;
  maxItemsToShow?: number;
  
  // Event handlers
  onFocus?: () => void;
  onBlur?: () => void;
  onRetry?: () => void;
  
  // Dropdown result integration
  dropdownResult?: UseSearchableDropdownResult<T>;
}

export const SearchableDropdown = React.memo(<T,>({
  items,
  selectedItem,
  onItemSelect,
  searchTerm,
  onSearchChange,
  placeholder = "Click to see all items or type to search...",
  renderItem,
  renderSelectedItem,
  getItemKey,
  isOpen,
  onOpenChange,
  loading = false,
  error = null,
  label,
  hint,
  required = false,
  disabled = false,
  maxDropdownHeight = 400,
  maxItemsToShow = 15,
  onFocus,
  onBlur,
  onRetry,
  dropdownResult,
}: SearchableDropdownProps<T>) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Use dropdown result if provided, otherwise use props
  const actualItems = dropdownResult?.filteredItems || items;
  const actualSelectedItem = dropdownResult?.selectedItem || selectedItem;
  const actualSearchTerm = dropdownResult?.searchTerm || searchTerm;
  const actualIsOpen = dropdownResult?.isOpen !== undefined ? dropdownResult.isOpen : isOpen;

  /**
   * Gets the display text for the input field
   */
  const getDisplayText = (): string => {
    if (actualSelectedItem) {
      if (renderSelectedItem) {
        return renderSelectedItem(actualSelectedItem);
      }
      // Try to extract a reasonable display text
      const item = actualSelectedItem as any;
      return item.displayName || item.friendlyname || item.name || item.title || String(item);
    }
    return actualSearchTerm;
  };

  /**
   * Handles input field changes
   */
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    
    if (dropdownResult) {
      dropdownResult.handleSearchChange(value);
    } else {
      onSearchChange(value);
      if (!actualIsOpen) {
        onOpenChange(true);
      }
    }
  };

  /**
   * Handles input field focus
   */
  const handleInputFocus = () => {
    if (actualSelectedItem) {
      // Clear selection when focusing to allow new search
      if (dropdownResult) {
        dropdownResult.clearSelection();
      } else {
        onItemSelect(null as any);
        onSearchChange('');
      }
    }
    
    if (dropdownResult) {
      dropdownResult.handleFocus();
    } else {
      onOpenChange(true);
    }
    
    onFocus?.();
  };

  /**
   * Handles input field blur
   */
  const handleInputBlur = () => {
    // Delay hiding to allow for dropdown item clicks
    setTimeout(() => {
      if (dropdownResult) {
        dropdownResult.handleBlur();
      } else {
        onOpenChange(false);
      }
    }, 150);
    
    onBlur?.();
  };

  /**
   * Handles item selection
   */
  const handleItemClick = (item: T) => {
    if (dropdownResult) {
      dropdownResult.handleItemSelect(item);
    } else {
      onItemSelect(item);
      onSearchChange('');
      onOpenChange(false);
    }
  };

  /**
   * Handles clear selection
   */
  const handleClearSelection = () => {
    if (dropdownResult) {
      dropdownResult.clearSelection();
    } else {
      onItemSelect(null as any);
      onSearchChange('');
    }
    inputRef.current?.focus();
  };

  /**
   * Handles keyboard navigation
   */
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (dropdownResult) {
        dropdownResult.close();
      } else {
        onOpenChange(false);
      }
      inputRef.current?.blur();
    } else if (event.key === 'Enter' && actualIsOpen && displayItems.length > 0) {
      // Select first item when Enter is pressed
      event.preventDefault();
      handleItemClick(displayItems[0]);
    } else if (event.key === 'ArrowDown') {
      // Open dropdown on arrow down
      event.preventDefault();
      if (!actualIsOpen) {
        if (dropdownResult) {
          dropdownResult.open();
        } else {
          onOpenChange(true);
        }
      }
    }
  };

  // Items to display (limited)
  const displayItems = actualItems.slice(0, maxItemsToShow);
  const hasMoreItems = actualItems.length > maxItemsToShow;

  return (
    <Field
      label={label}
      hint={hint}
      required={required}
      className={styles.field}
    >
      <div className={styles.dropdownContainer}>
        {/* Input Field */}
        <div className={styles.inputContainer}>
          <Input
            ref={inputRef}
            placeholder={loading ? "Loading..." : placeholder}
            value={getDisplayText()}
            disabled={disabled || loading}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            className={styles.input}
            role="combobox"
            aria-expanded={actualIsOpen}
            aria-haspopup="listbox"
            aria-controls={actualIsOpen ? "dropdown-list" : undefined}
          />
          
          {/* Loading Spinner */}
          {loading && (
            <div className={styles.inputIcon}>
              <Spinner size="tiny" />
            </div>
          )}
          
          {/* Clear Button */}
          {!loading && actualSelectedItem && (
            <Button
              appearance="transparent"
              size="small"
              icon={<DismissRegular />}
              onClick={handleClearSelection}
              className={styles.clearButton}
              tabIndex={-1}
            />
          )}
          
          {/* Dropdown Arrow */}
          {!loading && !actualSelectedItem && (
            <div className={styles.inputIcon}>
              <ChevronDownRegular />
            </div>
          )}
        </div>

        {/* Selected Item Display */}
        {actualSelectedItem && (
          <div className={styles.selectedItem}>
            <div className={styles.selectedContent}>
              {renderItem(actualSelectedItem)}
            </div>
            <Button
              appearance="transparent"
              size="small"
              onClick={handleClearSelection}
              className={styles.changeButton}
            >
              Change
            </Button>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <MessageBar intent="error" className={styles.errorMessage} role="alert">
            <MessageBarBody>
              {error}
              {onRetry && (
                <Button
                  appearance="transparent"
                  size="small"
                  onClick={onRetry}
                  className={styles.retryButton}
                >
                  Retry
                </Button>
              )}
            </MessageBarBody>
          </MessageBar>
        )}

        {/* Dropdown Results */}
        {!actualSelectedItem && actualIsOpen && !loading && !error && displayItems.length > 0 && (
          <div
            ref={dropdownRef}
            id="dropdown-list"
            role="listbox"
            className={styles.dropdown}
            style={{ maxHeight: maxDropdownHeight }}
            onMouseDown={(e) => {
              // Prevent input blur when clicking on dropdown
              e.preventDefault();
            }}
          >
            {displayItems.map((item) => (
              <div
                key={getItemKey(item)}
                onClick={() => handleItemClick(item)}
                className={styles.dropdownItem}
                role="option"
                aria-selected={false}
              >
                {renderItem(item)}
              </div>
            ))}
            
            {/* More Items Indicator */}
            {hasMoreItems && (
              <div className={styles.moreItemsIndicator}>
                {actualItems.length - maxItemsToShow} more results available. 
                Type to search and filter.
              </div>
            )}
          </div>
        )}

        {/* No Results Message */}
        {!actualSelectedItem && actualIsOpen && !loading && !error && actualSearchTerm && displayItems.length === 0 && (
          <div className={styles.dropdown}>
            <div className={styles.noResults}>
              No results found matching "{actualSearchTerm}"
            </div>
          </div>
        )}
      </div>
    </Field>
  );
}) as <T>(props: SearchableDropdownProps<T>) => JSX.Element;
