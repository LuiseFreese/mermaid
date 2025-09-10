/**
 * Tests for Deployment Step Hooks
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useConfigurationSummary } from '../../../src/components/wizard/steps/deployment/hooks';

// Mock the wizard context hook
const mockWizardData = {
  parsedEntities: [
    { name: 'Customer', isCdm: false, attributes: [{ name: 'Name', type: 'string' }] },
    { name: 'Account', isCdm: true, attributes: [{ name: 'AccountName', type: 'string' }] }
  ],
  parsedRelationships: [
    { from: 'Customer', to: 'Order', type: 'one-to-many' }
  ],
  selectedGlobalChoices: [
    { name: 'StatusCode', displayName: 'Status', options: [{ value: 1, label: 'Active' }] }
  ],
  uploadedGlobalChoices: [
    { name: 'Priority', displayName: 'Priority Level', options: [{ value: 1, label: 'High' }] }
  ]
};

// Mock the useWizardContext hook
vi.mock('../../../src/context/WizardContext', () => ({
  useWizardContext: () => ({
    wizardData: mockWizardData,
    updateWizardData: vi.fn(),
    resetWizard: vi.fn()
  })
}));

describe('useConfigurationSummary', () => {
  it('should filter entities correctly', () => {
    const { result } = renderHook(() => useConfigurationSummary());

    expect(result.current.entities).toHaveLength(1);
    expect(result.current.entities[0].name).toBe('Customer');
    expect(result.current.cdmEntities).toHaveLength(1);
    expect(result.current.cdmEntities[0].name).toBe('Account');
  });

  it('should return relationships', () => {
    const { result } = renderHook(() => useConfigurationSummary());

    expect(result.current.relationships).toHaveLength(1);
    expect(result.current.relationships[0].from).toBe('Customer');
    expect(result.current.relationships[0].to).toBe('Order');
  });

  it('should combine global choices', () => {
    const { result } = renderHook(() => useConfigurationSummary());

    expect(result.current.allGlobalChoices).toHaveLength(2);
    expect(result.current.allGlobalChoices[0].name).toBe('StatusCode');
    expect(result.current.allGlobalChoices[1].name).toBe('Priority');
  });

  it('should handle the hook correctly', () => {
    const { result } = renderHook(() => useConfigurationSummary());
    
    // Verify the hook returns valid objects
    expect(result.current).toHaveProperty('entities');
    expect(result.current).toHaveProperty('cdmEntities');
    expect(result.current).toHaveProperty('relationships');
    expect(result.current).toHaveProperty('allGlobalChoices');
  });
});
