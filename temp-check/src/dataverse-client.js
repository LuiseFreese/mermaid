/**
 * Dataverse API Client - CommonJS Version
 * Handles authentication and API calls to Microsoft Dataverse
 */

const { ConfidentialClientApplication } = require('@azure/msal-node');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create a log file with timestamp
const logFile = path.join(logsDir, `global-choices-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);

function logToFile(message, data = null) {
  const timestamp = new Date().toISOString();
  let logMessage = `[${timestamp}] ${message}`;
  
  if (data) {
    logMessage += '\n' + JSON.stringify(data, null, 2);
  }
  
  logMessage += '\n---\n';
  
  // Log to console and file
  console.log(message, data || '');
  
  try {
    fs.appendFileSync(logFile, logMessage);
  } catch (error) {
    console.error('Failed to write to log file:', error.message);
  }
}

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

    // Clean up endpoint to avoid double API path
    let cleanEndpoint = endpoint;
    if (endpoint.startsWith('/api/data/v')) {
      // Extract the version and the rest of the path
      const versionMatch = endpoint.match(/^\/api\/data\/v[0-9.]+(.*)$/);
      if (versionMatch) {
        cleanEndpoint = versionMatch[1]; // Get everything after /api/data/vX.X
      }
    }
    
    // Ensure the endpoint starts with a slash
    if (!cleanEndpoint.startsWith('/')) {
      cleanEndpoint = '/' + cleanEndpoint;
    }
    
    const url = `${this.dataverseUrl}/api/data/v${this.apiVersion}${cleanEndpoint}`;
    
    console.log(` Making ${method} request to: ${url}`);
    
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
      },
      timeout: 120000 // 2 minutes timeout for entity creation operations
    };

    if (data) {
      config.data = data;
    }

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        console.log(` Retrying request after authentication refresh...`);
        await this.authenticate();
        config.headers['Authorization'] = `Bearer ${this.accessToken}`;
        const retryResponse = await axios(config);
        return retryResponse.data;
      }
      console.error(`� Request failed:`, {
        method,
        url,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        errorMessage: error.message,
        responseObject: error.response || 'No response object'
      });
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
      
      console.log(' DEBUG: testConnection response:', {
        hasResponse: !!response,
        responseKeys: response ? Object.keys(response) : 'none',
        responseData: JSON.stringify(response, null, 2)
      });
      
      if (!response) {
        throw new Error('No response received from WhoAmI() call');
      }
      
      return {
        success: true,
        message: 'Successfully connected to Dataverse',
        userId: response.UserId,
        organizationId: response.OrganizationId,
        dataverseUrl: this.dataverseUrl
      };
    } catch (error) {
      console.error(' DEBUG: testConnection error:', {
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.name
      });
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
          console.log(` Customization lock detected (attempt ${attempt}/${maxRetries}). Retrying in ${delay/1000} seconds...`);
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
      console.log(` Creating entity: ${entityMetadata.LogicalName}`);
      
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
      console.log(' Entity properties:', Object.keys(entityMetadata));
      console.log(' Entity metadata validation passed');
      
      if (this.verbose) {
        console.log('Entity metadata:', JSON.stringify(entityMetadata, null, 2));
      }
      
      const response = await this.makeRequest('POST', 'EntityDefinitions', entityMetadata, headers);
      
      if (this.verbose) {
        console.log(` Entity ${entityMetadata.LogicalName} created successfully`);
      }
      
      return response;
    } catch (error) {
      const errorDetails = {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      };
      
      console.error(` Failed to create entity ${entityMetadata.LogicalName}:`, errorDetails);
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
      solutionInfo: null,
      publisherCreated: false,
      solutionCreated: false
    };
    
    // Explicit tracking of entity logical names for verification
    const entityLogicalNames = [];

    console.log(` DEBUG: createEntitiesFromMermaid called with options:`, JSON.stringify(options, null, 2));

    // Generate additionalColumns from entity attributes if not already provided
    if (!options.additionalColumns || options.additionalColumns.length === 0) {
      console.log(` Generating additional columns from entity attributes...`);
      options.additionalColumns = [];
      
      for (const entity of entities) {
        if (entity.attributes && Array.isArray(entity.attributes)) {
          const publisherPrefix = options?.publisherPrefix || 'mmd';
          const entityLogicalName = `${publisherPrefix}_${entity.name.toLowerCase()}`;
          
          // Get the primary attribute info to avoid conflicts
          const primaryAttribute = entity.attributes?.find(attr => attr.isPrimaryKey);
          let primaryAttributeSchemaName = null;
          if (primaryAttribute) {
            primaryAttributeSchemaName = `${publisherPrefix}_${entity.name}${primaryAttribute.name.charAt(0).toUpperCase() + primaryAttribute.name.slice(1)}`;
          } else {
            // Default primary name attribute uses "Name"
            primaryAttributeSchemaName = `${publisherPrefix}_${entity.name}Name`;
          }
          
          // Skip the primary key attribute and any attribute that would conflict with the primary name attribute
          const nonPrimaryAttributes = entity.attributes.filter(attr => {
            if (attr.isPrimaryKey) return false;
            
            // Check if this attribute would create the same SchemaName as the primary attribute
            const attrSchemaName = `${publisherPrefix}_${entity.name}${attr.name.charAt(0).toUpperCase() + attr.name.slice(1)}`;
            if (attrSchemaName === primaryAttributeSchemaName) {
              console.log(`   Skipping attribute ${attr.name} to avoid SchemaName conflict with primary attribute (${attrSchemaName})`);
              return false;
            }
            
            return true;
          });
          
          for (const attribute of nonPrimaryAttributes) {
            try {
              const columnMetadata = this.convertAttributeToColumnMetadata(attribute, entity, options);
              if (columnMetadata) {
                options.additionalColumns.push({
                  entityLogicalName: entityLogicalName,
                  columnMetadata: columnMetadata
                });
                console.log(`   Added column: ${entityLogicalName}.${columnMetadata.LogicalName} (${attribute.type})`);
              }
            } catch (error) {
              console.error(`   Failed to convert attribute ${attribute.name} for entity ${entity.name}:`, error.message);
            }
          }
        }
      }
      
      console.log(` Generated ${options.additionalColumns.length} additional columns from entity attributes`);
    } else {
      console.log(` Using ${options.additionalColumns.length} pre-defined additional columns`);
    }

    try {
      // Handle publisher creation if needed
      let publisherId = options.publisherId;
      const publisherUniqueName = options.publisherUniqueName || options.publisherName;
      const publisherFriendlyName = options.publisherFriendlyName || options.publisherName;
      
      if (options.createPublisher && publisherUniqueName && options.publisherPrefix) {
        console.log(` Creating new publisher: ${publisherFriendlyName} (${publisherUniqueName}, ${options.publisherPrefix})`);
        try {
          const publisherResult = await this.ensurePublisherExists(publisherUniqueName, {
            customizationPrefix: options.publisherPrefix,
            friendlyName: publisherFriendlyName,
            description: `Publisher created by Mermaid to Dataverse Converter`
          });
          
          if (publisherResult.success) {
            publisherId = publisherResult.publisher.publisherid || publisherResult.publisherId;
            results.publisherCreated = publisherResult.created;
            const publisherName = publisherResult.publisher ? 
              (publisherResult.publisher.friendlyname || publisherResult.publisher.friendlyName || options.publisherFriendlyName) :
              options.publisherFriendlyName;
            console.log(` Publisher ready: ${publisherName} (ID: ${publisherId})`);
          } else {
            console.error(` Publisher creation failed: ${publisherResult.error}`);
            throw new Error(`Publisher creation failed: ${publisherResult.error}`);
          }
        } catch (error) {
          console.error(` Publisher creation error:`, error);
          throw new Error(`Publisher creation failed: ${error.message}`);
        }
      }

      // Ensure solution exists before creating entities
      if (this.solutionName) {
        console.log(` Checking if solution '${this.solutionName}' exists...`);
        const solutionResult = await this.ensureSolutionExists(this.solutionName, {
          friendlyName: options.solutionFriendlyName || this.solutionName,
          description: `Solution for Mermaid ERD entities (${options.publisherPrefix || 'mmd'})`,
          publisherId: publisherId, // Use the publisher ID (either existing or newly created)
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
        results.solutionCreated = solutionResult.created;
        
        console.log(` ${solutionResult.message}`);
        
        // Wait after solution creation to allow system to stabilize
        if (solutionResult.created) {
          console.log(' Waiting for solution to be fully provisioned...');
          await this.sleep(5000); // 5 second wait after solution creation (reduced from 10s)
        }
      }

      // First pass: Create all entities with retry logic and delays
      console.log(` Creating ${entities.length} entities with retry logic...`);
      
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        const entityNumber = i + 1;
        
        try {
          if (this.verbose) {
            console.log(' Entity structure:', JSON.stringify(entity, null, 2));
          }
          
          if (options.dryRun) {
            console.log(` [DRY RUN] Would create entity: ${entity.LogicalName}`);
            results.entitiesCreated.push({
              name: entity.LogicalName,
              logicalName: entity.LogicalName,
              dryRun: true
            });
            
            // Add to tracking array even in dry run
            entityLogicalNames.push(entity.LogicalName);
          } else {
            // Clean the entity metadata to remove any invalid properties
            const cleanEntity = this.cleanEntityMetadata(entity, options);
            
            if (this.verbose) {
              console.log(' Cleaned entity metadata:', JSON.stringify(cleanEntity, null, 2));
            }
            
            // Get the actual logical name that will be used
            const entityLogicalName = cleanEntity.LogicalName;
            console.log(` Creating entity ${entityNumber}/${entities.length}: ${entityLogicalName}`);
            
            // Track the logical name for verification
            entityLogicalNames.push(entityLogicalName);
            
            // Retry entity creation with exponential backoff
            const created = await this.createEntityWithRetry(cleanEntity, {
              maxRetries: 3,
              baseDelay: 2500, // Start with 2.5 seconds (reduced from 5s)
              retryOn503: true
            });
            
            results.entitiesCreated.push({
              name: cleanEntity.LogicalName || entity.LogicalName,
              logicalName: cleanEntity.LogicalName || entity.LogicalName,
              metadataId: created.MetadataId
            });
            
            console.log(` Entity ${entityNumber}/${entities.length} created successfully: ${entityLogicalName}`);
            
            // Wait between entity creations to avoid customization locks
            if (i < entities.length - 1) { // Don't wait after the last entity
              console.log(' Waiting before next entity creation...');
              await this.sleep(4000); // 4 second delay between entities (reduced from 8s)
            }
          }
        } catch (error) {
          console.error(` Failed to create entity ${entityNumber}/${entities.length}: ${entity.LogicalName}`, error.message);
          results.entitiesFailed.push({
            name: entity.LogicalName || 'Unknown',
            error: error.message
          });
        }
      }

      // After entities are created, create additional columns if not in dry run
      if (!options.dryRun && options.additionalColumns && options.additionalColumns.length > 0) {
        console.log(` Creating ${options.additionalColumns.length} additional columns...`);
        
        for (const columnDef of options.additionalColumns) {
          try {
            console.log(` Creating column: ${columnDef.entityLogicalName}.${columnDef.columnMetadata.LogicalName}`);
            
            const response = await this.createAttribute(columnDef.entityLogicalName, columnDef.columnMetadata);
            
            results.columnsCreated.push({
              entity: columnDef.entityLogicalName,
              column: columnDef.columnMetadata.LogicalName,
              metadataId: response.MetadataId
            });
            
            // Wait between column creations
            await this.sleep(1000); // 1 second delay (reduced from 2s)
            
          } catch (error) {
            console.error(` Failed to create column: ${columnDef.entityLogicalName}.${columnDef.columnMetadata.LogicalName}`, error.message);
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
        console.log(` Waiting for entities to be fully provisioned before creating relationships...`);
        
        // Wait longer and verify entities exist before creating relationships
        await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds instead of 10
        
        // Verify all entities exist before proceeding
        console.log(` Verifying all entities are ready for relationship creation...`);
        
        // Use our explicitly tracked entity logical names
        console.log(` Verifying these entities exist: ${entityLogicalNames.join(', ')}`);
        console.log(` Waiting 10 seconds for entities to be fully provisioned...`);
        
        // Use a single longer wait instead of multiple attempts
        await this.sleep(10000); // 10 second wait
        
        // Just verify once after waiting
        for (const entityName of entityLogicalNames) {
          try {
            console.log(` Verifying entity: ${entityName}`);
            const response = await this.makeRequest('GET', `EntityDefinitions(LogicalName='${entityName}')?$select=LogicalName,SchemaName,DisplayName`);
            if (response && response.LogicalName === entityName) {
              console.log(`  Entity ${entityName} is ready`);
            } else {
              console.log(` ⚠️ Entity ${entityName} verification returned unexpected result`);
            }
          } catch (error) {
            console.warn(` ⚠️ Entity ${entityName} verification failed: ${error.message}`);
            // Continue anyway - entities might still be usable for relationships
          }
        }
        
        console.log(` Starting relationship creation: ${options.relationships.length} relationships to create...`);
        
        for (let i = 0; i < options.relationships.length; i++) {
          const parserRelationship = options.relationships[i];
          const relationshipNumber = i + 1;
          
          try {
            // Map parser relationship format to Dataverse API format
            const publisherPrefix = options.publisherPrefix || 'mmd';
            
            // Create proper relationship names based on the entities involved
            const fromEntity = parserRelationship.fromEntity?.toLowerCase(); // e.g., "author"
            const toEntity = parserRelationship.toEntity?.toLowerCase();     // e.g., "authorbook"
            
            // Entity logical names in Dataverse ARE WITH prefix (e.g., "perfect_author", "perfect_book", "perfect_authorbook")
            const fromEntityLogicalName = `${publisherPrefix}_${fromEntity}`;
            const toEntityLogicalName = `${publisherPrefix}_${toEntity}`;
            
            // The relationship should be named after the entities it connects
            const relationshipName = `${fromEntity}_${toEntity}`;
            const schemaName = `${publisherPrefix}_${relationshipName}`;
            
            const relationshipDef = {
              SchemaName: schemaName,
              ReferencingEntity: toEntityLogicalName,        // The "many" side (authorbook)
              ReferencedEntity: fromEntityLogicalName,       // The "one" side (author or book)
              "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
              ReferencingEntityNavigationPropertyName: `${publisherPrefix}_${fromEntity}`,
              ReferencedEntityNavigationPropertyName: `${publisherPrefix}_${toEntity}s`,
              Lookup: {
                AttributeType: "Lookup",
                AttributeTypeName: {
                  Value: "LookupType"
                },
                SchemaName: `${publisherPrefix}_${fromEntity}id`,
                DisplayName: {
                  LocalizedLabels: [
                    {
                      Label: `${fromEntity.charAt(0).toUpperCase() + fromEntity.slice(1)} Reference`,
                      LanguageCode: 1033
                    }
                  ],
                  UserLocalizedLabel: {
                    Label: `${fromEntity.charAt(0).toUpperCase() + fromEntity.slice(1)} Reference`,
                    LanguageCode: 1033
                  }
                },
                Description: {
                  LocalizedLabels: [
                    {
                      Label: `Reference to ${fromEntity}`,
                      LanguageCode: 1033
                    }
                  ],
                  UserLocalizedLabel: {
                    Label: `Reference to ${fromEntity}`,
                    LanguageCode: 1033
                  }
                },
                "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata"
              }
            };
            
            console.log(` Creating relationship ${relationshipNumber}/${options.relationships.length}: ${relationshipDef.SchemaName}`);
            console.log(`   ↳ From: ${relationshipDef.ReferencedEntity} → To: ${relationshipDef.ReferencingEntity}`);
            
            if (this.verbose) {
              console.log(' Full relationship metadata:', JSON.stringify(relationshipDef, null, 2));
            }
            
            const response = await this.createRelationship(relationshipDef);
            
            console.log(` Relationship ${relationshipNumber}/${options.relationships.length} created successfully: ${relationshipDef.SchemaName}`);
            console.log(`   ↳ MetadataId: ${response.MetadataId || 'N/A'}`);
            
            results.relationships.push({
              name: relationshipDef.SchemaName,
              referencingEntity: relationshipDef.ReferencingEntity,
              referencedEntity: relationshipDef.ReferencedEntity,
              metadataId: response.MetadataId || 'Unknown'
            });
            
            // Wait between relationship creations
            if (i < options.relationships.length - 1) {
              console.log(' Waiting before next relationship creation...');
              await this.sleep(1500); // 1.5 second delay (reduced from 3s)
            }
            
          } catch (error) {
            console.error(` Failed to create relationship ${relationshipNumber}/${options.relationships.length}: ${relationshipDef.SchemaName}`);
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
        
        console.log(` Relationship creation completed: ${results.relationships.length} successful, ${results.relationshipsFailed.length} failed`);
      } else if (options.dryRun && options.relationships && options.relationships.length > 0) {
        console.log(` [DRY RUN] Would create ${options.relationships.length} relationships:`);
        options.relationships.forEach((rel, index) => {
          console.log(`   ${index + 1}. ${rel.SchemaName}: ${rel.ReferencingEntity} → ${rel.ReferencedEntity}`);
        });
      } else {
        console.log(' No relationships to create');
      }

      // Handle global choices
      const solutionName = options.solutionFriendlyName || this.solutionName;
      
      // Process uploaded global choices from JSON file first
      if (options.uploadedGlobalChoices && options.uploadedGlobalChoices.globalChoices && options.uploadedGlobalChoices.globalChoices.length > 0) {
        console.log(` Creating ${options.uploadedGlobalChoices.globalChoices.length} new global choices from uploaded JSON...`);
        
        for (let i = 0; i < options.uploadedGlobalChoices.globalChoices.length; i++) {
          const choiceData = options.uploadedGlobalChoices.globalChoices[i];
          console.log(` Creating global choice ${i + 1}/${options.uploadedGlobalChoices.globalChoices.length}: ${choiceData.name}`);
          
          try {
            await this.createGlobalChoice(choiceData);
            console.log(`   ✓ Global choice ${choiceData.name} created successfully`);
            
            // Add the newly created choice to the solution if solutionName exists
            if (solutionName) {
              await this.addGlobalChoiceToSolution(choiceData.name, solutionName);
              console.log(`   ✓ Global choice ${choiceData.name} added to solution`);
            }
          } catch (error) {
            console.error(`   ✗ Failed to create global choice ${choiceData.name}: ${error.message}`);
            // Continue with other choices even if one fails
          }
        }
      }
      
      // Process selected existing global choices
      if (options.selectedChoices && options.selectedChoices.length > 0 && solutionName) {
        // Filter out undefined, null, and empty values
        const validChoices = options.selectedChoices.filter(choice => {
          if (!choice) return false;
          if (typeof choice === 'string' && choice.trim() === '') return false;
          if (typeof choice === 'object' && !choice.LogicalName && !choice.Name) return false;
          return true;
        });
        
        console.log(` Adding ${validChoices.length} global choices to solution (filtered from ${options.selectedChoices.length})...`);
        console.log(` DEBUG: selectedChoices array:`, JSON.stringify(options.selectedChoices, null, 2));
        console.log(` DEBUG: validChoices array:`, JSON.stringify(validChoices, null, 2));
        
        if (validChoices.length === 0) {
          console.log(' No valid global choices to add to solution');
          return results;
        }
        
        try {
          for (let i = 0; i < validChoices.length; i++) {
            const choice = validChoices[i];
            console.log(` DEBUG: Processing choice ${i}:`, choice);
            console.log(` DEBUG: Choice type:`, typeof choice);
            console.log(` DEBUG: Choice LogicalName:`, choice?.LogicalName);
            console.log(` DEBUG: Choice Name:`, choice?.Name);
            
            const choiceName = choice?.LogicalName || choice?.Name || choice;
            console.log(` Adding global choice ${i + 1}/${validChoices.length}: ${choiceName}`);
            
            try {
              await this.addGlobalChoiceToSolution(choiceName, solutionName);
              console.log(`   ✓ Global choice ${choiceName} added to solution`);
            } catch (error) {
              console.error(`   ✗ Failed to add global choice ${choiceName}: ${error.message}`);
              // Continue with other choices even if one fails
            }
          }
          
          console.log(' Global choices processing completed');
        } catch (error) {
          console.error(' Error processing global choices:', error.message);
          // Don't fail the entire deployment for global choices issues
        }
      } else if (options.selectedChoices && options.selectedChoices.length > 0) {
        console.log(` Warning: ${options.selectedChoices.length} global choices selected but no solution name provided - skipping`);
      } else {
        console.log(' No global choices to add to solution');
      }

      console.log(' DEBUG: About to return results from createEntitiesFromMermaid');
      
      // Make sure we have the proper result fields for the server
      if (Array.isArray(results.entities)) {
        results.entitiesCreated = results.entities;
      }
      
      if (Array.isArray(results.relationships)) {
        results.relationshipsCreated = results.relationships;
        console.log(` ℹ️ Setting relationshipsCreated to ${results.relationships.length} relationships`);
      }
      
      // Always set success flag explicitly based on what we created
      if (Array.isArray(results.entities) && results.entities.length > 0) {
        results.success = true;
        console.log(`  Deployment successful: Created ${results.entities.length} entities`);
      } else if (Array.isArray(results.relationships) && results.relationships.length > 0) {
        results.success = true;
        console.log(`  Deployment successful: Created ${results.relationships.length} relationships`);
      } else if (options.dryRun) {
        results.success = true;
        console.log(`  Dry run completed successfully`);
      } else {
        // Set default success if nothing else triggered it
        results.success = true; 
        console.log(`  Deployment completed`);
      }
      
      // Generate final summary after all operations
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
  cleanEntityMetadata(entity, options = {}) {
    const cleaned = { ...entity };
    
    // Map entity properties from parser format to Dataverse API format
    if (entity.name && !cleaned.LogicalName) {
      const publisherPrefix = options?.publisherPrefix || 'mmd';
      const unprefixedLogicalName = entity.name.toLowerCase(); // Convert to lowercase for Dataverse
      const prefixedLogicalName = `${publisherPrefix}_${unprefixedLogicalName}`; // Add prefix to LogicalName
      const prefixedSchemaName = `${publisherPrefix}_${entity.name}`;
      console.log(` Mapping entity.name "${entity.name}" to LogicalName "${prefixedLogicalName}"`);
      console.log(` Using prefixed SchemaName: "${prefixedSchemaName}"`);
      cleaned.LogicalName = prefixedLogicalName; // Use prefixed logical name
      cleaned.SchemaName = prefixedSchemaName; // Add publisher prefix to SchemaName
    }
    
    if (entity.displayName && !cleaned.DisplayName) {
      console.log(` Mapping entity.displayName "${entity.displayName}" to DisplayName`);
      cleaned.DisplayName = {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{
          '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
          Label: entity.displayName,
          LanguageCode: 1033
        }]
      };
      cleaned.DisplayCollectionName = {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{
          '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
          Label: entity.displayName + 's', // Pluralize for collection name
          LanguageCode: 1033
        }]
      };
    }
    
    // Add primary name attribute in Attributes array (required for entity creation)
    if (entity.attributes && Array.isArray(entity.attributes)) {
      // Find the primary key attribute
      const primaryAttribute = entity.attributes.find(attr => attr.isPrimaryKey);
      if (primaryAttribute) {
        const publisherPrefix = options?.publisherPrefix || 'mmd';
        const unprefixedLogicalName = (entity.name.toLowerCase() + '_' + primaryAttribute.name.toLowerCase()).replace(/[^a-z0-9_]/g, '');
        const primaryLogicalName = `${publisherPrefix}_${unprefixedLogicalName}`;
        const primarySchemaName = `${publisherPrefix}_${entity.name}${primaryAttribute.name.charAt(0).toUpperCase() + primaryAttribute.name.slice(1)}`;
        console.log(` Adding primary name attribute: ${primaryLogicalName} based on ${primaryAttribute.name}`);
        console.log(` Primary attribute SchemaName: ${primarySchemaName}`);
        cleaned.Attributes = [{
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          LogicalName: primaryLogicalName,
          SchemaName: primarySchemaName,
          DisplayName: {
            '@odata.type': 'Microsoft.Dynamics.CRM.Label',
            LocalizedLabels: [{
              '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
              Label: primaryAttribute.displayName || primaryAttribute.name,
              LanguageCode: 1033
            }]
          },
          AttributeType: 'String',
          AttributeTypeName: { Value: 'StringType' },
          MaxLength: 100,
          RequiredLevel: { Value: 'ApplicationRequired' },
          IsPrimaryName: true
        }];
      } else {
        // Create a default primary attribute if none specified
        const publisherPrefix = options?.publisherPrefix || 'mmd';
        const unprefixedLogicalName = entity.name.toLowerCase() + '_name';
        const defaultLogicalName = `${publisherPrefix}_${unprefixedLogicalName}`;
        const defaultSchemaName = `${publisherPrefix}_${entity.name}Name`;
        console.log(` Adding default primary name attribute: ${defaultLogicalName}`);
        console.log(` Default primary attribute SchemaName: ${defaultSchemaName}`);
        cleaned.Attributes = [{
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          LogicalName: defaultLogicalName,
          SchemaName: defaultSchemaName,
          DisplayName: {
            '@odata.type': 'Microsoft.Dynamics.CRM.Label',
            LocalizedLabels: [{
              '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
              Label: entity.displayName || entity.name,
              LanguageCode: 1033
            }]
          },
          AttributeType: 'String',
          AttributeTypeName: { Value: 'StringType' },
          MaxLength: 100,
          RequiredLevel: { Value: 'ApplicationRequired' },
          IsPrimaryName: true
        }];
      }
    }
    
    // Remove any properties that are not valid for EntityMetadata after mapping
    const invalidProperties = ['name', 'displayName', 'attributes'];
    invalidProperties.forEach(prop => {
      if (cleaned[prop]) {
        console.log(` Removing invalid property: ${prop} (after mapping)`);
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
        console.log(` Adding missing required property: ${prop} = ${defaultValue}`);
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
      if (!Object.prototype.hasOwnProperty.call(entityMetadata, prop)) {
        errors.push(`Missing required property: ${prop}`);
      }
    });
    
    // Check for invalid properties that cause API errors
    const invalidProperties = ['name', 'displayName', 'attributes'];
    invalidProperties.forEach(prop => {
      if (Object.prototype.hasOwnProperty.call(entityMetadata, prop)) {
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
      console.log(' Entity validation failed:');
      errors.forEach(error => console.log(`   • ${error}`));
      console.log(' Entity properties found:', Object.keys(entityMetadata));
    } else {
      console.log(' Entity validation passed');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Convert a Mermaid attribute to Dataverse column metadata
   * @param {Object} attribute - The Mermaid attribute
   * @param {Object} entity - The parent entity
   * @param {Object} options - Creation options including publisher prefix
   * @returns {Object} Dataverse column metadata
   */
  convertAttributeToColumnMetadata(attribute, entity, options = {}) {
    const publisherPrefix = options?.publisherPrefix || 'mmd';
    const columnLogicalName = `${publisherPrefix}_${attribute.name.toLowerCase()}`;
    const columnSchemaName = `${publisherPrefix}_${entity.name}${attribute.name.charAt(0).toUpperCase() + attribute.name.slice(1)}`;
    
    // Base metadata structure
    const baseMetadata = {
      LogicalName: columnLogicalName,
      SchemaName: columnSchemaName,
      DisplayName: {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{
          '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
          Label: attribute.displayName || attribute.name,
          LanguageCode: 1033
        }]
      },
      RequiredLevel: { 
        Value: attribute.isRequired ? 'ApplicationRequired' : 'None' 
      }
    };

    // Add description if available
    if (attribute.description) {
      baseMetadata.Description = {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{
          '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
          Label: attribute.description,
          LanguageCode: 1033
        }]
      };
    }

    // Handle different attribute types
    switch (attribute.type.toLowerCase()) {
      case 'string':
        return {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          ...baseMetadata,
          AttributeType: 'String',
          AttributeTypeName: { Value: 'StringType' },
          MaxLength: 255
        };

      case 'integer':
      case 'int':
        return {
          '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
          ...baseMetadata,
          AttributeType: 'Integer',
          AttributeTypeName: { Value: 'IntegerType' },
          MinValue: -2147483648,
          MaxValue: 2147483647
        };

      case 'decimal':
        return {
          '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata',
          ...baseMetadata,
          AttributeType: 'Decimal',
          AttributeTypeName: { Value: 'DecimalType' },
          Precision: 2,
          MinValue: -100000000000,
          MaxValue: 100000000000
        };

      case 'money':
        return {
          '@odata.type': 'Microsoft.Dynamics.CRM.MoneyAttributeMetadata',
          ...baseMetadata,
          AttributeType: 'Money',
          AttributeTypeName: { Value: 'MoneyType' },
          Precision: 2,
          MinValue: -922337203685477,
          MaxValue: 922337203685477
        };

      case 'boolean':
        return {
          '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
          ...baseMetadata,
          AttributeType: 'Boolean',
          AttributeTypeName: { Value: 'BooleanType' },
          DefaultValue: false,
          OptionSet: {
            '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
            TrueOption: {
              Value: 1,
              Label: {
                '@odata.type': 'Microsoft.Dynamics.CRM.Label',
                LocalizedLabels: [{
                  '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
                  Label: 'Yes',
                  LanguageCode: 1033
                }]
              }
            },
            FalseOption: {
              Value: 0,
              Label: {
                '@odata.type': 'Microsoft.Dynamics.CRM.Label',
                LocalizedLabels: [{
                  '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
                  Label: 'No',
                  LanguageCode: 1033
                }]
              }
            }
          }
        };

      case 'datetime':
        return {
          '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
          ...baseMetadata,
          AttributeType: 'DateTime',
          AttributeTypeName: { Value: 'DateTimeType' },
          Format: 'DateAndTime',
          DateTimeBehavior: { Value: 'UserLocal' }
        };

      // 📅 DATE ONLY
      case 'dateonly':
        return {
          '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
          ...baseMetadata,
          AttributeType: 'DateTime',
          AttributeTypeName: { Value: 'DateTimeType' },
          Format: 'DateOnly',
          DateTimeBehavior: { Value: 'DateOnly' }
        };

      case 'memo':
        return {
          '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
          ...baseMetadata,
          AttributeType: 'Memo',
          AttributeTypeName: { Value: 'MemoType' },
          MaxLength: 2000
        };

      case 'uniqueidentifier':
        return {
          '@odata.type': 'Microsoft.Dynamics.CRM.UniqueIdentifierAttributeMetadata',
          ...baseMetadata,
          AttributeType: 'Uniqueidentifier',
          AttributeTypeName: { Value: 'UniqueidentifierType' }
        };

      // ⏱️ DURATION
      case 'duration':
        return {
          '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
          ...baseMetadata,
          AttributeType: 'Integer',
          AttributeTypeName: { Value: 'IntegerType' },
          Format: 'Duration',
          MinValue: 0,
          MaxValue: 525600 // up to 1 year in minutes
        };

      // 📎 FILE (Using proper FileAttributeMetadata)
      case 'file':
        return {
          '@odata.type': 'Microsoft.Dynamics.CRM.FileAttributeMetadata',
          ...baseMetadata,
          MaxSizeInKB: 30720 // 30MB default
        };

      // 🖼️ IMAGE (Using proper ImageAttributeMetadata)
      case 'image':
        return {
          '@odata.type': 'Microsoft.Dynamics.CRM.ImageAttributeMetadata',
          ...baseMetadata,
          MaxSizeInKB: 30720, // 30MB default
          CanStoreFullImage: true
        };

      // 🌐 URL
      case 'url':
        return {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          ...baseMetadata,
          AttributeType: 'String',
          AttributeTypeName: { Value: 'StringType' },
          Format: 'Url',
          MaxLength: 500
        };

      // ☎️ PHONE
      case 'phone':
        return {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          ...baseMetadata,
          AttributeType: 'String',
          AttributeTypeName: { Value: 'StringType' },
          Format: 'Phone',
          MaxLength: 100
        };

      // 🕵️ TICKER SYMBOL
      case 'ticker':
        return {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          ...baseMetadata,
          AttributeType: 'String',
          AttributeTypeName: { Value: 'StringType' },
          Format: 'TickerSymbol',
          MaxLength: 10
        };

      // 🌐 TIMEZONE
      case 'timezone':
        return {
          '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
          ...baseMetadata,
          AttributeType: 'Integer',
          AttributeTypeName: { Value: 'IntegerType' },
          Format: 'TimeZone',
          MinValue: 0,
          MaxValue: 255
        };

      // 🌍 LANGUAGE CODE
      case 'language':
        return {
          '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
          ...baseMetadata,
          AttributeType: 'Integer',
          AttributeTypeName: { Value: 'IntegerType' },
          Format: 'Language',
          MinValue: 1033,
          MaxValue: 9999
        };

      // 🔢 FLOAT
      case 'float':
      case 'double':
        return {
          '@odata.type': 'Microsoft.Dynamics.CRM.DoubleAttributeMetadata',
          ...baseMetadata,
          AttributeType: 'Double',
          AttributeTypeName: { Value: 'DoubleType' },
          Precision: 2,
          MinValue: 0,
          MaxValue: 100000
        };

      // EMAIL (special string format)
      case 'email':
        return {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          ...baseMetadata,
          AttributeType: 'String',
          AttributeTypeName: { Value: 'StringType' },
          Format: 'Email',
          MaxLength: 320
        };

      case 'choice':
        if (attribute.isChoice && attribute.choiceOptions) {
          const optionSetMetadata = {
            '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
            Options: attribute.choiceOptions.map((option, index) => ({
              Value: index + 1,
              Label: {
                '@odata.type': 'Microsoft.Dynamics.CRM.Label',
                LocalizedLabels: [{
                  '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
                  Label: option.trim(),
                  LanguageCode: 1033
                }]
              }
            }))
          };

          return {
            '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
            ...baseMetadata,
            AttributeType: 'Picklist',
            AttributeTypeName: { Value: 'PicklistType' },
            OptionSet: optionSetMetadata
          };
        }
        break;

      case 'lookup':
        if (attribute.isLookup && attribute.targetEntity) {
          // Note: Lookup columns are created through relationships, not as regular attributes
          // Skip lookup attributes here as they'll be handled by relationship creation
          console.log(`   Skipping lookup attribute ${attribute.name} - will be created via relationship`);
          return null;
        }
        break;

      default:
        console.warn(`   Unknown attribute type: ${attribute.type}, defaulting to String`);
        return {
          '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
          ...baseMetadata,
          AttributeType: 'String',
          AttributeTypeName: { Value: 'StringType' },
          MaxLength: 255
        };
    }

    console.warn(`   Could not convert attribute ${attribute.name} of type ${attribute.type}`);
    return null;
  }

  /**
   * Check if a solution exists in Dataverse
   * @param {string} solutionUniqueName - The unique name of the solution to check
   * @returns {Promise<Object|null>} - The solution object if found, null otherwise
   */
  async findSolution(solutionUniqueName) {
    try {
      await this.authenticate();
      
      console.log(` Looking up solution '${solutionUniqueName}'...`);
      logToFile(`Finding solution: ${solutionUniqueName}`);
      
      const solutionResponse = await this.makeRequest(
        'GET',
        `solutions?$filter=uniquename eq '${solutionUniqueName}'&$select=solutionid,uniquename,friendlyname`
      );
      
      if (solutionResponse.value && solutionResponse.value.length > 0) {
        console.log(`  Found solution: ${solutionUniqueName}`);
        logToFile(` Found solution: ${solutionUniqueName}`, solutionResponse.value[0]);
        return solutionResponse.value[0];
      }
      
      console.log(` ⚠️ Solution not found: ${solutionUniqueName}`);
      logToFile(`⚠️ Solution not found: ${solutionUniqueName}`);
      return null;
    } catch (error) {
      console.error(` ❌ Error finding solution: ${error.message}`);
      logToFile(`❌ Error finding solution: ${solutionUniqueName}`, {
        error: error.message,
        stack: error.stack
      });
      return null;
    }
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
        console.log(` Checking if solution '${solutionUniqueName}' exists...`);
      }
      
      const response = await this.makeRequest(
        `GET`,
        `solutions?$filter=uniquename eq '${solutionUniqueName}'&$select=solutionid,uniquename,friendlyname,version,ismanaged`
      );
      
      if (this.verbose) {
        console.log(' Raw response from solutions API:', {
          status: undefined,
          statusText: undefined,
          hasData: !!response,
          dataValue: response?.value || 'no value property'
        });
      }
      
      // Handle different response structures
      let solutions = [];
      if (response && response.value) {
        solutions = response.value;
      } else if (Array.isArray(response)) {
        solutions = response;
      } else {
        console.warn(' Unexpected response structure:', response);
        solutions = [];
      }
      
      const exists = solutions.length > 0;
      
      if (this.verbose) {
        console.log(` Found ${solutions.length} solutions matching '${solutionUniqueName}'`);
      }
      
      return {
        success: true,
        exists: exists,
        solution: exists ? solutions[0] : null,
        message: exists ? `Solution '${solutionUniqueName}' found` : `Solution '${solutionUniqueName}' not found`
      };
    } catch (error) {
      console.error(' Error checking solution:', error);
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
        console.log(' Creating solution with payload:', JSON.stringify(solutionPayload, null, 2));
      }
      
      const response = await this.makeRequest('POST', 'solutions', solutionPayload);
      
      // For POST requests, the ID is typically in the Location header or the response contains an @odata.id
      let solutionId = null;
      if (response && response.solutionid) {
        solutionId = response.solutionid;
      } else if (response && response['@odata.id']) {
        // Extract ID from @odata.id which looks like: /solutions(guid)
        const match = response['@odata.id'].match(/solutions\(([^)]+)\)/);
        if (match) {
          solutionId = match[1];
        }
      }
      
      console.log(' Solution creation response:', {
        fullResponse: response,
        extractedSolutionId: solutionId
      });
      
      return {
        success: true,
        solutionId: solutionId,
        message: `Solution '${solutionData.uniqueName}' created successfully`,
        solution: response
      };
    } catch (error) {
      console.error(' Solution creation failed:', error);
      
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
      console.log(` Solution '${solutionUniqueName}' not found, creating it...`);
      
      // First ensure a publisher exists (required for solution creation)
      let publisherId = options.publisherId;
      if (!publisherId) {
        // Generate publisher name from the customization prefix
        const customizationPrefix = options.customizationPrefix || 'mmd';
        const publisherName = `${customizationPrefix}Publisher`;
        const publisherFriendlyName = `${customizationPrefix.toUpperCase()} Publisher`;
        
        console.log(` DEBUG: options.customizationPrefix = "${options.customizationPrefix}"`);
        console.log(` DEBUG: calculated customizationPrefix = "${customizationPrefix}"`);
        console.log(` DEBUG: calculated publisherName = "${publisherName}"`);
        console.log(` DEBUG: calculated publisherFriendlyName = "${publisherFriendlyName}"`);
        console.log(` Ensuring publisher '${publisherName}' exists with prefix '${customizationPrefix}'...`);
        
        const publisherResult = await this.ensurePublisherExists(publisherName, {
          friendlyName: publisherFriendlyName,
          description: `Publisher for ${customizationPrefix.toUpperCase()} solutions generated from Mermaid ERD`,
          customizationPrefix: customizationPrefix
        });
        
        console.log(` DEBUG: Publisher creation result:`, {
          success: publisherResult.success,
          created: publisherResult.created,
          message: publisherResult.message,
          error: publisherResult.error,
          hasPublisher: !!publisherResult.publisher,
          publisherKeys: publisherResult.publisher ? Object.keys(publisherResult.publisher) : 'no publisher',
          publisherId: publisherResult.publisher ? publisherResult.publisher.publisherid : 'no publisher id'
        });
        
        if (!publisherResult.success) {
          console.error(` Publisher creation failed:`, publisherResult);
          throw new Error(`Publisher creation failed: ${publisherResult.error}`);
        }

        publisherId = publisherResult.publisher.publisherid;
        console.log(` Publisher ready: ${publisherResult.message}`);
        console.log(` DEBUG: Retrieved publisherId = "${publisherId}"`);
        
        // Double-check that we have a valid publisher ID
        if (!publisherId) {
          console.error(' Publisher creation succeeded but no publisherId returned');
          console.error(' Full publisher result:', JSON.stringify(publisherResult, null, 2));
          throw new Error('Publisher creation succeeded but no publisherId was returned');
        }
      }
      
      // Validate that we have a valid publisherId before creating solution
      if (!publisherId) {
        throw new Error('Failed to get a valid publisher ID for solution creation');
      }
      
      console.log(` Creating solution with uniqueName: "${solutionUniqueName}", publisherId: "${publisherId}"`);
      const createResult = await this.createSolution({
        uniqueName: solutionUniqueName,
        friendlyName: options.friendlyName || solutionUniqueName,
        description: options.description,
        version: options.version,
        publisherId: publisherId
      });
      
      if (!createResult.success) {
        console.error(` Solution creation failed:`, {
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
      if (response.data && response.data.value) {
        solutions = response.data.value;
      } else if (response.data && Array.isArray(response.data)) {
        solutions = response.data;
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
      if (response.data && response.data.value) {
        publishers = response.data.value;
      } else if (Array.isArray(response.data)) {
        publishers = response.data;
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
      
      console.log(' DEBUG: Creating publisher with payload:', JSON.stringify(publisherPayload, null, 2));
      
      if (this.verbose) {
        console.log(' Creating publisher with payload:', JSON.stringify(publisherPayload, null, 2));
      }
      
      const response = await this.makeRequest('POST', 'publishers', publisherPayload);
      
      console.log(' DEBUG: Publisher creation response:', {
        fullResponse: response,
        hasPublisherId: !!(response && (response.publisherid || response.PublisherId || response.id)),
        dataKeys: response ? Object.keys(response) : 'no response'
      });
      
      // For POST requests, the ID might be in different locations
      let publisherId = null;
      if (response && response.publisherid) {
        publisherId = response.publisherid;
      } else if (response && response.PublisherId) {
        publisherId = response.PublisherId;
      } else if (response && response.id) {
        publisherId = response.id;
      } else if (response && response['@odata.id']) {
        // Extract ID from @odata.id which looks like: /publishers(guid)
        const match = response['@odata.id'].match(/publishers\(([^)]+)\)/);
        if (match) {
          publisherId = match[1];
        }
      }
      
      // If we still don't have a publisher ID, query for the newly created publisher
      if (!publisherId) {
        console.log(' DEBUG: No publisher ID in creation response, querying for created publisher...');
        
        // Try multiple times with increasing delays to allow creation to complete
        const maxRetries = 5;
        let attempt = 0;
        let checkResult = null;
        
        while (attempt < maxRetries && !publisherId) {
          attempt++;
          const delay = attempt * 1000; // 1s, 2s, 3s, 4s, 5s
          console.log(` DEBUG: Attempt ${attempt}/${maxRetries}, waiting ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          checkResult = await this.checkPublisherExists(publisherData.uniqueName);
          console.log(` DEBUG: Attempt ${attempt} result:`, {
            success: checkResult.success,
            exists: checkResult.exists,
            publisherId: checkResult.publisher ? checkResult.publisher.publisherid : 'none'
          });
          
          if (checkResult.success && checkResult.exists) {
            publisherId = checkResult.publisher.publisherid;
            console.log(` DEBUG: Retrieved publisher ID from query attempt ${attempt}: "${publisherId}"`);
            break;
          }
        }
        
        if (!publisherId) {
          console.error(' DEBUG: Failed to retrieve publisher after creation and all retry attempts:', checkResult);
          
          // Let's also try querying all publishers to see if it was created with a different name
          console.log(' DEBUG: Checking all publishers to see if creation succeeded...');
          try {
            const allPublishersResponse = await this.makeRequest('GET', 'publishers?$select=publisherid,uniquename,friendlyname,customizationprefix');
            console.log(' DEBUG: All publishers:', JSON.stringify(allPublishersResponse, null, 2));
          } catch (error) {
            console.log(' DEBUG: Failed to get all publishers:', error.message);
          }
        }
      }
      
      console.log(` DEBUG: Final publisher ID: "${publisherId}"`);
      
      if (!publisherId) {
        // Even if we don't have the ID, the creation might have succeeded
        // Return partial success with diagnostic information
        return {
          success: false,
          error: 'Failed to get publisher ID from creation response or subsequent query',
          details: 'Publisher may have been created but ID could not be retrieved',
          diagnostics: {
            creationResponse: response,
            publisherName: publisherData.uniqueName,
            customizationPrefix: publisherData.customizationPrefix
          },
          statusCode: 'Unknown'
        };
      }
      
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
      console.error(' Publisher creation failed:', error);
      
      // Extract detailed error information
      let errorDetails = error.message;
      if (error.response && error.response.data) {
        errorDetails = JSON.stringify(error.response.data, null, 2);
        console.error(' DEBUG: Publisher creation error details:', errorDetails);
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
      
      console.log(' DEBUG: checkPublisherExists response:', {
        hasResponse: !!response,
        hasValue: !!(response && response.value),
        responseKeys: response ? Object.keys(response) : 'no response',
        valueLength: response && response.value ? response.value.length : 'no value'
      });
      
      let publishers = [];
      if (response && response.value) {
        publishers = response.value;
      } else if (Array.isArray(response)) {
        publishers = response;
      }
      
      console.log(` DEBUG: checkPublisherExists found ${publishers.length} publishers`);
      
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
   * Check if a publisher exists by customization prefix
   * @param {string} customizationPrefix - Customization prefix to search for
   * @returns {Promise<Object>} Result with exists boolean and publisher details
   */
  async checkPublisherByPrefix(customizationPrefix) {
    try {
      await this.authenticate();
      
      const response = await this.makeRequest(
        'GET',
        `publishers?$filter=customizationprefix eq '${customizationPrefix}'&$select=publisherid,uniquename,friendlyname,customizationprefix`
      );
      
      console.log(` DEBUG: checkPublisherByPrefix('${customizationPrefix}') response:`, {
        hasResponse: !!response,
        hasValue: !!(response && response.value),
        valueLength: response && response.value ? response.value.length : 'no value'
      });
      
      let publishers = [];
      if (response && response.value) {
        publishers = response.value;
      } else if (Array.isArray(response)) {
        publishers = response;
      }
      
      console.log(` DEBUG: checkPublisherByPrefix found ${publishers.length} publishers with prefix '${customizationPrefix}'`);
      
      const exists = publishers.length > 0;
      
      return {
        success: true,
        exists: exists,
        publisher: exists ? publishers[0] : null,
        message: exists ? `Publisher with prefix '${customizationPrefix}' found: ${publishers[0].uniquename}` : `No publisher found with prefix '${customizationPrefix}'`
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
      // First check if publisher exists by unique name
      const checkByNameResult = await this.checkPublisherExists(publisherUniqueName);
      if (!checkByNameResult.success) {
        throw new Error(checkByNameResult.error);
      }
      
      if (checkByNameResult.exists) {
        return {
          success: true,
          publisher: checkByNameResult.publisher,
          created: false,
          message: `Using existing publisher '${publisherUniqueName}'`
        };
      }

      // Also check if a publisher with the same prefix already exists
      const prefix = options.customizationPrefix || 'mmd';
      const checkByPrefixResult = await this.checkPublisherByPrefix(prefix);
      
      if (checkByPrefixResult.exists) {
        console.log(` Publisher with prefix '${prefix}' already exists: ${checkByPrefixResult.publisher.uniquename}`);
        return {
          success: true,
          publisher: checkByPrefixResult.publisher,
          created: false,
          message: `Using existing publisher '${checkByPrefixResult.publisher.uniquename}' (same prefix '${prefix}')`
        };
      }
      
      // No publisher exists with this name or prefix, create it
      console.log(` Publisher '${publisherUniqueName}' not found, creating it with prefix '${prefix}'...`);
      
      const createResult = await this.createPublisher({
        uniqueName: publisherUniqueName,
        friendlyName: options.friendlyName || publisherUniqueName,
        description: options.description,
        customizationPrefix: prefix,
        optionValuePrefix: options.optionValuePrefix || 10000
      });
      
      if (!createResult.success) {
        throw new Error(createResult.error);
      }
      
      return {
        success: true,
        publisher: createResult.publisher,
        created: true,
        message: `Created new publisher '${publisherUniqueName}' with prefix '${prefix}'`
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
      console.log(` Creating attribute: ${attributeMetadata.LogicalName} for entity ${entityLogicalName}`);
      
      // Add solution header if solution name is available
      const headers = {};
      if (this.solutionName) {
        headers['MSCRM.SolutionUniqueName'] = this.solutionName;
      }
      
      if (this.verbose) {
        console.log('Attribute metadata:', JSON.stringify(attributeMetadata, null, 2));
      }
      
      const response = await this.makeRequest('POST', `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes`, attributeMetadata, headers);
      
      console.log(` Attribute ${attributeMetadata.LogicalName} created successfully for ${entityLogicalName}`);
      
      return response;
    } catch (error) {
      const errorDetails = {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      };
      
      console.error(` Failed to create attribute ${attributeMetadata.LogicalName} for ${entityLogicalName}:`, errorDetails);
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
      console.log(` Creating relationship: ${relationshipMetadata.SchemaName}`);
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
        console.log(' Full relationship metadata:', JSON.stringify(relationshipMetadata, null, 2));
      }
      
      console.log(' Sending relationship creation request to Dataverse...');
      const response = await this.makeRequest('POST', 'RelationshipDefinitions', relationshipMetadata, headers);
      
      console.log(` Relationship ${relationshipMetadata.SchemaName} created successfully`);
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
      
      console.error(` Failed to create relationship ${relationshipMetadata.SchemaName}:`);
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
      console.log(' Relationship validation failed:');
      errors.forEach(error => console.log(`   • ${error}`));
    } else {
      console.log(' Relationship validation passed');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if a global choice set exists
   * @param {string} name - Choice set name
   * @returns {Promise<{exists: boolean, choiceSet?: object}>}
   */
  async checkGlobalChoiceExists(name) {
    try {
      console.log(` Checking if global choice set '${name}' exists...`);
      
      // Note: $filter is not supported on GlobalOptionSetDefinitions, so we get all and filter client-side
      const endpoint = `/api/data/v${this.apiVersion}/GlobalOptionSetDefinitions?$select=MetadataId,Name,DisplayName`;
      const response = await this.makeRequest('GET', endpoint);
      
      if (response.value) {
        // Filter on client side since server-side filtering is not supported
        const existingChoiceSet = response.value.find(choice => 
          choice.Name && choice.Name.toLowerCase() === name.toLowerCase()
        );
        
        if (existingChoiceSet) {
          console.log(` Global choice set '${name}' already exists (ID: ${existingChoiceSet.MetadataId})`);
          return { exists: true, choiceSet: existingChoiceSet };
        } else {
          console.log(`ℹ Global choice set '${name}' does not exist`);
          return { exists: false };
        }
      } else {
        console.log(`ℹ No global choice sets found, '${name}' does not exist`);
        return { exists: false };
      }
    } catch (error) {
      console.error(` Error checking global choice set '${name}':`, error.message);
      throw error;
    }
  }

  /**
   * Create a global choice set
   * @param {object} choiceDefinition - Choice set definition
   * @returns {Promise<{success: boolean, choiceSet?: object, created?: boolean}>}
   */
  async createGlobalChoice(choiceDefinition) {
    try {
      const { name, displayName, description, options } = choiceDefinition;
      
      // Get the publisher prefix from the client
      const publisherPrefix = this.publisherPrefix || '';
      
      // Construct the name with publisher prefix if we have one
      // Only add the prefix if it's not already there
      const prefixedName = publisherPrefix ? 
        (name.startsWith(`${publisherPrefix}_`) ? name : `${publisherPrefix}_${name}`) : 
        name;
      
      logToFile(`🔧 Creating global choice set: ${displayName} (${prefixedName})`, {
        originalName: name,
        prefixedName,
        publisherPrefix,
        displayName,
        description,
        optionsCount: options?.length || 0,
        hasValidOptions: Array.isArray(options) && options.length > 0
      });
      
      // Validate required fields
      if (!name || !displayName || !options || !Array.isArray(options) || options.length === 0) {
        throw new Error(`Invalid choice definition: name=${name}, displayName=${displayName}, optionsCount=${options?.length || 0}`);
      }
      
      // Check if it already exists
      logToFile(`Checking if choice set '${prefixedName}' already exists...`);
      const existsCheck = await this.checkGlobalChoiceExists(prefixedName);
      if (existsCheck.exists) {
        logToFile(`⏭ Global choice set '${prefixedName}' already exists, skipping creation`);
        return { success: true, choiceSet: existsCheck.choiceSet, created: false };
      }
      
      logToFile(` Choice set '${prefixedName}' does not exist, proceeding with creation...`);
      
      // Prepare options array with correct Microsoft structure
      const formattedOptions = options.map((option, index) => ({
        Value: option.value || (100000000 + index),
        Label: {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [
            {
              "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
              Label: option.label,
              LanguageCode: 1033,
              IsManaged: false
            }
          ],
          UserLocalizedLabel: {
            "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
            Label: option.label,
            LanguageCode: 1033,
            IsManaged: false
          }
        }
      }));
      
      // Create the global choice set with Microsoft's exact structure
      const metadata = {
        "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
        Name: prefixedName,
        DisplayName: {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [
            {
              "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
              Label: displayName,
              LanguageCode: 1033,
              IsManaged: false
            }
          ],
          UserLocalizedLabel: {
            "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
            Label: displayName,
            LanguageCode: 1033,
            IsManaged: false
          }
        },
        Description: {
          "@odata.type": "Microsoft.Dynamics.CRM.Label",
          LocalizedLabels: [
            {
              "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
              Label: description || displayName,
              LanguageCode: 1033,
              IsManaged: false
            }
          ],
          UserLocalizedLabel: {
            "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
            Label: description || displayName,
            LanguageCode: 1033,
            IsManaged: false
          }
        },
        OptionSetType: "Picklist",
        Options: formattedOptions
      };
      
      // Note: SolutionUniqueName cannot be specified during creation of global option sets
      // The option set will be created in the default solution and can be moved later if needed
      
      console.log(` Creating global choice set with ${options.length} options...`);
      
      const endpoint = `/api/data/v${this.apiVersion}/GlobalOptionSetDefinitions`;
      console.log(` API endpoint: ${endpoint}`);
      console.log(` Metadata summary:`, {
        name: metadata.Name,
        displayName: metadata.DisplayName?.LocalizedLabels?.[0]?.Label,
        optionsCount: metadata.Options?.length || 0,
        solutionContext: this.solutionName || 'default'
      });
      
      // Prepare headers with solution information
      const headers = {};
      if (this.solutionName) {
        // Cannot use solution header during global choice creation
        // Will add to solution later using AddSolutionComponent
        logToFile(`ℹ️ Solution '${this.solutionName}' will be associated later (not during creation)`);
      }
      
      let response;
      try {
        console.log(`📤 Global choice request payload:`, JSON.stringify(metadata, null, 2));
        response = await this.makeRequest('POST', endpoint, metadata, headers);
        logToFile(` API Response received for global choice '${prefixedName}'`, {
          hasResponse: !!response,
          responseType: typeof response,
          responseKeys: response ? Object.keys(response) : [],
          responseData: response,
          metadataIdFound: response?.MetadataId || 'not found'
        });
      } catch (apiError) {
        logToFile(`🚨 API Request failed for global choice '${prefixedName}'`, {
          error: apiError.message,
          status: apiError.response?.status || apiError.code,
          statusText: apiError.response?.statusText,
          responseData: apiError.response?.data,
          endpoint,
          errorObject: JSON.stringify(apiError),
          responseObject: apiError.response ? JSON.stringify(apiError.response) : 'No response',
          authConfigured: !!(this.clientId && this.tenantId),
          hasAccessToken: !!this.accessToken,
          accessTokenPreview: this.accessToken ? this.accessToken.substring(0, 20) + '...' : 'none',
          metadata: metadata
        });
        
        throw new Error(`API request failed: ${apiError.message} (Status: ${apiError.response?.status || 'unknown'})`);
      }
      
      console.log(` Global choice set '${prefixedName}' created successfully`);
      
      // Cache the choice set
      this.globalChoiceSets.set(prefixedName, {
        name: prefixedName,
        displayName,
        description,
        options,
        metadataId: response?.MetadataId || response?.['@odata.context'] || 'unknown'
      });
      
      // Store for later solution addition (skip during creation if solution doesn't exist yet)
      if (this.solutionName) {
        logToFile(`🔖 Storing global choice '${prefixedName}' for later solution addition to '${this.solutionName}'`);
        console.log(`🔖 Global choice '${prefixedName}' will be added to solution '${this.solutionName}' after solution creation`);
        
        // Store the choice for later addition to solution
        this.storeGlobalChoiceForSolutionAddition(prefixedName, this.solutionName, response?.MetadataId);
      } else {
        logToFile(`ℹ️ No solution name specified, skipping solution addition for '${prefixedName}'`);
      }
      
      return { 
        success: true, 
        choiceSet: metadata,
        created: true,
        metadataId: response?.MetadataId || response?.['@odata.context'] || 'unknown'
      };
      
    } catch (error) {
      // In error case, we might not have access to prefixedName, so we construct it again
      const errorPrefixedName = this.publisherPrefix ? 
        (choiceDefinition.name.startsWith(`${this.publisherPrefix}_`) ? 
          choiceDefinition.name : `${this.publisherPrefix}_${choiceDefinition.name}`) : 
        choiceDefinition.name;
        
      console.error(` Error creating global choice set '${errorPrefixedName}':`, {
        error: error.message,
        stack: error.stack,
        name: error.name,
        choiceDefinition: {
          name: choiceDefinition.name,
          prefixedName: errorPrefixedName,
          displayName: choiceDefinition.displayName,
          optionsCount: choiceDefinition.options?.length || 0
        }
      });
      throw error;
    }
  }

  /**
   * Create multiple global choice sets from JSON definition
   * @param {object} choicesJson - JSON object with globalChoices array
   * @returns {Promise<{success: boolean, created: number, skipped: number, errors: Array}>}
   */
  async createGlobalChoicesFromJson(choicesJson, addToSolution = true) {
    try {
      logToFile('createGlobalChoicesFromJson: Starting', { 
        choicesJson,
        addToSolution 
      });
      
      // Handle both formats: direct array or wrapped in globalChoices property
      let choicesToProcess;
      if (Array.isArray(choicesJson)) {
        // Direct array format
        choicesToProcess = choicesJson;
        logToFile('createGlobalChoicesFromJson: Using direct array format');
      } else if (choicesJson.globalChoices && Array.isArray(choicesJson.globalChoices)) {
        // Wrapped format
        choicesToProcess = choicesJson.globalChoices;
        logToFile('createGlobalChoicesFromJson: Using wrapped format');
      } else {
        throw new Error('Invalid JSON format: expected array or object with globalChoices array');
      }
      
      logToFile(`createGlobalChoicesFromJson: Found ${choicesToProcess.length} choices to process`);

      const results = {
        success: true,
        created: 0,
        skipped: 0,
        addedToSolution: 0,
        errors: [],
        choiceSets: []
      };

      for (const choiceDefinition of choicesToProcess) {
        try {
          logToFile(`createGlobalChoicesFromJson: Processing choice`, {
            name: choiceDefinition.name,
            displayName: choiceDefinition.displayName,
            optionsCount: choiceDefinition.options?.length || 0,
            fullDefinition: choiceDefinition
          });
          
          // Check if choice already exists first
          const existingChoice = await this.findGlobalChoiceByName(choiceDefinition.name);
          
          if (existingChoice) {
            // Get the publisher prefix to ensure correct name is stored
            const publisherPrefix = this.publisherPrefix || '';
            const prefixedName = publisherPrefix ? 
              (choiceDefinition.name.startsWith(`${publisherPrefix}_`) ? 
                choiceDefinition.name : `${publisherPrefix}_${choiceDefinition.name}`) : 
              choiceDefinition.name;
                
            // Choice exists, just add to solution
            logToFile(`Choice '${prefixedName}' already exists, adding to solution`);
            
            if (this.solutionName && addToSolution) {
              try {
                const addResult = await this.addGlobalChoiceToSolution(prefixedName, this.solutionName);
                if (addResult) {
                  results.addedToSolution++;
                  logToFile(` Added existing choice '${prefixedName}' to solution`);
                }
              } catch (addError) {
                logToFile(`⚠️ Failed to add existing choice to solution: ${addError.message}`);
                // Store for later addition
                this.storeGlobalChoiceForSolutionAddition(prefixedName, this.solutionName);
              }
            } else if (this.solutionName && !addToSolution) {
              // Store for later addition after solution is created
              this.storeGlobalChoiceForSolutionAddition(prefixedName, this.solutionName);
              logToFile(`📌 Stored choice '${prefixedName}' for later solution addition`);
            }
            
            results.skipped++;
            results.choiceSets.push({
              success: true,
              choiceSet: existingChoice,
              created: false,
              addedToSolution: !!this.solutionName
            });
            logToFile(`⏭ Skipped: ${choiceDefinition.displayName} (already exists)`);
          } else {
            // Choice doesn't exist, create it
            const result = await this.createGlobalChoice(choiceDefinition);
            
            // Get the prefixed name used in creation
            const publisherPrefix = this.publisherPrefix || '';
            const prefixedName = publisherPrefix ? 
              (choiceDefinition.name.startsWith(`${publisherPrefix}_`) ? 
                choiceDefinition.name : `${publisherPrefix}_${choiceDefinition.name}`) : 
              choiceDefinition.name;
                
            logToFile(`createGlobalChoicesFromJson: Result for ${prefixedName} (original: ${choiceDefinition.name})`, result);
            
            results.choiceSets.push(result);
            
            if (result.created) {
              results.created++;
              logToFile(` Created: ${choiceDefinition.displayName}`);
              
              // If we have a solution name but we're not adding to solution now, store for later
              if (this.solutionName && !addToSolution) {
                this.storeGlobalChoiceForSolutionAddition(prefixedName, this.solutionName);
                logToFile(`📌 Stored newly created choice '${prefixedName}' for later solution addition`);
              }
            } else {
              results.skipped++;
              logToFile(`⏭ Skipped: ${choiceDefinition.displayName} (already exists)`);
              
              // If we have a solution name but we're not adding to solution now, store for later
              if (this.solutionName && !addToSolution) {
                this.storeGlobalChoiceForSolutionAddition(prefixedName, this.solutionName);
                logToFile(`📌 Stored existing choice '${prefixedName}' for later solution addition`);
              }
            }
          }

        } catch (error) {
          logToFile(`🚨 createGlobalChoicesFromJson: Error processing ${choiceDefinition.name}`, {
            error: error.message,
            stack: error.stack,
            choiceDefinition: choiceDefinition
          });
          results.errors.push({
            choiceSet: choiceDefinition.name,
            error: error.message
          });
        }
      }

      logToFile(`createGlobalChoicesFromJson: Final results`, results);

      // Don't mark as failed if we successfully processed choices (even if some already existed)
      if (results.errors.length > 0 && (results.created + results.skipped + results.addedToSolution) === 0) {
        results.success = false;
      }

      return results;

    } catch (error) {
      logToFile('🚨 createGlobalChoicesFromJson: Top-level error', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get all publishers in the environment
   * @returns {Promise<Array>} List of publishers
   */
  async getPublishers() {
    try {
      console.log('Fetching publishers from Dataverse (optimized)...');
      
      // Optimized query: limit fields, add top filter, exclude system publishers that aren't needed
      const query = '/publishers?$select=publisherid,uniquename,friendlyname,customizationprefix&$filter=isreadonly eq false&$top=50&$orderby=friendlyname';
      
      const response = await this.makeRequest('GET', query);
      
      if (response && response.value) {
        console.log(`Found ${response.value.length} publishers (filtered for custom publishers)`);
        
        const publishers = response.value.map(pub => ({
          id: pub.publisherid,
          uniqueName: pub.uniquename,
          friendlyName: pub.friendlyname,
          prefix: pub.customizationprefix,
          isDefault: pub.uniquename === 'Default' || pub.uniquename === 'MicrosoftCorporation'
        }));

        // Always include default publishers at the top
        const defaultPublishers = publishers.filter(p => p.isDefault);
        const customPublishers = publishers.filter(p => !p.isDefault);
        
        const sortedPublishers = [...defaultPublishers, ...customPublishers];

        console.log(`Returning ${sortedPublishers.length} publishers (${defaultPublishers.length} default, ${customPublishers.length} custom)`);
        return sortedPublishers;
      }
      
      console.log('No publishers found in response');
      return [];
    } catch (error) {
      console.error('Error fetching publishers:', error.message);
      throw error;
    }
  }

  /**
   * Get all global choice sets (option sets) in the environment
   * @returns {Promise<Array>} List of global choice sets
   */
  async getGlobalChoiceSets() {
    try {
      console.log('Fetching global choice sets from Dataverse (with categorization)...');
      
      // Get ALL choice sets but with optimized fields for performance
      const query = '/GlobalOptionSetDefinitions?$select=MetadataId,Name,DisplayName,Description,IsCustomOptionSet&$orderby=IsCustomOptionSet desc,DisplayName/LocalizedLabels/any(l:l/Label)';
      
      const response = await this.makeRequest('GET', query);
      
      if (response.value) {
        const choiceSets = response.value.map(cs => ({
          id: cs.MetadataId,
          name: cs.Name,
          displayName: cs.DisplayName?.LocalizedLabels?.[0]?.Label || cs.Name,
          description: cs.Description?.LocalizedLabels?.[0]?.Label || '',
          isCustom: cs.IsCustomOptionSet || false,
          category: cs.IsCustomOptionSet ? 'Custom' : 'Built-in',
          options: [] // Options will be fetched separately if needed
        }));

        // Group and sort the choice sets
        const customChoices = choiceSets.filter(cs => cs.isCustom)
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
        const builtInChoices = choiceSets.filter(cs => !cs.isCustom)
          .sort((a, b) => a.displayName.localeCompare(b.displayName));

        console.log(`Found ${choiceSets.length} choice sets total (${customChoices.length} custom, ${builtInChoices.length} built-in)`);
        
        // Return grouped structure for easier frontend handling
        return {
          all: choiceSets,
          grouped: {
            custom: customChoices,
            builtIn: builtInChoices
          },
          summary: {
            total: choiceSets.length,
            custom: customChoices.length,
            builtIn: builtInChoices.length
          }
        };
      }
      
      return {
        all: [],
        grouped: { custom: [], builtIn: [] },
        summary: { total: 0, custom: 0, builtIn: 0 }
      };
    } catch (error) {
      console.error('Error fetching global choice sets:', error.message);
      throw error;
    }
  }

  /**
   * Check if Common Data Model entities exist in the environment
   * @param {Array<string>} entityNames - List of entity names to check
   * @returns {Promise<Object>} Map of entity availability
   */
  async checkCDMEntities(entityNames = []) {
    try {
      console.log(' Checking CDM entity availability...');
      
      const cdmEntities = entityNames.length > 0 ? entityNames : [
        'account', 'contact', 'lead', 'opportunity', 'incident',
        'activity', 'email', 'phonecall', 'task', 'appointment',
        'systemuser', 'team', 'businessunit',
        'product', 'pricelevel', 'quote', 'salesorder', 'invoice',
        'campaign', 'list', 'competitor'
      ];

      const entityMap = {};
      
      for (const entityName of cdmEntities) {
        try {
          const response = await this.makeRequest('GET', `/EntityDefinitions(LogicalName='${entityName}')?$select=LogicalName,DisplayName,IsCustomEntity,PrimaryNameAttribute`);
          
          entityMap[entityName] = {
            exists: true,
            logicalName: response.LogicalName,
            displayName: response.DisplayName?.LocalizedLabels?.[0]?.Label || entityName,
            isCustom: response.IsCustomEntity,
            primaryNameAttribute: response.PrimaryNameAttribute
          };
        } catch (error) {
          // Entity doesn't exist
          entityMap[entityName] = {
            exists: false,
            logicalName: null,
            displayName: null,
            isCustom: null,
            primaryNameAttribute: null
          };
        }
      }

      const existingCount = Object.values(entityMap).filter(e => e.exists).length;
      console.log(` Found ${existingCount}/${cdmEntities.length} CDM entities`);
      
      return entityMap;
    } catch (error) {
      console.error(' Error checking CDM entities:', error.message);
      throw error;
    }
  }

  /**
   * Add existing CDM entities to a solution
   * @param {string} solutionUniqueName - Solution unique name
   * @param {Array<string>} entityNames - List of entity logical names to add
   * @returns {Promise<Object>} Result of adding entities
   */
  async addCDMEntitiesToSolution(solutionUniqueName, entityNames) {
    try {
      console.log(` Adding ${entityNames.length} CDM entities to solution: ${solutionUniqueName}`);
      
      const results = [];
      
      for (const entityName of entityNames) {
        try {
          // Add entity to solution
          const addRequest = {
            ComponentType: 1, // Entity
            SchemaName: entityName,
            SolutionUniqueName: solutionUniqueName
          };
          
          await this.makeRequest('POST', '/AddSolutionComponent', addRequest);
          
          results.push({
            entity: entityName,
            success: true,
            message: `Added ${entityName} to solution`
          });
          
          console.log(` Added ${entityName} to solution`);
        } catch (error) {
          results.push({
            entity: entityName,
            success: false,
            error: error.message
          });
          
          console.error(` Failed to add ${entityName} to solution:`, error.message);
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      console.log(` Successfully added ${successCount}/${entityNames.length} CDM entities to solution`);
      
      return {
        success: successCount > 0,
        results: results,
        summary: `Added ${successCount}/${entityNames.length} entities to solution`
      };
    } catch (error) {
      console.error(' Error adding CDM entities to solution:', error.message);
      throw error;
    }
  }

  /**
   * Create relationships between custom entities and CDM entities
   * @param {Array} relationships - Array of relationship definitions
   * @param {string} publisherPrefix - Publisher prefix for custom entities
   * @returns {Promise<Object>} Result of creating relationships
   */
  async createCDMRelationships(relationships) {
    try {
      console.log(` Creating ${relationships.length} relationships with CDM entities...`);
      
      const results = [];
      
      for (const rel of relationships) {
        try {
          // Determine if this is a relationship with a CDM entity
          const isCDMRelationship = this.isCDMEntity(rel.referencedEntity) || this.isCDMEntity(rel.referencingEntity);
          
          if (isCDMRelationship) {
            const relationshipMetadata = {
              '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
              SchemaName: rel.schemaName,
              ReferencedEntity: rel.referencedEntity,
              ReferencingEntity: rel.referencingEntity,
              ReferencedAttribute: rel.referencedAttribute || 'id',
              ReferencingAttribute: rel.referencingAttribute,
              RelationshipType: 'OneToManyRelationship',
              IsHierarchical: false,
              ReferencedEntityNavigationPropertyName: rel.referencedNavigation,
              ReferencingEntityNavigationPropertyName: rel.referencingNavigation,
              Lookup: {
                LogicalName: rel.referencingAttribute,
                DisplayName: {
                  LocalizedLabels: [{
                    Label: rel.displayName || `${rel.referencedEntity} lookup`,
                    LanguageCode: 1033
                  }]
                },
                RequiredLevel: { Value: 'None' }
              }
            };
            
            await this.makeRequest('POST', '/RelationshipDefinitions', relationshipMetadata);
            
            results.push({
              relationship: rel.schemaName,
              success: true,
              message: `Created CDM relationship: ${rel.referencingEntity} → ${rel.referencedEntity}`
            });
            
            console.log(` Created CDM relationship: ${rel.schemaName}`);
          }
        } catch (error) {
          results.push({
            relationship: rel.schemaName,
            success: false,
            error: error.message
          });
          
          console.error(` Failed to create CDM relationship ${rel.schemaName}:`, error.message);
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      console.log(` Successfully created ${successCount}/${relationships.length} CDM relationships`);
      
      return {
        success: successCount > 0,
        results: results,
        summary: `Created ${successCount}/${relationships.length} CDM relationships`
      };
    } catch (error) {
      console.error(' Error creating CDM relationships:', error.message);
      throw error;
    }
  }

  /**
   * Check if an entity is a Common Data Model entity
   * @param {string} entityName - Entity logical name
   * @returns {boolean} True if CDM entity
   */
  isCDMEntity(entityName) {
    const cdmEntities = [
      'account', 'contact', 'lead', 'opportunity', 'incident',
      'activity', 'email', 'phonecall', 'task', 'appointment',
      'systemuser', 'team', 'businessunit',
      'product', 'pricelevel', 'quote', 'salesorder', 'invoice',
      'campaign', 'list', 'competitor'
    ];
    
    return cdmEntities.includes(entityName.toLowerCase());
  }

  /**
   * Find a global choice by name
   * @param {string} choiceName - Name of the global choice to find
   * @returns {Promise<Object|null>} Choice metadata or null if not found
   */
  async findGlobalChoiceByName(choiceName) {
    try {
      await this.authenticate();
      
      // Determine if we need to add publisher prefix
      const publisherPrefix = this.publisherPrefix || '';
      const prefixedName = publisherPrefix ? 
        (choiceName.startsWith(`${publisherPrefix}_`) ? choiceName : `${publisherPrefix}_${choiceName}`) : 
        choiceName;
      
      logToFile(`Searching for global choice: ${prefixedName} (original: ${choiceName})`);
      
      // Get all global choice sets
      const choiceResponse = await this.makeRequest(
        'GET',
        `GlobalOptionSetDefinitions?$select=MetadataId,Name,DisplayName`
      );
      
      if (!choiceResponse.value || choiceResponse.value.length === 0) {
        logToFile(`❌ No global choice sets found in environment`);
        return null;
      }
      
      // Find the specific choice set by name (case-insensitive)
      const targetChoice = choiceResponse.value.find(choice => 
        choice.Name && choice.Name.toLowerCase() === prefixedName.toLowerCase()
      );
      
      logToFile(`Search result for '${prefixedName}' (original: ${choiceName}): ${targetChoice ? 'FOUND' : 'NOT FOUND'}`);
      
      return targetChoice || null;
      
    } catch (error) {
      logToFile(`❌ Error finding global choice '${choiceName}': ${error.message}`);
      return null;
    }
  }

  /**
   * Add a global choice set to a solution
   * @param {string} choiceLogicalName - Logical name of the global choice set
   * @param {string} solutionUniqueName - Unique name of the solution
   * @returns {Promise<Object>} Result of the operation
   */
  async addGlobalChoiceToSolution(choiceLogicalName, solutionUniqueName) {
    try {
      await this.authenticate();
      
      logToFile(`🔗 Starting addGlobalChoiceToSolution`, {
        choiceLogicalName,
        solutionUniqueName,
        timestamp: new Date().toISOString()
      });
      
      console.log(` Adding global choice '${choiceLogicalName}' to solution '${solutionUniqueName}'...`);
      
      // First, verify the solution exists
      const solution = await this.findSolution(solutionUniqueName);
      if (!solution) {
        const errorMsg = `Solution '${solutionUniqueName}' not found`;
        console.error(` ✗ ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      const solutionId = solution.solutionid;
      console.log(`   ↳ Found solution: ${solutionUniqueName} (ID: ${solutionId})`);
      
      // First, get all global choice sets (filtering is not supported on this endpoint)
      logToFile(`📋 Fetching all global choice sets to find '${choiceLogicalName}'...`);
      const choiceResponse = await this.makeRequest(
        'GET',
        `GlobalOptionSetDefinitions?$select=MetadataId,Name`
      );
      
      logToFile(`📊 Global choice sets response`, {
        hasValue: !!choiceResponse.value,
        count: choiceResponse.value?.length || 0,
        allChoiceNames: choiceResponse.value?.map(c => c.Name) || []
      });
      
      if (!choiceResponse.value || choiceResponse.value.length === 0) {
        throw new Error(`No global choice sets found in the environment`);
      }
      
      // Find the specific choice set by name (client-side filtering)
      const targetChoice = choiceResponse.value.find(choice => 
        choice.Name && choice.Name.toLowerCase() === choiceLogicalName.toLowerCase()
      );
      
      logToFile(`Search results for '${choiceLogicalName}'`, {
        found: !!targetChoice,
        targetChoice: targetChoice,
        searchingFor: choiceLogicalName.toLowerCase(),
        availableChoices: choiceResponse.value.map(c => ({ name: c.Name, nameLower: c.Name?.toLowerCase() }))
      });
      
      if (!targetChoice) {
        throw new Error(`Global choice set '${choiceLogicalName}' not found`);
      }
      
      const choiceMetadataId = targetChoice.MetadataId;
      console.log(`   ↳ Found global choice: ${choiceLogicalName} (MetadataId: ${choiceMetadataId})`);
      
      // We already verified the solution exists and got the solutionId
      
      // Add the global choice to the solution using AddSolutionComponent action
      const addComponentRequest = {
        ComponentType: 9, // OptionSet component type
        ComponentId: choiceMetadataId,
        SolutionUniqueName: solutionUniqueName,
        AddRequiredComponents: false,
        DoNotIncludeSubcomponents: false
      };
      
      console.log(`   ↳ Adding component to solution...`);
      logToFile(`📤 Sending AddSolutionComponent request`, {
        addComponentRequest,
        endpoint: 'AddSolutionComponent'
      });
      
      const addResult = await this.makeRequest('POST', 'AddSolutionComponent', addComponentRequest);
      
      logToFile(`📥 AddSolutionComponent response`, {
        success: true,
        addResult: addResult
      });
      
      console.log(`   ✓ Successfully added global choice '${choiceLogicalName}' to solution '${solutionUniqueName}'`);
      
      logToFile(`🎉 Solution addition completed successfully`, {
        choiceLogicalName,
        solutionUniqueName,
        choiceMetadataId
      });
      
      return {
        success: true,
        message: `Global choice '${choiceLogicalName}' added to solution '${solutionUniqueName}'`,
        choiceLogicalName,
        solutionUniqueName
      };
      
    } catch (error) {
      logToFile(`💥 Error in addGlobalChoiceToSolution`, {
        choiceLogicalName,
        solutionUniqueName,
        error: error.message,
        stack: error.stack
      });
      
      console.error(`   ✗ Failed to add global choice '${choiceLogicalName}' to solution: ${error.message}`);
      return {
        success: false,
        error: error.message,
        choiceLogicalName,
        solutionUniqueName
      };
    }
  }

  /**
   * Add pending global choices to solution after solution creation
   * This is called after the solution has been created
   * @returns {Promise<{success: boolean, added: number, failed: number, errors: Array}>}
   */
  /**
   * Store a global choice for later addition to a solution
   * This is used when we need to delay adding choices until after solution creation
   * @param {string} name - The logical name of the global choice
   * @param {string} solutionName - The unique name of the solution
   * @param {string} metadataId - Optional metadata ID of the global choice
   */
  storeGlobalChoiceForSolutionAddition(name, solutionName, metadataId = 'unknown') {
    // Initialize the array if it doesn't exist
    if (!this.pendingGlobalChoicesForSolution) {
      this.pendingGlobalChoicesForSolution = [];
    }
    
    // Check if this choice is already in the pending list for this solution
    const alreadyPending = this.pendingGlobalChoicesForSolution.some(
      item => item.name === name && item.solutionName === solutionName
    );
    
    if (alreadyPending) {
      logToFile(`ℹ️ Global choice '${name}' already pending for solution '${solutionName}'`);
      return; // Skip adding duplicate
    }
    
    // Add to pending list
    this.pendingGlobalChoicesForSolution.push({
      name,
      solutionName,
      metadataId: metadataId || 'unknown',
      timestamp: new Date().toISOString()
    });
    
    logToFile(`📝 Stored global choice '${name}' for later addition to solution '${solutionName}'`);
    console.log(`📝 Global choice '${name}' will be added to solution '${solutionName}' after solution creation`);
  }
  
  async addPendingGlobalChoicesToSolution() {
    logToFile('🔗 addPendingGlobalChoicesToSolution: Starting');
    
    if (!this.pendingGlobalChoicesForSolution || this.pendingGlobalChoicesForSolution.length === 0) {
      logToFile('ℹ️ No pending global choices to add to solution');
      return { success: true, added: 0, failed: 0, errors: [] };
    }

    const results = {
      success: true,
      added: 0,
      failed: 0,
      errors: []
    };

    logToFile(`🔗 Processing ${this.pendingGlobalChoicesForSolution.length} pending global choices...`);
    console.log(`🔗 Adding ${this.pendingGlobalChoicesForSolution.length} global choices to solution...`);
    
    // Check for unique solution names in the pending list
    const uniqueSolutionNames = [...new Set(this.pendingGlobalChoicesForSolution.map(choice => choice.solutionName))];
    console.log(`Found ${uniqueSolutionNames.length} solutions to check: ${uniqueSolutionNames.join(', ')}`);
    
    // Verify all solutions exist before proceeding
    for (const solutionName of uniqueSolutionNames) {
      console.log(`Verifying solution '${solutionName}' exists before adding global choices...`);
      
      // Check if the solution exists
      let solutionExists = false;
      try {
        const solution = await this.findSolution(solutionName);
        if (solution) {
          solutionExists = true;
          console.log(` Solution '${solutionName}' found (ID: ${solution.solutionid})`);
        } else {
          console.log(`⏳ Solution '${solutionName}' not found, waiting 5 seconds...`);
          // Wait 5 seconds and try again
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // Try again
          const retryResult = await this.findSolution(solutionName);
          if (retryResult) {
            solutionExists = true;
            console.log(` Solution '${solutionName}' found on retry (ID: ${retryResult.solutionid})`);
          } else {
            console.error(`❌ Solution '${solutionName}' not found after retry`);
            results.errors.push(`Solution '${solutionName}' not found after waiting`);
          }
        }
      } catch (error) {
        console.error(`❌ Error verifying solution '${solutionName}': ${error.message}`);
        results.errors.push(`Error verifying solution '${solutionName}': ${error.message}`);
      }
      
      if (!solutionExists) {
        // Skip choices for this solution
        const choicesForSolution = this.pendingGlobalChoicesForSolution.filter(
          choice => choice.solutionName === solutionName
        );
        console.warn(`⚠️ Skipping ${choicesForSolution.length} global choices for solution '${solutionName}' that doesn't exist`);
        
        for (const choice of choicesForSolution) {
          results.failed++;
          results.errors.push(`Skipped ${choice.name}: Solution '${solutionName}' not found`);
        }
        
        continue;
      }
    }

    for (const pendingChoice of this.pendingGlobalChoicesForSolution) {
      try {
        logToFile(`🔗 Adding pending global choice '${pendingChoice.name}' to solution '${pendingChoice.solutionName}'...`);
        
        // Add delay to allow solution to be fully created
        logToFile(`⏳ Adding 2-second delay before solution addition...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const addResult = await this.addGlobalChoiceToSolution(pendingChoice.name, pendingChoice.solutionName);
        
        if (addResult.success) {
          results.added++;
          logToFile(` Successfully added global choice '${pendingChoice.name}' to solution`, addResult);
          console.log(` Successfully added global choice '${pendingChoice.name}' to solution`);
        } else {
          results.failed++;
          results.errors.push(`Failed to add ${pendingChoice.name}: ${addResult.error}`);
          logToFile(`❌ Failed to add global choice '${pendingChoice.name}' to solution`, addResult);
          console.warn(`❌ Failed to add global choice '${pendingChoice.name}' to solution: ${addResult.error}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`Error adding ${pendingChoice.name}: ${error.message}`);
        logToFile(`💥 Error adding pending global choice '${pendingChoice.name}'`, {
          error: error.message,
          stack: error.stack
        });
        console.error(`💥 Error adding global choice '${pendingChoice.name}': ${error.message}`);
      }
    }

    // Clear the pending list
    this.pendingGlobalChoicesForSolution = [];

    logToFile('🔗 addPendingGlobalChoicesToSolution: Completed', {
      added: results.added,
      failed: results.failed,
      errors: results.errors
    });

    console.log(`🔗 Global choice solution addition completed: ${results.added} added, ${results.failed} failed`);

    return results;
  }
}

module.exports = { DataverseClient };

