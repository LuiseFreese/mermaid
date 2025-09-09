/**
 * Tests for useNameGeneration hook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNameGeneration } from '../../../src/components/wizard/steps/solution-setup/hooks';

// Mock the utility functions
vi.mock('../../../src/components/wizard/steps/solution-setup/utils', () => ({
  generateInternalName: vi.fn(),
  generatePrefix: vi.fn(),
  validateInternalName: vi.fn(),
  validatePrefix: vi.fn(),
  generateSolutionInternalName: vi.fn(),
  generatePublisherInternalName: vi.fn(),
  cleanInternalName: vi.fn(),
  cleanPrefix: vi.fn(),
}));

// Import the mocked functions for assertions
import {
  generateInternalName,
  generatePrefix,
  validateInternalName,
  validatePrefix,
  generateSolutionInternalName,
  generatePublisherInternalName,
  cleanInternalName,
  cleanPrefix,
} from '../../../src/components/wizard/steps/solution-setup/utils';

const mockGenerateInternalName = generateInternalName as ReturnType<typeof vi.fn>;
const mockGeneratePrefix = generatePrefix as ReturnType<typeof vi.fn>;
const mockValidateInternalName = validateInternalName as ReturnType<typeof vi.fn>;
const mockValidatePrefix = validatePrefix as ReturnType<typeof vi.fn>;
const mockGenerateSolutionInternalName = generateSolutionInternalName as ReturnType<typeof vi.fn>;
const mockGeneratePublisherInternalName = generatePublisherInternalName as ReturnType<typeof vi.fn>;
const mockCleanInternalName = cleanInternalName as ReturnType<typeof vi.fn>;
const mockCleanPrefix = cleanPrefix as ReturnType<typeof vi.fn>;

describe('useNameGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock implementations
    mockGenerateInternalName.mockImplementation((displayName, options) => {
      return displayName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/gi, '');
    });
    
    mockGeneratePrefix.mockImplementation((name, maxLength = 10) => {
      return name.substring(0, maxLength).toLowerCase().replace(/[^a-z0-9]/g, '');
    });
    
    mockValidateInternalName.mockReturnValue(true);
    mockValidatePrefix.mockReturnValue(true);
    
    mockGenerateSolutionInternalName.mockImplementation((displayName) => {
      return `sol_${displayName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/gi, '')}`;
    });
    
    mockGeneratePublisherInternalName.mockImplementation((displayName) => {
      return `pub_${displayName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/gi, '')}`;
    });
    
    mockCleanInternalName.mockImplementation((name) => {
      return name.replace(/[^a-z0-9_]/gi, '').toLowerCase();
    });
    
    mockCleanPrefix.mockImplementation((prefix) => {
      return prefix.replace(/[^a-z0-9]/gi, '').toLowerCase();
    });
  });

  describe('Core Generation Functions', () => {
    it('should provide generateInternalName function', () => {
      const { result } = renderHook(() => useNameGeneration());

      const generated = result.current.generateInternalName('Test Solution');

      expect(mockGenerateInternalName).toHaveBeenCalledWith('Test Solution', undefined);
      expect(generated).toBe('testsolution');
    });

    it('should provide generateInternalName with options', () => {
      const { result } = renderHook(() => useNameGeneration());
      const options = { maxLength: 10 };

      result.current.generateInternalName('Test Solution', options);

      expect(mockGenerateInternalName).toHaveBeenCalledWith('Test Solution', options);
    });

    it('should provide generatePrefix function', () => {
      const { result } = renderHook(() => useNameGeneration());

      const prefix = result.current.generatePrefix('Test Publisher');

      expect(mockGeneratePrefix).toHaveBeenCalledWith('Test Publisher', undefined);
      expect(prefix).toBe('testpubli');
    });

    it('should provide generatePrefix with maxLength', () => {
      const { result } = renderHook(() => useNameGeneration());

      result.current.generatePrefix('Test Publisher', 5);

      expect(mockGeneratePrefix).toHaveBeenCalledWith('Test Publisher', 5);
    });
  });

  describe('Validation Functions', () => {
    it('should provide validateInternalName function', () => {
      const { result } = renderHook(() => useNameGeneration());

      const isValid = result.current.validateInternalName('test_solution');

      expect(mockValidateInternalName).toHaveBeenCalledWith('test_solution');
      expect(isValid).toBe(true);
    });

    it('should provide validatePrefix function', () => {
      const { result } = renderHook(() => useNameGeneration());

      const isValid = result.current.validatePrefix('test');

      expect(mockValidatePrefix).toHaveBeenCalledWith('test');
      expect(isValid).toBe(true);
    });

    it('should handle validation failure', () => {
      mockValidateInternalName.mockReturnValue(false);
      const { result } = renderHook(() => useNameGeneration());

      const isValid = result.current.validateInternalName('invalid-name');

      expect(isValid).toBe(false);
    });
  });

  describe('Specialized Generators', () => {
    it('should provide solutionInternalName function', () => {
      const { result } = renderHook(() => useNameGeneration());

      const generated = result.current.solutionInternalName('My Solution');

      expect(mockGenerateSolutionInternalName).toHaveBeenCalledWith('My Solution');
      expect(generated).toBe('sol_mysolution');
    });

    it('should provide publisherInternalName function', () => {
      const { result } = renderHook(() => useNameGeneration());

      const generated = result.current.publisherInternalName('My Publisher');

      expect(mockGeneratePublisherInternalName).toHaveBeenCalledWith('My Publisher');
      expect(generated).toBe('pub_mypublisher');
    });
  });

  describe('Cleaning Functions', () => {
    it('should provide cleanInternalName function', () => {
      const { result } = renderHook(() => useNameGeneration());

      const cleaned = result.current.cleanInternalName('test-solution!@#');

      expect(mockCleanInternalName).toHaveBeenCalledWith('test-solution!@#');
      expect(cleaned).toBe('testsolution');
    });

    it('should provide cleanPrefix function', () => {
      const { result } = renderHook(() => useNameGeneration());

      const cleaned = result.current.cleanPrefix('test-prefix!@#');

      expect(mockCleanPrefix).toHaveBeenCalledWith('test-prefix!@#');
      expect(cleaned).toBe('testprefix');
    });
  });

  describe('Integration', () => {
    it('should work with real-world scenarios', () => {
      const { result } = renderHook(() => useNameGeneration());

      // Generate solution name
      const solutionName = result.current.solutionInternalName('Customer Management System');
      expect(solutionName).toBe('sol_customermanagementsystem');

      // Generate publisher name
      const publisherName = result.current.publisherInternalName('Contoso Ltd.');
      expect(publisherName).toBe('pub_contosoltd');

      // Generate prefix
      const prefix = result.current.generatePrefix('Contoso', 3);
      expect(mockGeneratePrefix).toHaveBeenCalledWith('Contoso', 3);

      // Validate names
      const isSolutionValid = result.current.validateInternalName(solutionName);
      const isPrefixValid = result.current.validatePrefix(prefix);
      
      expect(isSolutionValid).toBe(true);
      expect(isPrefixValid).toBe(true);
    });

    it('should handle name cleaning workflow', () => {
      const { result } = renderHook(() => useNameGeneration());

      // Clean user input
      const cleanedSolution = result.current.cleanInternalName('My Solution@#$%');
      const cleanedPrefix = result.current.cleanPrefix('My Prefix!@#');

      expect(cleanedSolution).toBe('mysolution');
      expect(cleanedPrefix).toBe('myprefix');

      // Validate cleaned names
      result.current.validateInternalName(cleanedSolution);
      result.current.validatePrefix(cleanedPrefix);

      expect(mockValidateInternalName).toHaveBeenCalledWith('mysolution');
      expect(mockValidatePrefix).toHaveBeenCalledWith('myprefix');
    });
  });
});
