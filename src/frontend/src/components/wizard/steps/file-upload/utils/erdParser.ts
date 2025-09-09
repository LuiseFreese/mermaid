/**
 * ERD parsing utilities for extracting entities and relationships
 */

import type { ParsedEntity, ParsedRelationship, EntityAttribute } from '../types/file-upload.types';
import { isCDMEntity } from './cdmEntityList';

/**
 * Parse ERD content to extract entities with their attributes
 */
export const parseERDEntities = (content: string): ParsedEntity[] => {
  const entities: ParsedEntity[] = [];
  
  // Match entity definitions: EntityName { ... }
  const entityMatches = content.match(/(\w+)\s*\{[^}]*\}/g);
  
  if (!entityMatches) {
    return entities;
  }
  
  entityMatches.forEach(entityMatch => {
    const nameMatch = entityMatch.match(/(\w+)\s*\{/);
    if (!nameMatch) return;
    
    const entityName = nameMatch[1];
    const isEntityCDM = isCDMEntity(entityName);
    
    // Extract attributes from within the braces
    const attributesContent = entityMatch.match(/\{([^}]*)\}/)?.[1] || '';
    const attributeLines = attributesContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('//'));
    
    const attributes: EntityAttribute[] = [];
    
    attributeLines.forEach(line => {
      // Parse attribute line: "type attributeName [constraint]"
      const attributeMatch = line.match(/^\s*(\w+)\s+(\w+)(?:\s+(\w+))?\s*$/);
      if (attributeMatch) {
        const [, type, name, constraint] = attributeMatch;
        attributes.push({
          name,
          type,
          constraint,
          isPrimaryKey: constraint === 'PK'
        });
      }
    });
    
    // Check for naming conflicts (non-PK 'name' attribute)
    const hasNamingConflict = !isEntityCDM && 
      attributes.some(attr => 
        attr.name === 'name' && attr.constraint !== 'PK'
      );
    
    entities.push({
      name: entityName,
      attributes,
      isCdm: isEntityCDM,
      hasNamingConflict
    });
  });
  
  return entities;
};

/**
 * Parse ERD content to extract relationships
 */
export const parseERDRelationships = (content: string): ParsedRelationship[] => {
  const relationships: ParsedRelationship[] = [];
  
  // Match relationship definitions: EntityA ||--|| EntityB : label
  const relationshipMatches = content.match(/(\w+)\s*([|o}{\][][\]{}o|]+[-]+[|o}{\][][\]{}o|]+)\s*(\w+)\s*:\s*(.+)/g);
  
  if (!relationshipMatches) {
    return relationships;
  }
  
  relationshipMatches.forEach(relationshipMatch => {
    const parts = relationshipMatch.match(/(\w+)\s*([|o}{\][][\]{}o|]+[-]+[|o}{\][][\]{}o|]+)\s*(\w+)\s*:\s*(.+)/);
    if (parts) {
      const [, fromEntity, cardinality, toEntity, label] = parts;
      relationships.push({
        from: fromEntity,
        to: toEntity,
        cardinality: cardinality.trim(),
        label: label.trim()
      });
    }
  });
  
  return relationships;
};

/**
 * Extract all entity names from ERD content
 */
export const extractEntityNames = (content: string): string[] => {
  const entities = parseERDEntities(content);
  return entities.map(entity => entity.name);
};

/**
 * Check if ERD content is valid Mermaid syntax
 */
export const validateERDSyntax = (content: string): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];
  
  // Check for erDiagram declaration
  if (!content.includes('erDiagram')) {
    errors.push('Missing erDiagram declaration');
  }
  
  // Check for balanced braces
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    errors.push('Unbalanced braces in entity definitions');
  }
  
  // Check for empty entities
  const entityMatches = content.match(/(\w+)\s*\{\s*\}/g);
  if (entityMatches) {
    entityMatches.forEach(match => {
      const entityName = match.match(/(\w+)\s*\{/)?.[1];
      if (entityName) {
        errors.push(`Entity '${entityName}' has no attributes`);
      }
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Clean ERD content by removing comments and empty lines
 */
export const cleanERDContent = (content: string): string => {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('//') && !line.startsWith('%'))
    .join('\n');
};

/**
 * Get entity attribute count for summary display
 */
export const getEntityAttributeCount = (entityName: string, content: string): number => {
  const entities = parseERDEntities(content);
  const entity = entities.find(e => e.name === entityName);
  return entity?.attributes.length || 0;
};

/**
 * Check if entity has primary key
 */
export const entityHasPrimaryKey = (entityName: string, content: string): boolean => {
  const entities = parseERDEntities(content);
  const entity = entities.find(e => e.name === entityName);
  return entity?.attributes.some(attr => attr.isPrimaryKey) || false;
};
