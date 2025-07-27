/**
 * Relationship Validator
 * Validates Dataverse relationship rules and detects conflicts/ambiguities
 */

export class RelationshipValidator {
  constructor() {
    this.warnings = [];
    this.errors = [];
    this.suggestions = [];
  }

  /**
   * Validate relationships for Dataverse compliance
   * @param {Array} relationships - Generated relationships
   * @param {Array} entities - Entity definitions
   * @returns {Object} Validation results
   */
  validateRelationships(relationships, entities) {
    this.warnings = [];
    this.errors = [];
    this.suggestions = [];

    // Build relationship map for analysis
    const relationshipMap = this.buildRelationshipMap(relationships);
    
    // Run validation checks
    this.checkMultipleParentalRelationships(relationshipMap);
    this.checkCircularCascadeDeletes(relationshipMap);
    this.checkSelfReferencingRelationships(relationships);
    // Note: Removed checkOrphanedEntities since all relationships are referential by default
    // and isolated entities are perfectly valid in many business scenarios
    this.checkNamingConflicts(relationships);

    return {
      isValid: this.errors.length === 0,
      warnings: this.warnings,
      errors: this.errors,
      suggestions: this.suggestions,
      resolvedRelationships: relationships, // Return the original relationships (not modified in current implementation)
      summary: this.generateValidationSummary()
    };
  }

  /**
   * Build a map of relationships for easier analysis
   * @param {Array} relationships - Generated relationships
   * @returns {Map} Entity -> relationship info map
   */
  buildRelationshipMap(relationships) {
    const map = new Map();

    relationships.forEach(rel => {
      // Since all relationships are referential by default, minimize debug output
      // Only show debug in case of actual validation issues
      
      const referencingEntity = rel.ReferencingEntity;
      const referencedEntity = rel.ReferencedEntity;
      const isParental = this.isParentalRelationship(rel);

      // Track incoming relationships (who references this entity)
      if (!map.has(referencingEntity)) {
        map.set(referencingEntity, {
          entity: referencingEntity,
          incomingParental: [],
          incomingLookup: [],
          outgoingParental: [],
          outgoingLookup: []
        });
      }

      if (!map.has(referencedEntity)) {
        map.set(referencedEntity, {
          entity: referencedEntity,
          incomingParental: [],
          incomingLookup: [],
          outgoingParental: [],
          outgoingLookup: []
        });
      }

      const relationshipInfo = {
        from: referencedEntity,
        to: referencingEntity,
        relationship: rel,
        isParental
      };

      // Add to incoming relationships for the referencing entity
      if (isParental) {
        map.get(referencingEntity).incomingParental.push(relationshipInfo);
        map.get(referencedEntity).outgoingParental.push(relationshipInfo);
      } else {
        map.get(referencingEntity).incomingLookup.push(relationshipInfo);
        map.get(referencedEntity).outgoingLookup.push(relationshipInfo);
      }
    });

    return map;
  }

  /**
   * Check if a relationship is parental (cascade delete)
   * @param {Object} relationship - Relationship definition
   * @returns {boolean} True if parental
   */
  isParentalRelationship(relationship) {
    return relationship.CascadeConfiguration?.Delete === 'Cascade';
  }

  /**
   * Check for multiple parental relationships to the same entity
   * @param {Map} relationshipMap - Relationship map
   */
  checkMultipleParentalRelationships(relationshipMap) {
    relationshipMap.forEach((entityInfo, entityName) => {
      // Only show output if there are actual parental relationships (should be none by default)
      if (entityInfo.incomingParental.length > 0) {
        console.log(`🔍 Checking entity ${entityName}: ${entityInfo.incomingParental.length} parental relationships`);
      }
      
      if (entityInfo.incomingParental.length > 1) {
        const parentEntities = entityInfo.incomingParental.map(rel => 
          this.getDisplayName(rel.from)
        );

        console.log(`❌ MULTIPLE PARENTAL RELATIONSHIPS DETECTED for ${entityName}:`, parentEntities);

        this.errors.push({
          type: 'MULTIPLE_PARENTAL_RELATIONSHIPS',
          entity: this.getDisplayName(entityName),
          message: `Entity '${this.getDisplayName(entityName)}' has ${entityInfo.incomingParental.length} parental relationships`,
          details: `Dataverse allows only ONE parental relationship per entity. Currently: ${parentEntities.join(', ')}`,
          parents: parentEntities,
          relationships: entityInfo.incomingParental
        });

        this.suggestions.push({
          type: 'CONVERT_TO_LOOKUP',
          entity: this.getDisplayName(entityName),
          message: `Consider converting all but one parental relationship to lookup relationships`,
          options: parentEntities.map(parent => ({
            parent,
            action: 'Keep as parental',
            description: `${parent} will own ${this.getDisplayName(entityName)} records (cascade delete)`
          }))
        });
      }
    });
  }

  /**
   * Check for circular cascade delete relationships
   * @param {Map} relationshipMap - Relationship map
   */
  checkCircularCascadeDeletes(relationshipMap) {
    const visited = new Set();
    const recursionStack = new Set();

    const findCycle = (entityName, path) => {
      if (recursionStack.has(entityName)) {
        // Found a cycle
        const cycleStart = path.indexOf(entityName);
        const cycle = path.slice(cycleStart);
        cycle.push(entityName); // Complete the cycle

        this.errors.push({
          type: 'CIRCULAR_CASCADE_DELETE',
          message: 'Circular cascade delete detected',
          details: `Circular parental relationship found: ${cycle.map(e => this.getDisplayName(e)).join(' → ')}`,
          cycle: cycle.map(e => this.getDisplayName(e)),
          impact: 'This would cause infinite cascade deletes and is not supported by Dataverse'
        });

        this.suggestions.push({
          type: 'BREAK_CYCLE',
          message: 'Break the circular cascade by converting one relationship to lookup',
          cycle: cycle.map(e => this.getDisplayName(e)),
          options: cycle.slice(0, -1).map((entity, index) => ({
            from: this.getDisplayName(entity),
            to: this.getDisplayName(cycle[index + 1]),
            action: 'Convert to lookup',
            description: 'Remove cascade delete behavior for this relationship'
          }))
        });

        return true;
      }

      if (visited.has(entityName)) {
        return false;
      }

      visited.add(entityName);
      recursionStack.add(entityName);

      const entityInfo = relationshipMap.get(entityName);
      if (entityInfo) {
        // Only follow parental (cascade) relationships
        for (const rel of entityInfo.outgoingParental) {
          if (findCycle(rel.to, [...path, entityName])) {
            return true;
          }
        }
      }

      recursionStack.delete(entityName);
      return false;
    };

    // Check for cycles starting from each entity
    relationshipMap.forEach((_, entityName) => {
      if (!visited.has(entityName)) {
        findCycle(entityName, []);
      }
    });
  }

  /**
   * Check self-referencing relationships for proper configuration
   * @param {Array} relationships - Generated relationships
   */
  checkSelfReferencingRelationships(relationships) {
    relationships.forEach(rel => {
      if (rel.ReferencingEntity === rel.ReferencedEntity) {
        const isParental = this.isParentalRelationship(rel);
        const isRequired = rel.Lookup?.RequiredLevel?.Value === 'ApplicationRequired';

        if (isParental) {
          this.warnings.push({
            type: 'SELF_REFERENCING_PARENTAL',
            entity: this.getDisplayName(rel.ReferencingEntity),
            message: `Self-referencing parental relationship detected`,
            details: `Entity '${this.getDisplayName(rel.ReferencingEntity)}' references itself with cascade delete`,
            impact: 'This could cause unintended cascade deletes of related records'
          });

          this.suggestions.push({
            type: 'CONVERT_SELF_REF_TO_LOOKUP',
            entity: this.getDisplayName(rel.ReferencingEntity),
            message: 'Consider converting self-referencing relationship to lookup',
            recommendation: 'Set CascadeConfiguration.Delete to "RemoveLink" instead of "Cascade"'
          });
        }

        if (isRequired) {
          this.warnings.push({
            type: 'SELF_REFERENCING_REQUIRED',
            entity: this.getDisplayName(rel.ReferencingEntity),
            message: `Required self-referencing relationship detected`,
            details: `This makes it impossible to create the first record`,
            recommendation: 'Make the lookup field optional (RequiredLevel: None)'
          });
        }
      }
    });
  }

  /**
   * Check for entities that have no relationships
   * @param {Map} relationshipMap - Relationship map
   * @param {Array} entities - Entity definitions
   */
  checkOrphanedEntities(relationshipMap, entities) {
    entities.forEach(entity => {
      const entityLogicalName = entity.LogicalName;
      const entityInfo = relationshipMap.get(entityLogicalName);

      if (!entityInfo || (
        entityInfo.incomingParental.length === 0 &&
        entityInfo.incomingLookup.length === 0 &&
        entityInfo.outgoingParental.length === 0 &&
        entityInfo.outgoingLookup.length === 0
      )) {
        this.warnings.push({
          type: 'ORPHANED_ENTITY',
          entity: this.getDisplayName(entityLogicalName),
          message: `Entity '${this.getDisplayName(entityLogicalName)}' has no relationships`,
          details: 'Isolated entities are valid but uncommon in business applications',
          recommendation: 'Consider if this entity should be related to others'
        });
      }
    });
  }

  /**
   * Check for potential naming conflicts
   * @param {Array} relationships - Generated relationships
   */
  checkNamingConflicts(relationships) {
    const schemaNames = new Set();
    const lookupNames = new Set();

    relationships.forEach(rel => {
      // Check for duplicate schema names
      if (schemaNames.has(rel.SchemaName)) {
        this.warnings.push({
          type: 'DUPLICATE_SCHEMA_NAME',
          schemaName: rel.SchemaName,
          message: `Duplicate relationship schema name: ${rel.SchemaName}`,
          details: 'This could cause conflicts during creation'
        });
      }
      schemaNames.add(rel.SchemaName);

      // Check for duplicate lookup field names within same entity
      if (rel.Lookup) {
        const lookupKey = `${rel.ReferencingEntity}.${rel.Lookup.LogicalName}`;
        if (lookupNames.has(lookupKey)) {
          this.warnings.push({
            type: 'DUPLICATE_LOOKUP_NAME',
            entity: this.getDisplayName(rel.ReferencingEntity),
            lookupName: rel.Lookup.LogicalName,
            message: `Duplicate lookup field name in entity '${this.getDisplayName(rel.ReferencingEntity)}'`,
            details: `Field '${rel.Lookup.LogicalName}' conflicts with another relationship`
          });
        }
        lookupNames.add(lookupKey);
      }
    });
  }

  /**
   * Generate a validation summary
   * @returns {Object} Summary of validation results
   */
  generateValidationSummary() {
    return {
      totalIssues: this.errors.length + this.warnings.length,
      errors: this.errors.length,
      warnings: this.warnings.length,
      suggestions: this.suggestions.length,
      status: this.errors.length === 0 ? 'VALID' : 'INVALID',
      message: this.errors.length === 0 
        ? `✅ Relationship validation passed${this.warnings.length > 0 ? ` with ${this.warnings.length} warnings` : ''}`
        : `❌ Relationship validation failed with ${this.errors.length} errors and ${this.warnings.length} warnings`
    };
  }

  /**
   * Get display name from logical name
   * @param {string} logicalName - Entity logical name
   * @returns {string} Display name
   */
  getDisplayName(logicalName) {
    if (!logicalName || typeof logicalName !== 'string') {
      return 'Unknown Entity';
    }
    // Remove publisher prefix and format for display
    return logicalName.replace(/^[^_]+_/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  /**
   * Generate interactive prompts for resolving conflicts
   * @param {Object} validationResults - Results from validateRelationships
   * @returns {Array} Array of prompts for user interaction
   */
  generateInteractivePrompts(validationResults) {
    const prompts = [];

    // Generate prompts for multiple parental relationships
    validationResults.errors
      .filter(error => error.type === 'MULTIPLE_PARENTAL_RELATIONSHIPS')
      .forEach(error => {
        prompts.push({
          type: 'choice',
          title: `🔗 Multiple Parent Relationships Detected`,
          message: `Entity '${error.entity}' has multiple parental relationships: ${error.parents.join(', ')}`,
          description: 'Dataverse allows only ONE parental (cascade delete) relationship per entity.',
          question: `Which entity should be the primary parent of '${error.entity}'?`,
          choices: [
            ...error.parents.map(parent => ({
              name: parent,
              value: parent,
              description: `${parent} will own ${error.entity} records (cascade delete)`
            })),
            {
              name: 'None - Convert all to lookups',
              value: 'none',
              description: 'Use referential relationships only (no cascade delete)'
            }
          ],
          default: error.parents[0] // Default to first parent
        });
      });

    // Generate prompts for circular cascades
    validationResults.errors
      .filter(error => error.type === 'CIRCULAR_CASCADE_DELETE')
      .forEach(error => {
        prompts.push({
          type: 'choice',
          title: `🔄 Circular Cascade Delete Detected`,
          message: `Circular relationship found: ${error.cycle.join(' → ')}`,
          description: 'This would cause infinite cascade deletes and must be resolved.',
          question: 'Which relationship should be converted to a lookup (non-cascading)?',
          choices: validationResults.suggestions
            .find(s => s.type === 'BREAK_CYCLE')?.options || [],
          required: true
        });
      });

    return prompts;
  }
}

export default RelationshipValidator;
