/**
 * Refactored Validation Service
 * Orchestrates validation using focused, single-responsibility components
 */
const { BaseService } = require('./base-service');
const {
    EntityStructureValidator,
    RelationshipValidator,
    DuplicateColumnFixer,
    DuplicateRelationshipFixer
} = require('./validation');

class ValidationService extends BaseService {
    constructor(dependencies = {}) {
        super(dependencies);
        
        // Validate required dependencies
        this.validateDependencies(['mermaidParser']);
        
        this.mermaidParser = dependencies.mermaidParser;
        this.cdmRegistry = dependencies.cdmRegistry; // Optional for now
        this.dataverseRepository = dependencies.dataverseRepository;
        
        // Initialize specialized validators and fixers
        this.entityStructureValidator = new EntityStructureValidator(dependencies);
        this.relationshipValidator = new RelationshipValidator(dependencies);
        this.duplicateColumnFixer = new DuplicateColumnFixer(dependencies);
        this.duplicateRelationshipFixer = new DuplicateRelationshipFixer(dependencies);
    }

    /**
     * Get CDM Registry (lazy initialization)
     * @returns {Object} CDM Registry instance
     */
    getCdmRegistry() {
        if (!this.cdmRegistry) {
            // Lazy load CDM registry to avoid circular dependencies
            const CDMEntityRegistry = require('../../cdm/cdm-entity-registry');
            this.cdmRegistry = new CDMEntityRegistry();
        }
        return this.cdmRegistry;
    }

    /**
     * Main ERD validation entry point
     * @param {string|Object} input - ERD content string or file data object
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Validation result
     */
    async validateERD(input, options = {}) {
        return this.executeOperation('validateERD', async () => {
            const startTime = Date.now();
            
            // Extract content from input
            const content = typeof input === 'string' ? input : input.content;
            if (!content) {
                throw new Error('No content provided for validation');
            }

            this.log('Starting ERD validation', { 
                contentLength: content.length,
                options 
            });

            const result = {
                isValid: true,
                warnings: [],
                errors: [],
                metadata: {
                    validationTime: 0,
                    contentLength: content.length,
                    options: options
                }
            };

            try {
                // Step 1: Parse the ERD content
                const parseResult = await this.mermaidParser.parse(content);
                
                if (!parseResult || parseResult.errors?.length > 0) {
                    result.isValid = false;
                    result.errors = parseResult.errors || ['Failed to parse ERD content'];
                    return result;
                }

                result.entities = parseResult.entities || [];
                result.relationships = parseResult.relationships || [];

                this.log('ERD parsed successfully', {
                    entityCount: result.entities.length,
                    relationshipCount: result.relationships.length
                });

                // Step 2: Detect autoFixable status for existing warnings
                if (parseResult.warnings && parseResult.warnings.length > 0) {
                    for (const warning of parseResult.warnings) {
                        if (warning.autoFixable === undefined) {
                            warning.autoFixable = this.isAutoFixable(warning);
                        }
                        result.warnings.push(warning);
                    }
                }

                // Step 3: CDM Detection (if enabled)
                if (options.detectCDM !== false) {
                    try {
                        const cdmRegistry = this.getCdmRegistry();
                        const cdmResult = await cdmRegistry.detectCDMEntities(result.entities);
                        result.cdmDetection = cdmResult;

                        // Mark entities as CDM entities
                        if (cdmResult.matches && cdmResult.matches.length > 0) {
                            const cdmEntityNames = new Set(cdmResult.matches.map(match => match.entityName));
                            result.entities.forEach(entity => {
                                entity.isCdmEntity = cdmEntityNames.has(entity.name);
                            });
                        }

                        this.log('CDM detection completed', {
                            cdmMatches: cdmResult.matches?.length || 0
                        });

                        // Add CDM-related warnings if no matches found
                        if (!result.cdmDetection.matches || result.cdmDetection.matches.length === 0) {
                            result.cdmDetection.suggestions = [
                                'Consider using Microsoft Common Data Model entities for better integration.',
                                'Standard entities like Account, Contact, or User might be applicable.',
                                'Review your entity names and attributes against CDM standards.'
                            ];
                        }

                    } catch (cdmError) {
                        this.error('CDM detection failed', cdmError);
                        result.cdmDetection = {
                            matches: [],
                            confidence: 0,
                            suggestions: ['CDM detection temporarily unavailable'],
                            error: cdmError.message
                        };
                    }
                }

                // Step 4: Enhanced Structure Validation using specialized validators
                if (result.entities.length > 0) {
                    try {
                        const structureValidation = this.entityStructureValidator.validateEntityStructure(
                            result.entities, 
                            result.relationships
                        );

                        if (!structureValidation.isValid) {
                            result.isValid = false;
                            result.errors.push(...(structureValidation.errors || []));
                        }

                        if (structureValidation.warnings && structureValidation.warnings.length > 0) {
                            result.warnings.push(...structureValidation.warnings);
                        }

                        // Merge metadata
                        result.metadata.structureValidation = structureValidation.metadata;

                    } catch (structureError) {
                        this.error('Structure validation failed', structureError);
                        result.warnings.push({
                            type: 'validation_error',
                            category: 'system',
                            severity: 'warning',
                            message: 'Structure validation partially failed',
                            suggestion: 'Some validation checks may be incomplete'
                        });
                    }
                }

                // Step 5: Relationship Validation using specialized validator
                if (result.relationships.length > 0) {
                    try {
                        const relationshipValidation = this.relationshipValidator.validateRelationships(
                            result.entities,
                            result.relationships
                        );

                        if (relationshipValidation.warnings && relationshipValidation.warnings.length > 0) {
                            result.warnings.push(...relationshipValidation.warnings);
                        }

                        // Merge metadata
                        result.metadata.relationshipValidation = relationshipValidation.metadata;

                    } catch (relationshipError) {
                        this.error('Relationship validation failed', relationshipError);
                        result.warnings.push({
                            type: 'validation_error',
                            category: 'system',
                            severity: 'warning',
                            message: 'Relationship validation partially failed',
                            suggestion: 'Some relationship checks may be incomplete'
                        });
                    }
                }

                // Calculate final validation time
                result.metadata.validationTime = Date.now() - startTime;

                this.log('ERD validation completed', {
                    isValid: result.isValid,
                    warningCount: result.warnings.length,
                    errorCount: result.errors.length,
                    validationTime: result.metadata.validationTime
                });

                return result;

            } catch (error) {
                this.error('ERD validation failed', error);
                result.isValid = false;
                result.errors.push(`Validation failed: ${error.message}`);
                result.metadata.validationTime = Date.now() - startTime;
                return result;
            }
        });
    }

    /**
     * Check if a warning is auto-fixable
     * @param {Object} warning - Warning object
     * @returns {boolean} True if auto-fixable
     */
    isAutoFixable(warning) {
        const autoFixableTypes = [
            'duplicate_attribute',
            'duplicate_relationship',
            'missing_primary_key',
            'missing_foreign_key',
            'many_to_many'
        ];
        
        return autoFixableTypes.includes(warning.type);
    }

    /**
     * Fix individual warning using specialized fixers
     * @param {string} content - ERD content
     * @param {Object} warning - Warning to fix
     * @returns {Promise<Object>} Fix result
     */
    async fixIndividualWarning(content, warning) {
        return this.executeOperation('fixIndividualWarning', async () => {
            this.log('Attempting to fix warning', { 
                warningType: warning.type,
                warningId: warning.id 
            });

            try {
                let fixResult;

                switch (warning.type) {
                    case 'duplicate_attribute':
                    case 'duplicate_columns':
                        fixResult = await this.duplicateColumnFixer.fixDuplicateColumns(content, warning);
                        break;
                        
                    case 'duplicate_relationship':
                        fixResult = await this.duplicateRelationshipFixer.fixDuplicateRelationship(content, warning);
                        break;
                        
                    default:
                        return {
                            success: false,
                            error: `No fixer available for warning type: ${warning.type}`
                        };
                }

                if (fixResult.success) {
                    this.log('Warning fixed successfully', { 
                        warningType: warning.type,
                        message: fixResult.message 
                    });
                }

                return fixResult;

            } catch (error) {
                this.error('Fix attempt failed', error);
                return {
                    success: false,
                    error: `Fix failed: ${error.message}`
                };
            }
        });
    }

    // Legacy method names for backward compatibility
    async validateEntityStructure(entities, relationships) {
        return this.entityStructureValidator.validateEntityStructure(entities, relationships);
    }

    async validateRelationships(entities, relationships) {
        return this.relationshipValidator.validateRelationships(entities, relationships);
    }

    async fixDuplicateColumns(content, warning) {
        return this.duplicateColumnFixer.fixDuplicateColumns(content, warning);
    }

    async fixDuplicateRelationship(content, warning) {
        return this.duplicateRelationshipFixer.fixDuplicateRelationship(content, warning);
    }
}

module.exports = { ValidationService };