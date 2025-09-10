/**
 * Tests for Deployment Step Utilities
 */

import { describe, it, expect } from 'vitest';
import {
  transformWizardDataToDeploymentData,
  validateDeploymentData,
  filterEntitiesByType,
  combineGlobalChoices,
  formatDeploymentResultMessage,
  hasDeploymentResults
} from '../../../src/components/wizard/steps/deployment/utils';

describe('Deployment Utilities', () => {
  describe('transformWizardDataToDeploymentData', () => {
    it('should transform wizard data correctly', () => {
      const wizardData = {
        originalErdContent: 'erDiagram\n  Customer {}',
        solutionName: 'Test Solution',
        selectedPublisher: {
          id: 'pub1',
          uniqueName: 'testpub',
          displayName: 'Test Publisher',
          prefix: 'test'
        },
        entityChoice: 'custom',
        parsedEntities: [{ name: 'Customer' }],
        parsedRelationships: []
      };

      const result = transformWizardDataToDeploymentData(wizardData);

      expect(result.mermaidContent).toBe('erDiagram\n  Customer {}');
      expect(result.solutionDisplayName).toBe('Test Solution');
      expect(result.selectedPublisher?.displayName).toBe('Test Publisher');
      expect(result.cdmChoice).toBe('custom');
    });

    it('should handle missing data with defaults', () => {
      const wizardData = {};
      const result = transformWizardDataToDeploymentData(wizardData);

      expect(result.mermaidContent).toBe('');
      expect(result.solutionName).toBe('MermaidSolution');
      expect(result.publisherName).toBe('Mermaid Publisher');
      expect(result.publisherPrefix).toBe('mmd');
    });
  });

  describe('validateDeploymentData', () => {
    it('should validate complete data as valid', () => {
      const deploymentData = {
        mermaidContent: 'erDiagram\n  Customer {}',
        solutionName: 'Test Solution',
        selectedPublisher: { id: 'pub1', uniqueName: 'pub', displayName: 'Pub', prefix: 'p' },
        createNewPublisher: false,
        publisherName: 'Test Publisher'
      };

      const result = validateDeploymentData(deploymentData as any);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should identify missing required fields', () => {
      const deploymentData = {
        mermaidContent: '',
        solutionName: '',
        selectedPublisher: null,
        createNewPublisher: false,
        publisherName: ''
      };

      const result = validateDeploymentData(deploymentData as any);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Mermaid content is required');
      expect(result.errors).toContain('Solution name is required');
      expect(result.errors).toContain('Publisher selection is required');
    });
  });

  describe('filterEntitiesByType', () => {
    it('should filter entities by CDM status', () => {
      const entities = [
        { name: 'Customer', isCdm: false },
        { name: 'Account', isCdm: true },
        { name: 'Product', isCdm: false },
        { name: 'Contact', isCdm: true }
      ];

      const result = filterEntitiesByType(entities);

      expect(result.customEntities).toHaveLength(2);
      expect(result.customEntities.map(e => e.name)).toEqual(['Customer', 'Product']);
      expect(result.cdmEntities).toHaveLength(2);
      expect(result.cdmEntities.map(e => e.name)).toEqual(['Account', 'Contact']);
    });
  });

  describe('combineGlobalChoices', () => {
    it('should combine arrays correctly', () => {
      const selected = [{ name: 'Choice1' }, { name: 'Choice2' }];
      const uploaded = [{ name: 'Choice3' }];

      const result = combineGlobalChoices(selected, uploaded);

      expect(result).toHaveLength(3);
      expect(result.map(c => c.name)).toEqual(['Choice1', 'Choice2', 'Choice3']);
    });
  });

  describe('formatDeploymentResultMessage', () => {
    it('should format success message with metrics', () => {
      const result = {
        success: true,
        entitiesCreated: 3,
        relationshipsCreated: 2,
        globalChoicesAdded: 1
      };

      const message = formatDeploymentResultMessage(result);

      expect(message).toBe('3 custom entities created, 2 relationships created, 1 global choices added');
    });

    it('should use fallback message when no metrics', () => {
      const result = {
        success: true,
        message: 'All done!'
      };

      const message = formatDeploymentResultMessage(result);

      expect(message).toBe('All done!');
    });

    it('should return error message for failed deployment', () => {
      const result = {
        success: false,
        error: 'Something went wrong'
      };

      const message = formatDeploymentResultMessage(result);

      expect(message).toBe('Something went wrong');
    });
  });

  describe('hasDeploymentResults', () => {
    it('should return true when has meaningful results', () => {
      const result = { entitiesCreated: 2 };
      expect(hasDeploymentResults(result)).toBe(true);

      const result2 = { relationshipsCreated: 1 };
      expect(hasDeploymentResults(result2)).toBe(true);

      const result3 = { message: 'Success' };
      expect(hasDeploymentResults(result3)).toBe(true);
    });

    it('should return false when no meaningful results', () => {
      const result = { entitiesCreated: 0 };
      expect(hasDeploymentResults(result)).toBe(false);

      const result2 = {};
      expect(hasDeploymentResults(result2)).toBe(false);

      const result3 = null;
      expect(hasDeploymentResults(result3)).toBe(false);
    });
  });
});
