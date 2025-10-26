/**
 * CDM Detection Handler
 * Centralized utility for detecting Common Data Model entities in ERD content
 */

export interface CDMDetectionResult {
  cdmDetected: boolean;
  detectedEntities: string[];
}

/**
 * List of Common Data Model entity names to detect
 */
export const CDM_ENTITIES = [
  'Account',
  'Contact',
  'Lead',
  'Opportunity',
  'Case',
  'Incident',
  'Activity',
  'Email',
  'PhoneCall',
  'Task',
  'Appointment',
  'User',
  'Team',
  'BusinessUnit',
  'SystemUser',
  'Product',
  'PriceLevel',
  'Quote',
  'Order',
  'Invoice',
  'Campaign',
  'MarketingList',
  'Competitor'
] as const;

/**
 * Detect CDM entities in ERD content
 * @param content - The ERD content to analyze
 * @returns Detection result with flag and list of detected entities
 */
export const detectCDMEntities = (content: string): CDMDetectionResult => {
  if (!content) {
    return {
      cdmDetected: false,
      detectedEntities: []
    };
  }

  // Find all CDM entities present in the content
  const detectedEntities = CDM_ENTITIES.filter(entity => {
    const regex = new RegExp(`\\b${entity}\\s*\\{`, 'i');
    return regex.test(content);
  });

  return {
    cdmDetected: detectedEntities.length > 0,
    detectedEntities
  };
};

/**
 * Check if a specific entity name is a CDM entity
 * @param entityName - The entity name to check
 * @returns True if the entity is a known CDM entity
 */
export const isCDMEntity = (entityName: string): boolean => {
  return CDM_ENTITIES.some(cdmEntity => 
    cdmEntity.toLowerCase() === entityName.toLowerCase()
  );
};

/**
 * Get display-friendly description of detected CDM entities
 * @param detectedEntities - Array of detected entity names
 * @returns Formatted string describing the detected entities
 */
export const formatDetectedEntities = (detectedEntities: string[]): string => {
  if (detectedEntities.length === 0) {
    return 'No CDM entities detected';
  }

  if (detectedEntities.length === 1) {
    return `1 CDM entity detected: ${detectedEntities[0]}`;
  }

  if (detectedEntities.length <= 3) {
    return `${detectedEntities.length} CDM entities detected: ${detectedEntities.join(', ')}`;
  }

  return `${detectedEntities.length} CDM entities detected: ${detectedEntities.slice(0, 3).join(', ')}, and ${detectedEntities.length - 3} more`;
};
