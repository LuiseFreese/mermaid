/**
 * Common Data Model (CDM) entity definitions and utilities
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

export type CDMEntityName = typeof CDM_ENTITIES[number];

/**
 * Check if an entity name is a CDM entity
 */
export const isCDMEntity = (entityName: string): boolean => {
  return CDM_ENTITIES.some(cdmEntity => 
    cdmEntity.toLowerCase() === entityName.toLowerCase()
  );
};

/**
 * Find CDM entities in ERD content
 * Only checks entity declarations (entityName { pattern)
 */
export const findCDMEntitiesInContent = (content: string): string[] => {
  const foundEntities: string[] = [];
  
  CDM_ENTITIES.forEach(entity => {
    // Match entity name followed by whitespace and opening brace (entity declaration)
    const regex = new RegExp(`\\b${entity}\\s*\\{`, 'i');
    if (regex.test(content)) {
      foundEntities.push(entity);
    }
  });
  
  return foundEntities;
};

/**
 * Check if content contains any CDM entities
 */
export const hasCDMEntities = (content: string): boolean => {
  return findCDMEntitiesInContent(content).length > 0;
};

/**
 * Get CDM entity description for UI display
 */
export const getCDMEntityDescription = (entityName: string): string => {
  const descriptions: Record<string, string> = {
    'Account': 'Business accounts and organizations',
    'Contact': 'Individual contacts and people',
    'Lead': 'Potential customers and prospects',
    'Opportunity': 'Sales opportunities and deals',
    'Case': 'Customer service cases',
    'Incident': 'Service incidents and issues',
    'Activity': 'General activities and interactions',
    'Email': 'Email communications',
    'PhoneCall': 'Phone call activities',
    'Task': 'Tasks and to-do items',
    'Appointment': 'Scheduled appointments',
    'User': 'System users',
    'Team': 'User teams and groups',
    'BusinessUnit': 'Organizational business units',
    'SystemUser': 'System user accounts',
    'Product': 'Products and services',
    'PriceLevel': 'Pricing levels and tiers',
    'Quote': 'Sales quotes and estimates',
    'Order': 'Sales orders',
    'Invoice': 'Customer invoices',
    'Campaign': 'Marketing campaigns',
    'MarketingList': 'Marketing contact lists',
    'Competitor': 'Competitor information'
  };
  
  return descriptions[entityName] || 'CDM entity';
};

/**
 * Filter entities to separate CDM from custom entities
 */
export const categorizeEntities = (entities: string[]): {
  cdmEntities: string[];
  customEntities: string[];
} => {
  const cdmEntities: string[] = [];
  const customEntities: string[] = [];
  
  entities.forEach(entity => {
    if (isCDMEntity(entity)) {
      cdmEntities.push(entity);
    } else {
      customEntities.push(entity);
    }
  });
  
  return { cdmEntities, customEntities };
};
