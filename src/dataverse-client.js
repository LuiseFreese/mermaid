/**
 * Dataverse API Client - CommonJS Version
 * Handles authentication and API calls to Microsoft Dataverse
 */

const { ConfidentialClientApplication } = require('@azure/msal-node');
const axios = require('axios');

class DataverseClient {
  constructor(config) {
    this.dataverseUrl = config.dataverseUrl;
    this.clientConfig = {
      auth: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        authority: `https://login.microsoftonline.com/${config.tenantId}`
      }
    };
    
    this.msalInstance = new ConfidentialClientApplication(this.clientConfig);
    this.accessToken = null;
    this.apiVersion = config.apiVersion || '9.2';
    this.solutionName = config.solutionName || null;
    this.verbose = config.verbose || false;
    
    this.globalChoiceSets = new Map();
  }

  /**
   * Authenticate and get access token
   * @returns {Promise<string>} Access token
   */
  async authenticate() {
    const clientCredentialRequest = {
      scopes: [`${this.dataverseUrl}/.default`]
    };

    try {
      const response = await this.msalInstance.acquireTokenSilent(clientCredentialRequest);
      this.accessToken = response.accessToken;
      return this.accessToken;
    } catch (error) {
      const response = await this.msalInstance.acquireTokenByClientCredential(clientCredentialRequest);
      this.accessToken = response.accessToken;
      return this.accessToken;
    }
  }

  /**
   * Make authenticated API request
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @param {Object} additionalHeaders - Additional headers
   * @returns {Promise<Object>} API response
   */
  async makeRequest(method, endpoint, data = null, additionalHeaders = {}) {
    if (!this.accessToken) {
      await this.authenticate();
    }

    const url = `${this.dataverseUrl}/api/data/v${this.apiVersion}/${endpoint}`;
    const config = {
      method,
      url,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        ...additionalHeaders
      }
    };

    if (data) {
      config.data = data;
    }

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        await this.authenticate();
        config.headers['Authorization'] = `Bearer ${this.accessToken}`;
        const retryResponse = await axios(config);
        return retryResponse.data;
      }
      throw error;
    }
  }

  /**
   * Test connection to Dataverse
   * @returns {Promise<Object>} Connection test result
   */
  async testConnection() {
    try {
      await this.authenticate();
      const response = await this.makeRequest('GET', 'WhoAmI()');
      
      return {
        success: true,
        message: 'Successfully connected to Dataverse',
        userId: response.UserId,
        organizationId: response.OrganizationId,
        dataverseUrl: this.dataverseUrl
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to connect to Dataverse: ${error.message}`,
        error: error.message
      };
    }
  }

  /**
   * Create a new entity in Dataverse with retry logic
   * @param {Object} entityMetadata - Entity metadata definition
   * @param {Object} retryOptions - Retry configuration
   * @returns {Promise<Object>} Created entity response
   */
  async createEntityWithRetry(entityMetadata, retryOptions = {}) {
    const {
      maxRetries = 3,
      baseDelay = 5000,
      retryOn503 = true
    } = retryOptions;
    
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.createEntity(entityMetadata);
      } catch (error) {
        lastError = error;
        
        // Check if it's a 503 customization lock error
        const is503Error = error.message.includes('503') && error.message.includes('CustomizationLockException');
        
        if (retryOn503 && is503Error && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`⚠️ Customization lock detected (attempt ${attempt}/${maxRetries}). Retrying in ${delay/1000} seconds...`);
          await this.sleep(delay);
          continue;
        } else {
          // Don't retry for non-503 errors or if we've exhausted retries
          throw error;
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Sleep utility function
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a new entity in Dataverse
   * @param {Object} entityMetadata - Entity metadata definition
   * @returns {Promise<Object>} Created entity response
   */
  async createEntity(entityMetadata) {
    try {
      console.log(`📝 Creating entity: ${entityMetadata.LogicalName}`);
      
      // Validate entity metadata before sending to API
      const validationResult = this.validateEntityMetadata(entityMetadata);
      if (!validationResult.isValid) {
        throw new Error(`Entity metadata validation failed: ${validationResult.errors.join(', ')}`);
      }
      
      // Add solution header if solution name is available
      const headers = {};
      if (this.solutionName) {
        headers['MSCRM.SolutionUniqueName'] = this.solutionName;
      }
      
      // Log entity metadata properties for debugging
      console.log('🔍 Entity properties:', Object.keys(entityMetadata));
      console.log('✅ Entity metadata validation passed');
      
      if (this.verbose) {
        console.log('Entity metadata:', JSON.stringify(entityMetadata, null, 2));
      }
      
      const response = await this.makeRequest('POST', 'EntityDefinitions', entityMetadata, headers);
      
      if (this.verbose) {
        console.log(`✅ Entity ${entityMetadata.LogicalName} created successfully`);
      }
      
      return response;
    } catch (error) {
      const errorDetails = {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      };
      
      console.error(`❌ Failed to create entity ${entityMetadata.LogicalName}:`, errorDetails);
      throw new Error(`Entity creation failed: ${errorDetails.message} (${errorDetails.status}). Details: ${JSON.stringify(errorDetails.data)}`);
    }
  }

  /**
   * Create multiple entities from parsed Mermaid data
   * @param {Array} entities - Array of entity definitions
   * @param {Object} options - Creation options
   * @returns {Promise<Object>} Creation results
   */
  async createEntitiesFromMermaid(entities, options = {}) {
    const results = {
      success: true,
      entitiesCreated: [],
      entitiesFailed: [],
      columnsCreated: [],
      columnsFailed: [],
      relationships: [],
      relationshipsFailed: [],
      summary: {},
      solutionInfo: null
    };

    console.log(`🔍 DEBUG: createEntitiesFromMermaid called with options:`, JSON.stringify(options, null, 2));

    try {
      // Ensure solution exists before creating entities
      if (this.solutionName) {
        console.log(`🔍 Checking if solution '${this.solutionName}' exists...`);
        const solutionResult = await this.ensureSolutionExists(this.solutionName, {
          friendlyName: options.solutionFriendlyName || this.solutionName,
          description: `Solution for Mermaid ERD entities (${options.publisherPrefix || 'mmd'})`,
          publisherId: options.publisherId,
          customizationPrefix: options.publisherPrefix || 'mmd'
        });
        
        if (!solutionResult.success) {
          throw new Error(`Solution management failed: ${solutionResult.error}`);
        }
        
        results.solutionInfo = {
          name: this.solutionName,
          exists: !solutionResult.created,
          created: solutionResult.created,
          message: solutionResult.message
        };
        
        console.log(`✅ ${solutionResult.message}`);
        
        // Wait after solution creation to allow system to stabilize
        if (solutionResult.created) {
          console.log('⏳ Waiting for solution to be fully provisioned...');
          await this.sleep(5000); // 5 second wait after solution creation (reduced from 10s)
        }
      }

      // First pass: Create all entities with retry logic and delays
      console.log(`🏗️ Creating ${entities.length} entities with retry logic...`);
      
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        const entityNumber = i + 1;
        
        try {
          if (this.verbose) {
            console.log('🔍 Entity structure:', JSON.stringify(entity, null, 2));
          }
          
          if (options.dryRun) {
            console.log(`🔍 [DRY RUN] Would create entity: ${entity.LogicalName}`);
            results.entitiesCreated.push({
              name: entity.LogicalName,
              logicalName: entity.LogicalName,
              dryRun: true
            });
          } else {
            // Clean the entity metadata to remove any invalid properties
            const cleanEntity = this.cleanEntityMetadata(entity);
            
            if (this.verbose) {
              console.log('🧹 Cleaned entity metadata:', JSON.stringify(cleanEntity, null, 2));
            }
            
            console.log(`📝 Creating entity ${entityNumber}/${entities.length}: ${entity.LogicalName}`);
            
            // Retry entity creation with exponential backoff
            const created = await this.createEntityWithRetry(cleanEntity, {
              maxRetries: 3,
              baseDelay: 2500, // Start with 2.5 seconds (reduced from 5s)
              retryOn503: true
            });
            
            results.entitiesCreated.push({
              name: entity.LogicalName,
              logicalName: entity.LogicalName,
              metadataId: created.MetadataId
            });
            
            console.log(`✅ Entity ${entityNumber}/${entities.length} created successfully: ${entity.LogicalName}`);
            
            // Wait between entity creations to avoid customization locks
            if (i < entities.length - 1) { // Don't wait after the last entity
              console.log('⏳ Waiting before next entity creation...');
              await this.sleep(4000); // 4 second delay between entities (reduced from 8s)
            }
          }
        } catch (error) {
          console.error(`❌ Failed to create entity ${entityNumber}/${entities.length}: ${entity.LogicalName}`, error.message);
          results.entitiesFailed.push({
            name: entity.LogicalName || 'Unknown',
            error: error.message
          });
        }
      }

      results.summary = {
        totalEntities: entities.length,
        created: results.entitiesCreated.length,
        failed: results.entitiesFailed.length,
        totalColumns: (options.additionalColumns || []).length,
        columnsCreated: results.columnsCreated.length,
        columnsFailed: results.columnsFailed.length,
        totalRelationships: (options.relationships || []).length,
        relationshipsCreated: results.relationships.length,
        relationshipsFailed: results.relationshipsFailed.length,
        dryRun: options.dryRun || false
      };

      // After entities are created, create additional columns if not in dry run
      if (!options.dryRun && options.additionalColumns && options.additionalColumns.length > 0) {
        console.log(`🏛️ Creating ${options.additionalColumns.length} additional columns...`);
        
        for (const columnDef of options.additionalColumns) {
          try {
            console.log(`📝 Creating column: ${columnDef.entityLogicalName}.${columnDef.columnMetadata.LogicalName}`);
            
            const response = await this.createAttribute(columnDef.entityLogicalName, columnDef.columnMetadata);
            
            results.columnsCreated.push({
              entity: columnDef.entityLogicalName,
              column: columnDef.columnMetadata.LogicalName,
              metadataId: response.MetadataId
            });
            
            // Wait between column creations
            await this.sleep(1000); // 1 second delay (reduced from 2s)
            
          } catch (error) {
            console.error(`❌ Failed to create column: ${columnDef.entityLogicalName}.${columnDef.columnMetadata.LogicalName}`, error.message);
            results.columnsFailed.push({
              entity: columnDef.entityLogicalName,
              column: columnDef.columnMetadata.LogicalName,
              error: error.message
            });
          }
        }
      }

      // After columns are created, create relationships if not in dry run
      if (!options.dryRun && options.relationships && options.relationships.length > 0) {
        console.log(`🔗 Starting relationship creation: ${options.relationships.length} relationships to create...`);
        
        for (let i = 0; i < options.relationships.length; i++) {
          const relationshipDef = options.relationships[i];
          const relationshipNumber = i + 1;
          
          try {
            console.log(`🔗 Creating relationship ${relationshipNumber}/${options.relationships.length}: ${relationshipDef.SchemaName}`);
            console.log(`   ↳ From: ${relationshipDef.ReferencingEntity} → To: ${relationshipDef.ReferencedEntity}`);
            
            if (this.verbose) {
              console.log('🔍 Full relationship metadata:', JSON.stringify(relationshipDef, null, 2));
            }
            
            const response = await this.createRelationship(relationshipDef);
            
            console.log(`✅ Relationship ${relationshipNumber}/${options.relationships.length} created successfully: ${relationshipDef.SchemaName}`);
            console.log(`   ↳ MetadataId: ${response.MetadataId || 'N/A'}`);
            
            results.relationships.push({
              name: relationshipDef.SchemaName,
              referencingEntity: relationshipDef.ReferencingEntity,
              referencedEntity: relationshipDef.ReferencedEntity,
              metadataId: response.MetadataId || 'Unknown'
            });
            
            // Wait between relationship creations
            if (i < options.relationships.length - 1) {
              console.log('⏳ Waiting before next relationship creation...');
              await this.sleep(1500); // 1.5 second delay (reduced from 3s)
            }
            
          } catch (error) {
            console.error(`❌ Failed to create relationship ${relationshipNumber}/${options.relationships.length}: ${relationshipDef.SchemaName}`);
            console.error(`   ↳ Error: ${error.message}`);
            console.error(`   ↳ From: ${relationshipDef.ReferencingEntity} → To: ${relationshipDef.ReferencedEntity}`);
            
            results.relationshipsFailed.push({
              name: relationshipDef.SchemaName,
              referencingEntity: relationshipDef.ReferencingEntity,
              referencedEntity: relationshipDef.ReferencedEntity,
              error: error.message
            });
          }
        }
        
        console.log(`🏁 Relationship creation completed: ${results.relationships.length} successful, ${results.relationshipsFailed.length} failed`);
      } else if (options.dryRun && options.relationships && options.relationships.length > 0) {
        console.log(`🔍 [DRY RUN] Would create ${options.relationships.length} relationships:`);
        options.relationships.forEach((rel, index) => {
          console.log(`   ${index + 1}. ${rel.SchemaName}: ${rel.ReferencingEntity} → ${rel.ReferencedEntity}`);
        });
      } else {
        console.log('🔗 No relationships to create');
      }

      return results;
    } catch (error) {
      results.success = false;
      results.error = error.message;
      return results;
    }
  }

  /**
   * Clean entity metadata to remove invalid properties for Dataverse API
   * @param {Object} entity - Entity metadata
   * @returns {Object} Cleaned entity metadata
   */
  cleanEntityMetadata(entity) {
    const cleaned = { ...entity };
    
    // Remove any properties that are not valid for EntityMetadata
    const invalidProperties = ['name', 'displayName', 'attributes'];
    invalidProperties.forEach(prop => {
      if (cleaned[prop]) {
        console.log(`🧹 Removing invalid property: ${prop}`);
        delete cleaned[prop];
      }
    });
    
    // Ensure required properties are present with defaults
    const requiredDefaults = {
      HasActivities: false,
      HasNotes: true,
      IsCustomEntity: true,
      OwnershipType: 'UserOwned'
    };
    
    Object.entries(requiredDefaults).forEach(([prop, defaultValue]) => {
      if (cleaned[prop] === undefined) {
        console.log(`🔧 Adding missing required property: ${prop} = ${defaultValue}`);
        cleaned[prop] = defaultValue;
      }
    });
    
    return cleaned;
  }

  /**
   * Validate entity metadata before sending to Dataverse API
   * @param {Object} entityMetadata - Entity metadata to validate
   * @returns {Object} Validation result with isValid boolean and errors array
   */
  validateEntityMetadata(entityMetadata) {
    const errors = [];
    
    // Check required properties
    const requiredProperties = [
      'LogicalName',
      'SchemaName', 
      'DisplayName',
      'DisplayCollectionName',
      'HasActivities',
      'IsCustomEntity',
      'OwnershipType'
    ];
    
    requiredProperties.forEach(prop => {
      if (!entityMetadata.hasOwnProperty(prop)) {
        errors.push(`Missing required property: ${prop}`);
      }
    });
    
    // Check for invalid properties that cause API errors
    const invalidProperties = ['name', 'displayName', 'attributes'];
    invalidProperties.forEach(prop => {
      if (entityMetadata.hasOwnProperty(prop)) {
        errors.push(`Invalid property found: ${prop} (not allowed in EntityMetadata)`);
      }
    });
    
    // Validate LogicalName format
    if (entityMetadata.LogicalName && !/^[a-z][a-z0-9_]*[a-z0-9]$/.test(entityMetadata.LogicalName)) {
      errors.push(`LogicalName must be lowercase, start with letter, contain only letters, numbers, underscores: ${entityMetadata.LogicalName}`);
    }
    
    // Validate DisplayName structure
    if (entityMetadata.DisplayName && !entityMetadata.DisplayName.LocalizedLabels) {
      errors.push('DisplayName must have LocalizedLabels array');
    }
    
    // Validate DisplayCollectionName structure  
    if (entityMetadata.DisplayCollectionName && !entityMetadata.DisplayCollectionName.LocalizedLabels) {
      errors.push('DisplayCollectionName must have LocalizedLabels array');
    }
    
    // Log validation details
    if (errors.length > 0) {
      console.log('❌ Entity validation failed:');
      errors.forEach(error => console.log(`   • ${error}`));
      console.log('🔍 Entity properties found:', Object.keys(entityMetadata));
    } else {
      console.log('✅ Entity validation passed');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if a solution exists in Dataverse
   * @param {string} solutionUniqueName - Unique name of the solution
   * @returns {Promise<Object>} Result with exists boolean and solution details
   */
  async checkSolutionExists(solutionUniqueName) {
    try {
      await this.authenticate();
      
      if (this.verbose) {
        console.log(`🔍 Checking if solution '${solutionUniqueName}' exists...`);
      }
      
      const response = await this.makeRequest(
        `GET`,
        `solutions?$filter=uniquename eq '${solutionUniqueName}'&$select=solutionid,uniquename,friendlyname,version,ismanaged`
      );
      
      if (this.verbose) {
        console.log('🔍 Raw response from solutions API:', JSON.stringify(response, null, 2));
      }
      
      // Handle different response structures
      let solutions = [];
      if (response && response.value) {
        solutions = response.value;
      } else if (Array.isArray(response)) {
        solutions = response;
      } else {
        console.warn('⚠️ Unexpected response structure:', response);
        solutions = [];
      }
      
      const exists = solutions.length > 0;
      
      if (this.verbose) {
        console.log(`🔍 Found ${solutions.length} solutions matching '${solutionUniqueName}'`);
      }
      
      return {
        success: true,
        exists: exists,
        solution: exists ? solutions[0] : null,
        message: exists ? `Solution '${solutionUniqueName}' found` : `Solution '${solutionUniqueName}' not found`
      };
    } catch (error) {
      console.error('❌ Error checking solution:', error);
      return {
        success: false,
        exists: false,
        error: error.message,
        details: error.response ? error.response.data : 'No response details'
      };
    }
  }

  /**
   * Create a new solution in Dataverse
   * @param {Object} solutionData - Solution configuration
   * @returns {Promise<Object>} Creation result
   */
  async createSolution(solutionData) {
    try {
      await this.authenticate();
      
      const solutionPayload = {
        uniquename: solutionData.uniqueName,
        friendlyname: solutionData.friendlyName || solutionData.uniqueName,
        description: solutionData.description || `Solution created for Mermaid ERD: ${solutionData.uniqueName}`,
        version: solutionData.version || '1.0.0.0'
      };
      
      // Only add publisher reference if provided and valid
      if (solutionData.publisherId) {
        solutionPayload['publisherid@odata.bind'] = `/publishers(${solutionData.publisherId})`;
      }
      
      if (this.verbose) {
        console.log('🏗️ Creating solution with payload:', JSON.stringify(solutionPayload, null, 2));
      }
      
      const response = await this.makeRequest('POST', 'solutions', solutionPayload);
      
      return {
        success: true,
        solutionId: response.solutionid,
        message: `Solution '${solutionData.uniqueName}' created successfully`,
        solution: response
      };
    } catch (error) {
      console.error('❌ Solution creation failed:', error);
      
      // Extract detailed error information
      let errorDetails = error.message;
      if (error.response && error.response.data) {
        errorDetails = JSON.stringify(error.response.data, null, 2);
      }
      
      return {
        success: false,
        error: error.message,
        details: errorDetails,
        statusCode: error.response ? error.response.status : 'Unknown'
      };
    }
  }

  /**
   * Get or create a solution (ensure it exists)
   * @param {string} solutionUniqueName - Unique name of the solution
   * @param {Object} options - Additional options for solution creation
   * @returns {Promise<Object>} Result with solution details
   */
  async ensureSolutionExists(solutionUniqueName, options = {}) {
    try {
      // First check if solution exists
      const checkResult = await this.checkSolutionExists(solutionUniqueName);
      if (!checkResult.success) {
        throw new Error(checkResult.error);
      }
      
      if (checkResult.exists) {
        return {
          success: true,
          solution: checkResult.solution,
          created: false,
          message: `Using existing solution '${solutionUniqueName}'`
        };
      }
      
      // Solution doesn't exist, need to create it
      console.log(`🔧 Solution '${solutionUniqueName}' not found, creating it...`);
      
      // First ensure a publisher exists (required for solution creation)
      let publisherId = options.publisherId;
      if (!publisherId) {
        // Generate publisher name from the customization prefix
        const customizationPrefix = options.customizationPrefix || 'mmd';
        const publisherName = `${customizationPrefix}Publisher`;
        const publisherFriendlyName = `${customizationPrefix.toUpperCase()} Publisher`;
        
        console.log(`🔍 DEBUG: options.customizationPrefix = "${options.customizationPrefix}"`);
        console.log(`🔍 DEBUG: calculated customizationPrefix = "${customizationPrefix}"`);
        console.log(`🔍 DEBUG: calculated publisherName = "${publisherName}"`);
        console.log(`🔍 DEBUG: calculated publisherFriendlyName = "${publisherFriendlyName}"`);
        console.log(`🏭 Ensuring publisher '${publisherName}' exists with prefix '${customizationPrefix}'...`);
        
        const publisherResult = await this.ensurePublisherExists(publisherName, {
          friendlyName: publisherFriendlyName,
          description: `Publisher for ${customizationPrefix.toUpperCase()} solutions generated from Mermaid ERD`,
          customizationPrefix: customizationPrefix
        });
        
        console.log(`🔍 DEBUG: Publisher creation result:`, {
          success: publisherResult.success,
          created: publisherResult.created,
          message: publisherResult.message,
          error: publisherResult.error
        });
        
        if (!publisherResult.success) {
          console.error(`❌ Publisher creation failed:`, publisherResult);
          throw new Error(`Publisher creation failed: ${publisherResult.error}`);
        }
        
        publisherId = publisherResult.publisher.publisherid;
        console.log(`✅ Publisher ready: ${publisherResult.message}`);
        console.log(`🔍 DEBUG: Retrieved publisherId = "${publisherId}"`);
      }
      
      // Validate that we have a valid publisherId before creating solution
      if (!publisherId) {
        throw new Error('Failed to get a valid publisher ID for solution creation');
      }
      
      console.log(`🏗️ Creating solution with uniqueName: "${solutionUniqueName}", publisherId: "${publisherId}"`);
      const createResult = await this.createSolution({
        uniqueName: solutionUniqueName,
        friendlyName: options.friendlyName || solutionUniqueName,
        description: options.description,
        version: options.version,
        publisherId: publisherId
      });
      
      if (!createResult.success) {
        console.error(`❌ Solution creation failed:`, {
          error: createResult.error,
          details: createResult.details,
          statusCode: createResult.statusCode
        });
        throw new Error(`Solution creation failed: ${createResult.error}. Details: ${createResult.details}`);
      }
      
      return {
        success: true,
        solution: createResult.solution,
        created: true,
        message: `Created new solution '${solutionUniqueName}'`
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * List existing solutions in Dataverse
   * @returns {Promise<Object>} List of solutions
   */
  async listSolutions() {
    try {
      await this.authenticate();
      
      const response = await this.makeRequest(
        'GET',
        'solutions?$select=solutionid,uniquename,friendlyname,version,ismanaged,publisherid&$top=20'
      );
      
      let solutions = [];
      if (response && response.value) {
        solutions = response.value;
      } else if (Array.isArray(response)) {
        solutions = response;
      }
      
      return {
        success: true,
        solutions: solutions,
        count: solutions.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * List existing publishers in Dataverse
   * @returns {Promise<Object>} List of publishers
   */
  async listPublishers() {
    try {
      await this.authenticate();
      
      const response = await this.makeRequest(
        'GET',
        'publishers?$select=publisherid,uniquename,friendlyname,customizationprefix&$top=20'
      );
      
      let publishers = [];
      if (response && response.value) {
        publishers = response.value;
      } else if (Array.isArray(response)) {
        publishers = response;
      }
      
      return {
        success: true,
        publishers: publishers,
        count: publishers.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a new publisher in Dataverse
   * @param {Object} publisherData - Publisher configuration
   * @returns {Promise<Object>} Creation result
   */
  async createPublisher(publisherData) {
    try {
      await this.authenticate();
      
      const publisherPayload = {
        uniquename: publisherData.uniqueName,
        friendlyname: publisherData.friendlyName || publisherData.uniqueName,
        description: publisherData.description || `Publisher created for Mermaid ERD: ${publisherData.uniqueName}`,
        customizationprefix: publisherData.customizationPrefix || 'mmd',
        customizationoptionvalueprefix: publisherData.optionValuePrefix || 10000
      };
      
      console.log('🔍 DEBUG: Creating publisher with payload:', JSON.stringify(publisherPayload, null, 2));
      
      if (this.verbose) {
        console.log('🏭 Creating publisher with payload:', JSON.stringify(publisherPayload, null, 2));
      }
      
      const response = await this.makeRequest('POST', 'publishers', publisherPayload);
      
      console.log('🔍 DEBUG: Publisher creation response:', JSON.stringify(response, null, 2));
      
      // Check if we got a publisher ID in the response
      let publisherId = response.publisherid || response.PublisherId || response.id;
      
      // If we don't have a publisher ID, query for the newly created publisher
      if (!publisherId) {
        console.log('🔍 DEBUG: No publisher ID in creation response, querying for created publisher...');
        const checkResult = await this.checkPublisherExists(publisherData.uniqueName);
        if (checkResult.success && checkResult.exists) {
          publisherId = checkResult.publisher.publisherid;
          console.log(`🔍 DEBUG: Retrieved publisher ID from query: "${publisherId}"`);
        }
      }
      
      console.log(`🔍 DEBUG: Final publisher ID: "${publisherId}"`);
      
      return {
        success: true,
        publisherId: publisherId,
        message: `Publisher '${publisherData.uniqueName}' created successfully`,
        publisher: {
          ...response,
          publisherid: publisherId // Ensure we have the ID in the response
        }
      };
    } catch (error) {
      console.error('❌ Publisher creation failed:', error);
      
      // Extract detailed error information
      let errorDetails = error.message;
      if (error.response && error.response.data) {
        errorDetails = JSON.stringify(error.response.data, null, 2);
        console.error('🔍 DEBUG: Publisher creation error details:', errorDetails);
      }
      
      return {
        success: false,
        error: error.message,
        details: errorDetails,
        statusCode: error.response ? error.response.status : 'Unknown'
      };
    }
  }

  /**
   * Check if a publisher exists in Dataverse
   * @param {string} publisherUniqueName - Unique name of the publisher
   * @returns {Promise<Object>} Result with exists boolean and publisher details
   */
  async checkPublisherExists(publisherUniqueName) {
    try {
      await this.authenticate();
      
      const response = await this.makeRequest(
        'GET',
        `publishers?$filter=uniquename eq '${publisherUniqueName}'&$select=publisherid,uniquename,friendlyname,customizationprefix`
      );
      
      let publishers = [];
      if (response && response.value) {
        publishers = response.value;
      } else if (response && Array.isArray(response)) {
        publishers = response;
      }
      
      const exists = publishers.length > 0;
      
      return {
        success: true,
        exists: exists,
        publisher: exists ? publishers[0] : null,
        message: exists ? `Publisher '${publisherUniqueName}' found` : `Publisher '${publisherUniqueName}' not found`
      };
    } catch (error) {
      return {
        success: false,
        exists: false,
        error: error.message
      };
    }
  }

  /**
   * Get or create a publisher (ensure it exists)
   * @param {string} publisherUniqueName - Unique name of the publisher
   * @param {Object} options - Additional options for publisher creation
   * @returns {Promise<Object>} Result with publisher details
   */
  async ensurePublisherExists(publisherUniqueName, options = {}) {
    try {
      // First check if publisher exists
      const checkResult = await this.checkPublisherExists(publisherUniqueName);
      if (!checkResult.success) {
        throw new Error(checkResult.error);
      }
      
      if (checkResult.exists) {
        return {
          success: true,
          publisher: checkResult.publisher,
          created: false,
          message: `Using existing publisher '${publisherUniqueName}'`
        };
      }
      
      // Publisher doesn't exist, create it
      console.log(`🏭 Publisher '${publisherUniqueName}' not found, creating it...`);
      
      const createResult = await this.createPublisher({
        uniqueName: publisherUniqueName,
        friendlyName: options.friendlyName || publisherUniqueName,
        description: options.description,
        customizationPrefix: options.customizationPrefix || 'mmd',
        optionValuePrefix: options.optionValuePrefix || 10000
      });
      
      if (!createResult.success) {
        throw new Error(createResult.error);
      }
      
      return {
        success: true,
        publisher: createResult.publisher,
        created: true,
        message: `Created new publisher '${publisherUniqueName}'`
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a new attribute (column) for an entity
   * @param {string} entityLogicalName - Logical name of the entity
   * @param {Object} attributeMetadata - Attribute metadata definition
   * @returns {Promise<Object>} Created attribute response
   */
  async createAttribute(entityLogicalName, attributeMetadata) {
    try {
      console.log(`📝 Creating attribute: ${attributeMetadata.LogicalName} for entity ${entityLogicalName}`);
      
      // Add solution header if solution name is available
      const headers = {};
      if (this.solutionName) {
        headers['MSCRM.SolutionUniqueName'] = this.solutionName;
      }
      
      if (this.verbose) {
        console.log('Attribute metadata:', JSON.stringify(attributeMetadata, null, 2));
      }
      
      const response = await this.makeRequest('POST', `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes`, attributeMetadata, headers);
      
      console.log(`✅ Attribute ${attributeMetadata.LogicalName} created successfully for ${entityLogicalName}`);
      
      return response;
    } catch (error) {
      const errorDetails = {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      };
      
      console.error(`❌ Failed to create attribute ${attributeMetadata.LogicalName} for ${entityLogicalName}:`, errorDetails);
      throw new Error(`Attribute creation failed: ${errorDetails.message} (${errorDetails.status}). Details: ${JSON.stringify(errorDetails.data)}`);
    }
  }

  /**
   * Create a new relationship between entities
   * @param {Object} relationshipMetadata - Relationship metadata definition
   * @returns {Promise<Object>} Created relationship response
   */
  async createRelationship(relationshipMetadata) {
    try {
      console.log(`🔗 Creating relationship: ${relationshipMetadata.SchemaName}`);
      console.log(`   ↳ Type: ${relationshipMetadata['@odata.type'] || 'Unknown'}`);
      console.log(`   ↳ From: ${relationshipMetadata.ReferencingEntity} → To: ${relationshipMetadata.ReferencedEntity}`);
      console.log(`   ↳ Referenced Attribute: ${relationshipMetadata.ReferencedAttribute || 'Unknown'}`);
      
      // Add solution header if solution name is available
      const headers = {};
      if (this.solutionName) {
        headers['MSCRM.SolutionUniqueName'] = this.solutionName;
        console.log(`   ↳ Solution: ${this.solutionName}`);
      }
      
      // Validate relationship metadata
      const validation = this.validateRelationshipMetadata(relationshipMetadata);
      if (!validation.isValid) {
        throw new Error(`Relationship validation failed: ${validation.errors.join(', ')}`);
      }
      
      if (this.verbose) {
        console.log('🔍 Full relationship metadata:', JSON.stringify(relationshipMetadata, null, 2));
      }
      
      console.log('📡 Sending relationship creation request to Dataverse...');
      const response = await this.makeRequest('POST', 'RelationshipDefinitions', relationshipMetadata, headers);
      
      console.log(`✅ Relationship ${relationshipMetadata.SchemaName} created successfully`);
      console.log(`   ↳ Response received:`, response ? 'Success' : 'No response data');
      
      if (response && response.MetadataId) {
        console.log(`   ↳ MetadataId: ${response.MetadataId}`);
      }
      
      return response;
    } catch (error) {
      const errorDetails = {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      };
      
      console.error(`❌ Failed to create relationship ${relationshipMetadata.SchemaName}:`);
      console.error(`   ↳ Status: ${errorDetails.status} ${errorDetails.statusText}`);
      console.error(`   ↳ Message: ${errorDetails.message}`);
      
      if (errorDetails.data) {
        console.error(`   ↳ Details:`, JSON.stringify(errorDetails.data, null, 2));
      }
      
      throw new Error(`Relationship creation failed: ${errorDetails.message} (${errorDetails.status}). Details: ${JSON.stringify(errorDetails.data)}`);
    }
  }

  /**
   * Validate relationship metadata before sending to Dataverse API
   * @param {Object} relationshipMetadata - Relationship metadata to validate
   * @returns {Object} Validation result with isValid boolean and errors array
   */
  validateRelationshipMetadata(relationshipMetadata) {
    const errors = [];
    
    // Check required properties
    const requiredProperties = [
      'SchemaName',
      'ReferencingEntity', 
      'ReferencedEntity',
      '@odata.type'
    ];
    
    requiredProperties.forEach(prop => {
      if (!(prop in relationshipMetadata)) {
        errors.push(`Missing required property: ${prop}`);
      }
    });
    
    // Validate schema name format
    if (relationshipMetadata.SchemaName && !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(relationshipMetadata.SchemaName)) {
      errors.push(`Invalid SchemaName format: ${relationshipMetadata.SchemaName}. Must start with letter and contain only letters, numbers, underscores`);
    }
    
    // Validate entity names
    if (relationshipMetadata.ReferencingEntity && !/^[a-z][a-z0-9_]*$/.test(relationshipMetadata.ReferencingEntity)) {
      errors.push(`Invalid ReferencingEntity format: ${relationshipMetadata.ReferencingEntity}`);
    }
    
    if (relationshipMetadata.ReferencedEntity && !/^[a-z][a-z0-9_]*$/.test(relationshipMetadata.ReferencedEntity)) {
      errors.push(`Invalid ReferencedEntity format: ${relationshipMetadata.ReferencedEntity}`);
    }
    
    // Log validation details
    if (errors.length > 0) {
      console.log('❌ Relationship validation failed:');
      errors.forEach(error => console.log(`   • ${error}`));
    } else {
      console.log('✅ Relationship validation passed');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

}

module.exports = { DataverseClient };
