/**
 * Validation Module Exports
 * Central export point for all validation components
 */

// Base classes
const { BaseValidator } = require('./base-validator');

// Validators
const { EntityStructureValidator } = require('./validators/entity-structure-validator');
const { RelationshipValidator } = require('./validators/relationship-validator');

// Fixers
const { DuplicateColumnFixer } = require('./fixers/duplicate-column-fixer');
const { DuplicateRelationshipFixer } = require('./fixers/duplicate-relationship-fixer');

module.exports = {
    // Base classes
    BaseValidator,
    
    // Validators
    EntityStructureValidator,
    RelationshipValidator,
    
    // Fixers
    DuplicateColumnFixer,
    DuplicateRelationshipFixer
};