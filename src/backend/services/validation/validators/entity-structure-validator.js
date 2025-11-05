/**
 * Entity Structure Validator
 * Handles validation of entity definitions, naming, and structure
 */
const { BaseValidator } = require('../base-validator');

class EntityStructureValidator extends BaseValidator {
    constructor(dependencies = {}) {
        super(dependencies);
    }

    /**
     * Validate entity structure including names, attributes, and primary keys
     * @param {Array} entities - Parsed entities
     * @param {Array} relationships - Parsed relationships  
     * @returns {Object} Validation result
     */
    validateEntityStructure(entities, relationships) {
        const warnings = [];
        const errors = [];

        // Check for duplicate entity names
        const duplicates = this.findDuplicateEntityNames(entities);
        if (duplicates.length > 0) {
            duplicates.forEach(entityName => {
                errors.push(`Duplicate entity name: '${entityName}'`);
            });
        }

        // Validate each entity
        entities.forEach(entity => {
            // Check for valid entity name
            if (!entity.name || typeof entity.name !== 'string') {
                errors.push('Entity must have a valid name');
                return;
            }

            // Validate entity naming conventions
            const namingWarnings = this.validateEntityNaming(entity);
            warnings.push(...namingWarnings);

            // Check for duplicate attributes within entity
            const duplicateAttrs = this.findDuplicateAttributes(entity);
            if (duplicateAttrs.length > 0) {
                duplicateAttrs.forEach(attrName => {
                    const warning = this.createWarning({
                        type: 'duplicate_attribute',
                        category: 'entities',
                        severity: 'error',
                        entity: entity.name,
                        attribute: attrName,
                        message: `Duplicate attribute '${attrName}' found in entity '${entity.name}'.`,
                        suggestion: `Remove duplicate '${attrName}' definitions to avoid conflicts.`,
                        autoFixable: true,
                        fixData: {
                            entity: entity.name,
                            attribute: attrName,
                            action: 'remove_duplicates'
                        }
                    });
                    if (warning) warnings.push(warning);
                });
            }

            // Check for primary key
            const hasPrimaryKey = entity.attributes?.some(attr => 
                attr.constraints?.includes('PK') || attr.isPrimaryKey
            );

            if (!hasPrimaryKey) {
                const warning = this.createWarning({
                    type: 'missing_primary_key',
                    category: 'entities',
                    severity: 'warning',
                    entity: entity.name,
                    message: `Entity '${entity.name}' does not have a primary key defined.`,
                    suggestion: `Consider adding a primary key attribute to uniquely identify records.`,
                    autoFixable: true,
                    fixData: {
                        entity: entity.name,
                        suggestedPrimaryKey: `${entity.name.toLowerCase()}_id`,
                        action: 'add_primary_key'
                    }
                });
                if (warning) warnings.push(warning);
            }
        });

        // Validate relationship entity references
        relationships.forEach(rel => {
            if (!rel.fromEntity || !rel.toEntity) {
                errors.push('Relationship must have valid from and to entities');
                return;
            }

            const fromExists = entities.some(e => e.name === rel.fromEntity);
            const toExists = entities.some(e => e.name === rel.toEntity);

            if (!fromExists) {
                errors.push(`Relationship references non-existent entity: '${rel.fromEntity}'`);
            }
            if (!toExists) {
                errors.push(`Relationship references non-existent entity: '${rel.toEntity}'`);
            }
        });

        return {
            isValid: errors.length === 0,
            warnings: warnings.filter(w => w !== null),
            errors,
            metadata: {
                entitiesProcessed: entities.length,
                relationshipsProcessed: relationships.length,
                duplicateEntities: duplicates.length
            }
        };
    }

    /**
     * Find duplicate entity names
     * @param {Array} entities - Array of entities
     * @returns {Array} Array of duplicate entity names
     */
    findDuplicateEntityNames(entities) {
        const nameCount = {};
        const duplicates = [];

        entities.forEach(entity => {
            const name = entity.name;
            nameCount[name] = (nameCount[name] || 0) + 1;
        });

        Object.keys(nameCount).forEach(name => {
            if (nameCount[name] > 1) {
                duplicates.push(name);
            }
        });

        return duplicates;
    }

    /**
     * Find duplicate attributes within an entity
     * @param {Object} entity - Entity object
     * @returns {Array} Array of duplicate attribute names
     */
    findDuplicateAttributes(entity) {
        if (!entity.attributes || !Array.isArray(entity.attributes)) {
            return [];
        }

        const attrCount = {};
        const duplicates = [];

        entity.attributes.forEach(attr => {
            const name = attr.name;
            attrCount[name] = (attrCount[name] || 0) + 1;
        });

        Object.keys(attrCount).forEach(name => {
            if (attrCount[name] > 1) {
                duplicates.push(name);
            }
        });

        return duplicates;
    }

    /**
     * Validate entity naming conventions
     * @param {Object} entity - Entity object
     * @returns {Array} Array of naming warnings
     */
    validateEntityNaming(entity) {
        const warnings = [];
        const name = entity.name;

        // Check for Pascal case (recommended for entities)
        if (!/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
            const warning = this.createWarning({
                type: 'naming_convention',
                category: 'entities',
                severity: 'info',
                entity: name,
                message: `Entity '${name}' should use PascalCase naming convention.`,
                suggestion: `Consider renaming to: ${this.toPascalCase(name)}`,
                autoFixable: false
            });
            if (warning) warnings.push(warning);
        }

        // Check for reserved keywords
        const reservedKeywords = ['User', 'Role', 'Group', 'System', 'Admin'];
        if (reservedKeywords.includes(name)) {
            const warning = this.createWarning({
                type: 'reserved_keyword',
                category: 'entities',
                severity: 'warning',
                entity: name,
                message: `Entity name '${name}' might conflict with system entities.`,
                suggestion: `Consider using a more specific name like 'Custom${name}' or '${name}Entity'.`,
                autoFixable: false
            });
            if (warning) warnings.push(warning);
        }

        return warnings;
    }

    /**
     * Convert string to PascalCase
     * @param {string} str - Input string
     * @returns {string} PascalCase string
     */
    toPascalCase(str) {
        return str
            .split(/[\s_-]+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }
}

module.exports = { EntityStructureValidator };