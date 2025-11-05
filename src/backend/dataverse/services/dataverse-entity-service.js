/**
 * Dataverse Entity Service
 * Handles entity creation, management, and schema operations
 */

const { DataverseAuthenticationService } = require('./dataverse-authentication-service');

class DataverseEntityService extends DataverseAuthenticationService {
  constructor(config = {}) {
    super(config);
  }

  /**
   * Create a new entity
   * @param {object} entityPayload - Entity metadata payload
   * @returns {Promise<object>} Created entity response
   */
  async createEntity(entityPayload) {
    return this.post('/EntityDefinitions', entityPayload);
  }

  /**
   * Create entity with retry logic for customization lock scenarios
   * @param {object} entityPayload - Entity metadata payload
   * @param {number} maxRetries - Maximum retry attempts
   * @returns {Promise<object>} Created entity response
   */
  async createEntityWithRetry(entityPayload, maxRetries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.createEntity(entityPayload);
      } catch (error) {
        lastError = error;
        const isRetryableError = error.status === 503 || 
                                /customization/i.test(error.message) || 
                                /unexpected/i.test(error.message);
        
        if (attempt < maxRetries && isRetryableError) {
          const delay = 3000 * attempt;
          this._log(` Entity create locked/err (attempt ${attempt}/${maxRetries}). Retrying in ${Math.round(delay/1000)}s...`);
          await this.sleep(delay);
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  /**
   * Create an attribute for an entity
   * @param {string} entityLogicalName - Entity logical name
   * @param {object} attributeMetadata - Attribute metadata
   * @returns {Promise<object>} Created attribute response
   */
  async createAttribute(entityLogicalName, attributeMetadata) {
    return this.post(`/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes`, attributeMetadata);
  }

  /**
   * Create attribute with retry logic for customization lock scenarios
   * @param {string} entityLogicalName - Entity logical name
   * @param {object} attributeMetadata - Attribute metadata
   * @param {number} maxRetries - Maximum retry attempts
   * @returns {Promise<object>} Created attribute response
   */
  async createAttributeWithRetry(entityLogicalName, attributeMetadata, maxRetries = 4) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.createAttribute(entityLogicalName, attributeMetadata);
      } catch (error) {
        lastError = error;
        const isRetryableError = error.status === 503 ||
          /Customization/i.test(error.message) ||
          /unexpected error/i.test(error.message) ||
          /another user has changed/i.test(error.message);
        
        if (attempt < maxRetries && isRetryableError) {
          const delay = 2500 * Math.pow(2, attempt - 1);
          this._log(` Attribute create lock/err (attempt ${attempt}/${maxRetries}). Retrying in ${Math.round(delay/1000)}s...`);
          await this.sleep(delay);
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  /**
   * Delete an entity
   * @param {object|string} entity - Entity object or logical name
   * @returns {Promise<object>} Deletion response
   */
  async deleteEntity(entity) {
    const logicalName = entity.LogicalName || entity.logicalName || entity.name || entity;
    
    if (!logicalName) {
      const errorMsg = `Cannot delete entity - no logical name found in: ${JSON.stringify(entity)}`;
      this._err(errorMsg);
      throw new Error(errorMsg);
    }
    
    this._log(`🏢 Processing entity deletion: ${logicalName}`);
    this._log(`   Display Name: ${entity.DisplayName?.UserLocalizedLabel?.Label || 'Unknown'}`);
    this._log(`   Entity Type: ${entity.OwnershipType || 'Unknown'}`);
    
    const deleteQuery = `EntityDefinitions(LogicalName='${logicalName}')`;
    this._log(`📞 API call: DELETE ${deleteQuery}`);
    this._log(`⏱️ Using extended timeout (5 minutes) for entity deletion`);
    
    try {
      // Entity deletions can take a long time - use 5 minute timeout
      const response = await this.delete(deleteQuery, { timeout: 300000 });
      this._log(`✅ Successfully deleted entity: ${logicalName}`);
      return response;
    } catch (error) {
      this._err(`❌ Failed to delete entity ${logicalName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get entity definition by logical name
   * @param {string} logicalName - Entity logical name
   * @param {string} select - OData select clause
   * @returns {Promise<object>} Entity definition
   */
  async getEntityDefinition(logicalName, select = 'LogicalName,SchemaName,DisplayName,OwnershipType') {
    const query = `/EntityDefinitions(LogicalName='${logicalName}')?$select=${select}`;
    return this.get(query);
  }

  /**
   * Get all entity definitions
   * @param {string} select - OData select clause
   * @param {string} filter - OData filter clause
   * @returns {Promise<Array>} Array of entity definitions
   */
  async getEntityDefinitions(select = 'LogicalName,SchemaName,DisplayName,OwnershipType', filter = null) {
    let query = `/EntityDefinitions?$select=${select}`;
    if (filter) {
      query += `&$filter=${filter}`;
    }
    const response = await this.get(query);
    return response.value || [];
  }

  /**
   * Check if entity exists
   * @param {string} logicalName - Entity logical name
   * @returns {Promise<boolean>} True if entity exists
   */
  async entityExists(logicalName) {
    try {
      await this.getEntityDefinition(logicalName, 'LogicalName');
      return true;
    } catch (error) {
      if (error.message.includes('NotFound') || error.message.includes('404')) {
        return false;
      }
      throw error;
    }
  }

  // ===========================================
  // ATTRIBUTE BUILDER HELPERS
  // ===========================================

  /**
   * Create localized label object
   * @param {string} text - Label text
   * @returns {object} Localized label object
   */
  _label(text) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.Label',
      LocalizedLabels: [{ 
        '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', 
        Label: text, 
        LanguageCode: 1033 
      }]
    };
  }

  /**
   * Create string attribute metadata
   * @param {string} schemaName - Schema name
   * @param {string} display - Display name
   * @param {number} max - Maximum length
   * @returns {object} String attribute metadata
   */
  _stringAttribute(schemaName, display, max = 200) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      MaxLength: max,
      DisplayName: this._label(display)
    };
  }

  /**
   * Create memo (multiline text) attribute metadata
   * @param {string} schemaName - Schema name
   * @param {string} display - Display name
   * @returns {object} Memo attribute metadata
   */
  _memoAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      MaxLength: 2000,
      DisplayName: this._label(display)
    };
  }

  /**
   * Create integer attribute metadata
   * @param {string} schemaName - Schema name
   * @param {string} display - Display name
   * @returns {object} Integer attribute metadata
   */
  _intAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      DisplayName: this._label(display)
    };
  }

  /**
   * Create decimal attribute metadata
   * @param {string} schemaName - Schema name
   * @param {string} display - Display name
   * @returns {object} Decimal attribute metadata
   */
  _decimalAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      Precision: 2,
      DisplayName: this._label(display)
    };
  }

  /**
   * Create money attribute metadata
   * @param {string} schemaName - Schema name
   * @param {string} display - Display name
   * @returns {object} Money attribute metadata
   */
  _moneyAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.MoneyAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      DisplayName: this._label(display)
    };
  }

  /**
   * Create boolean attribute metadata
   * @param {string} schemaName - Schema name
   * @param {string} display - Display name
   * @returns {object} Boolean attribute metadata
   */
  _booleanAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      OptionSet: {
        '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
        TrueOption: { Value: 1, Label: this._label('Yes') },
        FalseOption: { Value: 0, Label: this._label('No') }
      },
      DisplayName: this._label(display)
    };
  }

  /**
   * Create datetime attribute metadata
   * @param {string} schemaName - Schema name
   * @param {string} display - Display name
   * @returns {object} DateTime attribute metadata
   */
  _datetimeAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      Format: 'DateAndTime',
      DisplayName: this._label(display)
    };
  }

  /**
   * Create date-only attribute metadata
   * @param {string} schemaName - Schema name
   * @param {string} display - Display name
   * @returns {object} Date-only attribute metadata
   */
  _dateOnlyAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      Format: 'DateOnly',
      DisplayName: this._label(display)
    };
  }

  /**
   * Create float attribute metadata
   * @param {string} schemaName - Schema name
   * @param {string} display - Display name
   * @returns {object} Float attribute metadata
   */
  _floatAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.DoubleAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      Precision: 5,
      DisplayName: this._label(display)
    };
  }

  /**
   * Create email attribute metadata
   * @param {string} schemaName - Schema name
   * @param {string} display - Display name
   * @returns {object} Email attribute metadata
   */
  _emailAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      MaxLength: 100,
      Format: 'Email',
      DisplayName: this._label(display)
    };
  }

  /**
   * Create phone attribute metadata
   * @param {string} schemaName - Schema name
   * @param {string} display - Display name
   * @returns {object} Phone attribute metadata
   */
  _phoneAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      MaxLength: 50,
      Format: 'Phone',
      DisplayName: this._label(display)
    };
  }

  /**
   * Create URL attribute metadata
   * @param {string} schemaName - Schema name
   * @param {string} display - Display name
   * @returns {object} URL attribute metadata
   */
  _urlAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      MaxLength: 200,
      Format: 'Url',
      DisplayName: this._label(display)
    };
  }

  /**
   * Create image attribute metadata
   * @param {string} schemaName - Schema name
   * @param {string} display - Display name
   * @returns {object} Image attribute metadata
   */
  _imageAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.ImageAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      DisplayName: this._label(display)
    };
  }

  /**
   * Safely convert text to entity/attribute name
   * @param {string} text - Input text
   * @returns {string} Safe name
   */
  _safeName(text) {
    return String(text || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/__+/g, '_');
  }

  /**
   * Generate random prefix for testing
   * @returns {string} Random prefix
   */
  _generateRandomPrefix() {
    // Generate 8-character random prefix (must start with letter, then lowercase letters and numbers)
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    const alphanumeric = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = chars.charAt(Math.floor(Math.random() * chars.length));
    for (let i = 1; i < 8; i++) {
      result += alphanumeric.charAt(Math.floor(Math.random() * alphanumeric.length));
    }
    return result;
  }

  // ===========================================
  // ENTITY ANALYSIS HELPERS
  // ===========================================

  /**
   * Check if entity is a Common Data Model (CDM) entity
   * @param {object} entity - Entity object
   * @returns {boolean} True if CDM entity
   */
  _isCDMEntity(entity) {
    const cdmEntities = ['account', 'contact', 'lead', 'opportunity', 'systemuser', 'team', 'businessunit'];
    return cdmEntities.includes(entity.LogicalName.toLowerCase());
  }

  /**
   * Check if entity looks like a test entity
   * @param {object} entity - Entity object
   * @returns {boolean} True if appears to be test entity
   */
  _looksLikeTestEntity(entity) {
    // Check if the entity name starts with a random-looking prefix
    const name = entity.LogicalName.toLowerCase();
    
    // Skip known system entities
    if (this._isCDMEntity(entity)) return false;
    
    // Look for patterns like: randomprefix_entityname
    const parts = name.split('_');
    if (parts.length >= 2) {
      const prefix = parts[0];
      // Random prefixes are typically 8 characters, alphanumeric
      if (prefix.length >= 6 && prefix.length <= 10 && /^[a-z0-9]+$/.test(prefix)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Extract prefix from entity logical name
   * @param {string} logicalName - Entity logical name
   * @returns {string} Prefix part
   */
  _extractPrefix(logicalName) {
    const parts = logicalName.split('_');
    return parts.length > 1 ? parts[0] : '';
  }

  /**
   * Sort entities for proper deletion order (dependencies first)
   * @param {Array} entities - Array of entities to sort
   * @param {Array} relationships - Array of relationships
   * @returns {Array} Sorted entities array
   */
  _sortEntitiesForDeletion(entities, relationships = []) {
    this._log(`🔍 Sorting ${entities.length} entities for deletion order...`);
    
    // Build dependency map
    const entityDependencies = new Map();
    const junctionTables = new Set();
    
    // Initialize dependency tracking for each entity
    entities.forEach(entity => {
      const entityName = entity.logicalName || entity.name || entity.displayName;
      entityDependencies.set(entityName, {
        references: new Set(), // Entities this one references
        referencedBy: new Set() // Entities that reference this one
      });
    });
    
    // Analyze relationships to understand dependencies
    relationships.forEach(rel => {
      const fromEntity = rel.fromEntity || rel.sourceEntity;
      const toEntity = rel.toEntity || rel.targetEntity;
      
      if (fromEntity && toEntity && entityDependencies.has(fromEntity) && entityDependencies.has(toEntity)) {
        entityDependencies.get(fromEntity).references.add(toEntity);
        entityDependencies.get(toEntity).referencedBy.add(fromEntity);
        
        // Detect junction tables (entities that reference multiple others)
        if (entityDependencies.get(fromEntity).references.size > 1) {
          junctionTables.add(fromEntity);
        }
      }
    });
    
    // Sort entities into deletion order
    const sortedEntities = [];
    const processed = new Set();
    
    // First: Add junction tables (many-to-many relationship tables)
    entities.forEach(entity => {
      const entityName = entity.logicalName || entity.name || entity.displayName;
      if (junctionTables.has(entityName) || entityName.toLowerCase().includes('junction') || 
          entityName.toLowerCase().includes('course') && entityName.toLowerCase().includes('student') ||
          entityName.toLowerCase().includes('course') && entityName.toLowerCase().includes('instructor')) {
        sortedEntities.push(entity);
        processed.add(entityName);
        this._log(`   🔗 Junction table scheduled first: ${entityName}`);
      }
    });
    
    // Second: Add entities that are heavily referenced (likely junction/bridge entities)
    const remainingEntities = entities.filter(entity => {
      const entityName = entity.logicalName || entity.name || entity.displayName;
      return !processed.has(entityName);
    });
    
    // Sort by dependency count (entities with most references to others go first)
    remainingEntities.sort((a, b) => {
      const aName = a.logicalName || a.name || a.displayName;
      const bName = b.logicalName || b.name || b.displayName;
      const aDeps = entityDependencies.get(aName);
      const bDeps = entityDependencies.get(bName);
      
      // Entities that reference more others should be deleted first
      const aReferenceCount = aDeps ? aDeps.references.size : 0;
      const bReferenceCount = bDeps ? bDeps.references.size : 0;
      
      return bReferenceCount - aReferenceCount;
    });
    
    sortedEntities.push(...remainingEntities);
    
    this._log(`✅ Entity deletion order determined:`);
    sortedEntities.forEach((entity, index) => {
      const entityName = entity.logicalName || entity.name || entity.displayName;
      this._log(`   ${index + 1}. ${entityName}`);
    });
    
    return sortedEntities;
  }
}

module.exports = { DataverseEntityService };