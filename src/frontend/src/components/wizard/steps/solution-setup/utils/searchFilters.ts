/**
 * Search and Filtering Utilities for Solution Setup
 * Handles search functionality for solutions and publishers
 */

// Temporary placeholder types (will be replaced during integration)
interface Publisher {
  displayName: string;
  uniqueName: string;
  prefix: string;
  [key: string]: any;
}

interface Solution {
  friendlyname: string;
  uniquename: string;
  [key: string]: any;
}

import { SearchConfiguration, PublisherSearchConfig } from '../types';

/**
 * Generic search filter function that works with any object type
 * Searches across specified properties with configurable options
 */
export const filterItems = <T>(
  items: T[],
  searchTerm: string,
  config: SearchConfiguration<T>
): T[] => {
  if (!searchTerm?.trim()) {
    return items;
  }

  const {
    searchProperties,
    caseSensitive = false,
    exactMatch = false,
    maxResults = 50,
  } = config;

  const normalizedSearchTerm = caseSensitive 
    ? searchTerm.trim() 
    : searchTerm.trim().toLowerCase();

  const filtered = items.filter(item => {
    return searchProperties.some(property => {
      const value = item[property];
      if (!value) return false;

      const stringValue = String(value);
      const normalizedValue = caseSensitive 
        ? stringValue 
        : stringValue.toLowerCase();

      return exactMatch 
        ? normalizedValue === normalizedSearchTerm
        : normalizedValue.includes(normalizedSearchTerm);
    });
  });

  return filtered.slice(0, maxResults);
};

/**
 * Specialized search function for publishers
 * Searches across display name, unique name, and prefix
 */
export const filterPublishers = (
  publishers: Publisher[],
  searchTerm: string,
  config: Partial<PublisherSearchConfig> = {}
): Publisher[] => {
  const defaultConfig: PublisherSearchConfig = {
    searchFields: ['displayName', 'uniqueName', 'prefix'],
    caseSensitive: false,
    maxResults: 10,
    minSearchLength: 1,
  };

  const searchConfig = { ...defaultConfig, ...config };

  if (!searchTerm?.trim() || searchTerm.length < searchConfig.minSearchLength) {
    return publishers.slice(0, searchConfig.maxResults);
  }

  const searchConfiguration: SearchConfiguration<Publisher> = {
    searchProperties: searchConfig.searchFields,
    caseSensitive: searchConfig.caseSensitive,
    maxResults: searchConfig.maxResults,
  };

  return filterItems(publishers, searchTerm, searchConfiguration);
};

/**
 * Specialized search function for solutions
 * Searches across friendly name, unique name, and publisher name
 */
export const filterSolutions = (
  solutions: Solution[],
  searchTerm: string,
  maxResults: number = 15
): Solution[] => {
  if (!searchTerm?.trim()) {
    return solutions.slice(0, maxResults);
  }

  const normalizedSearchTerm = searchTerm.toLowerCase().trim();

  const filtered = solutions.filter(solution => {
    // Search in solution friendly name
    const friendlyNameMatch = solution.friendlyname
      ?.toLowerCase()
      .includes(normalizedSearchTerm);

    // Search in solution unique name
    const uniqueNameMatch = solution.uniquename
      ?.toLowerCase()
      .includes(normalizedSearchTerm);

    // Search in publisher unique name
    const publisherMatch = solution.publisherid?.uniquename
      ?.toLowerCase()
      .includes(normalizedSearchTerm);

    return friendlyNameMatch || uniqueNameMatch || publisherMatch;
  });

  return filtered.slice(0, maxResults);
};

/**
 * Highlights search terms in text for better UX
 * Returns text with highlighted portions marked
 */
export const highlightSearchTerm = (
  text: string,
  searchTerm: string,
  caseSensitive: boolean = false
): { text: string; highlights: Array<{ start: number; end: number }> } => {
  if (!searchTerm?.trim() || !text) {
    return { text, highlights: [] };
  }

  const normalizedText = caseSensitive ? text : text.toLowerCase();
  const normalizedSearchTerm = caseSensitive ? searchTerm.trim() : searchTerm.trim().toLowerCase();
  
  const highlights: Array<{ start: number; end: number }> = [];
  let startIndex = 0;

  while (true) {
    const index = normalizedText.indexOf(normalizedSearchTerm, startIndex);
    if (index === -1) break;

    highlights.push({
      start: index,
      end: index + normalizedSearchTerm.length,
    });

    startIndex = index + normalizedSearchTerm.length;
  }

  return { text, highlights };
};

/**
 * Sorts search results by relevance
 * Items that match at the beginning of properties are ranked higher
 */
export const sortByRelevance = <T>(
  items: T[],
  searchTerm: string,
  searchProperties: (keyof T)[],
  caseSensitive: boolean = false
): T[] => {
  if (!searchTerm?.trim()) {
    return items;
  }

  const normalizedSearchTerm = caseSensitive 
    ? searchTerm.trim() 
    : searchTerm.trim().toLowerCase();

  return items.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    searchProperties.forEach(property => {
      const valueA = String(a[property] || '');
      const valueB = String(b[property] || '');
      
      const normalizedA = caseSensitive ? valueA : valueA.toLowerCase();
      const normalizedB = caseSensitive ? valueB : valueB.toLowerCase();

      // Exact match gets highest score
      if (normalizedA === normalizedSearchTerm) scoreA += 100;
      if (normalizedB === normalizedSearchTerm) scoreB += 100;

      // Starts with search term gets high score
      if (normalizedA.startsWith(normalizedSearchTerm)) scoreA += 50;
      if (normalizedB.startsWith(normalizedSearchTerm)) scoreB += 50;

      // Contains search term gets lower score
      if (normalizedA.includes(normalizedSearchTerm)) scoreA += 10;
      if (normalizedB.includes(normalizedSearchTerm)) scoreB += 10;
    });

    return scoreB - scoreA; // Higher score first
  });
};

/**
 * Debounces search input to reduce API calls and improve performance
 */
export const createSearchDebouncer = (
  callback: (searchTerm: string) => void,
  delay: number = 300
) => {
  let timeoutId: NodeJS.Timeout | null = null;

  return (searchTerm: string) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      callback(searchTerm);
    }, delay);
  };
};

/**
 * Validates search terms and provides user feedback
 */
export const validateSearchTerm = (
  searchTerm: string,
  minLength: number = 1,
  maxLength: number = 100
): { isValid: boolean; message?: string } => {
  if (!searchTerm) {
    return { isValid: true }; // Empty search is valid (shows all items)
  }

  const trimmed = searchTerm.trim();

  if (trimmed.length < minLength) {
    return {
      isValid: false,
      message: `Search term must be at least ${minLength} character${minLength > 1 ? 's' : ''}`,
    };
  }

  if (trimmed.length > maxLength) {
    return {
      isValid: false,
      message: `Search term must be no more than ${maxLength} characters`,
    };
  }

  return { isValid: true };
};

/**
 * Builds search configuration for different entity types
 */
export const createPublisherSearchConfig = (
  overrides: Partial<SearchConfiguration<Publisher>> = {}
): SearchConfiguration<Publisher> => {
  const defaultConfig: SearchConfiguration<Publisher> = {
    searchProperties: ['displayName', 'uniqueName', 'prefix'],
    caseSensitive: false,
    maxResults: 10,
    exactMatch: false,
  };

  return { ...defaultConfig, ...overrides };
};

/**
 * Creates a search configuration for solutions
 */
export const createSolutionSearchConfig = (maxResults: number = 15): SearchConfiguration<Solution> => ({
  maxResults,
  searchProperties: ['friendlyname', 'uniquename'],
  caseSensitive: false,
  exactMatch: false,
});

/**
 * Groups search results by category for better organization
 */
export const groupSearchResults = <T>(
  items: T[],
  groupBy: keyof T,
  _searchTerm: string
): Record<string, T[]> => {
  const groups: Record<string, T[]> = {};

  items.forEach(item => {
    const groupKey = String(item[groupBy] || 'Other');
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(item);
  });

  return groups;
};
