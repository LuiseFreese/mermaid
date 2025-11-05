/**
 * Relationship Validator
 * Handles validation of relationships, foreign keys, and cardinality
 */
const { BaseValidator } = require('../base-validator');

class RelationshipValidator extends BaseValidator {
    constructor(dependencies = {}) {
        super(dependencies);
    }

    /**
     * Validate relationships including foreign keys, cardinality, and dependencies
     * @param {Array} entities - Parsed entities
     * @param {Array} relationships - Parsed relationships
     * @returns {Object} Validation result
     */
    validateRelationships(entities, relationships) {
        const warnings = [];

        // Check if all entities are CDM entities - if so, skip foreign key validation
        const allEntitiesAreCdm = entities.every(entity => entity.isCdmEntity);
        if (allEntitiesAreCdm && entities.length > 0) {
            this.log('All entities are CDM entities - skipping detailed relationship validation');
            return {
                isValid: true,
                warnings: [],
                metadata: {
                    relationshipsProcessed: relationships.length,
                    allCdmEntities: true,
                    validationSkipped: 'Foreign key validation skipped for CDM entities'
                }
            };
        }

        // Create entity map for faster lookups
        const entityMap = new Map();
        entities.forEach(entity => {
            entityMap.set(entity.name, entity);
        });

        // Validate missing foreign keys
        const missingFkWarnings = this.checkMissingForeignKeys(relationships, entityMap);
        warnings.push(...missingFkWarnings);

        // Check for orphaned relationships
        const orphanWarnings = this.checkOrphanedRelationships(relationships, entityMap);
        warnings.push(...orphanWarnings);

        // Check for circular dependencies
        const circularWarnings = this.checkCircularDependencies(relationships);
        warnings.push(...circularWarnings);

        // Validate cardinality patterns
        const cardinalityWarnings = this.validateCardinalityPatterns(relationships);
        warnings.push(...cardinalityWarnings);

        // Check for duplicate relationships
        const duplicateWarnings = this.checkDuplicateRelationships(relationships);
        warnings.push(...duplicateWarnings);

        return {
            isValid: true, // Relationships are warnings, not errors
            warnings: warnings.filter(w => w !== null),
            metadata: {
                relationshipsProcessed: relationships.length,
                allCdmEntities: false,
                checksPerformed: [
                    'missing_foreign_keys',
                    'orphaned_relationships', 
                    'circular_dependencies',
                    'cardinality_patterns',
                    'duplicate_relationships'
                ]
            }
        };
    }

    /**
     * Check for missing foreign keys in relationships
     * @param {Array} relationships - Parsed relationships
     * @param {Map} entityMap - Map of entity name to entity object
     * @returns {Array} Array of missing foreign key warnings
     */
    checkMissingForeignKeys(relationships, entityMap) {
        const warnings = [];

        relationships.forEach(rel => {
            if (!rel.fromEntity || !rel.toEntity) return;

            const fromEntity = entityMap.get(rel.fromEntity);
            const toEntity = entityMap.get(rel.toEntity);

            if (!fromEntity || !toEntity) return;

            // Skip CDM entities for foreign key validation
            if (fromEntity.isCdmEntity || toEntity.isCdmEntity) return;

            // Check if the relationship has a foreign key attribute
            const expectedFkName = `${rel.toEntity.toLowerCase()}_id`;
            const hasForeignKey = fromEntity.attributes?.some(attr => 
                attr.name === expectedFkName || 
                attr.constraints?.includes('FK') ||
                attr.isForeignKey
            );

            if (!hasForeignKey) {
                const warning = this.createWarning({
                    type: 'missing_foreign_key',
                    category: 'relationships',
                    severity: 'warning',
                    entity: rel.fromEntity,
                    relationship: `${rel.fromEntity} → ${rel.toEntity}`,
                    message: `Missing foreign key for relationship from '${rel.fromEntity}' to '${rel.toEntity}'.`,
                    suggestion: `Add foreign key attribute '${expectedFkName}' to '${rel.fromEntity}' entity.`,
                    autoFixable: true,
                    fixData: {
                        fromEntity: rel.fromEntity,
                        toEntity: rel.toEntity,
                        foreignKeyName: expectedFkName,
                        action: 'add_foreign_key'
                    }
                });
                if (warning) warnings.push(warning);
            }

            // Special check for one-to-one relationships
            if (rel.cardinality && rel.cardinality.type === 'one-to-one') {
                // For one-to-one, check if either entity has the foreign key
                const toEntityFkName = `${rel.fromEntity.toLowerCase()}_id`;
                const toEntityHasFk = toEntity.attributes?.some(attr => 
                    attr.name === toEntityFkName || 
                    attr.constraints?.includes('FK') ||
                    attr.isForeignKey
                );

                if (!hasForeignKey && !toEntityHasFk) {
                    const warning = this.createWarning({
                        type: 'missing_foreign_key_one_to_one',
                        category: 'relationships',
                        severity: 'warning',
                        relationship: `${rel.fromEntity} ↔ ${rel.toEntity}`,
                        message: `One-to-one relationship between '${rel.fromEntity}' and '${rel.toEntity}' is missing foreign key.`,
                        suggestion: `Add foreign key to one of the entities. Consider adding '${expectedFkName}' to '${rel.fromEntity}' or '${toEntityFkName}' to '${rel.toEntity}'.`,
                        autoFixable: true,
                        fixData: {
                            fromEntity: rel.fromEntity,
                            toEntity: rel.toEntity,
                            options: [
                                { entity: rel.fromEntity, foreignKey: expectedFkName },
                                { entity: rel.toEntity, foreignKey: toEntityFkName }
                            ],
                            action: 'add_foreign_key_one_to_one'
                        }
                    });
                    if (warning) warnings.push(warning);
                }
            }
        });

        return warnings;
    }

    /**
     * Check for orphaned relationships (references to non-existent entities)
     * @param {Array} relationships - Parsed relationships
     * @param {Map} entityMap - Map of entity name to entity object
     * @returns {Array} Array of orphaned relationship warnings
     */
    checkOrphanedRelationships(relationships, entityMap) {
        const warnings = [];

        relationships.forEach(rel => {
            if (!rel.fromEntity || !rel.toEntity) return;

            if (!entityMap.has(rel.fromEntity)) {
                const warning = this.createWarning({
                    type: 'orphaned_relationship',
                    category: 'relationships',
                    severity: 'error',
                    relationship: rel.fromEntity,
                    message: `Relationship references non-existent entity: '${rel.fromEntity}'.`,
                    suggestion: `Either create the '${rel.fromEntity}' entity or remove this relationship.`,
                    autoFixable: false
                });
                if (warning) warnings.push(warning);
            }

            if (!entityMap.has(rel.toEntity)) {
                const warning = this.createWarning({
                    type: 'orphaned_relationship',
                    category: 'relationships',
                    severity: 'error',
                    relationship: rel.toEntity,
                    message: `Relationship references non-existent entity: '${rel.toEntity}'.`,
                    suggestion: `Either create the '${rel.toEntity}' entity or remove this relationship.`,
                    autoFixable: false
                });
                if (warning) warnings.push(warning);
            }
        });

        return warnings;
    }

    /**
     * Check for circular dependencies in relationships
     * @param {Array} relationships - Parsed relationships
     * @returns {Array} Array of circular dependency warnings
     */
    checkCircularDependencies(relationships) {
        const warnings = [];
        const graph = new Map();

        // Build adjacency list
        relationships.forEach(rel => {
            if (!rel.fromEntity || !rel.toEntity) return;
            
            if (!graph.has(rel.fromEntity)) {
                graph.set(rel.fromEntity, []);
            }
            graph.get(rel.fromEntity).push(rel.toEntity);
        });

        // Detect cycles using DFS
        const visited = new Set();
        const recursionStack = new Set();

        const detectCycle = (node, path = []) => {
            if (recursionStack.has(node)) {
                // Found a cycle
                const cycleStart = path.indexOf(node);
                const cycle = path.slice(cycleStart).concat([node]);
                
                const warning = this.createWarning({
                    type: 'circular_dependency',
                    category: 'relationships',
                    severity: 'warning',
                    message: `Circular dependency detected: ${cycle.join(' → ')}.`,
                    suggestion: 'Consider breaking the cycle by removing one relationship or using junction tables.',
                    autoFixable: false,
                    context: {
                        cycle: cycle,
                        cyclePath: cycle.join(' → ')
                    }
                });
                if (warning) warnings.push(warning);
                return;
            }

            if (visited.has(node)) return;

            visited.add(node);
            recursionStack.add(node);

            const neighbors = graph.get(node) || [];
            for (const neighbor of neighbors) {
                detectCycle(neighbor, [...path, node]);
            }

            recursionStack.delete(node);
        };

        // Check all nodes
        for (const node of graph.keys()) {
            if (!visited.has(node)) {
                detectCycle(node);
            }
        }

        return warnings;
    }

    /**
     * Validate cardinality patterns
     * @param {Array} relationships - Parsed relationships
     * @returns {Array} Array of cardinality warnings
     */
    validateCardinalityPatterns(relationships) {
        const warnings = [];

        relationships.forEach(rel => {
            // Check for many-to-many relationships
            if (rel.cardinality && rel.cardinality.type === 'many-to-many') {
                const warning = this.createWarning({
                    type: 'many_to_many',
                    category: 'relationships',
                    severity: 'info',
                    relationship: `${rel.fromEntity} ↔ ${rel.toEntity}`,
                    message: `Many-to-many relationship between '${rel.fromEntity}' and '${rel.toEntity}' detected.`,
                    suggestion: 'Consider using a junction table for better database design.',
                    autoFixable: true,
                    fixData: {
                        fromEntity: rel.fromEntity,
                        toEntity: rel.toEntity,
                        junctionTableName: `${rel.fromEntity}${rel.toEntity}`,
                        action: 'convert_to_junction_table'
                    }
                });
                if (warning) warnings.push(warning);
            }
        });

        return warnings;
    }

    /**
     * Check for duplicate relationships
     * @param {Array} relationships - Parsed relationships
     * @returns {Array} Array of duplicate relationship warnings
     */
    checkDuplicateRelationships(relationships) {
        const warnings = [];
        const relationshipMap = new Map();

        relationships.forEach((rel, index) => {
            if (!rel.fromEntity || !rel.toEntity) return;

            const key = `${rel.fromEntity}-${rel.toEntity}`;
            const reverseKey = `${rel.toEntity}-${rel.fromEntity}`;

            if (relationshipMap.has(key)) {
                const warning = this.createWarning({
                    type: 'duplicate_relationship',
                    category: 'relationships',
                    severity: 'warning',
                    relationship: `${rel.fromEntity} → ${rel.toEntity}`,
                    message: `Duplicate relationship found between '${rel.fromEntity}' and '${rel.toEntity}'.`,
                    suggestion: 'Remove duplicate relationship definitions to avoid conflicts.',
                    autoFixable: true,
                    fixData: {
                        relationshipIndex: index,
                        fromEntity: rel.fromEntity,
                        toEntity: rel.toEntity,
                        action: 'remove_duplicate'
                    }
                });
                if (warning) warnings.push(warning);
            } else {
                relationshipMap.set(key, index);
                // Also track reverse to catch bidirectional duplicates
                relationshipMap.set(reverseKey, index);
            }
        });

        return warnings;
    }
}

module.exports = { RelationshipValidator };