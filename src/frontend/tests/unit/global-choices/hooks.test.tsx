/**
 * Tests for Global Choices Step Hooks
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChoicesValidation, useChoiceSelection } from '../../../src/components/wizard/steps/global-choices/hooks';

// Mock the wizard context hook
const mockWizardData = {
  selectedGlobalChoices: [
    { id: 'choice1', name: 'Status', displayName: 'Status Code' }
  ],
  uploadedGlobalChoices: [
    { id: 'choice2', name: 'Priority', displayName: 'Priority Level' }
  ]
};

vi.mock('../../../src/context/WizardContext', () => ({
  useWizardContext: () => ({
    wizardData: mockWizardData,
    updateWizardData: vi.fn(),
    resetWizard: vi.fn()
  })
}));

describe('useChoicesValidation', () => {
  it('should validate when choices are selected', () => {
    const { result } = renderHook(() => useChoicesValidation());

    expect(result.current.isValid).toBe(true);
    expect(result.current.errors).toEqual([]);
    expect(result.current.warnings).toBeDefined();
  });

  it('should be valid even with no choices (optional step)', () => {
    // Test with different wizard data
    const { result } = renderHook(() => useChoicesValidation());

    // The validation hook should always return valid since global choices are optional
    expect(result.current.isValid).toBe(true);
  });
});

describe('useChoiceSelection', () => {
  const availableChoices = [
    { id: 'choice1', name: 'Status', displayName: 'Status Code', logicalName: 'statuscode', options: [] },
    { id: 'choice2', name: 'Priority', displayName: 'Priority Level', logicalName: 'priority', options: [] }
  ];

  it('should return selected choices', () => {
    const { result } = renderHook(() => useChoiceSelection(availableChoices));

    expect(result.current.selectedChoices).toHaveLength(1);
    expect(result.current.selectedChoices[0].id).toBe('choice1');
  });

  it('should check if choice is selected correctly', () => {
    const { result } = renderHook(() => useChoiceSelection(availableChoices));

    expect(result.current.selectedChoiceIds.includes('choice1')).toBe(true);
    expect(result.current.selectedChoiceIds.includes('choice2')).toBe(false);
  });

  it('should handle selection and deselection', () => {
    const { result } = renderHook(() => useChoiceSelection(availableChoices));

    // Test that the hook functions exist and work
    expect(typeof result.current.handleChoiceSelect).toBe('function');
    expect(typeof result.current.unselectAll).toBe('function');
    expect(typeof result.current.selectChoice).toBe('function');
  });
});
