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
   * @param {Object} erdData - Parsed E      case 'Edm.Image':
        attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.ImageAttributeMetadata';
        attributeMetadata.AttributeType = 'Virtual';
        attributeMetadata.AttributeTypeName = {
          Value: 'ImageType'
        };
        attributeMetadata.MaxSizeInKB = 30720; // Max 30MB for images in Dataverse
        break;

      case 'Edm.File':
        attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.FileAttributeMetadata';
        attributeMetadata.AttributeType = 'Virtual';
        attributeMetadata.AttributeTypeName = {
          Value: 'FileType'
        };
        attributeMetadata.MaxSizeInKB = 131072; // Max 128MB for files
        break;ties and relationships
   * @returns {Object} Dataverse schema definitions
   */
  generateSchema(erdData) {
    const entities = this.generateEntities(erdData.entities);
    const relationships = this.generateRelationships(erdData.relationships, erdData.entities);
    const additionalColumns = this.generateAdditionalColumns(erdData.entities);

    return {
      entities,
      relationships,
      additionalColumns,
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
      
      // Find the primary key attribute
      const primaryKeyAttr = entity.attributes.find(attr => attr.isPrimaryKey);
      if (!primaryKeyAttr) {
        throw new Error(`Entity '${entity.name}' must have a primary key attribute marked with PK`);
      }
      
      const entityMetadata = {
        '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
        LogicalName: logicalName,
        SchemaName: `${this.publisherPrefix}_${this.formatSchemaName(entity.name)}`,
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
        HasNotes: false,
        HasActivities: false,
        // Create entity with only primary name attribute to avoid conflicts
        Attributes: [this.createPrimaryNameAttribute(primaryKeyAttr)]
      };
      
      return entityMetadata;
    });
  }

  /**
   * Generate additional columns for entities (to be created after entity creation)
   * @param {Array} entities - Array of parsed entities
   * @returns {Array} Additional column definitions
   */
  generateAdditionalColumns(entities) {
    const allColumns = [];
    
    entities.forEach(entity => {
      const entityLogicalName = `${this.publisherPrefix}_${entity.name.toLowerCase()}`;
      
      // Get all non-primary key attributes
      const additionalAttributes = entity.attributes.filter(attr => !attr.isPrimaryKey);
      
      additionalAttributes.forEach(attr => {
        allColumns.push({
          entityLogicalName,
          columnMetadata: this.createRegularAttribute(attr)
        });
      });
    });
    
    return allColumns;
  }

  /**
   * Generate attribute definitions for an entity
   * @param {Array} attributes - Array of parsed attributes
   * @param {string} entityLogicalName - The entity's logical name
   * @param {Object} primaryKeyAttr - The primary key attribute (to handle specially)
   * @returns {Array} Dataverse attribute definitions
   */
  generateAttributes(attributes, entityLogicalName, primaryKeyAttr) {
    // Filter out non-primary key attributes and create only the primary name attribute
    // Dataverse automatically creates the primary ID, we just need the primary name attribute
    const primaryNameAttribute = this.createPrimaryNameAttribute(primaryKeyAttr);
    
    // Create other attributes (exclude the primary key since it's handled as primary name)
    const otherAttributes = attributes
      .filter(attr => !attr.isPrimaryKey)
      .map(attr => this.createRegularAttribute(attr));
    
    return [primaryNameAttribute, ...otherAttributes];
  }

  /**
   * Create the primary name attribute
   * @param {Object} primaryKeyAttr - The primary key attribute
   * @returns {Object} Primary name attribute metadata
   */
  createPrimaryNameAttribute(primaryKeyAttr) {
    // Use "name" suffix instead of the original attribute name to avoid conflicts
    // Dataverse auto-creates: {prefix}_{entity}id (GUID primary key)
    // We create: {prefix}_{entity}name (String primary name)
    const logicalName = `${this.publisherPrefix}_name`;
    
    return {
      LogicalName: logicalName,
      SchemaName: `${this.publisherPrefix}_Name`,
      DisplayName: {
        LocalizedLabels: [
          {
            Label: primaryKeyAttr.displayName || 'Name',
            LanguageCode: 1033
          }
        ]
      },
      RequiredLevel: {
        Value: 'None',
        CanBeChanged: true,
        ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings'
      },
      Description: {
        LocalizedLabels: [
          {
            Label: `Primary name field`,
            LanguageCode: 1033
          }
        ]
      },
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      AttributeType: 'String',
      AttributeTypeName: {
        Value: 'StringType'
      },
      MaxLength: 100,
      IsPrimaryName: true,
      FormatName: {
        Value: 'Text'
      }
    };
  }

  /**
   * Create a regular attribute
   * @param {Object} attr - The attribute to create
   * @returns {Object} Attribute metadata
   */
  createRegularAttribute(attr) {
    const logicalName = `${this.publisherPrefix}_${attr.name.toLowerCase()}`;
    
    let attributeMetadata = {
      LogicalName: logicalName,
      SchemaName: `${this.publisherPrefix}_${this.formatSchemaName(attr.name)}`,
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
        attributeMetadata.AttributeType = 'String';
        attributeMetadata.AttributeTypeName = {
          Value: 'StringType'
        };
        
        // Set specific format based on field name/type
        if (this.isEmailField(attr.name)) {
          attributeMetadata.FormatName = { Value: 'Email' };
          attributeMetadata.MaxLength = 100;
        } else if (this.isPhoneField(attr.name)) {
          attributeMetadata.FormatName = { Value: 'Phone' };
          attributeMetadata.MaxLength = 50;
        } else if (this.isUrlField(attr.name)) {
          attributeMetadata.FormatName = { Value: 'Url' };
          attributeMetadata.MaxLength = 200;
        } else if (this.isTickerField(attr.name)) {
          attributeMetadata.FormatName = { Value: 'TickerSymbol' };
          attributeMetadata.MaxLength = 10;
        } else if (this.isTextAreaField(attr.name)) {
          attributeMetadata.FormatName = { Value: 'TextArea' };
          attributeMetadata.MaxLength = 2000;
        } else if (this.isRichTextField(attr.name)) {
          attributeMetadata.FormatName = { Value: 'RichText' };
          attributeMetadata.MaxLength = 4000; // Dataverse max for rich text
        } else if (this.isAutonumberField(attr.name)) {
          // Autonumber is actually a special string field
          attributeMetadata.FormatName = { Value: 'Text' };
          attributeMetadata.MaxLength = 100;
          attributeMetadata.AutoNumberFormat = 'AUTO-{SEQNUM:1000}'; // AUTO- prefix with sequential number
        } else {
          attributeMetadata.FormatName = { Value: 'Text' };
          attributeMetadata.MaxLength = 100;
        }
        break;

      case 'Edm.Int32':
        attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata';
        attributeMetadata.AttributeType = 'Integer';
        attributeMetadata.AttributeTypeName = {
          Value: 'IntegerType'
        };
        
        if (this.isLanguageCodeField(attr.name)) {
          attributeMetadata.MinValue = 1025;
          attributeMetadata.MaxValue = 1164;
          attributeMetadata.Format = 'Language';
        } else if (this.isDurationField(attr.name)) {
          attributeMetadata.MinValue = 0;
          attributeMetadata.MaxValue = 2147483647;
        } else if (this.isTimeZoneField(attr.name)) {
          attributeMetadata.AttributeTypeName = { Value: 'TimeZoneType' };
          attributeMetadata.Format = 'TimeZone';
          attributeMetadata.MinValue = -1500;
          attributeMetadata.MaxValue = 1500;
        } else {
          attributeMetadata.MinValue = -2147483648;
          attributeMetadata.MaxValue = 2147483647;
        }
        break;

      case 'Edm.Decimal':
        if (this.isCurrencyField(attr.name)) {
          attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.MoneyAttributeMetadata';
          attributeMetadata.AttributeType = 'Money';
          attributeMetadata.AttributeTypeName = {
            Value: 'MoneyType'
          };
          attributeMetadata.MinValue = -922337203685477;
          attributeMetadata.MaxValue = 922337203685477;
          attributeMetadata.Precision = 4;
          attributeMetadata.PrecisionSource = 2; // Currency precision
        } else {
          attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata';
          attributeMetadata.AttributeType = 'Decimal';
          attributeMetadata.AttributeTypeName = {
            Value: 'DecimalType'
          };
          attributeMetadata.MinValue = -100000000000;
          attributeMetadata.MaxValue = 100000000000;
          attributeMetadata.Precision = 2;
        }
        break;

      case 'Edm.Double':
        attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.DoubleAttributeMetadata';
        attributeMetadata.AttributeType = 'Double';
        attributeMetadata.AttributeTypeName = {
          Value: 'DoubleType'
        };
        // Don't set MinValue/MaxValue - let Dataverse use defaults
        attributeMetadata.Precision = 5;
        break;

      case 'Edm.Boolean':
        attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata';
        attributeMetadata.AttributeType = 'Boolean';
        attributeMetadata.AttributeTypeName = {
          Value: 'BooleanType'
        };
        attributeMetadata.OptionSet = {
          TrueOption: { Value: 1, Label: { LocalizedLabels: [{ Label: 'Yes', LanguageCode: 1033 }] } },
          FalseOption: { Value: 0, Label: { LocalizedLabels: [{ Label: 'No', LanguageCode: 1033 }] } }
        };
        break;

      case 'Edm.DateTimeOffset':
        attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata';
        attributeMetadata.AttributeType = 'DateTime';
        attributeMetadata.AttributeTypeName = {
          Value: 'DateTimeType'
        };
        
        if (this.isDateOnlyField(attr.name)) {
          attributeMetadata.Format = 'DateOnly';
        } else {
          attributeMetadata.Format = 'DateAndTime';
        }
        
        attributeMetadata.DateTimeBehavior = {
          Value: 'UserLocal'
        };
        break;

      case 'Edm.Guid':
        attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.UniqueIdentifierAttributeMetadata';
        attributeMetadata.AttributeType = 'Uniqueidentifier';
        attributeMetadata.AttributeTypeName = {
          Value: 'UniqueidentifierType'
        };
        break;

      case 'Edm.Image':
        attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.ImageAttributeMetadata';
        attributeMetadata.AttributeType = 'Virtual';
        attributeMetadata.AttributeTypeName = {
          Value: 'ImageType'
        };
        attributeMetadata.MaxSizeInKB = 30720; // Max 30MB for images in Dataverse
        break;

      case 'Edm.File':
        attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.FileAttributeMetadata';
        attributeMetadata.AttributeType = 'Virtual';
        attributeMetadata.AttributeTypeName = {
          Value: 'FileType'
        };
        attributeMetadata.MaxSizeInKB = 131072; // 128MB max for files
        break;

      case 'Edm.AutoNumber':
        attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.StringAttributeMetadata';
        attributeMetadata.AttributeType = 'String';
        attributeMetadata.AttributeTypeName = {
          Value: 'StringType'
        };
        attributeMetadata.AutoNumberFormat = 'AUTO-{SEQNUM:1000}'; // AUTO- prefix with sequential number
        attributeMetadata.MaxLength = 100;
        break;

      case 'Edm.Duration':
        attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata';
        attributeMetadata.AttributeType = 'Integer';
        attributeMetadata.AttributeTypeName = {
          Value: 'DurationType'
        };
        attributeMetadata.Format = 'Duration';
        attributeMetadata.MinValue = 0;
        attributeMetadata.MaxValue = 2147483647;
        break;

      default:
        attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.StringAttributeMetadata';
        attributeMetadata.AttributeType = 'String';
        attributeMetadata.AttributeTypeName = {
          Value: 'StringType'
        };
        attributeMetadata.FormatName = { Value: 'Text' };
        attributeMetadata.MaxLength = 100;
    }

    return attributeMetadata;
  }

  /**
   * Helper methods to detect field types based on name patterns
   */
  isEmailField(fieldName) {
    return /email|e_mail|emailaddress/i.test(fieldName);
  }

  isPhoneField(fieldName) {
    return /phone|telephone|mobile|cell/i.test(fieldName);
  }

  isUrlField(fieldName) {
    return /url|website|link|uri/i.test(fieldName);
  }

  isTickerField(fieldName) {
    return /ticker|symbol|ticker_symbol/i.test(fieldName);
  }

  isTextAreaField(fieldName) {
    return /text_area|textarea|plain_text_area|description|notes|comments/i.test(fieldName);
  }

  isRichTextField(fieldName) {
    return /rich_text|richtext|html|formatted/i.test(fieldName);
  }

  isAutonumberField(fieldName) {
    return /autonumber|auto_number|sequence/i.test(fieldName);
  }

  isLanguageCodeField(fieldName) {
    return /language_code|languagecode|locale/i.test(fieldName);
  }

  isDurationField(fieldName) {
    return /duration|elapsed|time_span/i.test(fieldName);
  }

  isTimeZoneField(fieldName) {
    return /time_zone|timezone|utc_offset/i.test(fieldName);
  }

  isCurrencyField(fieldName) {
    return /currency|price|amount|cost|fee|salary|wage|money/i.test(fieldName);
  }

  isDateOnlyField(fieldName) {
    return /date_only|dateonly|birth_date|start_date|end_date/i.test(fieldName);
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
