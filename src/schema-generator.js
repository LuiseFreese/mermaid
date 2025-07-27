/**
 * Dataverse Schema Generator
 * Converts parsed Mermaid ERD data into Dataverse entity and field definitions
 */

import { RelationshipValidator } from './relationship-validator.js';

export class DataverseSchemaGenerator {
  constructor(publisherPrefix = 'mmd', options = {}) {
    this.publisherPrefix = publisherPrefix;
    this.options = {
      enableValidation: true,
      safeMode: false,
      interactive: true,
      ...options
    };
    this.validator = new RelationshipValidator();
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
  /**
   * Generate Dataverse entities from parsed ERD data
   * @param {Object} erdData - Parsed ERD data containing entities and relationships
   * @returns {Object} Dataverse schema definitions
   */
  async generateSchema(erdData) {
    console.log('🏗️  Generating Dataverse schema...');

    // Step 1: Generate initial schema components
    const globalChoiceSets = this.generateGlobalChoiceSets(erdData.entities);
    const entities = this.generateEntities(erdData.entities);
    const relationships = this.generateRelationships(erdData.relationships, erdData.entities);
    const additionalColumns = this.generateAdditionalColumns(erdData.entities);

    // Step 2: Run relationship validation on generated Dataverse relationships
    if (this.options.enableValidation) {
      console.log('🔍 Running relationship validation...');
      const validationResult = await this.validator.validateRelationships(relationships, erdData.entities);
      
      if (!validationResult.isValid) {
        console.log('❌ Validation failed with critical errors. Please review and fix the issues above.');
        throw new Error('Relationship validation failed. Cannot proceed with schema generation.');
      }
      
      // Display detailed validation warnings
      if (validationResult.warnings.length > 0 || validationResult.errors.length > 0) {
        await this.displayValidationResults(validationResult);
        
        // Check if we should proceed
        if (!this.options.nonInteractive && (validationResult.errors.length > 0 || validationResult.warnings.length > 0)) {
          const shouldProceed = await this.promptUserToProceed(validationResult);
          if (!shouldProceed) {
            throw new Error('User chose to stop due to validation issues. Please fix the ERD and try again.');
          }
        }
      }
    }

    return {
      globalChoiceSets,
      entities,
      relationships,
      additionalColumns,
      metadata: {
        publisherPrefix: this.publisherPrefix,
        generatedAt: new Date().toISOString(),
        source: 'mermaid-erd',
        validationEnabled: this.options.enableValidation,
        safeMode: this.options.safeMode
      }
    };
  }

  /**
   * Generate global choice sets from choice fields across all entities
   * @param {Array} entities - Array of parsed entities
   * @returns {Array} Global choice set definitions
   */
  generateGlobalChoiceSets(entities) {
    const choiceSets = new Map();

    // Collect all choice fields from all entities
    entities.forEach(entity => {
      entity.attributes.forEach(attr => {
        if (attr.isChoice) {
          const choiceSetName = `${this.publisherPrefix}_${attr.name.toLowerCase()}`;
          
          // Check if we already have this choice set (by name)
          if (!choiceSets.has(choiceSetName)) {
            choiceSets.set(choiceSetName, {
              name: choiceSetName,
              displayName: attr.displayName,
              options: attr.choiceOptions,
              entities: [entity.name]
            });
          } else {
            // Add entity to the list of entities using this choice set
            const existing = choiceSets.get(choiceSetName);
            if (!existing.entities.includes(entity.name)) {
              existing.entities.push(entity.name);
            }
          }
        }
      });
    });

    // Convert to Dataverse global choice set metadata using correct format
    return Array.from(choiceSets.values()).map(choiceSet => ({
      Name: choiceSet.name,
      DisplayName: {
        LocalizedLabels: [{
          Label: choiceSet.displayName,
          LanguageCode: 1033
        }]
      },
      Description: {
        LocalizedLabels: [{
          Label: `Global choice set for ${choiceSet.displayName}`,
          LanguageCode: 1033
        }]
      },
      IsGlobal: true,
      options: choiceSet.options // Store options for separate creation
    }));
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
      
      // Get all non-primary key, non-foreign key attributes
      // Foreign key attributes will be created automatically by relationships
      const additionalAttributes = entity.attributes.filter(attr => !attr.isPrimaryKey && !attr.isForeignKey);
      
      additionalAttributes.forEach(attr => {
        // Skip attributes that would conflict with the auto-generated primary name column
        // The primary name column is always created as {prefix}_name
        const wouldConflictWithPrimaryName = attr.name.toLowerCase() === 'name';
        
        if (wouldConflictWithPrimaryName) {
          console.log(`ℹ️  Skipping attribute '${attr.name}' on entity '${entity.name}' - the 'Name' column has already been created with the table itself`);
          return;
        }
        
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
            Label: 'Name', // Always use "Name" as the display label for the primary name column
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

    // Handle choice fields with global choice sets
    if (attr.isChoice) {
      attributeMetadata['@odata.type'] = 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata';
      attributeMetadata.AttributeType = 'Picklist';
      attributeMetadata.AttributeTypeName = {
        Value: 'PicklistType'
      };
      
      // Reference the global choice set that should be created
      const globalChoiceSetName = `${this.publisherPrefix}_${attr.name.toLowerCase()}`;
      attributeMetadata._globalChoiceSetName = globalChoiceSetName; // Temporary property for resolution later
      
      return attributeMetadata;
    }

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
      
      // Skip self-referencing relationships that are problematic
      if (fromEntityLogicalName === toEntityLogicalName) {
        console.log(`⚠️  Skipping self-referencing relationship: ${rel.fromEntity} -> ${rel.toEntity} (can cause attribute conflicts)`);
        return null; // Will be filtered out
      }
      
      if (rel.cardinality.type === 'one-to-many') {
        return this.generateOneToManyRelationship(rel, fromEntityLogicalName, toEntityLogicalName, entities);
      } else if (rel.cardinality.type === 'many-to-many') {
        return this.generateManyToManyRelationship(rel, fromEntityLogicalName, toEntityLogicalName);
      } else {
        // Default to one-to-many for unsupported relationships
        return this.generateOneToManyRelationship(rel, fromEntityLogicalName, toEntityLogicalName, entities);
      }
    }).filter(rel => rel !== null); // Remove skipped relationships
  }

  /**
   * Generate one-to-many relationship
   * @param {Object} rel - Relationship data
   * @param {string} fromEntity - From entity logical name
   * @param {string} toEntity - To entity logical name
   * @param {Array} entities - Array of entities for reference
   * @returns {Object} One-to-many relationship definition
   */
  generateOneToManyRelationship(rel, fromEntity, toEntity, entities) {
    // Create unique schema name with publisher prefix and timestamp to avoid conflicts
    const timestamp = Date.now().toString().slice(-6); // Last 6 digits for uniqueness
    const schemaName = `${this.publisherPrefix}_${this.formatSchemaName(rel.fromEntity)}_${this.formatSchemaName(rel.toEntity)}_${timestamp}`;
    
    // Find the actual primary key attribute of the referenced entity
    const referencedEntity = entities.find(e => `${this.publisherPrefix}_${e.name.toLowerCase()}` === fromEntity);
    let referencedAttribute = `${fromEntity}id`; // default fallback
    
    if (referencedEntity) {
      const pkAttr = referencedEntity.attributes.find(attr => attr.isPrimaryKey);
      if (pkAttr) {
        // For Dataverse, the primary key is auto-generated as {entity}id (GUID)
        referencedAttribute = `${fromEntity}id`;
      }
    }
    
    // Determine if this should be a parental or lookup relationship
    const isLookupRelationship = this.shouldBeLookupRelationship(rel, entities);
    
    // Since all relationships are referential by default, no need for verbose debug output
    // Only show debug details in verbose mode if needed for troubleshooting
    
    // Configure cascade behavior based on relationship type
    const cascadeConfig = isLookupRelationship ? {
      Assign: 'NoCascade',
      Delete: 'RemoveLink',  // Just remove the link, don't delete the child
      Merge: 'NoCascade',
      Reparent: 'NoCascade',
      Share: 'NoCascade',
      Unshare: 'NoCascade'
    } : {
      Assign: 'Cascade',
      Delete: 'Cascade',     // Delete children when parent is deleted
      Merge: 'Cascade',
      Reparent: 'Cascade',
      Share: 'Cascade',
      Unshare: 'Cascade'
    };
    
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
      ReferencingEntity: toEntity,
      ReferencedEntity: fromEntity,
      ReferencedAttribute: referencedAttribute,
      SchemaName: schemaName,
      RelationshipType: 'OneToMany', // Add relationship type for display
      DisplayRelationshipType: `${rel.fromEntity} → ${rel.toEntity}`,
      AssociatedMenuConfiguration: {
        Behavior: 'UseLabel',
        Group: 'Details',
        Label: {
          LocalizedLabels: [
            {
              Label: rel.toEntity + 's',
              LanguageCode: 1033
            }
          ]
        },
        Order: 10000
      },
      CascadeConfiguration: cascadeConfig,
      Lookup: {
        '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
        LogicalName: referencedAttribute, // Use the actual primary key name
        SchemaName: `${this.publisherPrefix}_${this.formatSchemaName(rel.fromEntity)}Id_${timestamp.slice(-3)}`,
        AttributeType: 'Lookup',
        AttributeTypeName: { Value: 'LookupType' },
        DisplayName: {
          LocalizedLabels: [
            {
              Label: rel.fromEntity,
              LanguageCode: 1033
            }
          ]
        },
        Description: {
          LocalizedLabels: [
            {
              Label: `Lookup to ${rel.fromEntity}`,
              LanguageCode: 1033
            }
          ]
        },
        RequiredLevel: {
          Value: 'None',
          CanBeChanged: true,
          ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings'
        },
        Targets: [ fromEntity ]
      }
    };
  }

  /**
   * Determine if a relationship should be a lookup (non-parental) relationship
   * @param {Object} rel - Current relationship
   * @param {Array} entities - All entities for context
   * @returns {boolean} True if should be lookup, false if parental
   */
  shouldBeLookupRelationship(rel, entities) {
    const fromEntity = rel.fromEntity.toLowerCase();
    const toEntity = rel.toEntity.toLowerCase();
    
    // 🔗 DEFAULT BEHAVIOR: All relationships are referential (lookup) by default
    // Mermaid ERD syntax doesn't distinguish between parental and referential relationships,
    // so we default to the safer option that avoids cascade delete conflicts.
    // Users can manually configure parental relationships in Dataverse after creation.
    
    // Override for explicit all-referential mode
    if (this.options.allReferential) {
      console.log(`🔗 Lookup relationship: ${fromEntity} -> ${toEntity} (All referential mode)`);
      return true;
    }
    
    // ✅ Check for validation override flags (for future extensibility)
    if (rel._forceLookup) {
      console.log(`🔗 Lookup relationship: ${fromEntity} -> ${toEntity} (Validation override)`);
      return true;
    }
    
    if (rel._forceParental) {
      console.log(`🏗️  Parental relationship: ${fromEntity} -> ${toEntity} (Validation override)`);
      return false;
    }
    
    // 🔗 DEFAULT: Make all relationships referential (lookup)
    // This prevents multiple parental relationship conflicts and cascade delete issues
    console.log(`🔗 Lookup relationship: ${fromEntity} -> ${toEntity} (Default: referential)`);
    return true;
  }

  /**
   * Generate many-to-many relationship
   * @param {Object} rel - Relationship data
   * @param {string} fromEntity - From entity logical name
   * @param {string} toEntity - To entity logical name
   * @returns {Object} Many-to-many relationship definition
   */
  generateManyToManyRelationship(rel, fromEntity, toEntity) {
    const schemaName = `${this.publisherPrefix}_${this.formatSchemaName(rel.fromEntity)}_${this.formatSchemaName(rel.toEntity)}`;
    
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata',
      SchemaName: schemaName,
      RelationshipType: 'ManyToMany', // Add relationship type for display
      DisplayRelationshipType: `${rel.fromEntity} ↔ ${rel.toEntity}`,
      Entity1LogicalName: fromEntity,
      Entity2LogicalName: toEntity,
      IntersectEntityName: `${this.publisherPrefix}_${rel.fromEntity.toLowerCase()}_${rel.toEntity.toLowerCase()}`,
      Entity1AssociatedMenuConfiguration: {
        Behavior: 'UseLabel',
        Group: 'Details',
        Label: {
          '@odata.type': 'Microsoft.Dynamics.CRM.Label',
          LocalizedLabels: [
            {
              '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
              Label: rel.fromEntity,
              LanguageCode: 1033
            }
          ],
          UserLocalizedLabel: {
            '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
            Label: rel.fromEntity,
            LanguageCode: 1033
          }
        },
        Order: 10000
      },
      Entity2AssociatedMenuConfiguration: {
        Behavior: 'UseLabel',
        Group: 'Details',
        Label: {
          '@odata.type': 'Microsoft.Dynamics.CRM.Label',
          LocalizedLabels: [
            {
              '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
              Label: rel.toEntity,
              LanguageCode: 1033
            }
          ],
          UserLocalizedLabel: {
            '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
            Label: rel.toEntity,
            LanguageCode: 1033
          }
        },
        Order: 10000
      }
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

  /**
   * Display detailed validation results to the user
   * @param {Object} validationResult - Validation results from RelationshipValidator
   */
  async displayValidationResults(validationResult) {
    console.log('\n🔍 VALIDATION RESULTS');
    console.log('=====================');

    // Display errors first
    if (validationResult.errors.length > 0) {
      console.log('\n❌ CRITICAL ERRORS:');
      validationResult.errors.forEach((error, index) => {
        console.log(`\n${index + 1}. ⚠️  ${error.message}`);
        console.log(`   Type: ${error.type}`);
        console.log(`   Entity: ${error.entity}`);
        if (error.details) {
          console.log(`   Details: ${error.details}`);
        }
        
        // Provide resolution hints
        this.displayResolutionHint(error);
      });
    }

    // Display warnings
    if (validationResult.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      validationResult.warnings.forEach((warning, index) => {
        console.log(`\n${index + 1}. ⚠️  ${warning.message}`);
        if (warning.details) {
          console.log(`   Details: ${warning.details}`);
        }
        
        // Provide resolution hints
        this.displayResolutionHint(warning);
      });
    }

    console.log(`\n📊 SUMMARY: ${validationResult.errors.length} errors, ${validationResult.warnings.length} warnings`);
  }

  /**
   * Display resolution hints for validation issues
   * @param {Object} issue - Error or warning object
   */
  displayResolutionHint(issue) {
    const hints = {
      'MULTIPLE_PARENTAL_RELATIONSHIPS': `
   💡 RESOLUTION HINT:
      • Change relationships from '||--o{' to '}o--o{' to convert parental to lookup
      • Example: Change 'Account ||--o{ WorkOrder' to 'Account }o--o{ WorkOrder'
      • Keep only ONE '||--o{' relationship per entity (the primary parent)`,
      
      'CIRCULAR_CASCADE_DELETE': `
   💡 RESOLUTION HINT:
      • Break the cycle by converting one relationship to lookup (}o--o{)
      • Choose the least critical ownership relationship to convert
      • Circular cascades would cause infinite delete loops in Dataverse`,
      
      'SELF_REFERENCE': `
   💡 RESOLUTION HINT:
      • Self-referencing relationships should typically be lookup (}o--o{)
      • Parental self-references can cause cascade delete issues
      • Example: 'Account }o--o{ Account : parent_account'`,

      'MISSING_PRIMARY_KEY': `
   💡 RESOLUTION HINT:
      • Add a primary key field marked with 'PK' in your ERD
      • Example: 'entity_id string PK'
      • Every Dataverse entity needs a primary key field`,

      'BUSINESS_LOGIC_WARNING': `
   💡 RESOLUTION HINT:
      • Review the business logic for this relationship
      • Consider if cascade delete is appropriate for this relationship
      • Use lookup relationships (}o--o{) for reference-only connections`
    };

    const hint = hints[issue.type];
    if (hint) {
      console.log(hint);
    }
  }

  /**
   * Prompt user whether to proceed with validation issues
   * @param {Object} validationResult - Validation results
   * @returns {boolean} True if user wants to proceed, false otherwise
   */
  async promptUserToProceed(validationResult) {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: globalThis.process.stdin,
      output: globalThis.process.stdout
    });

    const question = (prompt) => new Promise((resolve) => {
      rl.question(prompt, resolve);
    });

    console.log('\n🤔 WHAT WOULD YOU LIKE TO DO?');
    
    if (validationResult.errors.length > 0) {
      console.log('❌ Critical errors were found that may cause Dataverse creation to fail.');
    }
    
    if (validationResult.warnings.length > 0) {
      console.log('⚠️  Warnings were found that indicate potential issues.');
    }

    console.log('\nOptions:');
    console.log('  Y - Proceed anyway (may cause creation failures)');
    console.log('  N - Stop and fix the ERD first (recommended)');
    console.log('  I - Show more information about the issues');

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const answer = await question('\n❓ Do you want to proceed? [Y/n/i]: ');
      const choice = answer.toLowerCase().trim() || 'n';

      if (choice === 'y' || choice === 'yes') {
        rl.close();
        console.log('⚠️  Proceeding with validation issues...');
        return true;
      } else if (choice === 'n' || choice === 'no') {
        rl.close();
        console.log('✅ Good choice! Please fix the ERD and try again.');
        return false;
      } else if (choice === 'i' || choice === 'info') {
        console.log('\n📖 DETAILED ISSUE EXPLANATIONS:');
        console.log('• Multiple Parental Relationships: Dataverse allows only ONE parent per entity');
        console.log('• Circular Cascade Deletes: Would cause infinite deletion loops');
        console.log('• Self-References: Usually should be lookup relationships, not parental');
        console.log('• Missing Primary Keys: Every entity needs a primary identifier');
        console.log('\n💡 Use the resolution hints above to fix these issues in your ERD file.');
      } else {
        console.log('⚠️  Please enter Y (yes), N (no), or I (info)');
      }
    }
  }
}
