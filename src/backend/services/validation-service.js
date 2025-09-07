/**
 * Validation Service
 * Business logic for ERD validation and CDM detection
 */
const { BaseService } = require('./base-service');

class ValidationService extends BaseService {
    constructor(dependencies = {}) {
        super(dependencies);
        
        // Validate required dependencies
        this.validateDependencies(['mermaidParser']);
        
        this.mermaidParser = dependencies.mermaidParser;
        this.cdmRegistry = dependencies.cdmRegistry; // Optional for now
        
        // Optional dependencies
        this.dataverseRepository = dependencies.dataverseRepository;
    }

    /**
     * Get CDM registry (lazy loading)
     * @returns {Object} CDM registry instance
     */
    getCdmRegistry() {
        if (!this.cdmRegistry) {
            try {
                const CDMEntityRegistry = require('../cdm/cdm-entity-registry.js');
                this.cdmRegistry = new CDMEntityRegistry();
                this.log('getCdmRegistry', { status: 'loaded' });
            } catch (error) {
                this.log('getCdmRegistry', { status: 'failed', error: error.message });
                return null;
            }
        }
        return this.cdmRegistry;
    }

    /**
     * Validate ERD content and detect CDM entities
     * @param {Object} input - Validation input
     * @param {string} input.mermaidContent - Mermaid ERD content
     * @param {Object} input.options - Validation options
     * @returns {Promise<Object>} Validation result
     */
    async validateERD(input) {
        return this.executeOperation('validateERD', async () => {
            this.validateInput(input, ['mermaidContent'], {
                mermaidContent: 'string',
                options: 'object'
            });

            const { mermaidContent, options = {} } = input;
            const result = {
                success: false,
                validation: null,
                entities: [],
                relationships: [],
                warnings: [],
                correctedERD: null,
                summary: {},
                cdmDetection: null,
                errors: []
            };

            try {
                // Step 1: Parse Mermaid ERD
                this.log('parseERD', { contentLength: mermaidContent.length });
                const parseResult = this.mermaidParser.parse(mermaidContent);
                
                if (!parseResult || parseResult.errors?.length > 0) {
                    result.validation = {
                        isValid: false,
                        errors: parseResult?.errors || ['Failed to parse ERD content']
                    };
                    result.errors = result.validation.errors;
                    return this.createError('ERD validation failed', result.errors, result);
                }

                // Extract parsed data
                result.entities = parseResult.entities || [];
                result.relationships = parseResult.relationships || [];
                // Keep warning objects intact for rich display
                result.warnings = parseResult.warnings || [];
                result.correctedERD = parseResult.correctedERD || mermaidContent;

                // Step 2: Validate entity structure
                const structureValidation = this.validateEntityStructure(result.entities, result.relationships);
                if (!structureValidation.isValid) {
                    result.validation = {
                        isValid: structureValidation.isValid,
                        errors: structureValidation.errors,
                        warnings: result.warnings
                    };
                    result.errors = structureValidation.errors;
                    return this.createError('ERD structure validation failed', result.errors, result);
                }

                // Step 3: CDM detection if requested
                if (options.detectCDM !== false) {
                    try {
                        result.cdmDetection = await this.detectCDMEntities(result.entities);
                        this.log('cdmDetection', { 
                            matchesFound: result.cdmDetection.matches?.length || 0 
                        });
                    } catch (error) {
                        this.warn('CDM detection failed', { error: error.message });
                        result.warnings.push({
                            type: 'cdm_detection_failed',
                            severity: 'info',
                            message: 'CDM detection unavailable',
                            suggestion: 'CDM entity matching is not available in this session. Manual entity creation will be used.',
                            category: 'cdm'
                        });
                    }
                }

                // Step 4: Generate summary
                result.summary = {
                    entityCount: result.entities.length,
                    relationshipCount: result.relationships.length,
                    warningCount: result.warnings.length,
                    cdmMatchCount: result.cdmDetection?.matches?.length || 0
                };

                // Step 5: Final validation result
                result.validation = {
                    isValid: true,
                    errors: [],
                    warnings: result.warnings
                };
                result.success = true;

                return this.createSuccess(result, 'ERD validation completed successfully');

            } catch (error) {
                this.error('ERD validation error', error);
                result.validation = {
                    isValid: false,
                    errors: [error.message]
                };
                result.errors = [error.message];
                return this.createError('ERD validation failed', [error.message], result);
            }
        });
    }

    /**
     * Validate entity and relationship structure
     * @param {Array} entities - Parsed entities
     * @param {Array} relationships - Parsed relationships
     * @returns {Object} Structure validation result
     */
    validateEntityStructure(entities, relationships) {
        const errors = [];
        const warnings = [];

        // Validate entities
        if (!Array.isArray(entities) || entities.length === 0) {
            errors.push('No entities found in ERD');
            return { isValid: false, errors, warnings };
        }

        // Check for duplicate entity names
        const entityNames = entities.map(e => e.name);
        const duplicates = entityNames.filter((name, index) => entityNames.indexOf(name) !== index);
        if (duplicates.length > 0) {
            errors.push(`Duplicate entity names found: ${[...new Set(duplicates)].join(', ')}`);
        }

        // Validate entity structure
        entities.forEach((entity, index) => {
            if (!entity.name || typeof entity.name !== 'string') {
                errors.push(`Entity at index ${index} has invalid or missing name`);
            }

            if (!entity.attributes || !Array.isArray(entity.attributes)) {
                warnings.push({
                    type: 'missing_attributes',
                    severity: 'warning',
                    message: `Entity '${entity.name}' has no attributes defined`,
                    suggestion: 'Add at least one attribute to this entity for proper table structure.',
                    category: 'entities'
                });
            } else if (entity.attributes.length === 0) {
                warnings.push({
                    type: 'empty_attributes',
                    severity: 'warning', 
                    message: `Entity '${entity.name}' has empty attributes array`,
                    suggestion: 'Add attributes to define the table columns for this entity.',
                    category: 'entities'
                });
            }

            // Check for primary key
            const hasPrimaryKey = entity.attributes?.some(attr => 
                attr.isPrimaryKey || attr.name?.toLowerCase().includes('id')
            );
            if (!hasPrimaryKey) {
                warnings.push({
                    type: 'missing_primary_key',
                    severity: 'warning',
                    message: `Entity '${entity.name}' may be missing a primary key`,
                    suggestion: 'Add a primary key attribute using "PK" notation to ensure proper table structure.',
                    example: 'string id PK "Unique identifier"',
                    category: 'entities'
                });
            }
        });

        // Validate relationships
        if (Array.isArray(relationships)) {
            relationships.forEach((rel, index) => {
                if (!rel.fromEntity || !rel.toEntity) {
                    errors.push(`Relationship at index ${index} has missing from/to entities`);
                }

                // Check if referenced entities exist
                if (rel.fromEntity && !entityNames.includes(rel.fromEntity)) {
                    errors.push(`Relationship references unknown entity: ${rel.fromEntity}`);
                }
                if (rel.toEntity && !entityNames.includes(rel.toEntity)) {
                    errors.push(`Relationship references unknown entity: ${rel.toEntity}`);
                }
            });
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Detect CDM entities in the parsed ERD
     * @param {Array} entities - Parsed entities
     * @returns {Promise<Object>} CDM detection result
     */
    async detectCDMEntities(entities) {
        const cdmRegistry = this.getCdmRegistry();
        if (!cdmRegistry) {
            this.log('detectCDMEntities', { status: 'cdm_registry_not_available' });
            return {
                matches: [],
                totalEntities: entities.length,
                cdmEntities: 0,
                customEntities: entities.length,
                confidence: 'low'
            };
        }

        try {
            const detection = cdmRegistry.detectCDMEntities(entities);
            
            return {
                matches: detection.detectedCDM || detection.matches || [],
                totalEntities: entities.length,
                cdmEntities: detection.detectedCDM?.length || 0,
                customEntities: entities.length - (detection.detectedCDM?.length || 0),
                confidence: detection.confidence || 'medium'
            };
        } catch (error) {
            this.error('CDM detection failed', error);
            throw new Error(`CDM detection failed: ${error.message}`);
        }
    }

    /**
     * Get validation status for async validations
     * @param {string} validationId - Validation ID
     * @returns {Promise<Object>} Status result
     */
    async getValidationStatus(validationId) {
        return this.executeOperation('getValidationStatus', async () => {
            // For now, this is a placeholder as current validation is synchronous
            // In the future, this could track long-running validations
            
            this.warn('getValidationStatus called but not implemented', { validationId });
            return this.createError('Validation status tracking not implemented');
        });
    }

    /**
     * Get supported validation options
     * @returns {Promise<Object>} Supported options
     */
    async getSupportedOptions() {
        return this.executeOperation('getSupportedOptions', async () => {
            const options = {
                detectCDM: {
                    type: 'boolean',
                    default: true,
                    description: 'Enable CDM entity detection'
                },
                strictValidation: {
                    type: 'boolean',
                    default: false,
                    description: 'Enable strict validation rules'
                },
                includeWarnings: {
                    type: 'boolean',
                    default: true,
                    description: 'Include validation warnings in results'
                },
                correctERD: {
                    type: 'boolean',
                    default: true,
                    description: 'Generate corrected ERD content'
                }
            };

            return this.createSuccess({ supportedOptions: options });
        });
    }
}

module.exports = { ValidationService };
