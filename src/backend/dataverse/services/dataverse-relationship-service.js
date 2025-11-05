/**
 * Dataverse Relationship Service
 * Handles relationship creation, management, and lookup operations
 */

const { DataverseAuthenticationService } = require('./dataverse-authentication-service');

class DataverseRelationshipService extends DataverseAuthenticationService {
  constructor(config = {}) {
    super(config);
  }

  /**
   * Check if a relationship exists by schema name
   * @param {string} referencingEntityLogical - Referencing entity logical name
   * @param {string} schemaName - Relationship schema name
   * @returns {Promise<boolean>} True if relationship exists
   */
  async checkRelationshipExists(referencingEntityLogical, schemaName) {
    // Best-effort generic lookup by schema name
    const q = `/RelationshipDefinitions?$select=SchemaName&$filter=SchemaName eq '${schemaName}'`;
    try {
      const d = await this.get(q);
      const list = d.value || [];
      return list.some(r => r.SchemaName === schemaName);
    } catch {
      // Some orgs limit RelationshipDefinitions, fallback to false => let creation try
      return false;
    }
  }

  /**
   * Create a new relationship
   * @param {object} payload - Relationship metadata payload
   * @returns {Promise<object>} Created relationship response
   */
  async createRelationship(payload) {
    return this.post('/RelationshipDefinitions', payload);
  }

  /**
   * Create relationship with retry logic for customization lock scenarios
   * @param {object} payload - Relationship metadata payload
   * @param {number} maxRetries - Maximum retry attempts
   * @returns {Promise<object>} Created relationship response
   */
  async createRelationshipWithRetry(payload, maxRetries = 4) {
    let last;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this._log(` Relationship creation attempt ${attempt}/${maxRetries} for ${payload.SchemaName}...`);
        return await this.createRelationship(payload);
      } catch (e) {
        last = e;
        // More comprehensive error detection
        const isRetryableError = 
          e.status === 503 || // Service Unavailable
          e.status === 429 || // Too Many Requests
          e.status === 409 || // Conflict
          /unexpected/i.test(e.message) || 
          /customization/i.test(e.message) ||
          /locked/i.test(e.message) ||
          /timeout/i.test(e.message) ||
          /busy/i.test(e.message) ||
          /try again/i.test(e.message);
          
        if (attempt < maxRetries && isRetryableError) {
          // Exponential backoff with jitter
          const baseDelay = 2500 * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 1000);
          const delay = baseDelay + jitter;
          
          this._log(` ⚠️ Relationship creation failed (${e.message}). Retrying in ${Math.round(delay/1000)}s... (Attempt ${attempt}/${maxRetries})`);
          await this.sleep(delay);
          continue;
        }
        
        this._err(` ❌ Relationship creation failed with error: ${e.message}`);
        throw e;
      }
    }
    throw last;
  }

  /**
   * Delete a relationship
   * @param {object} relationship - Relationship object with schema name
   * @returns {Promise<void>} Deletion response
   */
  async deleteRelationship(relationship) {
    // Try to get the correct schema name - relationship data might have different property names
    const schemaName = relationship.schemaName || relationship.logicalName || relationship.name;
    
    if (!schemaName) {
      const errorMsg = `Cannot delete relationship - no schema name found in: ${JSON.stringify(relationship)}`;
      this._err(errorMsg);
      throw new Error(errorMsg);
    }
    
    this._log(`🔗 Processing relationship deletion: ${schemaName}`);
    this._log(`   From: ${relationship.fromEntity || 'Unknown'} → To: ${relationship.toEntity || 'Unknown'}`);
    
    // Use the schema name directly if it looks like a proper Dataverse schema name (has underscores and no spaces)
    let actualSchemaName = schemaName;
    
    // If this looks like a display name (contains spaces or no underscores), construct the schema name
    if ((schemaName.includes(' ') || !schemaName.includes('_')) && relationship.fromEntity && relationship.toEntity && relationship.publisherPrefix) {
      this._log(`   🔎 Display name detected: "${schemaName}", constructing actual schema name...`);
      
      const prefix = relationship.publisherPrefix;
      const fromEntity = relationship.fromEntity.toLowerCase();
      const toEntity = relationship.toEntity.toLowerCase();
      
      // The schema name is typically: prefix_referencedEntity_referencingEntity
      // Try both entity orderings
      const schemaOption1 = `${prefix}_${fromEntity}_${toEntity}`;
      const schemaOption2 = `${prefix}_${toEntity}_${fromEntity}`;
      
      this._log(`   📋 Possible schema names: ${schemaOption1} or ${schemaOption2}`);
      
      // Use the first option as default (we'll try both if needed)
      actualSchemaName = schemaOption1;
      this._log(`   🎯 Using schema name: ${actualSchemaName}`);
    } else {
      this._log(`   ✅ Using provided schema name directly: ${actualSchemaName}`);
    }

    this._log(`   🗑️ Executing DELETE for relationship: ${actualSchemaName}`);
    const deleteQuery = `RelationshipDefinitions(SchemaName='${actualSchemaName}')`;
    this._log(`   📞 API call: DELETE ${deleteQuery}`);
    
    try {
      await this.delete(deleteQuery);
      this._log(`   ✅ Successfully deleted relationship: ${actualSchemaName}`);
    } catch (error) {
      // If first option failed and we have both entities, try the reverse
      if (relationship.fromEntity && relationship.toEntity && relationship.publisherPrefix && schemaName.includes(' ')) {
        const prefix = relationship.publisherPrefix;
        const fromEntity = relationship.fromEntity.toLowerCase();
        const toEntity = relationship.toEntity.toLowerCase();
        const schemaOption2 = `${prefix}_${toEntity}_${fromEntity}`;
        
        if (actualSchemaName !== schemaOption2) {
          this._log(`   🔄 First attempt failed, trying reverse order: ${schemaOption2}`);
          const deleteQuery2 = `RelationshipDefinitions(SchemaName='${schemaOption2}')`;
          
          try {
            await this.delete(deleteQuery2);
            this._log(`   ✅ Successfully deleted relationship: ${schemaOption2}`);
            return; // Success with second attempt
          } catch (error2) {
            // Both attempts failed
            this._err(`   ❌ Failed to delete relationship with both schema names`);
            this._err(`   Tried: ${actualSchemaName} and ${schemaOption2}`);
            throw new Error(`Could not delete relationship: ${error2.message}`);
          }
        }
      }
      
      this._err(`   ❌ Failed to delete relationship ${actualSchemaName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Discover relationships for given entities
   * @param {Array} entities - Array of entities to analyze
   * @returns {Promise<Array>} Array of discovered relationships
   */
  async discoverRelationships(entities) {
    const entityNames = entities.map(e => e.LogicalName);
    const relationships = [];
    
    for (const entityName of entityNames) {
      try {
        // Get one-to-many relationships where this entity is the parent
        const oneToManyQuery = `/EntityDefinitions(LogicalName='${entityName}')/OneToManyRelationships?$select=ReferencingEntity,ReferencedEntity,SchemaName,IsCustomRelationship`;
        const oneToMany = await this.get(oneToManyQuery);
        
        for (const rel of oneToMany.value || []) {
          // Only include custom relationships that we created
          if (rel.IsCustomRelationship && this._isOurCustomRelationship(rel.SchemaName)) {
            relationships.push({
              name: rel.SchemaName,
              logicalName: rel.SchemaName,
              fromEntity: rel.ReferencedEntity,
              toEntity: rel.ReferencingEntity,
              type: 'OneToMany'
            });
          }
        }
        
        // Get many-to-one relationships where this entity is the child
        const manyToOneQuery = `/EntityDefinitions(LogicalName='${entityName}')/ManyToOneRelationships?$select=ReferencingEntity,ReferencedEntity,SchemaName,IsCustomRelationship`;
        const manyToOne = await this.get(manyToOneQuery);
        
        for (const rel of manyToOne.value || []) {
          // Only include custom relationships that we created
          if (rel.IsCustomRelationship && this._isOurCustomRelationship(rel.SchemaName)) {
            relationships.push({
              name: rel.SchemaName,
              logicalName: rel.SchemaName,
              fromEntity: rel.ReferencedEntity,
              toEntity: rel.ReferencingEntity,
              type: 'ManyToOne'
            });
          }
        }
        
      } catch (e) {
        this._log(`Warning: Could not get relationships for ${entityName}: ${e.message}`);
      }
    }
    
    // Remove duplicates
    const uniqueRelationships = relationships.filter((rel, index, self) => 
      index === self.findIndex(r => r.logicalName === rel.logicalName)
    );
    
    return uniqueRelationships;
  }

  // ===========================================
  // RELATIONSHIP BUILDING HELPERS
  // ===========================================

  /**
   * Resolve entity logical name for relationship creation
   * @param {string} name - Entity name to resolve
   * @param {object} options - Options with publisherPrefix and cdmMap
   * @returns {string} Resolved logical name
   */
  _resolveLogicalNameForRelationship(name, { publisherPrefix, cdmMap }) {
    if (!name) return null;
    
    // Handle various input formats and normalizations
    let key = String(name).trim();
    
    // Remove quotes if present
    if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
    
    // Convert to lowercase for consistency
    key = key.toLowerCase();
    
    // Check if this is a CDM entity (from the map)
    const cdm = cdmMap?.[key];
    if (cdm) {
      this._log(` 🔍 Resolved CDM entity: ${key} → ${cdm}`);
      return cdm;
    }
    
    // Fallback: Check for common CDM entities that should always be CDM
    const commonCdmEntities = {
      'account': 'account',
      'contact': 'contact',
      'lead': 'lead',
      'opportunity': 'opportunity',
      'case': 'incident',
      'incident': 'incident',
      'user': 'systemuser',
      'systemuser': 'systemuser',
      'team': 'team',
      'businessunit': 'businessunit'
    };
    
    if (commonCdmEntities[key]) {
      return commonCdmEntities[key];
    }
    
    // If not CDM, it's a custom entity - apply prefix
    const customLogicalName = `${publisherPrefix}_${key}`;
    this._log(` 🔍 Resolved custom entity: ${key} → ${customLogicalName}`);
    return customLogicalName;
  }

  /**
   * Build relationship payload for creation
   * @param {object} options - Relationship options
   * @returns {object} Relationship metadata payload
   */
  _buildRelationshipPayload({ referencingLogical, referencedLogical, schemaName, fromEntity, toEntity, publisherPrefix }) {
    const friendlyFrom = fromEntity.charAt(0).toUpperCase() + fromEntity.slice(1);
    const lookupName = `${publisherPrefix}_${fromEntity}id`;
    const lookupDisplayName = `${friendlyFrom} Reference`;
    
    // Build a more robust payload with more explicit relationship properties
    return {
      SchemaName: schemaName,
      ReferencingEntity: referencingLogical, // many side
      ReferencedEntity: referencedLogical,   // one side
      '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
      ReferencingEntityNavigationPropertyName: `${publisherPrefix}_${fromEntity}`,
      ReferencedEntityNavigationPropertyName: `${publisherPrefix}_${toEntity}s`,
      CascadeConfiguration: {
        Assign: "NoCascade",
        Delete: "RemoveLink", // Safe default to prevent cascade delete conflicts
        Merge: "NoCascade",
        Reparent: "NoCascade",
        Share: "NoCascade",
        Unshare: "NoCascade"
      },
      IsValidForAdvancedFind: true,
      Lookup: {
        AttributeType: 'Lookup',
        AttributeTypeName: { Value: 'LookupType' },
        SchemaName: lookupName,
        DisplayName: this._label(lookupDisplayName),
        Description: this._label(`Reference to ${fromEntity}`),
        RequiredLevel: { Value: "None" },
        '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata'
      }
    };
  }

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
   * Smart relationship creation from parser relationships
   * @param {Array} parserRels - Array of relationships from parser
   * @param {object} options - Creation options
   * @returns {Promise<object>} Creation results
   */
  async createRelationshipsSmart(parserRels, { publisherPrefix = 'mdv', cdmEntities = [] } = {}) {
    if (!Array.isArray(parserRels) || !parserRels.length) {
      this._log(' No relationships to create');
      return { created: 0, failed: 0 };
    }

    // Build a map of UI name → CDM logical name
    const cdmMap = {};
    for (const m of cdmEntities) {
      const uiName = m?.originalEntity?.name;
      const logical = m?.cdmEntity?.logicalName;
      if (uiName && logical) cdmMap[uiName.toLowerCase()] = logical.toLowerCase();
    }

    // Wait longer for entities to be fully provisioned
    this._log(' Ensuring entities are fully provisioned before creating relationships...');
    await this.sleep(20000); // Increased wait time to 20 seconds

    let created = 0, failed = 0;
    for (let i = 0; i < parserRels.length; i++) {
      const r = parserRels[i];
      const from = (r.fromEntity || '').trim(); // ONE side
      const to   = (r.toEntity   || '').trim(); // MANY side
      if (!from || !to) {
        this._warn(` ⚠️ Relationship ${i + 1} missing from/to`);
        failed++;
        continue;
      }

      // Verify both entities exist before attempting to create relationship
      const referencedLogical  = this._resolveLogicalNameForRelationship(from, { publisherPrefix, cdmMap });
      const referencingLogical = this._resolveLogicalNameForRelationship(to,   { publisherPrefix, cdmMap });
      
      try {
        // Verify the entities exist and are fully provisioned
        await this.get(`/EntityDefinitions(LogicalName='${referencedLogical}')?$select=MetadataId`);
        await this.get(`/EntityDefinitions(LogicalName='${referencingLogical}')?$select=MetadataId`);
      } catch (e) {
        this._err(` ❌ Cannot create relationship: Entity ${e.message.includes(referencedLogical) ? referencedLogical : referencingLogical} not found or not fully provisioned`);
        failed++;
        continue;
      }
      
      const schemaName = `${publisherPrefix}_${from.toLowerCase()}_${to.toLowerCase()}`;

      const exists = await this.checkRelationshipExists(referencingLogical, schemaName);
      if (exists) {
        this._log(` ⏭️ Relationship already exists: ${schemaName}`);
        created++;
        continue;
      }

      const payload = this._buildRelationshipPayload({
        referencingLogical, referencedLogical, schemaName,
        fromEntity: from.toLowerCase(), toEntity: to.toLowerCase(), publisherPrefix
      });

      try {
        this._log(` Creating relationship ${i + 1}/${parserRels.length}: ${schemaName}`);
        await this.createRelationshipWithRetry(payload, 5); // Increased retries to 5
        this._log(` ✅ Relationship created: ${schemaName}`);
        created++;
        await this.sleep(3000); // Increased wait time between relationship creations
      } catch (e) {
        this._err(` ❌ Failed to create relationship ${schemaName}: ${e.message}`);
        this._log(` 🔄 Waiting 5 seconds before continuing to next relationship...`);
        await this.sleep(5000); // Add additional delay after failure
        failed++;
      }
    }
    this._log(` Relationship creation completed: ${created} successful, ${failed} failed`);
    return { created, failed };
  }

  /**
   * Check if a relationship schema name represents a custom relationship we created
   * @param {string} schemaName - Relationship schema name
   * @returns {boolean} True if it's our custom relationship
   */
  _isOurCustomRelationship(schemaName) {
    // Skip system relationships that are automatically created
    const systemRelationshipPatterns = [
      '_Annotations',
      '_SyncErrors',
      '_AsyncOperations',
      '_MailboxTrackingFolders',
      '_UserEntityInstanceDatas',
      '_ProcessSession',
      '_BulkDeleteFailures',
      '_PrincipalObjectAttributeAccesses',
      '_FileAttachments',
      'lk_',
      'user_',
      'team_',
      'owner_',
      'business_unit_',
      'TransactionCurrency_',
      'ImageDescriptor',
      'FileDescriptor'
    ];
    
    // If it matches any system pattern, it's not our custom relationship
    for (const pattern of systemRelationshipPatterns) {
      if (schemaName.includes(pattern)) {
        return false;
      }
    }
    
    return true;
  }
}

module.exports = { DataverseRelationshipService };