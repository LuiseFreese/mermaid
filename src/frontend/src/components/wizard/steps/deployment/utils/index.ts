/**
 * Utility functions for deployment step
 */

import type { DeploymentData } from '../types';

/**
 * Transform wizard data into deployment data format
 */
export const transformWizardDataToDeploymentData = (wizardData: any): DeploymentData => {
  return {
    mermaidContent: wizardData.originalErdContent || '',
    // Use existing solution name when adding to existing solution
    solutionName: wizardData.solutionType === 'existing' && wizardData.selectedSolution 
      ? wizardData.selectedSolution.uniquename 
      : (wizardData.solutionInternalName || wizardData.solutionName || 'MermaidSolution'),
    solutionDisplayName: wizardData.solutionType === 'existing' && wizardData.selectedSolution
      ? wizardData.selectedSolution.friendlyname
      : (wizardData.solutionName || 'Mermaid Solution'),
    // Publisher information - for existing solutions, use selected solution's publisher
    useExistingSolution: wizardData.solutionType === 'existing',
    selectedSolutionId: wizardData.selectedSolution?.solutionid,
    selectedPublisher: wizardData.selectedPublisher ? {
      id: wizardData.selectedPublisher.id,
      uniqueName: wizardData.selectedPublisher.uniqueName,
      displayName: wizardData.selectedPublisher.displayName,
      prefix: wizardData.selectedPublisher.prefix
    } : null,
    // For new publishers
    createNewPublisher: wizardData.publisherType === 'new',
    publisherName: wizardData.newPublisherName || wizardData.selectedPublisher?.displayName || 'Mermaid Publisher',
    publisherUniqueName: wizardData.newPublisherInternalName || wizardData.selectedPublisher?.uniqueName,
    publisherPrefix: wizardData.newPublisherPrefix || wizardData.selectedPublisher?.prefix || 'mmd',
    cdmChoice: wizardData.entityChoice,
    cdmMatches: wizardData.detectedEntities || [],
    selectedChoices: wizardData.selectedGlobalChoices || [],
    customChoices: wizardData.uploadedGlobalChoices || [],
    includeRelatedEntities: wizardData.includeRelatedTables || false,
    entities: wizardData.parsedEntities || [],
    relationships: wizardData.parsedRelationships || []
  };
};

/**
 * Validate deployment data
 */
export const validateDeploymentData = (data: DeploymentData): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!data.mermaidContent) {
    errors.push('Mermaid content is required');
  }

  if (!data.solutionName) {
    errors.push('Solution name is required');
  }

  if (!data.selectedPublisher && !data.createNewPublisher) {
    errors.push('Publisher selection is required');
  }

  if (data.createNewPublisher && !data.publisherName) {
    errors.push('Publisher name is required when creating new publisher');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Filter entities by type (CDM vs Custom)
 */
export const filterEntitiesByType = (entities: any[]) => {
  const customEntities = entities.filter(entity => !entity.isCdm);
  const cdmEntities = entities.filter(entity => entity.isCdm);
  
  return { customEntities, cdmEntities };
};

/**
 * Combine global choices from different sources
 */
export const combineGlobalChoices = (selected: any[], uploaded: any[]) => {
  return [...selected, ...uploaded];
};

/**
 * Format deployment result message
 */
export const formatDeploymentResultMessage = (result: any): string => {
  if (!result.success) {
    return result.error || 'Deployment failed';
  }

  const messages: string[] = [];
  
  if (result.entitiesCreated > 0) {
    messages.push(`${result.entitiesCreated} custom entities created`);
  }
  
  if (result.relationshipsCreated > 0) {
    messages.push(`${result.relationshipsCreated} relationships created`);
  }
  
  if (result.globalChoicesAdded > 0) {
    messages.push(`${result.globalChoicesAdded} global choices added`);
  }

  return messages.length > 0 
    ? messages.join(', ')
    : result.summary || result.message || 'Deployment completed successfully';
};

/**
 * Check if deployment has meaningful results to display
 */
export const hasDeploymentResults = (result: any): boolean => {
  if (!result) {
    return false;
  }
  
  return !!(
    (result.entitiesCreated && result.entitiesCreated > 0) ||
    (result.cdmEntitiesIntegrated && result.cdmEntitiesIntegrated?.length > 0) ||
    (result.relationshipsCreated && result.relationshipsCreated > 0) ||
    (result.globalChoicesAdded && result.globalChoicesAdded > 0) ||
    result.summary ||
    result.message
  );
};
