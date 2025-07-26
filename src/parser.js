/**
 * Mermaid ERD Parser
 * Parses Mermaid ERD syntax and extracts entities, attributes, and relationships
 */

export class MermaidERDParser {
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
    // Pattern: type name [constraints]
    const attributePattern = /^(\w+)\s+(\w+)(?:\s+(PK|FK|UK|.*?))?$/;
    const match = line.match(attributePattern);

    if (!match) {
      return null;
    }

    const [, type, name, constraints = ''] = match;

    return {
      name: name,
      displayName: this.formatDisplayName(name),
      type: this.mapMermaidTypeToDataverse(type),
      isPrimaryKey: constraints.includes('PK'),
      isForeignKey: constraints.includes('FK'),
      isUnique: constraints.includes('UK'),
      isRequired: constraints.includes('NOT NULL') || constraints.includes('PK')
    };
  }

  /**
   * Parse a relationship line
   * @param {string} line - The relationship line
   * @returns {Object|null} Parsed relationship or null
   */
  parseRelationship(line) {
    // Simplified pattern: EntityA relationship EntityB : name
    // Handle various relationship notations like ||--o{, ||--||, }o--o{, etc.
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
   * @returns {Object} Cardinality information
   */
  parseCardinality(cardinality) {
    const cardinalityMap = {
      '||--||': { from: 'one', to: 'one', type: 'one-to-one' },
      '||--o{': { from: 'one', to: 'many', type: 'one-to-many' },
      '}o--||': { from: 'many', to: 'one', type: 'many-to-one' },
      '}o--o{': { from: 'many', to: 'many', type: 'many-to-many' },
      '||--|{': { from: 'one', to: 'many', type: 'one-to-many' },
      '}|--||': { from: 'many', to: 'one', type: 'many-to-one' }
    };

    return cardinalityMap[cardinality] || { from: 'one', to: 'many', type: 'one-to-many' };
  }

  /**
   * Map Mermaid data types to Dataverse field types
   * @param {string} mermaidType - The Mermaid type
   * @returns {string} Dataverse field type
   */
  mapMermaidTypeToDataverse(mermaidType) {
    const typeMap = {
      'string': 'Edm.String',
      'int': 'Edm.Int32',
      'integer': 'Edm.Int32',
      'decimal': 'Edm.Decimal',
      'float': 'Edm.Double',
      'double': 'Edm.Double',
      'boolean': 'Edm.Boolean',
      'bool': 'Edm.Boolean',
      'datetime': 'Edm.DateTimeOffset',
      'date': 'Edm.DateTimeOffset',
      'guid': 'Edm.Guid',
      'uuid': 'Edm.Guid',
      'text': 'Edm.String',
      'varchar': 'Edm.String',
      'nvarchar': 'Edm.String',
      'image': 'Edm.Image',
      'file': 'Edm.File',
      'autonumber': 'Edm.AutoNumber',
      'duration': 'Edm.Duration'
    };

    return typeMap[mermaidType.toLowerCase()] || 'Edm.String';
  }

  /**
   * Format a name for display (convert snake_case to Title Case)
   * @param {string} name - The name to format
   * @returns {string} Formatted display name
   */
  formatDisplayName(name) {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  }
}
