/**
 * Dataverse Extractor Service
 * Handles reverse engineering of Dataverse solutions to Mermaid ERD format
 */

const { BaseService } = require('./base-service');

class DataverseExtractorService extends BaseService {
    constructor(dependencies = {}) {
        super();
        this.dataverseRepository = dependencies.dataverseRepository;
        this.configurationRepository = dependencies.configurationRepository;
        this.logger = dependencies.logger || console;
    }

    /**
     * Extract solution metadata and entities from Dataverse environment
     * @param {Object} connection - Connection details
     * @param {string} connection.environmentUrl - Dataverse environment URL
     * @param {string} [connection.solutionName] - Optional solution name filter
     * @param {string} [connection.authMethod] - Authentication method (managedIdentity, oauth, connectionString)
     * @returns {Promise<Object>} Extracted solution data
     */
    async extractSolution(connection) {
        this.log('extractSolution', { environmentUrl: connection.environmentUrl, solutionName: connection.solutionName });

        try {
            // Validate connection parameters
            this.validateConnection(connection);

            // Get Dataverse client instance
            const client = await this.getDataverseClient(connection);

            // Extract entities and metadata
            const entities = await this.extractEntities(client, connection.solutionName);
            const relationships = await this.extractRelationships(client, entities);
            const solutionMetadata = await this.extractSolutionMetadata(client, connection.solutionName);

            // 🔍 DEBUG OUTPUT: Write to file
            try {
                const fs = require('fs');
                const path = require('path');
                const logsDir = path.join(__dirname, '../../logs');
                
                // Ensure logs directory exists
                if (!fs.existsSync(logsDir)) {
                    fs.mkdirSync(logsDir, { recursive: true });
                }
                
                const debugFilePath = path.join(logsDir, 'extraction-debug.txt');
                
                let output = '\n' + '='.repeat(80) + '\n';
                output += '🔍 EXTRACTION DEBUG OUTPUT - ' + new Date().toISOString() + '\n';
                output += '='.repeat(80) + '\n';
                output += '\n📊 EXTRACTED TABLES:\n';
                output += `   Total: ${entities.length}\n`;
                entities.forEach((entity, idx) => {
                    output += `\n  ${idx + 1}. ${entity.logicalName.toUpperCase()}\n`;
                    output += `     Display Name: ${entity.displayName}\n`;
                    output += `     Primary Key: ${entity.primaryIdAttribute}\n`;
                    output += `     Attributes: ${entity.attributes.length}\n`;
                    const fkAttrs = entity.attributes.filter(a => a.isForeignKey);
                    if (fkAttrs.length > 0) {
                        output += `     Foreign Keys: ${fkAttrs.map(a => a.logicalName).join(', ')}\n`;
                    }
                    output += '     All Attributes:\n';
                    entity.attributes.forEach((attr, attrIdx) => {
                        const markers = [];
                        if (attr.isPrimaryKey) markers.push('PK');
                        if (attr.isForeignKey) markers.push('FK');
                        const markerStr = markers.length > 0 ? ` [${markers.join(', ')}]` : '';
                        output += `       ${attrIdx + 1}. ${attr.logicalName} (${attr.dataType})${markerStr}\n`;
                    });
                });
                
                output += '\n📊 EXTRACTED RELATIONSHIPS:\n';
                output += `   Total: ${relationships.length}\n`;
                relationships.forEach((rel, idx) => {
                    output += `\n  ${idx + 1}. ${rel.fromEntity} → ${rel.toEntity}\n`;
                    output += `     Type: ${rel.type}\n`;
                    output += `     Label: ${rel.label}\n`;
                    output += `     Schema: ${rel.schemaName}\n`;
                    output += `     From Attribute: ${rel.fromAttribute}\n`;
                    output += `     To Attribute: ${rel.toAttribute}\n`;
                });
                output += '\n' + '='.repeat(80) + '\n';
                
                fs.writeFileSync(debugFilePath, output, 'utf8');
                console.log(`\n✅ Extraction debug written to: ${debugFilePath}`);
                console.log(`   Tables: ${entities.length}, Relationships: ${relationships.length}\n`);
            } catch (err) {
                console.error('❌ Failed to write debug file:', err.message);
            }

            // Detect CDM entities
            const entitiesWithCdmInfo = this.detectCdmEntities(entities);

            // Filter attributes for CDM entities - only keep PK and FK columns
            entitiesWithCdmInfo.forEach(entity => {
                if (entity.isCdm) {
                    const originalCount = entity.attributes.length;
                    entity.attributes = entity.attributes.filter(attr => 
                        attr.isPrimaryKey || attr.isForeignKey
                    );
                    console.log(`📋 CDM Entity ${entity.logicalName}: Filtered attributes from ${originalCount} to ${entity.attributes.length} (PK + FK only)`);
                }
            });

            // Detect publisher prefix from custom entities
            const publisherPrefix = this.detectPublisherPrefix(entitiesWithCdmInfo);

            // Generate Mermaid ERD
            const erdContent = this.generateMermaidERD(entitiesWithCdmInfo, relationships);

            const result = {
                erdContent,
                metadata: {
                    solutionName: solutionMetadata.name || 'Extracted Solution',
                    publisher: solutionMetadata.publisher || 'Unknown Publisher',
                    publisherPrefix: publisherPrefix,
                    version: solutionMetadata.version || '1.0.0.0',
                    description: solutionMetadata.description || 'Reverse engineered from Dataverse',
                    extractedAt: new Date().toISOString(),
                    entities: entitiesWithCdmInfo.length,
                    relationships: relationships.length,
                    cdmEntities: entitiesWithCdmInfo.filter(e => e.isCdm).length,
                    customEntities: entitiesWithCdmInfo.filter(e => !e.isCdm).length
                }
            };

            this.log('extractSolution completed', { 
                entities: result.metadata.entities, 
                relationships: result.metadata.relationships,
                cdmEntities: result.metadata.cdmEntities 
            });

            return result;

        } catch (error) {
            this.error('extractSolution failed', error);
            throw new Error(`Failed to extract Dataverse solution: ${error.message}`);
        }
    }

    /**
     * Extract entities from Dataverse
     * @param {Object} client - Dataverse client
     * @param {string} [solutionName] - Optional solution filter
     * @returns {Promise<Array>} Array of entity definitions
     */
    async extractEntities(client, solutionName) {
        this.log('extractEntities', { solutionName });

        try {
            let entityDefinitions = [];

            if (solutionName) {
                // Get entities that are part of the specified solution
                entityDefinitions = await this.getEntitiesFromSolution(client, solutionName);
            } else {
                // Get all valid entities if no solution specified
                const entitiesQuery = `/EntityDefinitions?$select=LogicalName,DisplayName,PrimaryIdAttribute,PrimaryNameAttribute,Description,IsCustomEntity&$filter=IsValidForAdvancedFind eq true and IsCustomEntity eq true`;
                
                console.log('🔍 DEBUG: About to call client._req with:', {
                    entitiesQuery,
                    clientType: typeof client,
                });

                const response = await client._req('get', entitiesQuery);

                entityDefinitions = response.data.value || [];
            }

            this.log('Entity definitions retrieved', { count: entityDefinitions.length });

            // Extract detailed entity information including attributes
            const entities = [];
            for (const entityDef of entityDefinitions) {
                try {
                    const entity = await this.extractEntityDetails(client, entityDef);
                    entities.push(entity);
                } catch (error) {
                    this.error(`Failed to extract entity details for ${entityDef.LogicalName}`, error);
                    // Continue with other entities
                }
            }

            return entities;

        } catch (error) {
            this.error('extractEntities failed', error);
            throw error;
        }
    }

    /**
     * Get entities that are part of a specific solution
     * @param {Object} client - Dataverse client
     * @param {string} solutionName - Solution unique name
     * @returns {Promise<Array>} Array of entity definitions from the solution
     */
    async getEntitiesFromSolution(client, solutionName) {
        this.log('getEntitiesFromSolution', { solutionName });

        try {
            // First, get the solution ID
            const solutionQuery = `/solutions?$select=solutionid,uniquename&$filter=uniquename eq '${solutionName}'`;
            const solutionResponse = await client._req('get', solutionQuery);

            console.log('🔍 DEBUG: solutionResponse structure:', {
                type: typeof solutionResponse,
                keys: Object.keys(solutionResponse || {}),
                hasData: !!solutionResponse?.data,
                dataType: typeof solutionResponse?.data,
                dataKeys: solutionResponse?.data ? Object.keys(solutionResponse.data) : 'no data',
                response: solutionResponse
            });

            const solutions = solutionResponse?.data?.value || solutionResponse?.value || [];
            if (solutions.length === 0) {
                throw new Error(`Solution '${solutionName}' not found`);
            }

            const solutionId = solutions[0].solutionid;
            this.log('Found solution', { solutionId, solutionName });

            // Get solution components that are entities (componenttype = 1)
            console.log('🔧 DEBUG: About to query with _solutionid_value field - FIX APPLIED');
            const componentsQuery = `/solutioncomponents?$select=objectid&$filter=_solutionid_value eq ${solutionId} and componenttype eq 1`;
            const componentsResponse = await client._req('get', componentsQuery);

            console.log('🔍 DEBUG: componentsResponse structure:', {
                type: typeof componentsResponse,
                keys: Object.keys(componentsResponse || {}),
                hasData: !!componentsResponse?.data,
                dataType: typeof componentsResponse?.data,
                dataKeys: componentsResponse?.data ? Object.keys(componentsResponse.data) : 'no data',
                response: componentsResponse
            });

            const components = componentsResponse?.data?.value || componentsResponse?.value || [];
            const entityIds = components.map(c => c.objectid);
            
            if (entityIds.length === 0) {
                this.log('No entities found in solution', { solutionName });
                return [];
            }

            this.log('Found solution entities', { count: entityIds.length });

            console.log('🔧 DEBUG: Entity IDs found:', entityIds);

            // Get entity definitions for these specific entities
            const entityLogicalNames = [];
            for (const entityId of entityIds) {
                try {
                    console.log('🔧 DEBUG: Fetching entity definition for:', entityId);
                    const entityQuery = `/EntityDefinitions(${entityId})?$select=LogicalName,DisplayName,PrimaryIdAttribute,PrimaryNameAttribute,Description,IsCustomEntity`;
                    const entityResponse = await client._req('get', entityQuery);

                    // The entity data might be in different places depending on the client implementation
                    const entityData = entityResponse.data || entityResponse;
                    
                    console.log('🔧 DEBUG: Entity response for', entityId, ':', {
                        hasData: !!entityData,
                        hasLogicalName: !!entityData?.LogicalName,
                        logicalName: entityData?.LogicalName,
                        isCustom: entityData?.IsCustomEntity
                    });

                    if (entityData && entityData.LogicalName) {
                        entityLogicalNames.push(entityData);
                        console.log('✅ Added entity:', entityData.LogicalName, 'IsCustom:', entityData.IsCustomEntity);
                    } else {
                        console.log('❌ No valid entity data found for:', entityId);
                    }
                } catch (error) {
                    console.log('❌ Failed to get entity definition for', entityId, ':', error.message);
                    this.log('Failed to get entity definition', { entityId, error: error.message });
                    // Continue with other entities
                }
            }

            return entityLogicalNames;

        } catch (error) {
            this.error('getEntitiesFromSolution failed', error);
            throw error;
        }
    }

    async getEntitiesIndividually(client, entityIds) {
        const entityLogicalNames = [];
        for (const entityId of entityIds) {
            try {
                console.log('🔧 DEBUG: Fetching individual entity definition for:', entityId);
                const entityQuery = `/EntityDefinitions(${entityId})?$select=LogicalName,DisplayName,PrimaryIdAttribute,PrimaryNameAttribute,Description,IsCustomEntity`;
                const entityResponse = await client._req('get', entityQuery);

                // The entity data might be in different places depending on the client implementation
                const entityData = entityResponse.data || entityResponse;
                
                if (entityData && entityData.LogicalName) {
                    entityLogicalNames.push(entityData);
                    console.log('✅ Added individual entity:', entityData.LogicalName, 'IsCustom:', entityData.IsCustomEntity);
                } else {
                    console.log('❌ No valid entity data found for:', entityId, 'Response:', entityResponse);
                }
            } catch (error) {
                console.log('❌ Failed to get individual entity definition for', entityId, ':', error.message);
                // Continue with other entities
            }
        }
        return entityLogicalNames;
    }

    /**
     * Extract detailed entity information including attributes
     * @param {Object} client - Dataverse client
     * @param {Object} entityDef - Entity definition
     * @returns {Promise<Object>} Detailed entity information
     */
    async extractEntityDetails(client, entityDef) {
        try {
            // Get entity attributes with AttributeTypeName to detect lookups
            const attributesQuery = `/EntityDefinitions(LogicalName='${entityDef.LogicalName}')/Attributes?$select=LogicalName,DisplayName,AttributeType,AttributeTypeName,IsPrimaryId,IsPrimaryName,RequiredLevel,Description`;
            const attributesResponse = await client._req('get', attributesQuery);
            const attributes = attributesResponse.value || [];
            
            console.log(`🔍 ATTRIBUTES DEBUG: Entity ${entityDef.LogicalName} has ${attributes.length} total attributes`);

            // Process attributes - filter out system columns, prioritize FK/PK, then limit
            const filtered = attributes.filter(attr => !this.isSystemColumn(attr.LogicalName));
            
            // Separate FKs/PKs from regular attributes
            const fksAndPks = filtered.filter(attr => 
                attr.IsPrimaryId || 
                attr.IsPrimaryName ||
                attr.AttributeType === 'Lookup' ||
                attr.AttributeTypeName?.Value === 'LookupType' ||
                attr.AttributeType === 'Customer' ||
                attr.AttributeType === 'Owner'
            );
            
            const regularAttrs = filtered.filter(attr => 
                !attr.IsPrimaryId && 
                !attr.IsPrimaryName &&
                attr.AttributeType !== 'Lookup' &&
                attr.AttributeTypeName?.Value !== 'LookupType' &&
                attr.AttributeType !== 'Customer' &&
                attr.AttributeType !== 'Owner'
            );
            
            // Prioritize FKs/PKs, then take remaining regular attributes
            const prioritizedAttributes = [
                ...fksAndPks,
                ...regularAttrs.slice(0, Math.max(0, 20 - fksAndPks.length))
            ];
            
            console.log(`🔍 ATTRIBUTES DEBUG: ${entityDef.LogicalName} - Total: ${attributes.length}, After system filter: ${filtered.length}, FKs/PKs: ${fksAndPks.length}, Final: ${prioritizedAttributes.length}`);
            
            const processedAttributes = prioritizedAttributes
                .map(attr => {
                    // Log attribute type for debugging
                    if (attr.LogicalName.includes('id') && !attr.IsPrimaryId) {
                        console.log(`  🔍 Potential FK attribute: ${attr.LogicalName}`, {
                            AttributeType: attr.AttributeType,
                            AttributeTypeName: attr.AttributeTypeName
                        });
                    }
                    
                    // Check if this is a lookup field (foreign key)
                    const isLookup = attr.AttributeType === 'Lookup' || 
                                   attr.AttributeTypeName?.Value === 'LookupType' ||
                                   attr.AttributeType === 'Customer' ||
                                   attr.AttributeType === 'Owner';
                    
                    if (isLookup) {
                        console.log(`🔑 FK DEBUG: Found foreign key in ${entityDef.LogicalName}:`, {
                            attribute: attr.LogicalName,
                            type: attr.AttributeType,
                            typeName: attr.AttributeTypeName?.Value
                        });
                    }
                    
                    return {
                        logicalName: attr.LogicalName,
                        displayName: attr.DisplayName?.UserLocalizedLabel?.Label || attr.LogicalName,
                        dataType: this.mapDataverseTypeToMermaid(attr.AttributeType),
                        isPrimaryKey: attr.IsPrimaryId || false,
                        isPrimaryName: attr.IsPrimaryName || false,
                        isForeignKey: isLookup,
                        required: attr.RequiredLevel?.Value === 'ApplicationRequired',
                        description: attr.Description?.UserLocalizedLabel?.Label || ''
                    };
                });

            return {
                logicalName: entityDef.LogicalName,
                displayName: entityDef.DisplayName?.UserLocalizedLabel?.Label || entityDef.LogicalName,
                description: entityDef.Description?.UserLocalizedLabel?.Label || '',
                isCustomEntity: entityDef.IsCustomEntity || false,
                primaryIdAttribute: entityDef.PrimaryIdAttribute,
                primaryNameAttribute: entityDef.PrimaryNameAttribute,
                attributes: processedAttributes,
                isCdm: false // Will be set by CDM detection
            };

        } catch (error) {
            this.error(`extractEntityDetails failed for ${entityDef.LogicalName}`, error);
            throw error;
        }
    }

    /**
     * Extract relationships between entities
     * @param {Object} client - Dataverse client
     * @param {Array} entities - Array of entities
     * @returns {Promise<Array>} Array of relationships
     */
    async extractRelationships(client, entities) {
        this.log('extractRelationships', { entityCount: entities.length });

        try {
            const relationships = [];
            const entityNames = entities.map(e => e.logicalName);
            
            console.log('🔍 RELATIONSHIP DEBUG: Starting relationship extraction for entities:', entityNames);
            
            // Get OneToManyRelationships for each entity
            for (const entity of entities) {
                try {
                    console.log(`🔍 RELATIONSHIP DEBUG: Fetching relationships for entity: ${entity.logicalName}`);
                    const relationshipsQuery = `/EntityDefinitions(LogicalName='${entity.logicalName}')/OneToManyRelationships?$select=SchemaName,ReferencedEntity,ReferencedAttribute,ReferencingEntity,ReferencingAttribute,RelationshipType`;
                    const response = await client._req('get', relationshipsQuery);
                    const relationshipDefs = response.value || [];
                    
                    console.log(`🔍 RELATIONSHIP DEBUG: Found ${relationshipDefs.length} raw relationships for ${entity.logicalName}`);

                    // Filter relationships that involve our extracted entities
                    for (const rel of relationshipDefs) {
                        // Skip self-referencing relationships
                        if (rel.ReferencedEntity === rel.ReferencingEntity) {
                            console.log('⏭️  RELATIONSHIP DEBUG: Skipping self-referencing relationship:', {
                                entity: rel.ReferencedEntity,
                                schema: rel.SchemaName
                            });
                            continue;
                        }
                        
                        const isRelevant = entityNames.includes(rel.ReferencedEntity) && entityNames.includes(rel.ReferencingEntity);
                        
                        if (isRelevant) {
                            const relationship = {
                                type: 'one-to-many',
                                fromEntity: rel.ReferencedEntity,
                                toEntity: rel.ReferencingEntity,
                                fromAttribute: rel.ReferencedAttribute,
                                toAttribute: rel.ReferencingAttribute,
                                schemaName: rel.SchemaName,
                                label: this.generateRelationshipLabel(rel)
                            };
                            relationships.push(relationship);
                            
                            console.log('✅ RELATIONSHIP DEBUG: Added relationship:', {
                                from: `${rel.ReferencedEntity}.${rel.ReferencedAttribute}`,
                                to: `${rel.ReferencingEntity}.${rel.ReferencingAttribute}`,
                                schema: rel.SchemaName,
                                label: relationship.label
                            });
                        }
                    }
                } catch (error) {
                    console.log(`❌ RELATIONSHIP DEBUG: Failed to get relationships for ${entity.logicalName}:`, error.message);
                    this.log(`Failed to get relationships for ${entity.logicalName}`, { error: error.message });
                    // Continue with other entities
                }
            }

            // Remove duplicate relationships - keep only ONE relationship between any two entities
            // Deduplicate based on entity pair (fromEntity-toEntity), regardless of how many FKs exist
            const uniqueRelationships = [];
            const seenPairs = new Set();
            
            for (const rel of relationships) {
                // Create a unique key based on entity pair (bidirectional: A-B and B-A are the same)
                const pairKey = [rel.fromEntity, rel.toEntity].sort().join('-');
                
                if (!seenPairs.has(pairKey)) {
                    seenPairs.add(pairKey);
                    // Change all relationship labels to "relates to"
                    rel.label = 'relates to';
                    uniqueRelationships.push(rel);
                    console.log('✅ Keeping relationship:', {
                        from: rel.fromEntity,
                        to: rel.toEntity,
                        label: rel.label
                    });
                } else {
                    console.log('🗑️  RELATIONSHIP DEBUG: Removing duplicate relationship:', {
                        schema: rel.schemaName,
                        from: rel.fromEntity,
                        to: rel.toEntity,
                        reason: 'Entity pair already exists'
                    });
                }
            }

            console.log(`🎯 RELATIONSHIP DEBUG: Total relationships: ${relationships.length}, After deduplication: ${uniqueRelationships.length}`);
            console.log('📋 RELATIONSHIP DEBUG: Final relationships list:', JSON.stringify(uniqueRelationships, null, 2));
            
            this.log('Relationships extracted', { count: uniqueRelationships.length });
            return uniqueRelationships;

        } catch (error) {
            this.error('extractRelationships failed', error);
            // Return empty array rather than failing completely
            return [];
        }
    }

    /**
     * Extract solution metadata
     * @param {Object} client - Dataverse client
     * @param {string} [solutionName] - Solution name
     * @returns {Promise<Object>} Solution metadata
     */
    async extractSolutionMetadata(client, solutionName) {
        try {
            if (!solutionName) {
                return {
                    name: 'All Entities',
                    publisher: 'Multiple Publishers',
                    version: '1.0.0.0',
                    description: 'All entities from Dataverse environment'
                };
            }

            // Query solution metadata (using correct property names)
            const solutionQuery = `/solutions?$select=friendlyname,version,description&$filter=uniquename eq '${solutionName}'`;
            const response = await client._req('get', solutionQuery);
            
            if (response.value && response.value.length > 0) {
                const solution = response.value[0];
                return {
                    name: solution.friendlyname || solutionName,
                    publisher: 'Solution Publisher', // TODO: Get actual publisher
                    version: solution.version || '1.0.0.0',
                    description: solution.description || ''
                };
            }

            return {
                name: solutionName,
                publisher: 'Unknown Publisher',
                version: '1.0.0.0',
                description: 'Solution metadata not found'
            };

        } catch (error) {
            this.error('extractSolutionMetadata failed', error);
            return {
                name: solutionName || 'Unknown Solution',
                publisher: 'Unknown Publisher',
                version: '1.0.0.0',
                description: 'Failed to extract solution metadata'
            };
        }
    }

    /**
     * Detect CDM entities in the extracted entities
     * @param {Array} entities - Array of entities
     * @returns {Array} Entities with CDM detection information
     */
    detectCdmEntities(entities) {
        // Common CDM entity names
        const cdmEntities = [
            'account', 'contact', 'lead', 'opportunity', 'quote', 'salesorder', 'invoice',
            'incident', 'phonecall', 'email', 'task', 'appointment', 'campaign',
            'product', 'pricelevel', 'systemuser', 'team', 'businessunit',
            'territory', 'subject', 'competitor', 'contract'
        ];

        return entities.map(entity => ({
            ...entity,
            isCdm: cdmEntities.includes(entity.logicalName.toLowerCase()) || !entity.isCustomEntity
        }));
    }

    /**
     * Generate Mermaid ERD from entities and relationships
     * @param {Array} entities - Array of entities
     * @param {Array} relationships - Array of relationships
     * @returns {string} Mermaid ERD content
     */
    generateMermaidERD(entities, relationships) {
        this.log('generateMermaidERD', { entities: entities.length, relationships: relationships.length });
        
        console.log('📊 MERMAID DEBUG: Starting Mermaid generation');
        console.log('📊 MERMAID DEBUG: Relationships to render:', relationships.length);
        relationships.forEach((rel, idx) => {
            console.log(`  Relationship ${idx + 1}:`, JSON.stringify({
                from: rel.fromEntity,
                to: rel.toEntity,
                type: rel.type,
                label: rel.label,
                allProps: Object.keys(rel)
            }, null, 2));
        });

        let mermaid = 'erDiagram\n\n';

        // Add relationship definitions
        console.log('📊 MERMAID DEBUG: About to add relationship lines...');
        relationships.forEach((rel, idx) => {
            // Strip publisher prefixes from relationship entity names
            const fromEntityClean = this.stripPublisherPrefix(rel.fromEntity);
            const toEntityClean = this.stripPublisherPrefix(rel.toEntity);
            const cardinality = rel.type === 'one-to-many' ? '||--o{' : '||--||';
            const line = `    ${fromEntityClean.toUpperCase()} ${cardinality} ${toEntityClean.toUpperCase()} : "${rel.label}"`;
            console.log(`📊 MERMAID DEBUG: Relationship ${idx + 1} line:`, line);
            mermaid += line + '\n';
        });

        console.log('📊 MERMAID DEBUG: Total relationship lines added:', relationships.length);
        if (relationships.length > 0) {
            mermaid += '\n';
        }
        
        console.log('📊 MERMAID DEBUG: Mermaid string so far (first 500 chars):', mermaid.substring(0, 500));

        // Add entity definitions
        entities.forEach(entity => {
            // Strip publisher prefix to prevent double-prefixing in wizard
            const cleanEntityName = this.stripPublisherPrefix(entity.logicalName);
            const entityName = cleanEntityName.toUpperCase();
            const comment = entity.isCdm ? '%% CDM Entity' : '%% Custom Entity';
            
            console.log(`📊 MERMAID DEBUG: Processing entity ${entityName}, attributes:`, entity.attributes.length);
            
            // Add comment on separate line before entity definition
            mermaid += `    ${comment}\n`;
            mermaid += `    ${entityName} {\n`;
            
            entity.attributes.forEach(attr => {
                // Only mark as PK if it matches the entity's primary ID attribute
                const isPrimaryKey = attr.isPrimaryKey && attr.logicalName === entity.primaryIdAttribute;
                const pk = isPrimaryKey ? ' PK' : '';
                const fk = attr.isForeignKey ? ' FK' : '';
                
                // Escape quotes in descriptions to prevent Mermaid syntax errors
                let cleanDescription = attr.description ? attr.description.replace(/"/g, "'") : '';
                
                // Prepend "Required" to description if attribute is required
                if (attr.required && cleanDescription) {
                    cleanDescription = `Required - ${cleanDescription}`;
                } else if (attr.required && !cleanDescription) {
                    cleanDescription = 'Required';
                }
                
                const description = cleanDescription ? ` "${cleanDescription}"` : '';
                
                if (attr.isForeignKey) {
                    console.log(`  🔑 FK attribute: ${attr.logicalName} (${attr.dataType})`);
                }
                
                if (isPrimaryKey) {
                    console.log(`  🔑 PK attribute: ${attr.logicalName}`);
                }
                
                // Strip publisher prefix from attribute name to prevent double-prefixing in wizard
                const cleanAttributeName = this.stripPublisherPrefix(attr.logicalName);
                
                mermaid += `        ${attr.dataType} ${cleanAttributeName}${pk}${fk}${description}\n`;
            });
            
            mermaid += '    }\n\n';
        });

        return mermaid;
    }

    /**
     * Check if a column is a system column that should be filtered out during extraction
     * @param {string} logicalName - The logical name of the attribute
     * @returns {boolean} True if this is a system column that shouldn't be recreated
     */
    isSystemColumn(logicalName) {
        // Standard system columns that are automatically managed by Dataverse
        const systemColumns = [
            // Audit columns
            'createdby',
            'createdbyname',
            'createdon',
            'createdonbehalfby', 
            'createdonbehalfbyname',
            'modifiedby',
            'modifiedbyname',
            'modifiedon',
            'modifiedonbehalfby',
            'modifiedonbehalfbyname',
            
            // Ownership columns
            'ownerid',
            'owneridname',
            'owneridtype',
            'owningbusinessunit',
            'owningbusinessunitname',
            'owningteam',
            'owninguser',
            
            // State and status
            'statecode',
            'statuscode',
            'statuscodename',
            'statecodename',
            
            // Version and import tracking
            'versionnumber',
            'timezoneruleversionnumber',
            'importsequencenumber',
            'overriddencreatedon',
            'utcconversiontimezonecode',
            
            // Exchange sync
            'exchangerate',
            'transactioncurrencyid',
            'transactioncurrencyidname',
            
            // Process tracking
            'processid',
            'stageid',
            'traversedpath'
        ];

        const lowerLogicalName = logicalName.toLowerCase();
        
        // Check exact matches
        if (systemColumns.includes(lowerLogicalName)) {
            return true;
        }
        
        // Check patterns
        if (lowerLogicalName.startsWith('_') && lowerLogicalName.endsWith('_value')) {
            return true; // System lookup attributes like _ownerid_value
        }
        
        if (lowerLogicalName.includes('yomi')) {
            return true; // Phonetic attributes
        }
        
        if (lowerLogicalName.endsWith('_base') && systemColumns.some(sc => lowerLogicalName.startsWith(sc))) {
            return true; // Base currency columns like createdon_base
        }
        
        return false;
    }

    /**
     * Map Dataverse attribute types to Mermaid-friendly types
     * @param {string} dataverseType - Dataverse attribute type
     * @returns {string} Mermaid type
     */
    mapDataverseTypeToMermaid(dataverseType) {
        const typeMap = {
            'String': 'string',
            'Memo': 'text',
            'Integer': 'int',
            'BigInt': 'bigint',
            'Decimal': 'decimal',
            'Double': 'float',
            'Money': 'money',
            'Boolean': 'boolean',
            'DateTime': 'datetime',
            'Lookup': 'guid',
            'Picklist': 'int',
            'MultiSelectPicklist': 'string',
            'Uniqueidentifier': 'guid',
            'State': 'int',
            'Status': 'int',
            'Owner': 'guid',
            'PartyList': 'string',
            'Virtual': 'string',
            'EntityName': 'string',
            'Image': 'image'
        };

        return typeMap[dataverseType] || 'string';
    }

    /**
     * Generate a readable relationship label
     * @param {Object} relationship - Relationship definition
     * @returns {string} Relationship label
     */
    generateRelationshipLabel(relationship) {
        // Simple label generation - could be enhanced with natural language processing
        const fromEntity = relationship.ReferencedEntity;
        const toEntity = relationship.ReferencingEntity;
        
        // Common relationship patterns
        if (toEntity.includes('line') && fromEntity.includes('order')) {
            return 'contains';
        }
        if (fromEntity === 'account' && toEntity === 'contact') {
            return 'has';
        }
        if (fromEntity === 'account' && toEntity === 'opportunity') {
            return 'manages';
        }
        
        return 'relates to';
    }

    /**
     * Get Dataverse client instance with proper authentication
     * @param {Object} connection - Connection details
     * @returns {Promise<Object>} Dataverse client
     */
    async getDataverseClient(connection) { // eslint-disable-line no-unused-vars
        try {
            // For MVP, use the existing dataverse repository
            // In future versions, this could support different auth methods
            return this.dataverseRepository.getClient();
            
        } catch (error) {
            console.error('getDataverseClient failed', error);
            throw error;
        }
    }

    /**
     * Detect publisher prefix from custom entities
     * @param {Array} entities - Array of entity objects
     * @returns {string} Detected publisher prefix or empty string
     */
    detectPublisherPrefix(entities) {
        if (!entities || entities.length === 0) {
            return '';
        }

        // Look for custom entities (typically have prefix_)
        const customEntities = entities.filter(entity => 
            entity.logicalName && 
            entity.logicalName.includes('_') && 
            !entity.isCdm
        );

        if (customEntities.length === 0) {
            return '';
        }

        // Extract prefix from first custom entity
        const firstCustomEntity = customEntities[0];
        const match = firstCustomEntity.logicalName.match(/^([a-z]+)_/);
        return match ? match[1] : '';
    }

    /**
     * Strip publisher prefix from entity name for use in ERD generation
     * This prevents double-prefixing when ERD content flows into the wizard
     * @param {string} entityName - Full entity logical name (e.g., 'cre_employee')
     * @returns {string} Entity name without publisher prefix (e.g., 'employee')
     */
    stripPublisherPrefix(entityName) {
        if (!entityName || typeof entityName !== 'string') {
            return entityName;
        }

        // Check if entity has a publisher prefix pattern (prefix_entityname)
        const prefixMatch = entityName.match(/^([a-z]+)_(.+)$/);
        if (prefixMatch && prefixMatch[1] && prefixMatch[2]) {
            // Return the entity name without the prefix
            return prefixMatch[2];
        }

        // Return original name if no prefix pattern found
        return entityName;
    }

    /**
     * Validate connection parameters
     * @param {Object} connection - Connection details
     */
    validateConnection(connection) {
        if (!connection) {
            throw new Error('Connection details are required');
        }

        if (!connection.environmentUrl) {
            throw new Error('Environment URL is required');
        }

        // Validate URL format
        try {
            new URL(connection.environmentUrl);
        } catch (error) {
            throw new Error('Invalid environment URL format');
        }

        // Ensure URL is a Dataverse environment
        if (!connection.environmentUrl.includes('.dynamics.com') && 
            !connection.environmentUrl.includes('.crm.dynamics.com')) {
            throw new Error('URL must be a valid Dataverse environment');
        }
    }
}

module.exports = { DataverseExtractorService };