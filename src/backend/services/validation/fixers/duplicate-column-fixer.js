/**
 * Duplicate Column Fixer
 * Handles fixing duplicate columns within entities
 */
const { BaseValidator } = require('../base-validator');

class DuplicateColumnFixer extends BaseValidator {
    constructor(dependencies = {}) {
        super(dependencies);
    }

    /**
     * Fix duplicate columns in an entity
     * @param {string} content - ERD content
     * @param {Object} warning - Warning details
     * @returns {Object} Fix result
     */
    async fixDuplicateColumns(content, warning) {
        const entityName = warning.entity;
        if (!entityName) {
            return this.createError('Entity name not provided');
        }

        try {
            this.log('fixDuplicateColumns', { entity: entityName });
            
            // Find the entity definition
            const entityPattern = new RegExp(`(${entityName}\\s*\\{[^}]*})`, 'g');
            const entityMatch = entityPattern.exec(content);
            
            if (!entityMatch) {
                this.log('Entity not found', { entity: entityName });
                return this.createError(`Entity ${entityName} not found`);
            }
            
            const entityDefinition = entityMatch[1];
            this.log('Found entity definition', { entityDefinition });
            
            // Parse all attributes in the entity
            const result = this.removeDuplicateAttributes(entityDefinition, entityName);
            if (!result.success) {
                return result;
            }

            // Replace the entity definition in the content
            const updatedContent = content.replace(entityDefinition, result.newEntityContent);
            
            this.log('Successfully fixed duplicate columns', { 
                entity: entityName,
                removedCount: result.removedCount 
            });
            
            return {
                success: true,
                data: updatedContent,
                message: `Removed ${result.removedCount} duplicate column(s) in entity '${entityName}'`
            };
            
        } catch (error) {
            this.error('fixDuplicateColumns failed', error);
            return this.createError(error.message, error);
        }
    }

    /**
     * Remove duplicate attributes from entity definition
     * @param {string} entityDefinition - Entity definition string
     * @param {string} entityName - Entity name for logging
     * @returns {Object} Result with new content and metadata
     */
    removeDuplicateAttributes(entityDefinition, entityName) {
        const attributePattern = /^\s*(string|int|datetime|decimal|boolean)\s+(\w+)(?:\s+(PK|FK))?(?:\s+"([^"]*)")?/gm;
        let attributeMatch;
        const attributes = [];
        const seenAttributes = new Set();
        const duplicateAttributes = new Set();
        
        // First pass: identify all attributes and duplicates
        while ((attributeMatch = attributePattern.exec(entityDefinition)) !== null) {
            const [fullMatch, type, name, constraint, description] = attributeMatch;
            
            if (seenAttributes.has(name)) {
                duplicateAttributes.add(name);
                this.log('Found duplicate attribute', { attribute: name, entity: entityName });
            } else {
                seenAttributes.add(name);
            }
            
            attributes.push({
                fullMatch,
                type,
                name,
                constraint,
                description,
                isDuplicate: seenAttributes.has(name) && duplicateAttributes.has(name)
            });
        }

        if (duplicateAttributes.size === 0) {
            return {
                success: false,
                error: 'No duplicate attributes found'
            };
        }

        let newEntityContent = entityDefinition;
        let removedCount = 0;

        // Process each duplicate attribute
        for (const duplicate of duplicateAttributes) {
            const duplicateInstances = attributes.filter(attr => attr.name === duplicate);
            
            if (duplicateInstances.length <= 1) continue;

            // Choose the best instance (prefer one with constraints, then with description)
            const bestInstance = this.chooseBestInstance(duplicateInstances);
            const keptLine = bestInstance.fullMatch;
            
            this.log('Keeping best instance', { 
                duplicate, 
                kept: keptLine.trim(),
                entity: entityName 
            });
            
            // Remove all instances of this duplicate
            for (const instance of duplicateInstances) {
                const escapedMatch = this.escapeRegexString(instance.fullMatch);
                const removePattern = new RegExp(`\\s*${escapedMatch}\\s*`, 'g');
                newEntityContent = newEntityContent.replace(removePattern, '');
                removedCount++;
                this.log('Removed instance', { 
                    removed: instance.fullMatch.trim(),
                    entity: entityName 
                });
            }
            
            // Add back the best instance
            const closingBraceIndex = newEntityContent.lastIndexOf('}');
            if (closingBraceIndex !== -1) {
                const beforeBrace = newEntityContent.substring(0, closingBraceIndex);
                const afterBrace = newEntityContent.substring(closingBraceIndex);
                newEntityContent = beforeBrace + `  ${keptLine.trim()}\n` + afterBrace;
                removedCount--; // Don't count the one we added back
                this.log('Added back best instance', { 
                    added: keptLine.trim(),
                    entity: entityName 
                });
            }
        }
        
        // Clean up extra whitespace
        newEntityContent = this.cleanupWhitespace(newEntityContent);
        
        return {
            success: true,
            newEntityContent,
            removedCount
        };
    }

    /**
     * Choose the best instance from duplicate attributes
     * @param {Array} instances - Array of duplicate attribute instances
     * @returns {Object} Best instance
     */
    chooseBestInstance(instances) {
        // Priority: 1. Has constraint, 2. Has description, 3. First occurrence
        return instances.reduce((best, current) => {
            // Prefer instances with constraints (PK, FK)
            if (current.constraint && !best.constraint) return current;
            if (!current.constraint && best.constraint) return best;
            
            // Prefer instances with descriptions
            if (current.description && !best.description) return current;
            if (!current.description && best.description) return best;
            
            // Keep the first one if equal priority
            return best;
        }, instances[0]);
    }

    /**
     * Escape special regex characters in string
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    escapeRegexString(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Clean up extra whitespace in entity definition
     * @param {string} content - Content to clean
     * @returns {string} Cleaned content
     */
    cleanupWhitespace(content) {
        return content
            .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove multiple empty lines
            .replace(/^\s+$/gm, '') // Remove whitespace-only lines
            .replace(/\s+}/g, '}'); // Clean up spacing before closing brace
    }
}

module.exports = { DuplicateColumnFixer };