/**
 * Mermaid ERD Parser - CommonJS Version
 * Parses Mermaid ERD syntax and extracts entities, attributes, and relationships
 */

class MermaidERDParser {
  constructor() {
    this.entities = new Map();
    this.relationships = [];
    this.warnings = [];
  }

  /**
   * Parse a Mermaid ERD string and extract entities and relationships
   * @param {string} mermaidContent - The Mermaid ERD content
   * @returns {Object} Parsed entities and relationships
   */
  parse(mermaidContent) {
    this.entities.clear();
    this.relationships = [];
    this.warnings = [];

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

    // Comprehensive validation after parsing
    this.validateSchema();

    return {
      entities: Array.from(this.entities.values()),
      relationships: this.relationships,
      warnings: this.warnings,
      validation: this.getValidationSummary()
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
      return null;
    }
    
    // Also check for any line containing cardinality symbols (consecutive only, not scattered)
    const relationshipIndicators = /\|\|--|--o\{|o\{|}\|/;
    if (relationshipIndicators.test(line)) {
      return null;
    }
    
    // Check for any line with colon followed by quoted text (relationship labels)
    const relationshipLabelPattern = /:\s*["'][^"']*["']$/;
    if (relationshipLabelPattern.test(line)) {
      return null;
    }
    
    // Pattern: type name [constraints] [description] - ONLY for entity attributes
    const attributePattern = /^((?:choice\([^)]+\)|lookup\([^)]+\)|\w+))\s+(\w+)(?:\s+([^"]+?))?(?:\s+"([^"]*)")?$/;
    const match = line.match(attributePattern);

    if (!match) {
      return null;
    }

    const [, type, name, constraints = '', description = ''] = match;
    const typeInfo = this.mapMermaidTypeToDataverse(type);
    const initialType = typeInfo.dataType || typeInfo;
    
    // Apply semantic type detection for better data type mapping
    const improvedType = this.applySemanticTypeDetection(name, type, initialType);

    const attribute = {
      name: name,
      displayName: this.formatDisplayName(name),
      originalType: type, // Store original type format
      type: improvedType, // Use the improved type
      description: description, // Store the original description
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
      'dateonly': 'DateOnly',
      'text': 'Memo',
      'memo': 'Memo',
      'guid': 'Uniqueidentifier',
      'uniqueidentifier': 'Uniqueidentifier',
      // Special data types
      'email': 'Email',
      'phone': 'Phone',
      'url': 'Url',
      'ticker': 'Ticker',
      'timezone': 'TimeZone',
      'language': 'Language',
      'duration': 'Duration',
      'float': 'Float',
      'double': 'Double',
      'file': 'File',
      'image': 'Image'
    };

    return typeMap[mermaidType.toLowerCase()] || 'String';
  }

  /**
   * Apply semantic type detection based on field name and improve data type mapping
   * @param {string} fieldName - The field name
   * @param {string} originalType - The original type from Mermaid
   * @param {string} mappedType - The mapped Dataverse type
   * @returns {string} Improved Dataverse type
   */
  applySemanticTypeDetection(fieldName, originalType, mappedType) {
    const lowerFieldName = fieldName.toLowerCase();
    
    // Email detection - if field name contains 'email' and type is string, make it email
    if (lowerFieldName.includes('email') && mappedType === 'String') {
      return 'Email';
    }
    
    // Phone detection
    if ((lowerFieldName.includes('phone') || lowerFieldName.includes('mobile') || lowerFieldName.includes('tel')) && mappedType === 'String') {
      return 'Phone';
    }
    
    // URL detection
    if ((lowerFieldName.includes('url') || lowerFieldName.includes('website') || lowerFieldName.includes('link')) && mappedType === 'String') {
      return 'Url';
    }
    
    // Age detection - if field name is 'age' and type is int/integer, make it whole number
    if (lowerFieldName === 'age' && mappedType === 'Integer') {
      return 'Integer'; // This is already correct, but we could add validation
    }
    
    // Date-only detection - common date field names that should be date-only not datetime
    const dateOnlyFields = ['birthdate', 'dateofbirth', 'startdate', 'enddate', 'duedate', 'orderdate', 'deliverydate', 'createddate', 'modifieddate'];
    if (dateOnlyFields.some(field => lowerFieldName.includes(field)) && (originalType.toLowerCase() === 'date' || mappedType === 'DateTime')) {
      return 'DateOnly';
    }
    
    return mappedType;
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

  /**
   * Validate entity naming to detect potential conflicts
   * @param {string} entityName - Name of the entity to validate
   */
  validateEntityNaming(entityName) {
    const entity = this.entities.get(entityName);
    if (!entity || !entity.attributes) return;

    // Check for "name" column conflicts (case-insensitive)
    const nameColumns = entity.attributes.filter(attr => 
      attr.name.toLowerCase() === 'name' && !attr.isPrimaryKey
    );

    if (nameColumns.length > 0) {
      this.warnings.push({
        type: 'naming_conflict',
        severity: 'warning',
        entity: entityName,
        message: `Entity '${entityName}' has a non-primary column called 'name'. This will conflict with the auto-generated primary name column in Dataverse.`,
        suggestion: `Consider renaming the column to something like '${entityName.toLowerCase()}_name', 'display_name', or 'title'.`,
        columns: nameColumns.map(col => col.name),
        category: 'naming'
      });
    }

    // Check for other potential conflicts with system columns
    const problemColumns = entity.attributes.filter(attr => {
      const lowerName = attr.name.toLowerCase();
      return ['createdon', 'createdby', 'modifiedon', 'modifiedby', 'ownerid', 'statecode', 'statuscode'].includes(lowerName);
    });

    if (problemColumns.length > 0) {
      this.warnings.push({
        type: 'system_column_conflict',
        severity: 'warning',
        entity: entityName,
        message: `Entity '${entityName}' has columns that conflict with system columns: ${problemColumns.map(c => c.name).join(', ')}`,
        suggestion: `Consider adding a prefix to these columns to avoid conflicts with Dataverse system columns.`,
        columns: problemColumns.map(col => col.name),
        category: 'naming'
      });
    }
  }

  /**
   * Comprehensive schema validation
   */
  validateSchema() {
    // Clear previous warnings
    this.warnings = [];

    // Validate each entity
    for (const entityName of this.entities.keys()) {
      this.validateEntity(entityName);
    }

    // Validate relationships
    this.validateRelationships();

    // Check for Common Data Model entities
    this.detectCDMEntities();
  }

  /**
   * Validate individual entity structure
   * @param {string} entityName - Name of the entity to validate
   */
  validateEntity(entityName) {
    const entity = this.entities.get(entityName);
    if (!entity || !entity.attributes) return;

    // CRITICAL: Check for multiple primary keys
    const primaryKeys = entity.attributes.filter(attr => attr.isPrimaryKey);
    if (primaryKeys.length === 0) {
      this.warnings.push({
        type: 'missing_primary_key',
        severity: 'error',
        entity: entityName,
        message: `Entity '${entityName}' must have exactly one primary key (PK) attribute.`,
        suggestion: 'Add a primary key attribute with PK constraint to one of your columns.',
        category: 'structure'
      });
    } else if (primaryKeys.length > 1) {
      this.warnings.push({
        type: 'multiple_primary_keys',
        severity: 'error',
        entity: entityName,
        message: `Entity '${entityName}' has ${primaryKeys.length} primary keys. Only one primary key is allowed per entity.`,
        suggestion: 'Remove PK constraint from all but one attribute.',
        columns: primaryKeys.map(pk => pk.name),
        category: 'structure'
      });
    }

    // CRITICAL: Check for duplicate column names
    const columnNames = entity.attributes.map(attr => attr.name.toLowerCase());
    const duplicates = columnNames.filter((name, index) => columnNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      const uniqueDuplicates = [...new Set(duplicates)];
      this.warnings.push({
        type: 'duplicate_columns',
        severity: 'error',
        entity: entityName,
        message: `Entity '${entityName}' has duplicate column names: ${uniqueDuplicates.join(', ')}`,
        suggestion: 'Each column name must be unique within an entity. Rename the duplicate columns.',
        columns: uniqueDuplicates,
        category: 'structure'
      });
    }

    // Check for empty entities
    if (entity.attributes.length === 0) {
      this.warnings.push({
        type: 'empty_entity',
        severity: 'warning',
        entity: entityName,
        message: `Entity '${entityName}' has no attributes defined.`,
        suggestion: 'Add at least one attribute with a primary key (PK) to make this entity useful.',
        category: 'structure'
      });
    }

    // Call existing naming validation
    this.validateEntityNaming(entityName);
  }

  /**
   * Validate relationships
   */
  validateRelationships() {
    this.relationships.forEach((relationship, index) => {
      // Check if entities exist
      if (!this.entities.has(relationship.fromEntity)) {
        this.warnings.push({
          type: 'missing_entity',
          severity: 'error',
          relationship: `${relationship.fromEntity} → ${relationship.toEntity}`,
          message: `Relationship references non-existent entity '${relationship.fromEntity}'.`,
          suggestion: 'Ensure all entities referenced in relationships are defined in the ERD.',
          category: 'relationships'
        });
      }

      if (!this.entities.has(relationship.toEntity)) {
        this.warnings.push({
          type: 'missing_entity',
          severity: 'error',
          relationship: `${relationship.fromEntity} → ${relationship.toEntity}`,
          message: `Relationship references non-existent entity '${relationship.toEntity}'.`,
          suggestion: 'Ensure all entities referenced in relationships are defined in the ERD.',
          category: 'relationships'
        });
      }

      // CRITICAL: Block many-to-many relationships with detailed guidance
      if (relationship.cardinality && relationship.cardinality.type === 'many-to-many') {
        this.warnings.push({
          type: 'many_to_many_relationship',
          severity: 'error',
          relationship: `${relationship.fromEntity} → ${relationship.toEntity}`,
          message: `Many-to-many relationship detected between '${relationship.fromEntity}' and '${relationship.toEntity}'. Direct M:N relationships are not supported.`,
          suggestion: 'Create an intersection table to model many-to-many relationships as two one-to-many relationships.',
          documentationLink: '/docs/RELATIONSHIP_TYPES.md#creating-many-to-many-relationships',
          example: `Create a junction table like '${relationship.fromEntity}${relationship.toEntity}' with FK references to both entities.`,
          category: 'relationships'
        });
      }

      // Check for self-referencing relationships (warning)
      if (relationship.fromEntity === relationship.toEntity) {
        this.warnings.push({
          type: 'self_referencing_relationship',
          severity: 'warning',
          relationship: `${relationship.fromEntity} → ${relationship.toEntity}`,
          message: `Self-referencing relationship detected in entity '${relationship.fromEntity}'.`,
          suggestion: 'Self-referencing relationships are supported but may require additional configuration in Dataverse.',
          category: 'relationships'
        });
      }

      // Check for orphaned foreign keys (warning)
      if (this.entities.has(relationship.fromEntity) && this.entities.has(relationship.toEntity)) {
        const toEntity = this.entities.get(relationship.toEntity);
        const expectedFK = `${relationship.fromEntity.toLowerCase()}_id`;
        const hasMatchingFK = toEntity.attributes.some(attr => 
          attr.isForeignKey && attr.name.toLowerCase() === expectedFK
        );
        
        if (!hasMatchingFK) {
          this.warnings.push({
            type: 'missing_foreign_key',
            severity: 'warning',
            relationship: `${relationship.fromEntity} → ${relationship.toEntity}`,
            message: `Relationship defined but no matching foreign key found in '${relationship.toEntity}'.`,
            suggestion: `Add a foreign key field '${expectedFK} FK' to entity '${relationship.toEntity}'.`,
            category: 'relationships'
          });
        }
      }
    });
  }

  /**
   * Detect Common Data Model entities
   */
  detectCDMEntities() {
    const cdmEntities = [
      'account', 'contact', 'lead', 'opportunity', 'case', 'incident',
      'activity', 'email', 'phonecall', 'task', 'appointment',
      'user', 'team', 'businessunit', 'systemuser',
      'product', 'pricelevel', 'quote', 'order', 'invoice',
      'campaign', 'marketinglist', 'competitor'
    ];

    this.entities.forEach((entity, entityName) => {
      const lowerName = entityName.toLowerCase();
      if (cdmEntities.includes(lowerName)) {
        this.warnings.push({
          type: 'cdm_entity_detected',
          severity: 'info',
          entity: entityName,
          message: `Entity '${entityName}' appears to be a Common Data Model entity.`,
          suggestion: 'Consider using the existing CDM entity instead of creating a custom one.',
          documentationLink: '/docs/USAGE-GUIDE.md#common-data-model-integration',
          category: 'cdm'
        });
      }
    });
  }

  /**
   * Get validation summary with counts by severity
   */
  getValidationSummary() {
    const errors = this.warnings.filter(w => w.severity === 'error');
    const warnings = this.warnings.filter(w => w.severity === 'warning');
    const info = this.warnings.filter(w => w.severity === 'info');
    
    const isValid = errors.length === 0;
    
    let status = 'success'; // Green
    if (errors.length > 0) {
      status = 'error'; // Red
    } else if (warnings.length > 0) {
      status = 'warning'; // Amber
    }
    
    return {
      isValid,
      status,
      errors,
      warnings,
      info,
      totalIssues: this.warnings.length,
      summary: {
        errorCount: errors.length,
        warningCount: warnings.length,
        infoCount: info.length,
        cdmEntitiesDetected: this.warnings.filter(w => w.category === 'cdm').length
      }
    };
  }

  /**
   * Generate a corrected version of the ERD based on validation warnings
   * @returns {string} Corrected ERD content
   */
  generateCorrectedERD() {
    let correctedERD = 'erDiagram\n';
    
    // Get warnings that actually need fixes
    const criticalNameConflicts = this.warnings.filter(w => 
      w.type === 'naming_conflict' && 
      w.message.includes('non-primary column called \'name\'') &&
      w.severity === 'warning'
    );
    
    const missingForeignKeys = this.warnings.filter(w => 
      w.type === 'missing_foreign_key' && 
      w.severity === 'warning'
    );
    
    const manyToManyRelationships = this.warnings.filter(w => 
      w.type === 'many_to_many_relationship' && 
      w.severity === 'error'
    );
    
    // Track entities that need foreign keys
    const entitiesNeedingFKs = new Map();
    missingForeignKeys.forEach(warning => {
      const match = warning.message.match(/no matching foreign key found in '(\w+)'/);
      if (match) {
        const entityName = match[1];
        const relMatch = warning.relationship?.match(/(\w+)\s*→\s*(\w+)/);
        if (relMatch) {
          const [, fromEntity, toEntity] = relMatch;
          if (entityName === toEntity) {  // FK should be in the target entity
            entitiesNeedingFKs.set(entityName, `${fromEntity.toLowerCase()}_id`);
          }
        }
      }
    });

    // Generate corrected entities - preserve original formatting unless fixes needed
    for (const [entityName, entity] of this.entities) {
      correctedERD += `    ${entityName} {\n`;
      
      // Add attributes with minimal corrections
      entity.attributes.forEach(attr => {
        let correctedName = attr.name;
        let description = attr.description || ''; // Preserve original description
        
        // Check if this is a junction table (has multiple PKs that are also FKs)
        const entityPKCount = entity.attributes.filter(a => a.isPrimaryKey).length;
        const isJunctionTable = entityPKCount > 1 && entity.attributes.filter(a => a.isPrimaryKey && a.isForeignKey).length > 1;
        
        // Always rename primary keys to 'name' (Dataverse convention) EXCEPT for junction tables
        if (attr.isPrimaryKey && !isJunctionTable) {
          correctedName = 'name';
          description = description || `Primary name column`;
        } else {
          // Only fix name conflicts if it's actually a non-primary 'name' column
          const hasNameConflict = criticalNameConflicts.some(w => 
            w.entity === entityName && 
            w.columns.includes(attr.name) && 
            !attr.isPrimaryKey
          );
          
          if (hasNameConflict) {
            correctedName = `${entityName.toLowerCase()}_name`;
            description = description || `${entityName} display name`;
          }
        }
        
        // Build attribute line preserving original format
        const typeToUse = attr.originalType || attr.type; // Use original type format
        let attrLine = `        ${typeToUse} ${correctedName}`;
        if (attr.isPrimaryKey) {
          attrLine += ' PK';
        }
        if (attr.isForeignKey) {
          attrLine += ' FK';
        }
        if (description) {
          attrLine += ` "${description}"`;
        }
        
        correctedERD += attrLine + '\n';
      });
      
      // Add missing foreign keys only if there's a real missing FK warning
      if (entitiesNeedingFKs.has(entityName)) {
        const fkName = entitiesNeedingFKs.get(entityName);
        const referencedEntity = fkName.replace('_id', '');
        // Use 'string' instead of 'String' for consistency with original format
        correctedERD += `        string ${fkName} FK "Foreign key to ${referencedEntity.charAt(0).toUpperCase() + referencedEntity.slice(1)}"\n`;
      }
      
      correctedERD += '    }\n\n';
    }

    // Handle relationships - only fix many-to-many, preserve others exactly
    this.relationships.forEach(rel => {
      const isManyToMany = manyToManyRelationships.some(w => 
        w.relationship === `${rel.fromEntity} → ${rel.toEntity}` ||
        w.relationship === `${rel.toEntity} → ${rel.fromEntity}`
      );
      
      if (isManyToMany) {
        // Create intersection table for many-to-many relationship
        const intersectionTableName = `${rel.fromEntity}${rel.toEntity}`;
        
        correctedERD += `    ${intersectionTableName} {\n`;
        correctedERD += `        string id PK "Unique identifier"\n`;
        correctedERD += `        string ${rel.fromEntity.toLowerCase()}_id FK "Foreign key to ${rel.fromEntity}"\n`;
        correctedERD += `        string ${rel.toEntity.toLowerCase()}_id FK "Foreign key to ${rel.toEntity}"\n`;
        correctedERD += '    }\n\n';
        
        // Create two one-to-many relationships instead of many-to-many
        correctedERD += `    ${rel.fromEntity} ||--o{ ${intersectionTableName} : has\n`;
        correctedERD += `    ${rel.toEntity} ||--o{ ${intersectionTableName} : has\n`;
      } else {
        // Preserve original relationship exactly as written
        let cardinalitySymbol = '||--o{'; // Default, but try to preserve original
        
        if (rel.cardinality) {
          if (rel.cardinality.type === 'one-to-one') {
            cardinalitySymbol = '||--||';
          } else if (rel.cardinality.type === 'one-to-many') {
            cardinalitySymbol = '||--o{';
          } else if (rel.cardinality.type === 'zero-to-many') {
            cardinalitySymbol = 'o|--o{';
          }
        }
        
        const relationshipName = rel.name || 'has';
        correctedERD += `    ${rel.fromEntity} ${cardinalitySymbol} ${rel.toEntity} : ${relationshipName}\n`;
      }
    });

    return correctedERD.trim();
  }
}

module.exports = { MermaidERDParser };
