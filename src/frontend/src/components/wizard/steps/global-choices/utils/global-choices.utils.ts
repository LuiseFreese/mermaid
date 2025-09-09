/**
 * Utility functions for Global Choices Step
 * Extracted from GlobalChoicesStep.tsx for better organization and testability
 */

import { 
  GlobalChoice, 
  GlobalChoiceOption, 
  GlobalChoicesJsonData, 
  GlobalChoicesFilterOptions,
  GlobalChoicesValidationError,
  GlobalChoicesValidationResult,
  JsonFormatType,
  GLOBAL_CHOICES_CONSTANTS,
  JSON_FORMAT_PATTERNS,
  GLOBAL_CHOICES_ERROR_MESSAGES
} from '../types/global-choices.types';

// ===== SEARCH AND FILTERING =====

/**
 * Filters global choices based on search criteria
 */
export function filterGlobalChoices(
  choices: GlobalChoice[], 
  filters: GlobalChoicesFilterOptions
): GlobalChoice[] {
  if (!choices || choices.length === 0) return [];

  let filtered = [...choices];

  // Filter by search term
  if (filters.searchTerm && filters.searchTerm.length >= GLOBAL_CHOICES_CONSTANTS.MIN_SEARCH_LENGTH) {
    const searchLower = filters.searchTerm.toLowerCase();
    filtered = filtered.filter(choice => 
      choice.name?.toLowerCase().includes(searchLower) ||
      choice.displayName?.toLowerCase().includes(searchLower) ||
      choice.logicalName?.toLowerCase().includes(searchLower) ||
      choice.options?.some(option => 
        option.label?.toLowerCase().includes(searchLower) ||
        option.description?.toLowerCase().includes(searchLower)
      )
    );
  }

  // Filter by built-in vs custom
  if (!filters.includeBuiltIn || !filters.includeCustom) {
    filtered = filtered.filter(choice => {
      const isBuiltIn = !choice.isCustom;
      return (filters.includeBuiltIn && isBuiltIn) || 
             (filters.includeCustom && choice.isCustom);
    });
  }

  return filtered;
}

/**
 * Searches for specific global choices by various criteria
 */
export function searchGlobalChoices(
  choices: GlobalChoice[], 
  searchTerm: string,
  options: {
    searchFields?: ('name' | 'displayName' | 'logicalName' | 'options')[];
    caseSensitive?: boolean;
    exactMatch?: boolean;
  } = {}
): GlobalChoice[] {
  if (!searchTerm || searchTerm.length < GLOBAL_CHOICES_CONSTANTS.MIN_SEARCH_LENGTH) {
    return choices;
  }

  const {
    searchFields = ['name', 'displayName', 'logicalName', 'options'],
    caseSensitive = false,
    exactMatch = false
  } = options;

  const searchValue = caseSensitive ? searchTerm : searchTerm.toLowerCase();

  return choices.filter(choice => {
    return searchFields.some(field => {
      switch (field) {
        case 'name':
          return matchesSearchTerm(choice.name, searchValue, { caseSensitive, exactMatch });
        case 'displayName':
          return matchesSearchTerm(choice.displayName, searchValue, { caseSensitive, exactMatch });
        case 'logicalName':
          return matchesSearchTerm(choice.logicalName, searchValue, { caseSensitive, exactMatch });
        case 'options':
          return choice.options?.some(option => 
            matchesSearchTerm(option.label, searchValue, { caseSensitive, exactMatch }) ||
            matchesSearchTerm(option.description, searchValue, { caseSensitive, exactMatch })
          );
        default:
          return false;
      }
    });
  });
}

/**
 * Helper function to match search terms
 */
function matchesSearchTerm(
  value: string | undefined, 
  searchValue: string, 
  options: { caseSensitive: boolean; exactMatch: boolean }
): boolean {
  if (!value) return false;
  
  const targetValue = options.caseSensitive ? value : value.toLowerCase();
  
  if (options.exactMatch) {
    return targetValue === searchValue;
  }
  
  return targetValue.includes(searchValue);
}

// ===== SELECTION UTILITIES =====

/**
 * Checks if a choice is selected in the given selection array
 */
export function isChoiceSelected(choice: GlobalChoice, selectedChoices: GlobalChoice[]): boolean {
  return selectedChoices.some(selected => selected.id === choice.id);
}

/**
 * Adds a choice to the selection array if not already present
 */
export function addChoiceToSelection(choice: GlobalChoice, selectedChoices: GlobalChoice[]): GlobalChoice[] {
  if (isChoiceSelected(choice, selectedChoices)) {
    return selectedChoices;
  }
  return [...selectedChoices, choice];
}

/**
 * Removes a choice from the selection array
 */
export function removeChoiceFromSelection(choice: GlobalChoice, selectedChoices: GlobalChoice[]): GlobalChoice[] {
  return selectedChoices.filter(selected => selected.id !== choice.id);
}

/**
 * Toggles a choice in the selection array
 */
export function toggleChoiceSelection(choice: GlobalChoice, selectedChoices: GlobalChoice[]): GlobalChoice[] {
  if (isChoiceSelected(choice, selectedChoices)) {
    return removeChoiceFromSelection(choice, selectedChoices);
  }
  return addChoiceToSelection(choice, selectedChoices);
}

/**
 * Gets unique choices from multiple arrays
 */
export function getUniqueChoices(...choiceArrays: GlobalChoice[][]): GlobalChoice[] {
  const uniqueMap = new Map<string, GlobalChoice>();
  
  choiceArrays.forEach(choices => {
    choices?.forEach(choice => {
      if (choice.id && !uniqueMap.has(choice.id)) {
        uniqueMap.set(choice.id, choice);
      }
    });
  });
  
  return Array.from(uniqueMap.values());
}

// ===== JSON FILE PROCESSING =====

/**
 * Detects the format of uploaded JSON data
 */
export function detectJsonFormat(data: any): JsonFormatType {
  if (data?.globalChoices && Array.isArray(data.globalChoices)) {
    return JSON_FORMAT_PATTERNS.STANDARD;
  }
  
  if (Array.isArray(data)) {
    return JSON_FORMAT_PATTERNS.ARRAY;
  }
  
  return JSON_FORMAT_PATTERNS.LEGACY;
}

/**
 * Parses JSON file content into GlobalChoice array
 */
export async function parseJsonFileContent(file: File): Promise<GlobalChoice[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsedData = JSON.parse(content);
        const choices = extractChoicesFromJsonData(parsedData);
        resolve(choices);
      } catch (error) {
        reject(new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
}

/**
 * Extracts global choices from various JSON formats
 */
export function extractChoicesFromJsonData(data: any): GlobalChoice[] {
  const format = detectJsonFormat(data);
  
  switch (format) {
    case JSON_FORMAT_PATTERNS.STANDARD:
      return validateAndNormalizeChoices(data.globalChoices);
      
    case JSON_FORMAT_PATTERNS.ARRAY:
      return validateAndNormalizeChoices(data);
      
    case JSON_FORMAT_PATTERNS.LEGACY:
      // Try to extract from various legacy formats
      if (data.choices) {
        return validateAndNormalizeChoices(data.choices);
      }
      if (data.optionSets) {
        return validateAndNormalizeChoices(data.optionSets);
      }
      if (data.globalOptionSets) {
        return validateAndNormalizeChoices(data.globalOptionSets);
      }
      break;
  }
  
  throw new Error('Unsupported JSON format. Expected globalChoices array or direct array of choices.');
}

/**
 * Validates and normalizes choice data
 */
function validateAndNormalizeChoices(choices: any[]): GlobalChoice[] {
  if (!Array.isArray(choices)) {
    throw new Error('Choices data must be an array');
  }
  
  return choices.map((choice, index) => {
    if (!choice || typeof choice !== 'object') {
      throw new Error(`Invalid choice at index ${index}: must be an object`);
    }
    
    const normalized: GlobalChoice = {
      id: choice.id || choice.logicalName || `imported_${index}`,
      name: choice.name || choice.displayName || choice.logicalName || `Choice ${index + 1}`,
      displayName: choice.displayName || choice.name || choice.logicalName || `Choice ${index + 1}`,
      logicalName: choice.logicalName || choice.name || `choice_${index}`,
      options: normalizeChoiceOptions(choice.options || []),
      isCustom: choice.isCustom !== undefined ? choice.isCustom : true,
      prefix: choice.prefix || undefined
    };
    
    return normalized;
  });
}

/**
 * Normalizes choice options
 */
function normalizeChoiceOptions(options: any[]): GlobalChoiceOption[] {
  if (!Array.isArray(options)) {
    return [];
  }
  
  return options.map((option, index) => ({
    value: option.value !== undefined ? Number(option.value) : index,
    label: option.label || option.text || option.name || `Option ${index + 1}`,
    description: option.description || undefined,
    color: option.color || undefined
  }));
}

// ===== VALIDATION =====

/**
 * Validates file before upload
 */
export function validateUploadFile(file: File): GlobalChoicesValidationError[] {
  const errors: GlobalChoicesValidationError[] = [];
  
  // Check file size
  if (file.size > GLOBAL_CHOICES_CONSTANTS.MAX_FILE_SIZE) {
    errors.push({
      field: 'file',
      message: GLOBAL_CHOICES_ERROR_MESSAGES.FILE_TOO_LARGE,
      type: 'upload'
    });
  }
  
  // Check file type
  const extension = file.name.toLowerCase().split('.').pop();
  if (!extension || !GLOBAL_CHOICES_CONSTANTS.SUPPORTED_FILE_TYPES.includes(`.${extension}` as '.json')) {
    errors.push({
      field: 'file',
      message: GLOBAL_CHOICES_ERROR_MESSAGES.UNSUPPORTED_FILE_TYPE,
      type: 'upload'
    });
  }
  
  return errors;
}

/**
 * Validates global choices selection
 */
export function validateGlobalChoicesSelection(selectedChoices: GlobalChoice[]): GlobalChoicesValidationResult {
  const errors: GlobalChoicesValidationError[] = [];
  const warnings: GlobalChoicesValidationError[] = [];
  
  // Check if at least one choice is selected
  if (!selectedChoices || selectedChoices.length === 0) {
    errors.push({
      field: 'selection',
      message: GLOBAL_CHOICES_ERROR_MESSAGES.NO_CHOICES_SELECTED,
      type: 'required'
    });
  }
  
  // Check for too many selections
  if (selectedChoices.length > GLOBAL_CHOICES_CONSTANTS.MAX_SELECTIONS) {
    warnings.push({
      field: 'selection',
      message: `Consider limiting selections to ${GLOBAL_CHOICES_CONSTANTS.MAX_SELECTIONS} or fewer for better performance`,
      type: 'selection'
    });
  }
  
  // Validate individual choices
  selectedChoices.forEach((choice, index) => {
    if (!choice.id) {
      errors.push({
        field: `choice_${index}`,
        message: `Choice at index ${index} is missing an ID`,
        type: 'format'
      });
    }
    
    if (!choice.options || choice.options.length === 0) {
      warnings.push({
        field: `choice_${index}`,
        message: `Choice "${choice.name}" has no options defined`,
        type: 'format'
      });
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// ===== UTILITY HELPERS =====

/**
 * Debounce function for search input
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Generates a unique ID for choices
 */
export function generateChoiceId(name: string, prefix?: string): string {
  const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const timestamp = Date.now();
  const prefixPart = prefix ? `${prefix}_` : '';
  
  return `${prefixPart}${cleanName}_${timestamp}`;
}

/**
 * Formats choice name for display
 */
export function formatChoiceName(choice: GlobalChoice): string {
  if (choice.displayName && choice.displayName !== choice.name) {
    return `${choice.displayName} (${choice.name})`;
  }
  return choice.displayName || choice.name;
}

/**
 * Gets choice summary for display
 */
export function getChoiceSummary(choice: GlobalChoice): string {
  const optionCount = choice.options?.length || 0;
  const type = choice.isCustom ? 'Custom' : 'Built-in';
  
  return `${type} choice with ${optionCount} option${optionCount === 1 ? '' : 's'}`;
}

/**
 * Downloads choices as JSON file
 */
export function downloadChoicesAsJson(choices: GlobalChoice[], filename: string = 'global-choices.json'): void {
  const data: GlobalChoicesJsonData = {
    globalChoices: choices,
    exportedAt: new Date().toISOString(),
    version: '1.0'
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}
