/**
 * Dataverse Schema Generator
 * Converts parsed Mermaid ERD data into Dataverse entity and field definitions
 */

export class DataverseSchemaGenerator {
  constructor() {
    this.publisherPrefix = 'mmd'; // Mermaid prefix
  }

  /**
   * Generate Dataverse entities from parsed ERD data
   * @param {Object} erdData - Parsed ERD data with entities and relationships
   * @returns {Object} Dataverse schema definitions
   */
  generateSchema(erdData) {
    const entities = this.generateEntities(erdData.entities);
    const relationships = this.generateRelationships(erdData.relationships, erdData.entities);

    return {
      entities,
      relationships,
      metadata: {
        publisherPrefix: this.publisherPrefix,
        generatedAt: new Date().toISOString(),
        source: 'mermaid-erd'
      }
    };
  }

  /**
   * Generate entity definitions
   * @param {Array} entities - Array of parsed entities
   * @returns {Array} Dataverse entity definitions
   */
  generateEntities(entities) {
    return entities.map(entity => {
      const logicalName = `${this.publisherPrefix}_${entity.name.toLowerCase()}`;
      
      return {
        '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
        LogicalName: logicalName,
        SchemaName: this.formatSchemaName(entity.name),
        DisplayName: {
          LocalizedLabels: [
            {
              Label: entity.displayName,
              LanguageCode: 1033
            }
          ]
        },
        DisplayCollectionName: {
          LocalizedLabels: [
            {
              Label: `${entity.displayName}s`,
              LanguageCode: 1033
            }
          ]
        },
        Description: {
          LocalizedLabels: [
            {
              Label: `Entity generated from Mermaid ERD: ${entity.name}`,
              LanguageCode: 1033
            }
          ]
        },
        OwnershipType: 'UserOwned',
        IsActivity: false,
        HasNotes: true,
        HasActivities: true,
        Attributes: this.generateAttributes(entity.attributes, logicalName)
      };
    });
  }

  /**
   * Generate attribute definitions for an entity
   * @param {Array} attributes - Array of parsed attributes
   * @param {string} entityLogicalName - The entity's logical name
   * @returns {Array} Dataverse attribute definitions
   */
  generateAttributes(attributes, entityLogicalName) {
    return attributes.map(attr => {
      const logicalName = `${this.publisherPrefix}_${attr.name.toLowerCase()}`;
      
      let attributeMetadata = {
        LogicalName: logicalName,
        SchemaName: this.formatSchemaName(attr.name),
        DisplayName: {
          LocalizedLabels: [
            {
              Label: attr.displayName,
              LanguageCode: 1033
            }
          ]
        },
        RequiredLevel: {
          Value: attr.isRequired ? 'ApplicationRequired' : 'None'
        },
        Description: {
          LocalizedLabels: [
            {
              Label: `${attr.displayName} field`,
              LanguageCode: 1033
            }
          ]
        }
      };

      // Add type-specific metadata
      switch (attr.type) {
        case 'Edm.String':
          attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.StringAttributeMetadata';
          attributeMetadata.MaxLength = 100;
          if (attr.isPrimaryKey) {
            attributeMetadata.MaxLength = 100;
            attributeMetadata.Format = 'Text';
          }
          break;

        case 'Edm.Int32':
          attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata';
          attributeMetadata.MinValue = -2147483648;
          attributeMetadata.MaxValue = 2147483647;
          break;

        case 'Edm.Decimal':
          attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata';
          attributeMetadata.MinValue = -100000000000;
          attributeMetadata.MaxValue = 100000000000;
          attributeMetadata.Precision = 2;
          break;

        case 'Edm.Double':
          attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.DoubleAttributeMetadata';
          attributeMetadata.MinValue = Number.MIN_SAFE_INTEGER;
          attributeMetadata.MaxValue = Number.MAX_SAFE_INTEGER;
          attributeMetadata.Precision = 5;
          break;

        case 'Edm.Boolean':
          attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata';
          attributeMetadata.OptionSet = {
            TrueOption: { Value: 1, Label: { LocalizedLabels: [{ Label: 'Yes', LanguageCode: 1033 }] } },
            FalseOption: { Value: 0, Label: { LocalizedLabels: [{ Label: 'No', LanguageCode: 1033 }] } }
          };
          break;

        case 'Edm.DateTimeOffset':
          attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata';
          attributeMetadata.Format = 'DateAndTime';
          attributeMetadata.DateTimeBehavior = {
            Value: 'UserLocal'
          };
          break;

        case 'Edm.Guid':
          attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.UniqueIdentifierAttributeMetadata';
          break;

        default:
          attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.StringAttributeMetadata';
          attributeMetadata.MaxLength = 100;
      }

      return attributeMetadata;
    });
  }

  /**
   * Generate relationship definitions
   * @param {Array} relationships - Array of parsed relationships
   * @param {Array} entities - Array of entities for reference
   * @returns {Array} Dataverse relationship definitions
   */
  generateRelationships(relationships, entities) {
    return relationships.map(rel => {
      const fromEntityLogicalName = `${this.publisherPrefix}_${rel.fromEntity.toLowerCase()}`;
      const toEntityLogicalName = `${this.publisherPrefix}_${rel.toEntity.toLowerCase()}`;
      
      if (rel.cardinality.type === 'one-to-many') {
        return this.generateOneToManyRelationship(rel, fromEntityLogicalName, toEntityLogicalName);
      } else if (rel.cardinality.type === 'many-to-many') {
        return this.generateManyToManyRelationship(rel, fromEntityLogicalName, toEntityLogicalName);
      } else {
        // Default to one-to-many for unsupported relationships
        return this.generateOneToManyRelationship(rel, fromEntityLogicalName, toEntityLogicalName);
      }
    });
  }

  /**
   * Generate one-to-many relationship
   * @param {Object} rel - Relationship data
   * @param {string} fromEntity - From entity logical name
   * @param {string} toEntity - To entity logical name
   * @returns {Object} One-to-many relationship definition
   */
  generateOneToManyRelationship(rel, fromEntity, toEntity) {
    const schemaName = `${this.formatSchemaName(rel.fromEntity)}_${this.formatSchemaName(rel.toEntity)}`;
    
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
      SchemaName: schemaName,
      ReferencedEntity: fromEntity,
      ReferencingEntity: toEntity,
      ReferencedAttribute: `${this.publisherPrefix}_${rel.fromEntity.toLowerCase()}id`,
      ReferencingAttribute: `${this.publisherPrefix}_${rel.fromEntity.toLowerCase()}id`,
      RelationshipType: 'OneToManyRelationship',
      SecurityTypes: 'Append',
      IsHierarchical: false,
      ReferencedEntityNavigationPropertyName: `${this.publisherPrefix}_${rel.toEntity.toLowerCase()}_${rel.fromEntity.toLowerCase()}`,
      ReferencingEntityNavigationPropertyName: `${this.publisherPrefix}_${rel.fromEntity.toLowerCase()}`,
      RelationshipBehavior: {
        Value: 'Referential'
      },
      CascadeConfiguration: {
        Assign: 'NoCascade',
        Delete: 'RemoveLink',
        Merge: 'NoCascade',
        Reparent: 'NoCascade',
        Share: 'NoCascade',
        Unshare: 'NoCascade'
      }
    };
  }

  /**
   * Generate many-to-many relationship
   * @param {Object} rel - Relationship data
   * @param {string} fromEntity - From entity logical name
   * @param {string} toEntity - To entity logical name
   * @returns {Object} Many-to-many relationship definition
   */
  generateManyToManyRelationship(rel, fromEntity, toEntity) {
    const schemaName = `${this.formatSchemaName(rel.fromEntity)}_${this.formatSchemaName(rel.toEntity)}`;
    
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata',
      SchemaName: schemaName,
      Entity1LogicalName: fromEntity,
      Entity2LogicalName: toEntity,
      IntersectEntityName: `${this.publisherPrefix}_${rel.fromEntity.toLowerCase()}_${rel.toEntity.toLowerCase()}`,
      Entity1IntersectAttribute: `${fromEntity}id`,
      Entity2IntersectAttribute: `${toEntity}id`,
      Entity1NavigationPropertyName: `${this.publisherPrefix}_${rel.fromEntity.toLowerCase()}_${rel.toEntity.toLowerCase()}`,
      Entity2NavigationPropertyName: `${this.publisherPrefix}_${rel.toEntity.toLowerCase()}_${rel.fromEntity.toLowerCase()}`,
      RelationshipType: 'ManyToManyRelationship',
      SecurityTypes: 'Append'
    };
  }

  /**
   * Format a name for Dataverse schema naming conventions
   * @param {string} name - The name to format
   * @returns {string} Formatted schema name
   */
  formatSchemaName(name) {
    // Remove underscores and capitalize each word
    return name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
               .replace(/^[a-z]/, letter => letter.toUpperCase());
  }
}
