/**
 * Mermaid ERD Parser - CommonJS Version
 * Parses Mermaid ERD syntax and extracts entities, attributes, and relationships
 */

class MermaidERDParser {
  constructor() {
    this.entities = new Map();
    this.relationships = [];
  }

  /**
   * Parse a Mermaid ERD string and extract entities and relationships
   * @param {string} mermaidContent - The Mermaid ERD content
   * @returns {Object} Parsed entities and relationships
   */
  parse(mermaidContent) {
    this.entities.clear();
    this.relationships = [];

    const lines = mermaidContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('%%'));

    let currentEntity = null;
    let inEntityDefinition = false;

    for (const line of lines) {
      if (line === 'erDiagram') {
        continue;
      }

      // Check if this is an entity definition start
      if (line.includes('{')) {
        const entityMatch = line.match(/^(\w+)\s*\{/);
        if (entityMatch) {
          currentEntity = entityMatch[1];
          this.entities.set(currentEntity, {
            name: currentEntity,
            attributes: [],
            displayName: this.formatDisplayName(currentEntity)
          });
          inEntityDefinition = true;
          continue;
        }
      }

      // Check if this is the end of entity definition
      if (line === '}') {
        inEntityDefinition = false;
        currentEntity = null;
        continue;
      }

      // Parse attribute within entity definition
      if (inEntityDefinition && currentEntity) {
        const attribute = this.parseAttribute(line);
        if (attribute) {
          this.entities.get(currentEntity).attributes.push(attribute);
        }
        continue;
      }

      // Parse relationship
      const relationship = this.parseRelationship(line);
      if (relationship) {
        this.relationships.push(relationship);
      }
    }

    return {
      entities: Array.from(this.entities.values()),
      relationships: this.relationships
    };
  }

  /**
   * Parse an attribute line
   * @param {string} line - The attribute line
   * @returns {Object|null} Parsed attribute or null
   */
  parseAttribute(line) {
    // CRITICAL FIX: First, check if this line looks like a relationship
    // Relationships have the pattern: ENTITY cardinality ENTITY : "label"
    const relationshipPattern = /^(\w+)\s+([|}{o-]+)\s+(\w+)(?:\s*:\s*(.+))?$/;
    if (relationshipPattern.test(line)) {
      console.log(`🔍 DEBUG: Skipping relationship line in attribute parsing: "${line}"`);
      return null;
    }
    
    // Also check for any line containing cardinality symbols
    const relationshipIndicators = /[|}{o-]{2,}/;
    if (relationshipIndicators.test(line)) {
      console.log(`🔍 DEBUG: Skipping line with cardinality symbols: "${line}"`);
      return null;
    }
    
    // Check for any line with colon followed by quoted text (relationship labels)
    const relationshipLabelPattern = /:\s*["'][^"']*["']$/;
    if (relationshipLabelPattern.test(line)) {
      console.log(`🔍 DEBUG: Skipping line with relationship label: "${line}"`);
      return null;
    }
    
    // Pattern: type name [constraints] - ONLY for entity attributes
    const attributePattern = /^((?:choice\([^)]+\)|lookup\([^)]+\)|\w+))\s+(\w+)(?:\s+(PK|FK|UK|.*?))?(?:\s+"[^"]*")?$/;
    const match = line.match(attributePattern);

    if (!match) {
      return null;
    }

    const [, type, name, constraints = ''] = match;
    const typeInfo = this.mapMermaidTypeToDataverse(type);

    const attribute = {
      name: name,
      displayName: this.formatDisplayName(name),
      type: typeInfo.dataType || typeInfo,
      isPrimaryKey: constraints.includes('PK'),
      isForeignKey: constraints.includes('FK'),
      isUnique: constraints.includes('UK'),
      isRequired: constraints.includes('NOT NULL') || constraints.includes('PK')
    };

    // Add choice-specific properties
    if (typeInfo.isChoice) {
      attribute.isChoice = true;
      attribute.choiceOptions = typeInfo.choiceOptions;
    }
    
    // Add lookup-specific properties
    if (typeInfo.isLookup) {
      attribute.isLookup = true;
      attribute.targetEntity = typeInfo.targetEntity;
    }

    return attribute;
  }

  /**
   * Parse a relationship line
   * @param {string} line - The relationship line
   * @returns {Object|null} Parsed relationship or null
   */
  parseRelationship(line) {
    const relationshipPattern = /^(\w+)\s+([|}{o-]+)\s+(\w+)(?:\s*:\s*(.+))?$/;
    const match = line.match(relationshipPattern);

    if (!match) {
      return null;
    }

    const [, fromEntity, cardinality, toEntity, relationshipName = ''] = match;

    return {
      fromEntity,
      toEntity,
      cardinality: this.parseCardinality(cardinality),
      name: relationshipName.trim() || `${fromEntity}_${toEntity}`,
      displayName: relationshipName.trim() || this.formatDisplayName(`${fromEntity}_${toEntity}`)
    };
  }

  /**
   * Parse cardinality notation
   * @param {string} cardinality - The cardinality string
   * @returns {Object} Parsed cardinality
   */
  parseCardinality(cardinality) {
    // Handle various Mermaid cardinality notations
    if (cardinality.includes('||') && cardinality.includes('{')) {
      return { type: 'one-to-many', from: 'one', to: 'many' };
    } else if (cardinality.includes('||') && cardinality.includes('||')) {
      return { type: 'one-to-one', from: 'one', to: 'one' };
    } else if (cardinality.includes('}') && cardinality.includes('{')) {
      return { type: 'many-to-many', from: 'many', to: 'many' };
    } else if (cardinality.includes('o') && cardinality.includes('{')) {
      return { type: 'zero-to-many', from: 'zero-or-one', to: 'many' };
    }
    
    return { type: 'unknown', from: 'unknown', to: 'unknown' };
  }

  /**
   * Map Mermaid data types to Dataverse data types
   * @param {string} mermaidType - The Mermaid type
   * @returns {Object} Dataverse type information
   */
  mapMermaidTypeToDataverse(mermaidType) {
    // Handle choice types
    if (mermaidType.startsWith('choice(')) {
      const optionsMatch = mermaidType.match(/choice\(([^)]+)\)/);
      if (optionsMatch) {
        const options = optionsMatch[1].split(',').map(opt => opt.trim());
        return {
          dataType: 'Choice',
          isChoice: true,
          choiceOptions: options
        };
      }
    }

    // Handle lookup types
    if (mermaidType.startsWith('lookup(')) {
      const targetMatch = mermaidType.match(/lookup\(([^)]+)\)/);
      if (targetMatch) {
        return {
          dataType: 'Lookup',
          isLookup: true,
          targetEntity: targetMatch[1].trim()
        };
      }
    }

    // Standard type mappings
    const typeMap = {
      'string': 'String',
      'int': 'Integer',
      'integer': 'Integer',
      'decimal': 'Decimal',
      'money': 'Money',
      'boolean': 'Boolean',
      'bool': 'Boolean',
      'datetime': 'DateTime',
      'date': 'DateTime',
      'text': 'Memo',
      'memo': 'Memo',
      'guid': 'Uniqueidentifier',
      'uniqueidentifier': 'Uniqueidentifier'
    };

    return typeMap[mermaidType.toLowerCase()] || 'String';
  }

  /**
   * Format a technical name into a display name
   * @param {string} name - The technical name
   * @returns {string} Formatted display name
   */
  formatDisplayName(name) {
    return name
      .toLowerCase() // Convert to lowercase first
      .replace(/[_-]/g, ' ') // Replace underscores and hyphens with spaces
      .replace(/\b\w/g, l => l.toUpperCase()) // Capitalize first letter of each word
      .trim();
  }
}

module.exports = { MermaidERDParser };
