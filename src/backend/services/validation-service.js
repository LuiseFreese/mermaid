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
        
        // Initialize warning ID counter for unique warning identification
        this.warningIdCounter = 0;
    }

    /**
     * Generate deterministic warning ID based on warning content
     * @param {Object} warningData - Warning data to generate ID from
     * @returns {string} Deterministic warning ID
     */
    generateWarningId(warningData) {
        // Create a deterministic ID based on warning content
        const keyParts = [
            warningData.type,
            warningData.entity || '',
            warningData.attribute || '',
            warningData.relationship || '',
            warningData.message || ''
        ];
        
        // Create a simple hash from the key parts
        const key = keyParts.join('|');
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            const char = key.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return `warning_${Math.abs(hash)}`;
    }

    /**
     * Create a warning object with deterministic ID
     * @param {Object} warningData - Warning data
     * @returns {Object} Warning with deterministic ID
     */
    createWarning(warningData) {
        const id = this.generateWarningId(warningData);
        
        // Debug: Track specific problematic warning IDs
        if (id === 'warning_1304205498' || id === 'warning_1571953518') {
            console.log('🚨 CRITICAL: Creating problematic warning:', {
                id,
                type: warningData.type,
                message: warningData.message,
                entity: warningData.entity,
                relationship: warningData.relationship,
                stackTrace: new Error().stack.substring(0, 500)
            });
        }
        
        return {
            id,
            ...warningData
        };
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
                // Convert parser warnings to use our warning format with unique IDs
                result.warnings = (parseResult.warnings || [])
                    .filter(warning => {
                        // Filter out relationship name warnings since spaces should be allowed
                        return warning.type !== 'invalid_relationship_name';
                    })
                    .map(warning => {
                        // Determine if parser warning should be auto-fixable
                        let autoFixable = warning.autoFixable;
                        if (autoFixable === undefined) {
                            // Most parser warnings are auto-fixable, except for certain types
                            const nonAutoFixableTypes = ['cdm_summary', 'cdm_entity_detected'];
                            autoFixable = !nonAutoFixableTypes.includes(warning.type);
                        }
                        
                        return this.createWarning({
                            ...warning,
                            autoFixable
                        });
                    });
                
                // Apply Mermaid syntax fixes to ensure valid diagram rendering
                const baseContent = parseResult.correctedERD || mermaidContent;
                result.correctedERD = this.fixMermaidSyntax(baseContent);

                // Step 2: CDM detection and entity flag setting - moved before structure validation
                if (options.detectCDM !== false) {
                    try {
                        // Use CDM detection results from the parser
                        result.cdmDetection = parseResult.cdmDetection || {
                            matches: [],
                            detectedCDM: [],
                            totalEntities: result.entities.length,
                            cdmEntities: 0,
                            customEntities: result.entities.length,
                            confidence: 'low'
                        };
                        
                        console.log('🔧 DEBUG: CDM Detection from parser:', {
                            parseResultHasCdmDetection: !!parseResult.cdmDetection,
                            matchesCount: result.cdmDetection.matches?.length || 0,
                            detectedCDMCount: result.cdmDetection.detectedCDM?.length || 0,
                            matches: result.cdmDetection.matches?.map(m => ({ original: m.originalEntity?.name, cdm: m.cdmEntity?.logicalName })) || []
                        });
                        
                        this.log('cdmDetection', { matchesFound: result.cdmDetection.matches?.length || 0 });
                        
                        // If no advanced CDM detection available, use basic detection
                        if (!result.cdmDetection.matches || result.cdmDetection.matches.length === 0) {
                            try {
                                result.cdmDetection = this.performBasicCDMDetection(result.entities);
                            } catch (basicCdmError) {
                                console.warn('⚠️ Advanced CDM detection not available, using basic detection:', basicCdmError.message);
                                result.cdmDetection = {
                                    matches: [],
                                    detectedCDM: [],
                                    totalEntities: result.entities.length,
                                    cdmEntities: 0,
                                    customEntities: result.entities.length,
                                    confidence: 'low'
                                };
                            }
                        }
                    } catch (cdmDetectionError) {
                        console.error('CDM detection failed:', cdmDetectionError);
                        result.cdmDetection = {
                            matches: [],
                            detectedCDM: [],
                            totalEntities: result.entities.length,
                            cdmEntities: 0,
                            customEntities: result.entities.length,
                            confidence: 'low'
                        };
                    }
                }

                // Step 2.5: Set isCdm flag on entities based on CDM detection and user choice
                console.log('🔧 DEBUG: CDM Flag Setting - Initial state:', {
                    entityChoice: options.entityChoice,
                    hasCdmDetection: !!result.cdmDetection,
                    matchesCount: result.cdmDetection?.matches?.length || 0,
                    matches: result.cdmDetection?.matches?.map(m => ({ original: m.originalEntity?.name, cdm: m.cdmEntity?.logicalName })) || []
                });
                
                // Always mark entities as CDM if they match CDM entities (for display purposes)
                if (result.cdmDetection?.matches?.length > 0) {
                    const cdmEntityNames = result.cdmDetection.matches.map(match => match.originalEntity?.name || match.name).filter(Boolean);
                    console.log('🔧 DEBUG: CDM Entity Names extracted:', cdmEntityNames);
                    console.log('🔧 DEBUG: Available entity names:', result.entities.map(e => e.name));
                    
                    result.entities = result.entities.map(entity => {
                        const isCdm = cdmEntityNames.includes(entity.name);
                        console.log(`🔧 DEBUG: Entity ${entity.name} - isCdm: ${isCdm}`);
                        return {
                            ...entity,
                            isCdm
                        };
                    });
                    
                    this.log('setCdmFlags', { 
                        entityChoice: options.entityChoice || 'none',
                        cdmEntityNames,
                        entitiesWithCdmFlags: result.entities.map(e => ({ name: e.name, isCdm: e.isCdm }))
                    });
                } else {
                    // If no CDM entities detected, all entities are custom
                    console.log('🔧 DEBUG: Setting all entities as custom because no CDM matches found');
                    
                    result.entities = result.entities.map(entity => ({
                        ...entity,
                        isCdm: false
                    }));
                    
                    this.log('setCdmFlags', { 
                        entityChoice: options.entityChoice || 'none',
                        allEntitiesCustom: true,
                        entityCount: result.entities.length
                    });
                }

                // Step 3: Validate entity structure (now entities have CDM flags set)
                const structureValidation = this.validateEntityStructure(result.entities, result.relationships);
                console.log('🔧 DEBUG: Structure validation result:', {
                    isValid: structureValidation.isValid,
                    errorsCount: structureValidation.errors?.length || 0,
                    warningsCount: structureValidation.warnings?.length || 0,
                    errors: structureValidation.errors
                });
                
                if (!structureValidation.isValid) {
                    result.validation = {
                        isValid: structureValidation.isValid,
                        errors: structureValidation.errors,
                        warnings: result.warnings
                    };
                    result.errors = structureValidation.errors;
                    return this.createError('ERD structure validation failed', result.errors, result);
                }

                // Merge structure validation warnings into result
                if (structureValidation.warnings && structureValidation.warnings.length > 0) {
                    result.warnings = [...result.warnings, ...structureValidation.warnings];
                }

                // Update autoFixable flags for warnings based on CDM entity status
                result.warnings = this.updateAutoFixableForCDMEntities(result.warnings, result.entities);

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
                warnings.push(this.createWarning({
                    type: 'missing_attributes',
                    severity: 'warning',
                    entity: entity.name,
                    message: `Entity '${entity.name}' has no attributes defined`,
                    suggestion: 'Add at least one attribute to this entity for proper table structure.',
                    category: 'entities',
                    autoFixable: true
                }));
            } else if (entity.attributes.length === 0) {
                warnings.push(this.createWarning({
                    type: 'empty_attributes',
                    severity: 'warning',
                    entity: entity.name, 
                    message: `Entity '${entity.name}' has empty attributes array`,
                    suggestion: 'Add attributes to define the table columns for this entity.',
                    category: 'entities',
                    autoFixable: true
                }));
            }

            // Check for primary key
            console.log(`🔍 DEBUG ValidationService: Entity '${entity.name}' primary key check:`, {
                totalAttributes: entity.attributes?.length || 0,
                attributesWithDetails: entity.attributes?.map(attr => ({ 
                    name: attr.name, 
                    isPrimaryKey: attr.isPrimaryKey
                })) || [],
                hasPrimaryKeyCheck: entity.attributes?.some(attr => attr.isPrimaryKey)
            });
            
            const hasPrimaryKey = entity.attributes?.some(attr => attr.isPrimaryKey);
            
            if (!hasPrimaryKey) {
                console.log(`🔍 DEBUG ValidationService: Adding missing_primary_key warning for ${entity.name}`);
                warnings.push(this.createWarning({
                    type: 'missing_primary_key',
                    severity: 'warning',
                    entity: entity.name,
                    message: `Entity '${entity.name}' may be missing a primary key`,
                    suggestion: 'Add a primary key attribute using "PK" notation to ensure proper table structure.',
                    example: 'guid myEntityId PK "Unique identifier"',
                    category: 'entities',
                    autoFixable: true
                }));
            }
        });

        // Enhanced relationship validation
        if (Array.isArray(relationships)) {
            // Basic relationship validation
            relationships.forEach((rel, index) => {
                if (!rel.fromEntity || !rel.toEntity) {
                    errors.push(`Relationship at index ${index} has missing from/to entities`);
                }

                // Check if referenced entities exist - treat as errors since they break relationship integrity
                if (rel.fromEntity && !entityNames.includes(rel.fromEntity)) {
                    errors.push(`Relationship references non-existent entity '${rel.fromEntity}'.`);
                }
                if (rel.toEntity && !entityNames.includes(rel.toEntity)) {
                    errors.push(`Relationship references non-existent entity '${rel.toEntity}'.`);
                }
            });

            // Advanced relationship validation
            const relationshipWarnings = this.validateRelationships(entities, relationships);
            warnings.push(...relationshipWarnings);
        }

        // Enhanced naming convention validation
        console.log('About to call validateNamingConventions with entities count:', entities?.length);
        console.log('🔍 DEBUG: Relationships being passed to validateNamingConventions:', {
            relationshipsCount: relationships?.length || 0,
            relationships: relationships?.slice(0, 5) || [] // Show first 5 relationships
        });
        const namingWarnings = this.validateNamingConventions(entities, relationships);
        console.log('Naming warnings returned:', namingWarnings?.length);
        warnings.push(...namingWarnings);

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Enhanced relationship validation
     * @param {Array} entities - Parsed entities
     * @param {Array} relationships - Parsed relationships
     * @returns {Array} Array of relationship warnings
     */
    validateRelationships(entities, relationships) {
        const warnings = [];
        
        // Skip relationship validation for CDM-only ERDs
        const allEntitiesAreCdm = entities.every(entity => entity.isCdm === true);
        if (allEntitiesAreCdm && entities.length > 0) {
            console.log('🔍 Skipping relationship validation for CDM-only ERD');
            return warnings; // Return empty warnings array
        }
        
        const entityMap = new Map();
        
        // Build entity map for efficient lookups
        entities.forEach(entity => {
            entityMap.set(entity.name, entity);
        });

        // 1. Check for missing foreign keys
        warnings.push(...this.checkMissingForeignKeys(relationships, entityMap));
        
        // 2. Check for orphaned relationships (relationships without proper entity connections)
        warnings.push(...this.checkOrphanedRelationships(relationships, entityMap));
        
        // 3. Check for circular dependencies
        warnings.push(...this.checkCircularDependencies(relationships));
        
        // 4. Validate cardinalities and relationship patterns
        warnings.push(...this.validateCardinalityPatterns(relationships));
        
        // 5. Check for duplicate relationships
        warnings.push(...this.checkDuplicateRelationships(relationships));

        return warnings;
    }

    /**
     * Check for missing foreign key columns in relationships
     * @param {Array} relationships - Parsed relationships
     * @param {Map} entityMap - Map of entity names to entity objects
     * @returns {Array} Array of missing FK warnings
     */
    checkMissingForeignKeys(relationships, entityMap) {
        const warnings = [];

        relationships.forEach(rel => {
            if (!rel.fromEntity || !rel.toEntity) return;

            const fromEntity = entityMap.get(rel.fromEntity);
            const toEntity = entityMap.get(rel.toEntity);

            if (!fromEntity || !toEntity) return;

            // For one-to-many relationships, check if the "many" side has a foreign key
            if (rel.cardinality && (rel.cardinality.type === 'one-to-many' || rel.cardinality.type === 'zero-to-many')) {
                // Use current entity names instead of original relationship names
                const currentFromEntityName = fromEntity.name;
                const currentToEntityName = toEntity.name;
                
                // Check for any foreign key that references the correct entity (no naming convention required)
                const hasForeignKey = toEntity.attributes && toEntity.attributes.some(attr => 
                    attr.isForeignKey && (
                        attr.referencedEntity === currentFromEntityName ||
                        attr.referencedEntity === rel.fromEntity
                    )
                );

                if (!hasForeignKey) {
                    // Suggest a generic foreign key name without enforcing "_id" convention
                    const suggestedFK = `${currentFromEntityName.toLowerCase()}Ref`;
                    
                    warnings.push(this.createWarning({
                        type: 'missing_foreign_key',
                        category: 'relationships',
                        severity: 'warning',
                        entity: currentToEntityName,
                        relationship: `${currentFromEntityName} → ${currentToEntityName}`,
                        message: `Relationship '${currentFromEntityName} → ${currentToEntityName}' exists but no foreign key found in '${currentToEntityName}'. Add a foreign key column.`,
                        suggestion: `Add foreign key column: guid ${suggestedFK} FK "Foreign key to ${currentFromEntityName}"`,
                        autoFixable: true,
                        fixData: {
                            entityName: currentToEntityName,
                            columnName: suggestedFK,
                            referencedEntity: currentFromEntityName
                        }
                    }));
                }
            }

            // For one-to-one relationships, check both sides (typically the dependent side should have the FK)
            if (rel.cardinality && rel.cardinality.type === 'one-to-one') {
                // Use current entity names instead of original relationship names
                const currentFromEntityName = fromEntity.name;
                const currentToEntityName = toEntity.name;
                const expectedFK = `${currentFromEntityName.toLowerCase()}_id`;
                
                // Also check for FK using original entity name (in case of partial fixes)
                const originalExpectedFK = `${rel.fromEntity.toLowerCase()}_id`;
                
                const hasForeignKey = toEntity.attributes && toEntity.attributes.some(attr => 
                    attr.name.toLowerCase() === expectedFK || 
                    attr.name.toLowerCase() === originalExpectedFK ||
                    attr.name.toLowerCase() === `${currentFromEntityName.toLowerCase()}id` ||
                    attr.name.toLowerCase() === `${rel.fromEntity.toLowerCase()}id` ||
                    (attr.isForeignKey && (
                        attr.referencedEntity === currentFromEntityName ||
                        attr.referencedEntity === rel.fromEntity
                    ))
                );

                if (!hasForeignKey) {
                    warnings.push(this.createWarning({
                        type: 'missing_foreign_key',
                        category: 'relationships',
                        severity: 'warning',
                        entity: currentToEntityName,
                        relationship: `${currentFromEntityName} → ${currentToEntityName}`,
                        message: `One-to-one relationship between '${currentFromEntityName}' and '${currentToEntityName}' but no foreign key found in '${currentToEntityName}'.`,
                        suggestion: `Add foreign key column: string ${expectedFK} FK "Foreign key to ${currentFromEntityName}"`,
                        autoFixable: true,
                        fixData: {
                            entityName: currentToEntityName,
                            columnName: expectedFK,
                            referencedEntity: currentFromEntityName
                        }
                    }));
                }
            }
        });

        return warnings;
    }

    /**
     * Check for orphaned relationships (relationships pointing to non-existent entities)
     * @param {Array} relationships - Parsed relationships
     * @param {Map} entityMap - Map of entity names to entity objects
     * @returns {Array} Array of orphaned relationship warnings
     */
    checkOrphanedRelationships(relationships, entityMap) {
        const warnings = [];

        relationships.forEach(rel => {
            if (!rel.fromEntity || !rel.toEntity) return;

            if (!entityMap.has(rel.fromEntity)) {
                warnings.push(this.createWarning({
                    type: 'orphaned_relationship',
                    category: 'relationships',
                    severity: 'error',
                    relationship: `${rel.fromEntity} → ${rel.toEntity}`,
                    message: `Relationship references non-existent entity '${rel.fromEntity}'.`,
                    suggestion: `Either create the '${rel.fromEntity}' entity or remove this relationship.`,
                    autoFixable: false
                }));
            }

            if (!entityMap.has(rel.toEntity)) {
                warnings.push(this.createWarning({
                    type: 'orphaned_relationship',
                    category: 'relationships',
                    severity: 'error',
                    relationship: `${rel.fromEntity} → ${rel.toEntity}`,
                    message: `Relationship references non-existent entity '${rel.toEntity}'.`,
                    suggestion: `Either create the '${rel.toEntity}' entity or remove this relationship.`,
                    autoFixable: false
                }));
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
        const visited = new Set();
        const recursionStack = new Set();

        // Build dependency graph
        relationships.forEach(rel => {
            if (!rel.fromEntity || !rel.toEntity) return;
            
            if (!graph.has(rel.fromEntity)) {
                graph.set(rel.fromEntity, []);
            }
            graph.get(rel.fromEntity).push(rel.toEntity);
        });

        // DFS to detect cycles
        const hasCycle = (node, path = []) => {
            if (recursionStack.has(node)) {
                // Found a cycle
                const cycleStart = path.indexOf(node);
                const cycle = path.slice(cycleStart).concat([node]);
                warnings.push(this.createWarning({
                    type: 'circular_dependency',
                    category: 'relationships',
                    severity: 'error',
                    entities: cycle,
                    message: `Circular dependency detected: ${cycle.join(' → ')}.`,
                    suggestion: 'Consider breaking the cycle by removing one relationship or introducing a junction table.',
                    autoFixable: false
                }));
                return true;
            }

            if (visited.has(node)) {
                return false;
            }

            visited.add(node);
            recursionStack.add(node);
            path.push(node);

            const neighbors = graph.get(node) || [];
            for (const neighbor of neighbors) {
                if (hasCycle(neighbor, [...path])) {
                    return true;
                }
            }

            recursionStack.delete(node);
            return false;
        };

        // Check all nodes for cycles
        for (const node of graph.keys()) {
            if (!visited.has(node)) {
                hasCycle(node);
            }
        }

        return warnings;
    }

    /**
     * Validate cardinality patterns and relationship consistency
     * @param {Array} relationships - Parsed relationships
     * @returns {Array} Array of cardinality warnings
     */
    validateCardinalityPatterns(relationships) {
        const warnings = [];

        relationships.forEach(rel => {
            if (!rel.cardinality || !rel.fromEntity || !rel.toEntity) return;

            // Check for many-to-many relationships (should use junction tables in Dataverse)
            if (rel.cardinality.type === 'many-to-many') {
                warnings.push(this.createWarning({
                    type: 'many_to_many_detected',
                    category: 'relationships',
                    severity: 'info',
                    relationship: `${rel.fromEntity} → ${rel.toEntity}`,
                    message: `Many-to-many relationship detected between '${rel.fromEntity}' and '${rel.toEntity}'.`,
                    suggestion: 'Consider using a junction table pattern for better Dataverse compatibility.',
                    autoFixable: true,
                    fixData: {
                        fromEntity: rel.fromEntity,
                        toEntity: rel.toEntity,
                        relationshipName: rel.name
                    }
                }));
            }

            // Check for self-referencing relationships
            if (rel.fromEntity === rel.toEntity) {
                warnings.push(this.createWarning({
                    type: 'self_referencing_relationship',
                    category: 'relationships',
                    severity: 'info',
                    entity: rel.fromEntity,
                    relationship: `${rel.fromEntity} → ${rel.toEntity}`,
                    message: `Self-referencing relationship detected in '${rel.fromEntity}'.`,
                    suggestion: 'Ensure the foreign key column has a different name than the primary key to avoid conflicts.',
                    autoFixable: false
                }));
            }

            // Check for unknown cardinality types
            if (rel.cardinality.type === 'unknown') {
                warnings.push(this.createWarning({
                    type: 'invalid_cardinality',
                    category: 'relationships',
                    severity: 'warning',
                    relationship: `${rel.fromEntity} → ${rel.toEntity}`,
                    message: `Invalid or unrecognized cardinality in relationship '${rel.fromEntity} → ${rel.toEntity}'.`,
                    suggestion: 'Use standard Mermaid cardinality notation: ||--o{ (one-to-many), ||--|| (one-to-one), }o--o{ (many-to-many).',
                    autoFixable: false
                }));
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
                warnings.push(this.createWarning({
                    type: 'duplicate_relationship',
                    category: 'relationships',
                    severity: 'warning',
                    relationship: `${rel.fromEntity} → ${rel.toEntity}`,
                    message: `Duplicate relationship found between '${rel.fromEntity}' and '${rel.toEntity}'.`,
                    suggestion: 'Remove duplicate relationship definitions to avoid conflicts.',
                    autoFixable: true,
                    fixData: {
                        relationshipIndex: index,
                        duplicateOf: relationshipMap.get(key)
                    }
                }));
            } else {
                relationshipMap.set(key, index);
                
                // Also check for bidirectional duplicates (A->B and B->A)
                if (relationshipMap.has(reverseKey)) {
                    warnings.push(this.createWarning({
                        type: 'bidirectional_relationship',
                        category: 'relationships',
                        severity: 'info',
                        relationship: `${rel.fromEntity} ↔ ${rel.toEntity}`,
                        message: `Bidirectional relationship detected between '${rel.fromEntity}' and '${rel.toEntity}'.`,
                        suggestion: 'Ensure this is intentional. Consider using a single relationship with appropriate cardinality.',
                        autoFixable: false
                    }));
                }
            }
        });

        return warnings;
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
     * Validate naming conventions for entities, attributes, and relationships
     * @param {Array} entities - Parsed entities
     * @param {Array} relationships - Parsed relationships
     * @returns {Array} Array of naming convention warnings
     */
    validateNamingConventions(entities, relationships) {
        console.log('validateNamingConventions called with entities:', entities?.length || 0);
        const warnings = [];

        // 1. Validate entity names
        warnings.push(...this.validateEntityNames(entities));
        
        // 2. Validate attribute names
        warnings.push(...this.validateAttributeNames(entities));
        
        // 3. Validate relationship names - DISABLED: Relationship labels should allow spaces
        // warnings.push(...this.validateRelationshipNames(relationships));
        
        // 4. Check for reserved words
        warnings.push(...this.checkReservedWords(entities));

        return warnings;
    }

    /**
     * Validate entity naming conventions
     * @param {Array} entities - Parsed entities
     * @returns {Array} Array of entity naming warnings
     */
    validateEntityNames(entities) {
        console.log('validateEntityNames called with entities:', entities?.map(e => ({ name: e.name, isCdm: e.isCdm })));
        const warnings = [];
        const dataverseReservedWords = ['User', 'Account', 'Contact', 'Lead', 'Opportunity', 'Task', 
                                      'Activity', 'Note', 'Email', 'PhoneCall', 'Appointment', 'Letter'];

        entities.forEach(entity => {
            const entityName = entity.name;
            console.log(`Validating entity: ${entityName}, isCdm: ${entity.isCdm}`);

            // Skip validation for CDM entities - they are managed by Dataverse
            if (entity.isCdm) {
                console.log(`🔍 Skipping entity name validation for CDM entity: ${entityName}`);
                return;
            }

            // Check for invalid characters
            if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(entityName)) {
                console.log(`Invalid entity name detected: ${entityName}`);
                warnings.push(this.createWarning({
                    type: 'invalid_entity_name',
                    category: 'naming',
                    severity: 'warning',
                    entity: entityName,
                    message: `Entity name '${entityName}' contains invalid characters. Use only letters, numbers, and underscores.`,
                    suggestion: `Rename to: ${this.sanitizeEntityName(entityName)}`,
                    autoFixable: true,
                    fixData: {
                        originalName: entityName,
                        suggestedName: this.sanitizeEntityName(entityName)
                    }
                }));
            }

            // Check for length constraints (Dataverse has a 64-character limit for logical names)
            if (entityName.length > 50) { // Leave room for prefixes
                warnings.push(this.createWarning({
                    type: 'entity_name_too_long',
                    category: 'naming',
                    severity: 'warning',
                    entity: entityName,
                    message: `Entity name '${entityName}' is too long (${entityName.length} characters). Dataverse recommends under 50 characters.`,
                    suggestion: `Consider shortening to: ${entityName.substring(0, 47)}...`,
                    autoFixable: true,
                    fixData: {
                        originalName: entityName,
                        suggestedName: this.shortenEntityName(entityName)
                    }
                }));
            }

            // Check for Dataverse reserved entity names
            if (dataverseReservedWords.includes(entityName)) {
                warnings.push(this.createWarning({
                    type: 'reserved_entity_name',
                    category: 'naming',
                    severity: 'warning',
                    entity: entityName,
                    message: `Entity name '${entityName}' conflicts with Dataverse system entity. Consider using a different name.`,
                    suggestion: `Rename to: Custom${entityName} or ${entityName}Custom`,
                    autoFixable: true,
                    fixData: {
                        originalName: entityName,
                        suggestedName: `Custom${entityName}`
                    }
                }));
            }

            // Check for PascalCase convention
            if (!/^[A-Z][a-zA-Z0-9]*$/.test(entityName)) {
                warnings.push(this.createWarning({
                    type: 'entity_name_case',
                    category: 'naming',
                    severity: 'info',
                    entity: entityName,
                    message: `Entity name '${entityName}' should use PascalCase convention (e.g., CustomerOrder, ProductCatalog).`,
                    suggestion: `Rename to: ${this.toPascalCase(entityName)}`,
                    autoFixable: true,
                    fixData: {
                        originalName: entityName,
                        suggestedName: this.toPascalCase(entityName)
                    }
                }));
            }
        });

        return warnings;
    }

    /**
     * Validate attribute naming conventions
     * @param {Array} entities - Parsed entities
     * @returns {Array} Array of attribute naming warnings
     */
    validateAttributeNames(entities) {
        const warnings = [];
        const dataverseReservedAttributes = ['Id', 'CreatedOn', 'CreatedBy', 'ModifiedOn', 
                                           'ModifiedBy', 'OwnerId', 'OwningBusinessUnit', 'StateCode', 'StatusCode'];

        entities.forEach(entity => {
            if (!entity.attributes) return;

            // Skip validation for CDM entities - they are managed by Dataverse
            if (entity.isCdm) {
                console.log(`🔍 Skipping attribute validation for CDM entity: ${entity.name}`);
                return;
            }

            entity.attributes.forEach(attr => {
                const attrName = attr.name;

                // Check for invalid characters
                if (!/^[a-z][a-zA-Z0-9_]*$/.test(attrName)) {
                    warnings.push(this.createWarning({
                        type: 'invalid_attribute_name',
                        category: 'naming',
                        severity: 'warning',
                        entity: entity.name,
                        attribute: attrName,
                        message: `Attribute '${attrName}' in entity '${entity.name}' contains invalid characters or doesn't follow camelCase.`,
                        suggestion: `Rename to: ${this.sanitizeAttributeName(attrName)}`,
                        autoFixable: true,
                        fixData: {
                            entityName: entity.name,
                            originalName: attrName,
                            suggestedName: this.sanitizeAttributeName(attrName)
                        }
                    }));
                }

                // Check for length constraints
                if (attrName.length > 50) {
                    warnings.push(this.createWarning({
                        type: 'attribute_name_too_long',
                        category: 'naming',
                        severity: 'warning',
                        entity: entity.name,
                        attribute: attrName,
                        message: `Attribute name '${attrName}' is too long (${attrName.length} characters). Dataverse recommends under 50 characters.`,
                        suggestion: `Consider shortening to: ${this.shortenAttributeName(attrName)}`,
                        autoFixable: true,
                        fixData: {
                            entityName: entity.name,
                            originalName: attrName,
                            suggestedName: this.shortenAttributeName(attrName)
                        }
                    }));
                }

                // Check for reserved attribute names
                if (dataverseReservedAttributes.includes(attrName)) {
                    warnings.push(this.createWarning({
                        type: 'reserved_attribute_name',
                        category: 'naming',
                        severity: 'warning',
                        entity: entity.name,
                        attribute: attrName,
                        message: `Attribute name '${attrName}' conflicts with Dataverse system attribute. Consider using a different name.`,
                        suggestion: `Rename to: custom${attrName} or ${attrName}Custom`,
                        autoFixable: true,
                        fixData: {
                            entityName: entity.name,
                            originalName: attrName,
                            suggestedName: `custom${attrName}`
                        }
                    }));
                }

                // Removed: Check for meaningful names - no longer enforcing attribute name length conventions
            });
        });

        return warnings;
    }

    /**
     * Validate relationship naming conventions
     * @param {Array} relationships - Parsed relationships
     * @returns {Array} Array of relationship naming warnings
     */
    validateRelationshipNames(relationships) {
        // DISABLED: Relationship labels should allow any characters, including spaces
        console.log('🔍 DEBUG: validateRelationshipNames DISABLED - returning empty warnings');
        return []; // Return empty array to bypass all relationship name validation
    }

    /**
     * Check for reserved words usage
     * @param {Array} entities - Parsed entities
     * @returns {Array} Array of reserved word warnings
     */
    checkReservedWords(entities) {
        const warnings = [];
        const sqlReservedWords = ['SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 
                                'ALTER', 'TABLE', 'INDEX', 'VIEW', 'GRANT', 'REVOKE', 'COMMIT', 'ROLLBACK'];

        // Check entity names
        entities.forEach(entity => {
            // Skip validation for CDM entities - they are managed by Dataverse
            if (entity.isCdm) {
                console.log(`🔍 Skipping reserved word validation for CDM entity: ${entity.name}`);
                return;
            }

            if (sqlReservedWords.includes(entity.name.toUpperCase())) {
                warnings.push(this.createWarning({
                    type: 'sql_reserved_word',
                    category: 'naming',
                    severity: 'warning',
                    entity: entity.name,
                    message: `Entity name '${entity.name}' is a SQL reserved word and may cause issues.`,
                    suggestion: `Rename to: ${entity.name}Entity or Custom${entity.name}`,
                    autoFixable: true,
                    fixData: {
                        originalName: entity.name,
                        suggestedName: `${entity.name}Entity`
                    }
                }));
            }

            // Check attribute names
            if (entity.attributes) {
                entity.attributes.forEach(attr => {
                    if (sqlReservedWords.includes(attr.name.toUpperCase())) {
                        warnings.push(this.createWarning({
                            type: 'sql_reserved_word',
                            category: 'naming',
                            severity: 'warning',
                            entity: entity.name,
                            attribute: attr.name,
                            message: `Attribute name '${attr.name}' is a SQL reserved word and may cause issues.`,
                            suggestion: `Rename to: ${attr.name}Value or custom${attr.name}`,
                            autoFixable: true,
                            fixData: {
                                entityName: entity.name,
                                originalName: attr.name,
                                suggestedName: `${attr.name}Value`
                            }
                        }));
                    }
                });
            }
        });

        return warnings;
    }

    // Helper methods for naming conventions

    /**
     * Sanitize entity name to follow Dataverse conventions
     */
    sanitizeEntityName(name) {
        // Remove invalid characters
        let sanitized = name.replace(/[^A-Za-z0-9_]/g, '');
        
        // If starts with number, prefix with 'Entity'
        if (/^[0-9]/.test(sanitized)) {
            sanitized = 'Entity' + sanitized;
        }
        
        return sanitized;
    }

    /**
     * Shorten entity name while preserving meaning
     */
    shortenEntityName(name) {
        if (name.length <= 50) return name;
        
        // Remove vowels from the middle, keep consonants and first/last chars
        const shortened = name.substring(0, 2) + 
                         name.substring(2, name.length - 2).replace(/[aeiouAEIOU]/g, '') + 
                         name.substring(name.length - 2);
                         
        return shortened.length <= 50 ? shortened : name.substring(0, 50);
    }

    /**
     * Convert string to PascalCase
     */
    toPascalCase(str) {
        // Handle camelCase strings by preserving existing word boundaries
        if (/^[a-z][a-zA-Z0-9]*$/.test(str)) {
            // Split camelCase into words
            const words = str.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
            return words
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join('');
        }
        
        // Handle other formats (snake_case, kebab-case, space separated)
        return str
            .replace(/[^a-zA-Z0-9]/g, ' ') // Replace non-alphanumeric with spaces
            .split(' ')
            .filter(word => word.length > 0)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }

    /**
     * Sanitize attribute name to follow camelCase convention
     */
    sanitizeAttributeName(name) {
        // Remove special characters
        let cleaned = name.replace(/[^a-zA-Z0-9_]/g, '');
        
        // If empty or starts with number/underscore, prepend 'attr'
        if (!cleaned || !/^[a-zA-Z]/.test(cleaned)) {
            cleaned = 'attr' + cleaned;
        }
        
        // Ensure first character is lowercase
        return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
    }

    /**
     * Shorten attribute name while preserving meaning
     */
    shortenAttributeName(name) {
        if (name.length <= 50) return name;
        
        // Keep prefix and suffix, remove vowels from middle
        const shortened = name.substring(0, 5) + 
                         name.substring(5, name.length - 5).replace(/[aeiouAEIOU]/g, '') + 
                         name.substring(name.length - 5);
                         
        return shortened.length <= 50 ? shortened : name.substring(0, 50);
    }

    /**
     * Fix foreign key name to follow convention
     */
    /**
     * Sanitize relationship name
     */
    sanitizeRelationshipName(name) {
        return name.replace(/[^a-zA-Z0-9_\s]/g, '').trim();
    }

    /**
     * Shorten relationship name
     */
    shortenRelationshipName(name) {
        return name.length <= 100 ? name : name.substring(0, 97) + '...';
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

    /**
     * Apply bulk fixes to warnings in ERD content
     * @param {Object} params - Bulk fix parameters
     * @param {string} params.mermaidContent - Original Mermaid ERD content
     * @param {Array} params.warnings - Array of warnings to fix
     * @param {string|Array} params.fixTypes - Types of fixes to apply ('all', 'autoFixableOnly', or array)
     * @param {Object} params.options - Additional options
     * @returns {Promise<Object>} Bulk fix results
     */
    async bulkFixWarnings({ mermaidContent, warnings, fixTypes = 'all' }) {
        return this.executeOperation('bulkFixWarnings', async () => {
            let fixedContent = mermaidContent;
            const appliedFixes = [];
            const failedFixes = [];
            
            // Filter warnings based on fixTypes
            let warningsToFix = warnings;
            if (fixTypes === 'autoFixableOnly') {
                warningsToFix = warnings.filter(w => w.autoFixable);
            } else if (Array.isArray(fixTypes)) {
                warningsToFix = warnings.filter(w => fixTypes.includes(w.type));
            }

            // Group fixes by type for optimal processing order
            const fixesByType = this.groupFixesByType(warningsToFix);

            // Apply fixes in order of priority (structural fixes first, then cosmetic)
            const fixOrder = [
                'missing_primary_key',
                'missing_foreign_key', 
                'orphaned_relationship',
                'duplicate_relationship',
                'reserved_entity_name',
                'reserved_attribute_name',
                'sql_reserved_word',
                'invalid_entity_name',
                'invalid_attribute_name',
                'entity_name_too_long',
                'attribute_name_too_long',
                'foreign_key_naming',
                'foreign_key_naming_convention',
                'naming_conflict',
                'multiple_primary_keys',
                'duplicate_columns',
                'entity_name_case',
                'many_to_many_detected'
            ];

            for (const fixType of fixOrder) {
                if (fixesByType[fixType]) {
                    const fixes = fixesByType[fixType];
                    for (const warning of fixes) {
                        try {
                            const fixResult = await this.applyIndividualFix(fixedContent, warning);
                            if (fixResult.success) {
                                fixedContent = fixResult.content;
                                appliedFixes.push({
                                    type: warning.type,
                                    entity: warning.entity,
                                    message: warning.message,
                                    appliedFix: fixResult.appliedFix
                                });
                            } else {
                                failedFixes.push({
                                    type: warning.type,
                                    entity: warning.entity,
                                    message: warning.message,
                                    error: fixResult.error
                                });
                            }
                        } catch (error) {
                            failedFixes.push({
                                type: warning.type,
                                entity: warning.entity,
                                message: warning.message,
                                error: error.message
                            });
                        }
                    }
                }
            }

            // Re-validate to get remaining warnings
            const revalidationResult = await this.validateERD({
                mermaidContent: fixedContent,
                options: { includeWarnings: true }
            });

            const remainingWarnings = revalidationResult.success ? 
                (revalidationResult.warnings || []) : [];

            return this.createSuccess({
                fixedContent,
                appliedFixes,
                failedFixes,
                remainingWarnings,
                summary: {
                    totalWarnings: warnings.length,
                    fixesAttempted: warningsToFix.length,
                    fixesApplied: appliedFixes.length,
                    fixesFailed: failedFixes.length,
                    remainingWarnings: remainingWarnings.length
                }
            });
        });
    }

    /**
     * Fix an individual warning by its ID
     * @param {Object} params - Parameters
     * @param {string} params.mermaidContent - Original mermaid content
     * @param {string} params.warningId - ID of the warning to fix
     * @param {Object} params.options - Additional options
     * @returns {Object} Result with fixed content
     */
    async fixIndividualWarning({ mermaidContent, warningId, options = {} }) {
        return this.executeOperation('fixIndividualWarning', async () => {
            console.log('🔧 DEBUG: fixIndividualWarning called with:', {
                contentLength: mermaidContent?.length,
                warningId,
                contentPreview: mermaidContent?.substring(0, 100)
            });
            
            // First validate to get the current warnings
            const validationResult = await this.validateERD({ mermaidContent, options });
            
            console.log('🔧 DEBUG: Validation result structure:', {
                success: validationResult.success,
                hasData: !!validationResult.data,
                dataKeys: validationResult.data ? Object.keys(validationResult.data) : [],
                errorMessage: validationResult.error?.message || validationResult.message,
                directWarningsCount: validationResult.warnings?.length,
                dataWarningsCount: validationResult.data?.warnings?.length
            });
            
            // Only fail if there are actual parsing/structure errors, not just warnings
            if (!validationResult.success && validationResult.errors && validationResult.errors.length > 0) {
                return this.createError('Failed to validate ERD for individual fix', validationResult.errors);
            }

            // Extract the validation data from the wrapped result
            const validationData = validationResult.data || validationResult;
            const warnings = validationData.warnings || [];

            // Find the specific warning to fix
            const warningToFix = warnings.find(w => w.id === warningId);
            console.log('🔧 DEBUG: Warning search result:', {
                warningId,
                warningFound: !!warningToFix,
                availableWarningIds: warnings.map(w => w.id)
            });
            
            if (!warningToFix) {
                // Check if this is a valid warning ID format or completely invalid
                if (warningId.startsWith('warning_') && /^warning_\d+$/.test(warningId)) {
                    // Valid format, likely already fixed - return success
                    console.log('🔧 DEBUG: Warning not found but valid format, returning success (likely already fixed)');
                    const successResult = this.createSuccess({
                        fixedContent: mermaidContent,
                        appliedFix: {
                            warningId: warningId,
                            warningType: 'unknown',
                            description: 'Warning already resolved (not found in current validation)'
                        },
                        remainingWarnings: warnings
                    });
                    console.log('🔧 DEBUG: Success result created:', { success: successResult.success });
                    return successResult;
                } else {
                    // Invalid warning ID format - return error
                    console.log('🔧 DEBUG: Invalid warning ID format, returning error');
                    return this.createError(`Warning with ID '${warningId}' not found`);
                }
            }

            // Check if the warning is auto-fixable
            if (!warningToFix.autoFixable) {
                return this.createError(`Warning '${warningToFix.type}' is not auto-fixable`);
            }

            // Apply the fix for this specific warning
            console.log('🔧 DEBUG: Applying fix for warning:', warningToFix.type);
            const fixResult = await this.applyIndividualFix(mermaidContent, warningToFix);
            console.log('🔧 DEBUG: Fix result:', { success: fixResult.success });
            
            if (!fixResult.success) {
                console.log('🔧 DEBUG: Fix failed, returning error');
                return this.createError('Failed to apply individual fix', fixResult.error);
            }

            // Validate the fixed content to ensure the warning is resolved
            const finalValidation = await this.validateERD({ 
                mermaidContent: fixResult.content, 
                options 
            });

            // Apply Mermaid syntax fixes to ensure the result can be rendered
            const mermaidReadyContent = this.fixMermaidSyntax(fixResult.content);
            
            const finalResult = this.createSuccess({
                fixedContent: mermaidReadyContent,
                appliedFix: {
                    warningId: warningId,
                    warningType: warningToFix.type,
                    description: fixResult.appliedFix
                },
                remainingWarnings: finalValidation.data?.warnings || []
            });
            console.log('🔧 DEBUG: Final success result:', { success: finalResult.success });
            return finalResult;
        });
    }

    /**
     * Group fixes by type for optimal processing
     * @param {Array} warnings - Warnings to group
     * @returns {Object} Warnings grouped by type
     */
    groupFixesByType(warnings) {
        const groups = {};
        warnings.forEach(warning => {
            if (!groups[warning.type]) {
                groups[warning.type] = [];
            }
            groups[warning.type].push(warning);
        });
        return groups;
    }

    /**
     * Apply an individual fix to ERD content
     * @param {string} content - Current ERD content
     * @param {Object} warning - Warning to fix
     * @returns {Promise<Object>} Fix result
     */
    async applyIndividualFix(content, warning) {
        try {
            switch (warning.type) {
                case 'missing_primary_key':
                    return this.fixMissingPrimaryKey(content, warning);
                    
                case 'missing_foreign_key':
                    return this.fixMissingForeignKey(content, warning);
                    
                case 'foreign_key_naming':
                    return this.fixForeignKeyNaming(content, warning);
                    
                case 'naming_conflict':
                    return this.fixNamingConflict(content, warning);
                    
                case 'invalid_entity_name':
                case 'entity_name_too_long':
                case 'reserved_entity_name':
                case 'entity_name_case':
                    return this.fixEntityNaming(content, warning);
                    
                case 'invalid_attribute_name':
                case 'attribute_name_too_long':
                case 'reserved_attribute_name':
                case 'foreign_key_naming_convention':
                    return this.fixAttributeNaming(content, warning);
                    
                case 'sql_reserved_word':
                    return this.fixReservedWord(content, warning);
                    
                case 'multiple_primary_keys':
                    return this.fixMultiplePrimaryKeys(content, warning);
                    
                case 'duplicate_columns':
                    return this.fixDuplicateColumns(content, warning);
                    
                case 'missing_entity':
                    return this.fixMissingEntity(content, warning);
                    
                case 'duplicate_relationship':
                    return this.fixDuplicateRelationship(content, warning);
                    
                case 'self_referencing_relationship':
                    return this.fixSelfReferencingRelationship(content, warning);
                    
                case 'many_to_many_detected':
                    return this.fixManyToMany(content, warning);
                    
                case 'status_column_ignored':
                    return this.fixStatusColumn(content, warning);
                    
                case 'choice_column_detected':
                case 'invalid_choice_syntax':
                    return this.fixChoiceColumns(content, warning);
                    
                // case 'invalid_relationship_name': // DISABLED: Relationship labels should allow spaces
                //     return this.fixInvalidRelationshipName(content, warning);
                    
                default:
                    return {
                        success: false,
                        error: `No fix available for warning type: ${warning.type}`
                    };
            }
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Fix missing primary key in an entity
     * @param {string} content - ERD content
     * @param {Object} warning - Warning details
     * @returns {Object} Fix result
     */
    fixMissingPrimaryKey(content, warning) {
        console.log('🔧 DEBUG: fixMissingPrimaryKey called with warning:', JSON.stringify(warning, null, 2));
        
        const entityName = warning.entity;
        if (!entityName) {
            console.log('🔧 DEBUG: No entity name found in warning');
            return { success: false, error: 'Entity name not provided' };
        }

        // Find the entity definition more robustly
        const entityStartPattern = new RegExp(`${entityName}\\s*\\{`, 'g');
        console.log('🔧 DEBUG: Looking for entity pattern:', entityStartPattern);
        console.log('🔧 DEBUG: Content preview:', content.substring(0, 300));
        const startMatch = entityStartPattern.exec(content);
        
        if (!startMatch) {
            console.log('🔧 DEBUG: Entity not found with pattern:', entityStartPattern);
            return { success: false, error: `Entity ${entityName} not found` };
        }

        // Find the closing brace
        let braceCount = 1;
        let pos = startMatch.index + startMatch[0].length;
        let entityEnd = -1;
        
        while (pos < content.length && braceCount > 0) {
            if (content[pos] === '{') braceCount++;
            else if (content[pos] === '}') braceCount--;
            
            if (braceCount === 0) {
                entityEnd = pos;
                break;
            }
            pos++;
        }
        
        if (entityEnd === -1) {
            return { success: false, error: `Could not find end of entity ${entityName}` };
        }

        // Extract the entity content
        const entityStart = startMatch.index;
        const entityHeader = content.substring(entityStart, startMatch.index + startMatch[0].length);
        const entityBody = content.substring(startMatch.index + startMatch[0].length, entityEnd);
        const entityClose = '}';
        
        console.log('🔧 DEBUG: Entity body:', entityBody);
        
        // Check if entity already has any primary key
        if (entityBody.includes(' PK')) {
            console.log('🔧 DEBUG: Entity already has a primary key');
            return { 
                success: true, 
                content: content,
                appliedFix: `Entity '${entityName}' already has a primary key - no changes needed`
            };
        }

        // Add primary key as the first line in the entity
        const primaryKeyLine = '\n        string id PK "Primary identifier"';
        const newEntityBody = primaryKeyLine + entityBody;
        
        // Reconstruct the content
        const beforeEntity = content.substring(0, entityStart);
        const afterEntity = content.substring(entityEnd + 1);
        const updatedContent = beforeEntity + entityHeader + newEntityBody + '\n    ' + entityClose + afterEntity;

        return {
            success: true,
            content: updatedContent,
            appliedFix: `Added primary key 'id' to entity '${entityName}'`
        };
    }

    /**
     * Fix missing foreign key in an entity
     * @param {string} content - ERD content
     * @param {Object} warning - Warning details
     * @returns {Object} Fix result
     */
    fixMissingForeignKey(content, warning) {
        console.log('🔧 DEBUG: fixMissingForeignKey called with warning:', JSON.stringify(warning, null, 2));
        
        if (!warning.fixData) {
            console.log('🔧 DEBUG: No fixData found in warning');
            return { success: false, error: 'Fix data not provided' };
        }

        const { entityName, columnName, referencedEntity } = warning.fixData;
        
        // Find the entity definition more robustly
        const entityStartPattern = new RegExp(`${entityName}\\s*\\{`, 'g');
        const startMatch = entityStartPattern.exec(content);
        
        if (!startMatch) {
            return { success: false, error: `Entity ${entityName} not found` };
        }

        // Find the closing brace
        let braceCount = 1;
        let pos = startMatch.index + startMatch[0].length;
        let entityEnd = -1;
        
        while (pos < content.length && braceCount > 0) {
            if (content[pos] === '{') braceCount++;
            else if (content[pos] === '}') braceCount--;
            
            if (braceCount === 0) {
                entityEnd = pos;
                break;
            }
            pos++;
        }
        
        if (entityEnd === -1) {
            return { success: false, error: `Could not find end of entity ${entityName}` };
        }

        // Extract the entity content
        const entityStart = startMatch.index;
        const entityHeader = content.substring(entityStart, startMatch.index + startMatch[0].length);
        const entityBody = content.substring(startMatch.index + startMatch[0].length, entityEnd);
        const entityClose = '}';
        
        // Check if entity already has this foreign key
        if (entityBody.includes(`${columnName} FK`) || entityBody.includes(`${columnName}FK`)) {
            return { 
                success: true, 
                content: content,
                appliedFix: `Entity '${entityName}' already has foreign key '${columnName}' - no changes needed`
            };
        }

        // Add foreign key line - use current entity name in description, not the old one from fixData
        // In case entity was renamed, we want the FK description to use the current entity name
        let currentReferencedEntity = referencedEntity;
        
        // Check if the referencedEntity exists in the current ERD
        const entityPattern = new RegExp(`\\b${referencedEntity}\\s*\\{`, 'g');
        if (!entityPattern.test(content)) {
            // Original entity not found, try to find the current name by checking all entities
            const allEntityMatches = content.match(/(\w+)\s*\{/g);
            if (allEntityMatches) {
                const availableEntities = allEntityMatches
                    .map(match => match.replace(/\s*\{/, ''))
                    .filter(entity => entity.length > 1); // Filter out single characters from relationship syntax
                console.log(`🔧 DEBUG: Referenced entity '${referencedEntity}' not found. Available entities:`, availableEntities);
                
                // Try to find a matching entity based on common patterns
                // Look for entities that might be the renamed version
                const potentialMatches = availableEntities.filter(entity => {
                    // Check if it contains the original name (e.g., CustomContact contains Contact)
                    return entity.toLowerCase().includes(referencedEntity.toLowerCase()) ||
                           // Or if the original name contains the current name
                           referencedEntity.toLowerCase().includes(entity.toLowerCase());
                });
                
                if (potentialMatches.length === 1) {
                    currentReferencedEntity = potentialMatches[0];
                    console.log(`🔧 DEBUG: Auto-resolved referenced entity from '${referencedEntity}' to '${currentReferencedEntity}'`);
                } else if (potentialMatches.length > 1) {
                    console.log(`🔧 DEBUG: Multiple potential matches found:`, potentialMatches, 'using first one:', potentialMatches[0]);
                    currentReferencedEntity = potentialMatches[0];
                } else {
                    // If no good match, check relationships to infer the correct entity
                    // Parse relationships from the content to find what entity this FK should reference
                    const relationshipPattern = new RegExp(`${entityName}\\s*\\|[\\|\\-\\}\\{o]*\\s*(\\w+)\\s*:`, 'g');
                    let relationshipMatch;
                    while ((relationshipMatch = relationshipPattern.exec(content)) !== null) {
                        const relatedEntity = relationshipMatch[1];
                        if (availableEntities.includes(relatedEntity) && relatedEntity !== entityName) {
                            currentReferencedEntity = relatedEntity;
                            console.log(`🔧 DEBUG: Inferred referenced entity from relationship: '${currentReferencedEntity}'`);
                            break;
                        }
                    }
                    
                    if (currentReferencedEntity === referencedEntity) {
                        console.log(`🔧 DEBUG: Could not auto-resolve referenced entity, using original name '${referencedEntity}'`);
                    }
                }
            }
        }
        
        const foreignKeyLine = `\n        string ${columnName} FK "Foreign key to ${currentReferencedEntity}"`;
        const newEntityBody = entityBody + foreignKeyLine;
        
        // Reconstruct the content
        const beforeEntity = content.substring(0, entityStart);
        const afterEntity = content.substring(entityEnd + 1);
        const updatedContent = beforeEntity + entityHeader + newEntityBody + '\n    ' + entityClose + afterEntity;

        return {
            success: true,
            content: updatedContent,
            appliedFix: `Added foreign key '${columnName}' to entity '${entityName}'`
        };
    }

    /**
     * Fix foreign key naming convention
     * @param {string} content - ERD content
     * @param {Object} warning - Warning details
     * @returns {Object} Fix result
     */
    fixForeignKeyNaming(content, warning) {
        this.log('fixForeignKeyNaming', { content: content.length, warning: warning.type });
        
        try {
            // Extract relationship info from warning message
            // Pattern: "Relationship 'A → B' exists with foreign keys present in 'B', but no FK named 'a_id' was found."
            const relationshipMatch = warning.message.match(/Relationship '([^']+)' exists with foreign keys present in '([^']+)', but no FK named '([^']+)' was found/);
            
            if (!relationshipMatch) {
                console.log('🔧 DEBUG: Could not parse foreign key naming warning message:', warning.message);
                return { success: false, error: 'Could not parse warning message' };
            }
            
            const [, relationship, targetEntity, expectedFKName] = relationshipMatch;
            const [sourceEntity] = relationship.split(' → ');
            
            console.log('🔧 DEBUG: Parsed foreign key naming fix:', {
                relationship,
                sourceEntity,
                targetEntity,
                expectedFKName
            });
            
            // Find the target entity definition
            const entityPattern = new RegExp(`(${targetEntity}\\s*\\{[^}]*})`, 'g');
            const entityMatch = entityPattern.exec(content);
            
            if (!entityMatch) {
                console.log('🔧 DEBUG: Could not find target entity:', targetEntity);
                return { success: false, error: `Target entity ${targetEntity} not found` };
            }
            
            const entityDefinition = entityMatch[1];
            console.log('🔧 DEBUG: Found entity definition:', entityDefinition);
            
            // Check if there's already a foreign key that could be renamed
            // Look for foreign keys that reference the source entity
            const fkPattern = new RegExp(`string\\s+(\\w+)\\s+FK(?:\\s+"[^"]*")?`, 'g');
            let fkMatch;
            const foreignKeys = [];
            
            while ((fkMatch = fkPattern.exec(entityDefinition)) !== null) {
                foreignKeys.push(fkMatch[1]);
            }
            
            console.log('🔧 DEBUG: Found foreign keys in entity:', foreignKeys);
            
            // Look for a foreign key that might be incorrectly named
            // Check if any FK name suggests it should be the expected FK name
            const sourceEntityLower = sourceEntity.toLowerCase();
            const candidateFK = foreignKeys.find(fk => {
                const fkLower = fk.toLowerCase();
                return fkLower.includes(sourceEntityLower) || fkLower.includes('id');
            });
            
            if (candidateFK && candidateFK !== expectedFKName) {
                console.log('🔧 DEBUG: Found candidate FK to rename:', candidateFK, '→', expectedFKName);
                
                // Rename the foreign key
                const oldFKPattern = new RegExp(`(string\\s+)${candidateFK}(\\s+FK(?:\\s+"[^"]*")?)`, 'g');
                const updatedContent = content.replace(oldFKPattern, `$1${expectedFKName}$2`);
                
                if (updatedContent !== content) {
                    console.log('🔧 DEBUG: Successfully renamed foreign key');
                    return {
                        success: true,
                        content: updatedContent,
                        appliedFix: `Renamed foreign key '${candidateFK}' to '${expectedFKName}' in entity '${targetEntity}'`
                    };
                }
            } else {
                // Add the missing foreign key
                console.log('🔧 DEBUG: Adding missing foreign key:', expectedFKName);
                
                const newFKLine = `        string ${expectedFKName} FK "Foreign key to ${sourceEntity}"`;
                
                // Find the position to insert the FK (before the closing brace)
                const closingBraceIndex = entityDefinition.lastIndexOf('}');
                if (closingBraceIndex === -1) {
                    return { success: false, error: 'Could not find entity closing brace' };
                }
                
                // Insert the FK before the closing brace
                const beforeClosing = entityDefinition.substring(0, closingBraceIndex);
                const afterClosing = entityDefinition.substring(closingBraceIndex);
                const updatedEntity = beforeClosing + '\n' + newFKLine + '\n    ' + afterClosing;
                
                const updatedContent = content.replace(entityDefinition, updatedEntity);
                
                console.log('🔧 DEBUG: Successfully added missing foreign key');
                return {
                    success: true,
                    content: updatedContent,
                    appliedFix: `Added missing foreign key '${expectedFKName}' to entity '${targetEntity}'`
                };
            }
            
            return { success: false, error: 'Could not determine appropriate fix' };
            
        } catch (error) {
            console.error('🔧 ERROR: fixForeignKeyNaming failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Fix naming conflicts in entities
     * @param {string} content - ERD content
     * @param {Object} warning - Warning details
     * @returns {Object} Fix result
     */
    fixNamingConflict(content, warning) {
        const entityName = warning.entity;
        if (!entityName) {
            return { success: false, error: 'Entity name not provided' };
        }

        // Find the entity definition more robustly
        const entityStartPattern = new RegExp(`${entityName}\\s*\\{`, 'g');
        const startMatch = entityStartPattern.exec(content);
        
        if (!startMatch) {
            return { success: false, error: `Entity ${entityName} not found` };
        }

        // Find the closing brace
        let braceCount = 1;
        let pos = startMatch.index + startMatch[0].length;
        let entityEnd = -1;
        
        while (pos < content.length && braceCount > 0) {
            if (content[pos] === '{') braceCount++;
            else if (content[pos] === '}') braceCount--;
            
            if (braceCount === 0) {
                entityEnd = pos;
                break;
            }
            pos++;
        }
        
        if (entityEnd === -1) {
            return { success: false, error: `Could not find end of entity ${entityName}` };
        }

        // Extract the entity content
        const entityStart = startMatch.index;
        const entityHeader = content.substring(entityStart, startMatch.index + startMatch[0].length);
        const entityBody = content.substring(startMatch.index + startMatch[0].length, entityEnd);
        const entityClose = '}';
        
        // Replace 'string name' with entity-specific naming
        const newColumnName = `${entityName.toLowerCase()}_name`;
        const namePattern = /(\s+)string\s+name(\s+[^\n]*)?/g;
        const newEntityBody = entityBody.replace(namePattern, `$1string ${newColumnName}$2`);
        
        if (newEntityBody === entityBody) {
            return { success: false, error: `No 'name' attribute found in entity ${entityName}` };
        }
        
        // Reconstruct the content
        const beforeEntity = content.substring(0, entityStart);
        const afterEntity = content.substring(entityEnd + 1);
        const updatedContent = beforeEntity + entityHeader + newEntityBody + '\n    ' + entityClose + afterEntity;

        return {
            success: true,
            content: updatedContent,
            appliedFix: `Renamed 'name' column to '${newColumnName}' in entity '${entityName}'`
        };
    }

    /**
     * Fix missing entity by creating a basic entity or removing the relationship
     * @param {string} content - ERD content
     * @param {Object} warning - Missing entity warning
     * @returns {Object} Fix result
     */
    fixMissingEntity(content, warning) {
        console.log('🔧 DEBUG: fixMissingEntity called with warning:', JSON.stringify(warning, null, 2));
        
        let missingEntity;
        
        if (warning.fixData && warning.fixData.missingEntity) {
            missingEntity = warning.fixData.missingEntity;
        } else if (warning.relationship) {
            // Extract missing entity from relationship string (e.g., "Category → NonExistentEntity")
            const relationshipMatch = warning.relationship.match(/→\s*(\w+)/);
            if (relationshipMatch) {
                missingEntity = relationshipMatch[1];
                console.log('🔧 DEBUG: Extracted missing entity from relationship:', missingEntity);
            }
        }
        
        if (!missingEntity) {
            console.log('🔧 DEBUG: Could not determine missing entity name');
            return { success: false, error: 'Missing entity name not provided' };
        }
        
        // Option 1: Create a basic entity (preferred approach)
        // Find a good place to add the new entity (after the last entity definition)
        const entityPattern = /(\w+)\s*\{[^}]*\}/g;
        let lastEntityMatch = null;
        let match;
        
        while ((match = entityPattern.exec(content)) !== null) {
            lastEntityMatch = match;
        }
        
        if (lastEntityMatch) {
            // Insert the new entity after the last entity
            const insertPosition = lastEntityMatch.index + lastEntityMatch[0].length;
            const newEntity = `\n\n    ${missingEntity} {\n        string id PK "Unique identifier"\n        string name "Name"\n    }`;
            
            console.log('🔧 DEBUG: Inserting new entity after last entity at position:', insertPosition);
            console.log('🔧 DEBUG: New entity content:', newEntity);
            
            const beforeInsert = content.substring(0, insertPosition);
            const afterInsert = content.substring(insertPosition);
            const updatedContent = beforeInsert + newEntity + afterInsert;
            
            console.log('🔧 DEBUG: Entity creation successful');
            return {
                success: true,
                content: updatedContent,
                appliedFix: `Created basic entity '${missingEntity}' with id and name attributes`
            };
        } else {
            // If no entities found, add after erDiagram
            const diagramStart = content.indexOf('erDiagram');
            if (diagramStart !== -1) {
                const insertPosition = content.indexOf('\n', diagramStart) + 1;
                const newEntity = `\n    ${missingEntity} {\n        string id PK "Unique identifier"\n        string name "Name"\n    }\n`;
                
                const beforeInsert = content.substring(0, insertPosition);
                const afterInsert = content.substring(insertPosition);
                const updatedContent = beforeInsert + newEntity + afterInsert;
                
                return {
                    success: true,
                    content: updatedContent,
                    appliedFix: `Created basic entity '${missingEntity}' with id and name attributes`
                };
            }
        }
        
        console.log('🔧 DEBUG: Could not find suitable insertion point for entity');
        return { success: false, error: `Could not find a suitable place to insert entity '${missingEntity}'` };
    }

    /**
     * Fix multiple primary keys in an entity
     * @param {string} content - ERD content
     * @param {Object} warning - Warning details
     * @returns {Object} Fix result
     */
    fixMultiplePrimaryKeys(content, warning) {
        const entityName = warning.entity;
        if (!entityName) {
            return { success: false, error: 'Entity name not provided' };
        }

        // Remove PK notation from all but the first occurrence
        const entityPattern = new RegExp(`(${entityName}\\s*\\{[^}]*?)(\\})`, 'gms');
        const entityMatch = content.match(entityPattern);
        
        if (!entityMatch) {
            return { success: false, error: `Entity ${entityName} not found` };
        }

        let entityContent = entityMatch[0];
        let pkCount = 0;
        
        // Remove PK from all but first occurrence
        entityContent = entityContent.replace(/(\s+\w+\s+\w+)\s+PK/g, (match, p1) => {
            if (pkCount === 0) {
                pkCount++;
                return match; // Keep first PK
            }
            return p1; // Remove PK from subsequent occurrences
        });

        const updatedContent = content.replace(entityPattern, entityContent);

        return {
            success: true,
            content: updatedContent,
            appliedFix: `Removed duplicate primary key notations in entity '${entityName}'`
        };
    }

    /**
     * Fix duplicate columns in an entity
     * @param {string} content - ERD content
     * @param {Object} warning - Warning details
     * @returns {Object} Fix result
     */
    fixDuplicateColumns(content, warning) {
        const entityName = warning.entity;
        if (!entityName) {
            return { success: false, error: 'Entity name not provided' };
        }

        try {
            console.log('🔧 DEBUG: Fixing duplicate columns in entity:', entityName);
            
            // Find the entity definition
            const entityPattern = new RegExp(`(${entityName}\\s*\\{[^}]*})`, 'g');
            const entityMatch = entityPattern.exec(content);
            
            if (!entityMatch) {
                console.log('🔧 DEBUG: Could not find entity:', entityName);
                return { success: false, error: `Entity ${entityName} not found` };
            }
            
            const entityDefinition = entityMatch[1];
            console.log('🔧 DEBUG: Found entity definition:', entityDefinition);
            
            // Parse all attributes in the entity
            const attributePattern = /^\s*(string|int|datetime|decimal|boolean)\s+(\w+)(?:\s+(PK|FK))?(?:\s+"([^"]*)")?/gm;
            let attributeMatch;
            const attributes = [];
            const seenAttributes = new Set();
            const duplicateAttributes = new Set();
            
            while ((attributeMatch = attributePattern.exec(entityDefinition)) !== null) {
                const [fullMatch, type, name, constraint, description] = attributeMatch;
                
                if (seenAttributes.has(name)) {
                    duplicateAttributes.add(name);
                    console.log('🔧 DEBUG: Found duplicate attribute:', name);
                } else {
                    seenAttributes.add(name);
                }
                
                attributes.push({
                    fullMatch,
                    type,
                    name,
                    constraint: constraint || '',
                    description: description || '',
                    isDuplicate: seenAttributes.has(name) && duplicateAttributes.has(name)
                });
            }
            
            console.log('🔧 DEBUG: Parsed attributes:', attributes.map(a => ({ name: a.name, constraint: a.constraint, isDuplicate: a.isDuplicate })));
            
            if (duplicateAttributes.size === 0) {
                return { success: false, error: 'No duplicate columns found to fix' };
            }
            
            // Create deduplicated entity definition
            let newEntityContent = entityDefinition;
            
            for (const duplicate of duplicateAttributes) {
                console.log('🔧 DEBUG: Processing duplicate attribute:', duplicate);
                
                // Find all instances of this duplicate attribute
                const duplicateInstances = attributes.filter(a => a.name === duplicate);
                console.log('🔧 DEBUG: Found instances:', duplicateInstances.map(d => ({ constraint: d.constraint, description: d.description })));
                
                // Keep the best instance (priority: PK > FK > regular, then first occurrence)
                let bestInstance = duplicateInstances[0];
                for (const instance of duplicateInstances) {
                    if (instance.constraint === 'PK' && bestInstance.constraint !== 'PK') {
                        bestInstance = instance;
                    } else if (instance.constraint === 'FK' && bestInstance.constraint !== 'PK' && bestInstance.constraint !== 'FK') {
                        bestInstance = instance;
                    }
                }
                
                console.log('🔧 DEBUG: Best instance for', duplicate, ':', { constraint: bestInstance.constraint, description: bestInstance.description });
                
                // Build the kept attribute line
                let keptLine = `        ${bestInstance.type} ${bestInstance.name}`;
                if (bestInstance.constraint) {
                    keptLine += ` ${bestInstance.constraint}`;
                }
                if (bestInstance.description) {
                    keptLine += ` "${bestInstance.description}"`;
                }
                
                console.log('🔧 DEBUG: Kept line for', duplicate, ':', keptLine);
                
                // Remove all instances of this duplicate
                for (const instance of duplicateInstances) {
                    const escapedMatch = instance.fullMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const removePattern = new RegExp(`\\s*${escapedMatch}\\s*`, 'g');
                    newEntityContent = newEntityContent.replace(removePattern, '');
                    console.log('🔧 DEBUG: Removed instance:', instance.fullMatch);
                }
                
                // Add back the best instance
                const closingBraceIndex = newEntityContent.lastIndexOf('}');
                if (closingBraceIndex === -1) {
                    return { success: false, error: 'Could not find entity closing brace' };
                }
                
                const beforeClosing = newEntityContent.substring(0, closingBraceIndex);
                const afterClosing = newEntityContent.substring(closingBraceIndex);
                newEntityContent = beforeClosing + '\n' + keptLine + '\n    ' + afterClosing;
                
                console.log('🔧 DEBUG: Added back best instance for', duplicate);
            }
            
            // Clean up extra whitespace and empty lines
            newEntityContent = newEntityContent.replace(/\n\s*\n\s*\n/g, '\n\n').replace(/\n\s*}/g, '\n    }');
            
            console.log('🔧 DEBUG: New entity content:', newEntityContent);
            
            // Replace in the full content
            const updatedContent = content.replace(entityDefinition, newEntityContent);
            
            const removedDuplicates = Array.from(duplicateAttributes);
            console.log('🔧 DEBUG: Successfully removed duplicate columns:', removedDuplicates);
            
            return {
                success: true,
                content: updatedContent,
                appliedFix: `Removed duplicate columns in entity '${entityName}': ${removedDuplicates.join(', ')}`
            };
            
        } catch (error) {
            console.error('🔧 ERROR: fixDuplicateColumns failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Fix duplicate relationships
     * @param {string} content - ERD content
     * @param {Object} warning - Warning details
     * @returns {Object} Fix result
     */
    fixDuplicateRelationship(content, warning) {
        this.log('fixDuplicateRelationship', { content: content.length, warning: warning.type });
        
        try {
            // Extract relationship info from warning
            const relationship = warning.relationship;
            if (!relationship) {
                console.log('🔧 DEBUG: No relationship info in warning:', warning);
                return { success: false, error: 'No relationship information found' };
            }
            
            console.log('🔧 DEBUG: Fixing duplicate relationship:', relationship);
            
            // Find all relationship definitions in the content (handle different relationship types)
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
            
            console.log('🔧 DEBUG: Found relationships:', relationships.map(r => `${r.source} → ${r.target}`));
            
            // Parse the warning relationship (e.g., "Employee → Department")
            const [sourceEntity, targetEntity] = relationship.split(' → ');
            
            // Find duplicates for this specific relationship
            const duplicates = relationships.filter(r => 
                (r.source === sourceEntity && r.target === targetEntity) ||
                (r.source === targetEntity && r.target === sourceEntity)
            );
            
            console.log('🔧 DEBUG: Found duplicate relationships:', duplicates.length, duplicates.map(d => d.fullMatch));
            
            if (duplicates.length <= 1) {
                return { success: false, error: 'No duplicate relationships found to remove' };
            }
            
            // Keep the first occurrence, remove the rest
            const toRemove = duplicates.slice(1);
            let updatedContent = content;
            
            // Remove duplicates in reverse order to maintain indices
            toRemove.reverse().forEach(duplicate => {
                console.log('🔧 DEBUG: Removing duplicate relationship:', duplicate.fullMatch.trim());
                const beforeRemoval = updatedContent.substring(0, duplicate.startIndex);
                const afterRemoval = updatedContent.substring(duplicate.endIndex);
                updatedContent = beforeRemoval + afterRemoval;
            });
            
            // Clean up any extra whitespace
            updatedContent = updatedContent.replace(/\n\s*\n\s*\n/g, '\n\n');
            
            console.log('🔧 DEBUG: Successfully removed', toRemove.length, 'duplicate relationships');
            
            return {
                success: true,
                content: updatedContent,
                appliedFix: `Removed ${toRemove.length} duplicate relationship(s) for '${relationship}'`
            };
            
        } catch (error) {
            console.error('🔧 ERROR: fixDuplicateRelationship failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Fix self-referencing relationships
     * @param {string} content - ERD content
     * @param {Object} warning - Warning details
     * @returns {Object} Fix result
     */
    fixSelfReferencingRelationship(content, warning) {
        try {
            console.log('🔧 DEBUG: Fixing self-referencing relationship:', warning.relationship);
            
            // Extract entity name from warning message
            // Message: "Self-referencing relationship detected in entity 'Employee'."
            const entityMatch = warning.message.match(/entity '([^']+)'/);
            if (!entityMatch) {
                return { success: false, error: 'Could not extract entity name from warning message' };
            }
            
            const entityName = entityMatch[1];
            console.log('🔧 DEBUG: Entity with self-reference:', entityName);
            
            // Show all lines containing the entity name for debugging
            const contentLines = content.split('\n');
            const entityLines = contentLines.filter(line => line.includes(entityName));
            console.log('🔧 DEBUG: All lines containing', entityName, ':', entityLines);
            
            // More flexible pattern to match various Mermaid relationship syntaxes
            // This pattern handles: ||--o{, ||--||, ||--o|, |{--||, etc.
            const selfRefPattern = new RegExp(`\\s*${entityName}\\s+\\|[\\|\\{o]*--[o\\{\\|]*\\s*${entityName}\\s*:[^\\n]*`, 'g');
            console.log('🔧 DEBUG: Self-ref pattern:', selfRefPattern.toString());
            console.log('🔧 DEBUG: Content length:', content.length);
            
            const match = selfRefPattern.exec(content);
            console.log('🔧 DEBUG: Regex match result:', match);
            
            if (!match) {
                // Try to find any relationship involving this entity for debugging
                const anyRelPattern = new RegExp(`${entityName}[^\\n]*`, 'g');
                const anyMatches = [];
                let anyMatch;
                while ((anyMatch = anyRelPattern.exec(content)) !== null) {
                    anyMatches.push(anyMatch[0]);
                }
                console.log('🔧 DEBUG: Any relationships involving', entityName, ':', anyMatches);
                return { success: false, error: `Self-referencing relationship not found for entity ${entityName}` };
            }
            
            console.log('🔧 DEBUG: Found self-referencing relationship:', match[0].trim());
            
            // Option 1: Remove the self-referencing relationship entirely
            // This is the safest fix as self-references can be complex in database design
            const updatedContent = content.replace(match[0], '');
            
            // Clean up any extra whitespace
            const cleanedContent = updatedContent.replace(/\n\s*\n\s*\n/g, '\n\n');
            
            console.log('🔧 DEBUG: Successfully removed self-referencing relationship');
            
            return {
                success: true,
                content: cleanedContent,
                appliedFix: `Removed self-referencing relationship in entity '${entityName}' (requires manual review for proper hierarchical design)`
            };
            
        } catch (error) {
            console.error('🔧 ERROR: fixSelfReferencingRelationship failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Fix many-to-many relationships by converting to junction table pattern
     * @param {string} content - ERD content
     * @param {Object} warning - Warning details
     * @returns {Object} Fix result
     */
    fixManyToMany(content, warning) {
        if (!warning.fixData) {
            return { success: false, error: 'Fix data not provided' };
        }

        const { fromEntity, toEntity } = warning.fixData;
        const junctionTableName = `${fromEntity}_${toEntity}`;

        // Find and replace the many-to-many relationship
        const manyToManyPattern = new RegExp(`${fromEntity}\\s+}[o-]+{\\s+${toEntity}[^\\n]*`, 'g');
        
        // Create junction table and new relationships
        const junctionTable = `
    ${junctionTableName} {
        string id PK "Primary identifier"
        string ${fromEntity.toLowerCase()}_id FK "Foreign key to ${fromEntity}"
        string ${toEntity.toLowerCase()}_id FK "Foreign key to ${toEntity}"
    }`;

        const newRelationships = `
    ${fromEntity} ||--o{ ${junctionTableName} : "has"
    ${toEntity} ||--o{ ${junctionTableName} : "has"`;

        const updatedContent = content.replace(manyToManyPattern, junctionTable + newRelationships);

        return {
            success: true,
            content: updatedContent,
            appliedFix: `Converted many-to-many relationship to junction table pattern: ${junctionTableName}`
        };
    }

    /**
     * Fix status column warnings by removing status columns and converting choice columns to valid Mermaid syntax
     * @param {string} content - ERD content
     * @param {Object} warning - Warning details
     * @returns {Object} Fix result
     */
    fixStatusColumn(content, warning) {
        try {
            console.log('🔧 DEBUG: Fixing status column warning:', warning.message);
            
            // Extract entity name from warning message
            // Message: "Entity 'Customer' contains 'status' columns which will be ignored..."
            const entityMatch = warning.message.match(/Entity '([^']+)'/);
            if (!entityMatch) {
                return { success: false, error: 'Could not extract entity name from warning message' };
            }
            
            const entityName = entityMatch[1];
            console.log('🔧 DEBUG: Entity with status column:', entityName);
            
            let updatedContent = content;
            let fixApplied = false;
            let fixMessages = [];
            
            // Pattern 1: Remove simple string status columns
            const stringStatusPattern = new RegExp(`(\\s*${entityName}\\s*\\{[^}]*?)\\s*string\\s+status[^\\n]*\\n`, 'g');
            if (stringStatusPattern.test(content)) {
                updatedContent = updatedContent.replace(stringStatusPattern, '$1\n');
                fixApplied = true;
                fixMessages.push('Removed string status column');
                console.log('🔧 DEBUG: Removed string status column');
            }
            
            // Pattern 2: Convert choice status columns to string (for valid Mermaid syntax)
            const choiceStatusPattern = new RegExp(`(\\s*${entityName}\\s*\\{[^}]*?)\\s*choice\\([^)]+\\)\\s+status\\s*("[^"]*")?[^\\n]*\\n`, 'g');
            const choiceMatches = [...content.matchAll(choiceStatusPattern)];
            
            if (choiceMatches.length > 0) {
                for (const match of choiceMatches) {
                    const description = match[2] || '"Status field"';
                    const replacement = `${match[1]}        string status ${description}\n`;
                    updatedContent = updatedContent.replace(match[0], replacement);
                    fixApplied = true;
                    fixMessages.push('Converted choice status column to string for valid Mermaid syntax');
                    console.log('🔧 DEBUG: Converted choice status column to string');
                }
            }
            
            // Pattern 3: Fix any other choice columns that might cause Mermaid parsing issues
            const allChoicePattern = new RegExp(`(choice\\([^)]+\\))\\s+(\\w+)\\s*("[^"]*")?`, 'g');
            const allChoiceMatches = [...updatedContent.matchAll(allChoicePattern)];
            
            if (allChoiceMatches.length > 0) {
                for (const match of allChoiceMatches) {
                    const fieldName = match[2];
                    const description = match[3] || `"${fieldName} field"`;
                    const replacement = `string ${fieldName} ${description}`;
                    updatedContent = updatedContent.replace(match[0], replacement);
                    fixApplied = true;
                    fixMessages.push(`Converted choice column '${fieldName}' to string for valid Mermaid syntax`);
                    console.log('🔧 DEBUG: Converted choice column to string:', fieldName);
                }
            }
            
            if (!fixApplied) {
                return { success: false, error: `No status or choice columns found in entity ${entityName}` };
            }
            
            // Clean up any extra whitespace
            updatedContent = updatedContent.replace(/\n\s*\n\s*\n/g, '\n\n');
            
            console.log('🔧 DEBUG: Successfully applied status/choice column fixes');
            
            return {
                success: true,
                content: updatedContent,
                appliedFix: `Fixed entity '${entityName}': ${fixMessages.join(', ')} (Choice columns should be created manually in Dataverse)`
            };
            
        } catch (error) {
            console.error('🔧 ERROR: fixStatusColumn failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Fix choice column syntax issues by converting to valid Mermaid syntax
     * @param {string} content - ERD content
     * @param {Object} warning - Warning details
     * @returns {Object} Fix result
     */
    fixChoiceColumns(content, warning) {
        try {
            console.log('🔧 DEBUG: Fixing choice column syntax:', warning.message);
            
            let updatedContent = content;
            let fixApplied = false;
            let fixMessages = [];
            
            // Find all choice columns that might cause Mermaid parsing issues
            const choicePattern = new RegExp(`choice\\([^)]+\\)\\s+(\\w+)\\s*("[^"]*")?`, 'g');
            const choiceMatches = [...content.matchAll(choicePattern)];
            
            if (choiceMatches.length > 0) {
                for (const match of choiceMatches) {
                    const fieldName = match[1];
                    const description = match[2] || `"${fieldName} field"`;
                    const replacement = `string ${fieldName} ${description}`;
                    updatedContent = updatedContent.replace(match[0], replacement);
                    fixApplied = true;
                    fixMessages.push(`Converted choice column '${fieldName}' to string`);
                    console.log('🔧 DEBUG: Converted choice column to string:', fieldName);
                }
            }
            
            if (!fixApplied) {
                return { success: false, error: 'No choice columns found to fix' };
            }
            
            console.log('🔧 DEBUG: Successfully converted choice columns to valid Mermaid syntax');
            
            return {
                success: true,
                content: updatedContent,
                appliedFix: `Fixed choice column syntax: ${fixMessages.join(', ')} (Choice columns should be created manually in Dataverse)`
            };
            
        } catch (error) {
            console.error('🔧 ERROR: fixChoiceColumns failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Fix invalid relationship names by sanitizing them
     * @param {string} content - ERD content
     * @param {Object} warning - Warning object
     * @returns {Object} Fix result
     */
    fixInvalidRelationshipName(content, warning) {
        console.log('🔧 DEBUG: fixInvalidRelationshipName called with:', {
            warningType: warning.type,
            relationship: warning.relationship,
            details: warning.details
        });

        try {
            let updatedContent = content;
            const relationshipText = warning.relationship || warning.details?.relationship;
            
            if (!relationshipText) {
                console.log('🔧 No relationship text found in warning');
                return { success: false, error: 'No relationship information found' };
            }

            // Extract entities from relationship text (e.g., "Location → Event")
            const relationshipMatch = relationshipText.match(/(\w[\w\s]*?)\s*[→-]\s*(\w[\w\s]*?)$/);
            if (!relationshipMatch) {
                console.log('🔧 Could not parse relationship:', relationshipText);
                return { success: false, error: 'Could not parse relationship format' };
            }

            const [, fromEntity, toEntity] = relationshipMatch;
            console.log('🔧 Parsed relationship:', { fromEntity, toEntity });

            // Sanitize entity names (remove invalid characters, ensure valid Mermaid names)
            const sanitizedFromEntity = this.sanitizeEntityName(fromEntity.trim());
            const sanitizedToEntity = this.sanitizeEntityName(toEntity.trim());

            console.log('🔧 Sanitized entities:', { 
                from: `${fromEntity} → ${sanitizedFromEntity}`, 
                to: `${toEntity} → ${sanitizedToEntity}` 
            });

            // Find and replace the relationship in the content
            const relationshipPattern = new RegExp(
                `${this.escapeRegExp(fromEntity)}\\s*[→{}-]\\s*${this.escapeRegExp(toEntity)}`,
                'gi'
            );

            const replacement = `${sanitizedFromEntity} }|--|| ${sanitizedToEntity}`;
            updatedContent = updatedContent.replace(relationshipPattern, replacement);

            // Also check for any entity declarations that need updating
            if (sanitizedFromEntity !== fromEntity) {
                const fromEntityPattern = new RegExp(`^\\s*${this.escapeRegExp(fromEntity)}\\s*\\{`, 'gm');
                updatedContent = updatedContent.replace(fromEntityPattern, `    ${sanitizedFromEntity} {`);
            }

            if (sanitizedToEntity !== toEntity) {
                const toEntityPattern = new RegExp(`^\\s*${this.escapeRegExp(toEntity)}\\s*\\{`, 'gm');
                updatedContent = updatedContent.replace(toEntityPattern, `    ${sanitizedToEntity} {`);
            }

            console.log('🔧 Fixed invalid relationship name');
            return {
                success: true,
                content: updatedContent,
                appliedFix: `Fixed relationship name: "${relationshipText}" → "${sanitizedFromEntity} }|--|| ${sanitizedToEntity}"`
            };

        } catch (error) {
            console.error('🔧 ERROR: fixInvalidRelationshipName failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Fix general Mermaid syntax issues in content
     * @param {string} content - ERD content
     * @returns {string} Fixed content with valid Mermaid syntax
     */
    fixMermaidSyntax(content) {
        let fixedContent = content;
        
        // Fix choice columns that cause Mermaid parsing errors
        // Convert choice(option1,option2) fieldname to string fieldname
        const choicePattern = /choice\([^)]+\)\s+(\w+)(\s*"[^"]*")?/g;
        fixedContent = fixedContent.replace(choicePattern, (match, fieldName, description) => {
            const desc = description || ` "${fieldName} field"`;
            return `string ${fieldName}${desc}`;
        });
        
        return fixedContent;
    }

    /**
     * Fix entity naming issues
     * @param {string} content - ERD content
     * @param {Object} warning - Warning details
     * @returns {Object} Fix result
     */
    fixEntityNaming(content, warning) {
        if (!warning.fixData) {
            return { success: false, error: 'Fix data not provided' };
        }

        const { originalName, suggestedName } = warning.fixData;
        
        // Replace entity name in entity definition
        const entityPattern = new RegExp(`\\b${originalName}\\s*\\{`, 'g');
        let updatedContent = content.replace(entityPattern, `${suggestedName} {`);
        
        // Replace entity name in relationships
        const relationshipPattern1 = new RegExp(`\\b${originalName}\\s+([|}{o-]+)\\s+`, 'g');
        const relationshipPattern2 = new RegExp(`\\s+([|}{o-]+)\\s+${originalName}\\b`, 'g');
        
        updatedContent = updatedContent.replace(relationshipPattern1, `${suggestedName} $1 `);
        updatedContent = updatedContent.replace(relationshipPattern2, ` $1 ${suggestedName}`);

        return {
            success: true,
            content: updatedContent,
            appliedFix: `Renamed entity '${originalName}' to '${suggestedName}'`
        };
    }

    /**
     * Fix attribute naming issues
     * @param {string} content - ERD content
     * @param {Object} warning - Warning details
     * @returns {Object} Fix result
     */
    fixAttributeNaming(content, warning) {
        if (!warning.fixData) {
            return { success: false, error: 'Fix data not provided' };
        }

        const { entityName, originalName, suggestedName } = warning.fixData;
        
        // Find and replace the attribute within the specific entity
        // Pattern matches: EntityName { ... attributeName "description" ... }
        // Escape special regex characters in originalName
        const escapedOriginalName = originalName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const entityPattern = new RegExp(`(${entityName}\\s*\\{[^}]*?)\\s+${escapedOriginalName}(\\s+[^\\n}]*)`, 'gms');
        
        const updatedContent = content.replace(entityPattern, `$1 ${suggestedName}$2`);

        return {
            success: true,
            content: updatedContent,
            appliedFix: `Renamed attribute '${originalName}' to '${suggestedName}' in entity '${entityName}'`
        };
    }

    /**
     * Fix reserved word usage
     * @param {string} content - ERD content
     * @param {Object} warning - Warning details
     * @returns {Object} Fix result
     */
    fixReservedWord(content, warning) {
        if (!warning.fixData) {
            return { success: false, error: 'Fix data not provided' };
        }

        if (warning.entity && !warning.attribute) {
            // Entity reserved word
            return this.fixEntityNaming(content, warning);
        } else if (warning.entity && warning.attribute) {
            // Attribute reserved word
            return this.fixAttributeNaming(content, warning);
        }

        return { success: false, error: 'Unable to determine reserved word context' };
    }

    /**
     * Update autoFixable flag for warnings based on CDM entity status
     * CDM entities should not be auto-fixed, only custom entities
     * @param {Array} warnings - Array of warnings to update
     * @param {Array} entities - Array of entities with isCdm flags
     * @returns {Array} Updated warnings
     */
    updateAutoFixableForCDMEntities(warnings, entities) {
        // Create a map of entity names to their CDM status
        const entityCDMStatus = new Map();
        entities.forEach(entity => {
            entityCDMStatus.set(entity.name, entity.isCdm || false);
        });

        // Update warnings to disable autoFixable for CDM entities
        return warnings.map(warning => {
            if (!warning.autoFixable) {
                // If already not auto-fixable, leave as is
                return warning;
            }

            // Check if this warning relates to a CDM entity
            let isCdmRelated = false;
            
            // Check warning.entity (direct entity reference)
            if (warning.entity && entityCDMStatus.has(warning.entity)) {
                isCdmRelated = entityCDMStatus.get(warning.entity);
            }
            
            // Check warning.fixData.entityName (fix data entity reference)
            if (!isCdmRelated && warning.fixData?.entityName && entityCDMStatus.has(warning.fixData.entityName)) {
                isCdmRelated = entityCDMStatus.get(warning.fixData.entityName);
            }

            // If this warning relates to a CDM entity, disable auto-fixing
            if (isCdmRelated) {
                return {
                    ...warning,
                    autoFixable: false,
                    message: warning.message + ' [CDM entity - cannot be auto-fixed]'
                };
            }

            return warning;
        });
    }

    /**
     * Escape special regex characters in a string
     * @param {string} string - String to escape
     * @returns {string} Escaped string
     */
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Perform basic CDM detection when advanced detection is unavailable
     * @param {Array} entities - Array of entities to check
     * @returns {Object} CDM detection result
     */
    performBasicCDMDetection(entities) {
        return {
            matches: [],
            detectedCDM: [],
            totalEntities: entities.length,
            cdmEntities: 0,
            customEntities: entities.length,
            confidence: 'low'
        };
    }
}

module.exports = { ValidationService };
