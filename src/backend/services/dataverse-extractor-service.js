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

            // Detect CDM entities
            const entitiesWithCdmInfo = this.detectCdmEntities(entities);

            // Generate Mermaid ERD
            const erdContent = this.generateMermaidERD(entitiesWithCdmInfo, relationships);

            const result = {
                erdContent,
                metadata: {
                    solutionName: solutionMetadata.name || 'Extracted Solution',
                    publisher: solutionMetadata.publisher || 'Unknown Publisher',
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
            throw this.createServiceError('Failed to extract Dataverse solution', error);
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
            // Use Dataverse Web API to get entity definitions
            let entitiesQuery = `EntityDefinitions?$select=LogicalName,DisplayName,PrimaryIdAttribute,PrimaryNameAttribute,Description,IsCustomEntity&$filter=IsValidForAdvancedFind eq true`;
            
            // If solution name is provided, filter by solution
            if (solutionName) {
                // Note: This is a simplified approach. In a full implementation, 
                // you'd need to query solution components to get entities in a specific solution
                this.log('Solution-specific filtering not yet implemented, extracting all entities');
            }

            const response = await client.get(entitiesQuery);
            const entityDefinitions = response.value || [];

            this.log('Entity definitions retrieved', { count: entityDefinitions.length });

            // Extract detailed entity information including attributes
            const entities = [];
            for (const entityDef of entityDefinitions.slice(0, 20)) { // Limit to first 20 for MVP
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
     * Extract detailed entity information including attributes
     * @param {Object} client - Dataverse client
     * @param {Object} entityDef - Entity definition
     * @returns {Promise<Object>} Detailed entity information
     */
    async extractEntityDetails(client, entityDef) {
        try {
            // Get entity attributes
            const attributesQuery = `EntityDefinitions(LogicalName='${entityDef.LogicalName}')/Attributes?$select=LogicalName,DisplayName,AttributeType,IsPrimaryId,IsPrimaryName,RequiredLevel,MaxLength,Description`;
            const attributesResponse = await client.get(attributesQuery);
            const attributes = attributesResponse.value || [];

            // Process attributes
            const processedAttributes = attributes
                .filter(attr => !attr.LogicalName.startsWith('_') && // Filter out system lookup attributes
                               !attr.LogicalName.includes('yomi') &&  // Filter out phonetic attributes
                               attr.LogicalName !== 'timezoneruleversionnumber' &&
                               attr.LogicalName !== 'importsequencenumber' &&
                               attr.LogicalName !== 'overriddencreatedon')
                .slice(0, 15) // Limit attributes for readability
                .map(attr => ({
                    logicalName: attr.LogicalName,
                    displayName: attr.DisplayName?.UserLocalizedLabel?.Label || attr.LogicalName,
                    dataType: this.mapDataverseTypeToMermaid(attr.AttributeType),
                    isPrimaryKey: attr.IsPrimaryId || false,
                    isPrimaryName: attr.IsPrimaryName || false,
                    required: attr.RequiredLevel?.Value === 'ApplicationRequired',
                    maxLength: attr.MaxLength,
                    description: attr.Description?.UserLocalizedLabel?.Label || ''
                }));

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
            // For MVP, extract basic one-to-many relationships
            const relationships = [];
            
            // Get one-to-many relationships
            const relationshipsQuery = `RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata?$select=ReferencedEntity,ReferencingEntity,ReferencedAttribute,ReferencingAttribute,SchemaName&$top=50`;
            const response = await client.get(relationshipsQuery);
            const relationshipDefs = response.value || [];

            // Filter relationships that involve our extracted entities
            const entityNames = entities.map(e => e.logicalName);
            
            for (const rel of relationshipDefs) {
                if (entityNames.includes(rel.ReferencedEntity) && entityNames.includes(rel.ReferencingEntity)) {
                    relationships.push({
                        type: 'one-to-many',
                        fromEntity: rel.ReferencedEntity,
                        toEntity: rel.ReferencingEntity,
                        fromAttribute: rel.ReferencedAttribute,
                        toAttribute: rel.ReferencingAttribute,
                        schemaName: rel.SchemaName,
                        label: this.generateRelationshipLabel(rel)
                    });
                }
            }

            this.log('Relationships extracted', { count: relationships.length });
            return relationships;

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

            // Query solution metadata
            const solutionQuery = `solutions?$select=FriendlyName,Version,Description&$filter=UniqueName eq '${solutionName}'`;
            const response = await client.get(solutionQuery);
            
            if (response.value && response.value.length > 0) {
                const solution = response.value[0];
                return {
                    name: solution.FriendlyName || solutionName,
                    publisher: 'Solution Publisher', // TODO: Get actual publisher
                    version: solution.Version || '1.0.0.0',
                    description: solution.Description || ''
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

        let mermaid = 'erDiagram\n\n';

        // Add relationship definitions
        relationships.forEach(rel => {
            const cardinality = rel.type === 'one-to-many' ? '||--o{' : '||--||';
            mermaid += `    ${rel.fromEntity.toUpperCase()} ${cardinality} ${rel.toEntity.toUpperCase()} : "${rel.label}"\n`;
        });

        if (relationships.length > 0) {
            mermaid += '\n';
        }

        // Add entity definitions
        entities.forEach(entity => {
            const entityName = entity.logicalName.toUpperCase();
            const comment = entity.isCdm ? ' %% CDM Entity' : ' %% Custom Entity';
            
            mermaid += `    ${entityName} {${comment}\n`;
            
            entity.attributes.forEach(attr => {
                const required = attr.required ? ' "Required"' : '';
                const pk = attr.isPrimaryKey ? ' PK' : '';
                const description = attr.description ? ` "${attr.description}"` : '';
                
                mermaid += `        ${attr.dataType} ${attr.logicalName}${pk}${required}${description}\n`;
            });
            
            mermaid += '    }\n\n';
        });

        return mermaid;
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
    async getDataverseClient(connection) {
        try {
            // For MVP, use the existing dataverse repository
            // In future versions, this could support different auth methods
            return this.dataverseRepository.getClient();
            
        } catch (error) {
            this.error('getDataverseClient failed', error);
            throw error;
        }
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