/**
 * Duplicate Relationship Fixer
 * Handles fixing duplicate relationships between entities
 */
const { BaseValidator } = require('../base-validator');

class DuplicateRelationshipFixer extends BaseValidator {
    constructor(dependencies = {}) {
        super(dependencies);
    }

    /**
     * Fix duplicate relationships
     * @param {string} content - ERD content
     * @param {Object} warning - Warning details
     * @returns {Object} Fix result
     */
    async fixDuplicateRelationship(content, warning) {
        this.log('fixDuplicateRelationship', { 
            contentLength: content.length, 
            warningType: warning.type 
        });
        
        try {
            // Extract relationship info from warning
            const relationship = warning.relationship;
            if (!relationship) {
                this.log('No relationship info in warning', { warning });
                return this.createError('No relationship information found');
            }
            
            this.log('Fixing duplicate relationship', { relationship });
            
            const result = this.removeDuplicateRelationships(content, relationship);
            
            if (!result.success) {
                return result;
            }

            return {
                success: true,
                data: result.data,
                message: result.message
            };
            
        } catch (error) {
            this.error('fixDuplicateRelationship failed', error);
            return this.createError(error.message, error);
        }
    }

    /**
     * Remove duplicate relationships from content
     * @param {string} content - ERD content
     * @param {string} relationship - Relationship string (e.g., "Employee → Department")
     * @returns {Object} Result with fixed content
     */
    removeDuplicateRelationships(content, relationship) {
        // Find all relationship definitions in the content
        const relationshipPattern = new RegExp(`\\s*(\\w+)\\s*\\|\\|--[o{|}]*\\s*(\\w+)\\s*:\\s*[^\\n]*`, 'g');
        const relationships = [];
        let match;
        
        while ((match = relationshipPattern.exec(content)) !== null) {
            relationships.push({
                fullMatch: match[0],
                source: match[1],
                target: match[2],
                startIndex: match.index,
                endIndex: match.index + match[0].length
            });
        }
        
        this.log('Found relationships', { 
            count: relationships.length,
            relationships: relationships.map(r => `${r.source} → ${r.target}`)
        });
        
        // Parse the warning relationship (e.g., "Employee → Department")
        const [sourceEntity, targetEntity] = relationship.split(' → ');
        
        // Find duplicates for this specific relationship
        const duplicates = relationships.filter(r => 
            (r.source === sourceEntity && r.target === targetEntity) ||
            (r.source === targetEntity && r.target === sourceEntity)
        );
        
        this.log('Found duplicate relationships', { 
            count: duplicates.length,
            duplicates: duplicates.map(d => d.fullMatch.trim())
        });
        
        if (duplicates.length <= 1) {
            return {
                success: false,
                error: 'No duplicate relationships found to remove'
            };
        }
        
        // Keep the first occurrence, remove the rest
        const toRemove = duplicates.slice(1);
        let updatedContent = content;
        
        // Remove duplicates in reverse order to maintain indices
        toRemove.reverse().forEach(duplicate => {
            this.log('Removing duplicate relationship', { 
                removed: duplicate.fullMatch.trim()
            });
            
            const beforeRemoval = updatedContent.substring(0, duplicate.startIndex);
            const afterRemoval = updatedContent.substring(duplicate.endIndex);
            updatedContent = beforeRemoval + afterRemoval;
        });
        
        // Clean up any extra whitespace
        updatedContent = this.cleanupWhitespace(updatedContent);
        
        this.log('Successfully removed duplicate relationships', { 
            removedCount: toRemove.length
        });
        
        return {
            success: true,
            data: updatedContent,
            message: `Removed ${toRemove.length} duplicate relationship(s) for '${relationship}'`
        };
    }

    /**
     * Clean up extra whitespace in content
     * @param {string} content - Content to clean
     * @returns {string} Cleaned content
     */
    cleanupWhitespace(content) {
        return content.replace(/\n\s*\n\s*\n/g, '\n\n');
    }
}

module.exports = { DuplicateRelationshipFixer };