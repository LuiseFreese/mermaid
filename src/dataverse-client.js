/**
 * Dataverse API Client
 * Handles authentication and API calls to Microsoft Dataverse
 */

import { ConfidentialClientApplication } from '@azure/msal-node';
import axios from 'axios';

export class DataverseClient {
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
    this.apiVersion = '9.2';
    this.solutionName = null; // Will be set when working with solutions
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
      // If silent authentication fails, try acquiring token
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
   * @param {Object} additionalHeaders - Additional headers to include
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
        ...additionalHeaders // Merge additional headers
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
        // Token might be expired, try to authenticate again
        await this.authenticate();
        config.headers['Authorization'] = `Bearer ${this.accessToken}`;
        const retryResponse = await axios(config);
        return retryResponse.data;
      }
      throw error;
    }
  }

  /**
   * Create a new entity in Dataverse
   * @param {Object} entityMetadata - Entity metadata definition
   * @returns {Promise<Object>} Created entity response
   */
  async createEntity(entityMetadata) {
    console.log(`Creating entity: ${entityMetadata.LogicalName}`);
    
    try {
      // Add solution header if solution name is available
      const headers = {};
      if (this.solutionName) {
        headers['MSCRM.SolutionUniqueName'] = this.solutionName;
        console.log(`🔧 Adding entity to solution: ${this.solutionName}`);
      }
      
      const response = await this.makeRequest('POST', 'EntityDefinitions', entityMetadata, headers);
      console.log(`✅ Entity created: ${entityMetadata.LogicalName}`);
      return response;
    } catch (error) {
      console.error(`❌ Failed to create entity ${entityMetadata.LogicalName}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create a new attribute for an entity
   * @param {string} entityLogicalName - Entity logical name
   * @param {Object} attributeMetadata - Attribute metadata definition
   * @returns {Promise<Object>} Created attribute response
   */
  async createAttribute(entityLogicalName, attributeMetadata) {
    console.log(`Creating attribute: ${attributeMetadata.LogicalName} for entity: ${entityLogicalName}`);
    
    try {
      const endpoint = `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes`;
      const response = await this.makeRequest('POST', endpoint, attributeMetadata);
      console.log(`✅ Attribute created: ${attributeMetadata.LogicalName}`);
      return response;
    } catch (error) {
      console.error(`❌ Failed to create attribute ${attributeMetadata.LogicalName}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create a relationship between entities
   * @param {Object} relationshipMetadata - Relationship metadata definition
   * @returns {Promise<Object>} Created relationship response
   */
  async createRelationship(relationshipMetadata) {
    console.log(`Creating relationship: ${relationshipMetadata.SchemaName}`);
    
    try {
      let endpoint;
      if (relationshipMetadata['@odata.type'].includes('OneToMany')) {
        endpoint = 'RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata';
      } else if (relationshipMetadata['@odata.type'].includes('ManyToMany')) {
        endpoint = 'RelationshipDefinitions/Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata';
      } else {
        throw new Error(`Unsupported relationship type: ${relationshipMetadata['@odata.type']}`);
      }

      const response = await this.makeRequest('POST', endpoint, relationshipMetadata);
      console.log(`✅ Relationship created: ${relationshipMetadata.SchemaName}`);
      return response;
    } catch (error) {
      console.error(`❌ Failed to create relationship ${relationshipMetadata.SchemaName}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create a column/attribute for an entity
   * @param {string} entityLogicalName - Entity logical name
   * @param {Object} columnMetadata - Column metadata
   * @returns {Promise<Object>} Creation response
   */
  async createColumn(entityLogicalName, columnMetadata) {
    if (this.verbose) {
      console.log(`Creating column ${columnMetadata.LogicalName} for entity ${entityLogicalName}...`);
      console.log('Column metadata:', JSON.stringify(columnMetadata, null, 2));
    }

    try {
      const response = await this.makeRequest(
        'POST',
        `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes`,
        columnMetadata,
        {
          'MSCRM.SolutionUniqueName': this.solutionName
        }
      );
      
      if (this.verbose) {
        console.log(`✅ Column ${columnMetadata.LogicalName} created successfully`);
      }
      
      return response;
    } catch (error) {
      console.error(`❌ Failed to create column ${columnMetadata.LogicalName}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Publish all customizations
   * @returns {Promise<Object>} Publish response
   */
  async publishCustomizations() {
    console.log('Publishing customizations...');
    
    try {
      const response = await this.makeRequest('POST', 'PublishAllXml', {});
      console.log('✅ Customizations published successfully');
      return response;
    } catch (error) {
      console.error('❌ Failed to publish customizations:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Check if an entity exists
   * @param {string} logicalName - Entity logical name
   * @returns {Promise<boolean>} True if entity exists
   */
  async entityExists(logicalName) {
    try {
      await this.makeRequest('GET', `EntityDefinitions(LogicalName='${logicalName}')`);
      return true;
    } catch (error) {
      if (error.response?.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Check if a column exists on an entity
   * @param {string} entityLogicalName - Entity logical name
   * @param {string} columnLogicalName - Column logical name
   * @returns {Promise<boolean>} True if column exists
   */
  async columnExists(entityLogicalName, columnLogicalName) {
    try {
      await this.makeRequest('GET', `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${columnLogicalName}')`);
      return true;
    } catch (error) {
      if (error.response?.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Check if a global choice set exists
   * @param {string} choiceSetName - Global choice set name
   * @returns {Promise<boolean>} True if choice set exists
   */
  async globalChoiceSetExists(choiceSetName) {
    try {
      const response = await this.makeRequest('GET', `GlobalOptionSetDefinitions?$filter=Name eq '${choiceSetName}'&$select=MetadataId,Name`);
      return response.value && response.value.length > 0;
    } catch (error) {
      if (error.response?.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Create a global choice set
   * @param {Object} choiceSetMetadata - Choice set metadata
   * @returns {Promise<Object>} Created choice set response with ID
   */
  async createGlobalChoiceSet(choiceSetMetadata) {
    try {
      console.log(`Creating global choice set: ${choiceSetMetadata.Name}`);
      
      // Create options for the global choice set
      const options = choiceSetMetadata.options.map((option, index) => ({
        Value: index + 1, // Start from 1
        Label: {
          LocalizedLabels: [{
            Label: option,
            LanguageCode: 1033
          }]
        }
      }));

      // Create the global option set with embedded options
      const optionSetPayload = {
        '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
        Name: choiceSetMetadata.Name,
        DisplayName: choiceSetMetadata.DisplayName,
        Description: choiceSetMetadata.Description,
        IsGlobal: choiceSetMetadata.IsGlobal,
        OptionSetType: 'Picklist',
        Options: options
      };

      let response;
      if (this.solutionName) {
        response = await this.makeRequest('POST', 'GlobalOptionSetDefinitions', optionSetPayload, {
          'MSCRM.SolutionUniqueName': this.solutionName
        });
      } else {
        response = await this.makeRequest('POST', 'GlobalOptionSetDefinitions', optionSetPayload);
      }

      const optionSetId = response.MetadataId;
      console.log(`✅ Created global choice set ${choiceSetMetadata.Name} with ID: ${optionSetId}`);

      return {
        MetadataId: optionSetId,
        Name: choiceSetMetadata.Name,
        options: choiceSetMetadata.options
      };

    } catch (error) {
      console.error(`Failed to create global choice set ${choiceSetMetadata.Name}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get solution information
   * @param {string} solutionName - Solution unique name
   * @returns {Promise<Object>} Solution information
   */
  async getSolution(solutionName) {
    try {
      const response = await this.makeRequest('GET', `solutions?$filter=uniquename eq '${solutionName}'`);
      return response.value?.[0] || null;
    } catch (error) {
      console.error(`Failed to get solution ${solutionName}:`, error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Create a new solution in Dataverse
   * @param {Object} solutionMetadata - Solution metadata definition
   * @returns {Promise<Object>} Created solution response
   */
  async createSolution(solutionMetadata) {
    console.log(`Creating solution: ${solutionMetadata.uniquename}`);
    
    try {
      const response = await this.makeRequest('POST', 'solutions', solutionMetadata);
      console.log(`✅ Solution created: ${solutionMetadata.uniquename}`);
      return response;
    } catch (error) {
      console.error(`❌ Failed to create solution ${solutionMetadata.uniquename}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Ensure solution exists (create if not exists)
   * @param {string} solutionName - Solution unique name
   * @param {string} displayName - Solution display name
   * @param {string} publisherPrefix - Publisher prefix (default: 'mmd')
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Solution information
   */
  async ensureSolution(solutionName, displayName, publisherPrefix = 'mmd', options = {}) {
    const { listPublishers = false, allowCreatePublisher = true } = options;
    
    // Check if solution already exists
    const existingSolution = await this.getSolution(solutionName);
    if (existingSolution) {
      console.log(`✅ Solution '${solutionName}' already exists`);
      return existingSolution;
    }

    // If requested, list available publishers first
    if (listPublishers) {
      console.log('\n📋 Available Publishers:');
      const publishers = await this.getPublishers();
      if (publishers.length > 0) {
        console.log('┌─────────────────────────────────────────────────────────────────┐');
        console.log('│ Prefix │ Name                           │ Description           │');
        console.log('├─────────────────────────────────────────────────────────────────┤');
        publishers.forEach(pub => {
          const prefix = (pub.customizationprefix || '').padEnd(6);
          const name = (pub.friendlyname || '').substring(0, 30).padEnd(30);
          const desc = (pub.description || '').substring(0, 20).padEnd(20);
          console.log(`│ ${prefix} │ ${name} │ ${desc} │`);
        });
        console.log('└─────────────────────────────────────────────────────────────────┘');
      } else {
        console.log('   No custom publishers found.');
      }
    }

    // Get the publisher (or create if allowed)
    const publisher = await this.getOrCreatePublisher(publisherPrefix, allowCreatePublisher);
    
    // Create solution metadata
    const solutionMetadata = {
      uniquename: solutionName,
      friendlyname: displayName,
      description: `Solution created by Mermaid to Dataverse Converter for ${displayName}`,
      version: '1.0.0.0',
      'publisherid@odata.bind': `/publishers(${publisher.publisherid})`
    };

    console.log(`Creating new solution: ${solutionName} with publisher: ${publisher.friendlyname}`);
    return await this.createSolution(solutionMetadata);
  }

  /**
   * Get all available publishers
   * @returns {Promise<Array>} List of publishers
   */
  async getPublishers() {
    try {
      const response = await this.makeRequest('GET', `publishers?$select=publisherid,uniquename,friendlyname,customizationprefix,description&$orderby=friendlyname`);
      return response.value || [];
    } catch (error) {
      console.error('Failed to get publishers:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get publisher by prefix
   * @param {string} prefix - Publisher prefix
   * @returns {Promise<Object|null>} Publisher information or null if not found
   */
  async getPublisherByPrefix(prefix) {
    try {
      const response = await this.makeRequest('GET', `publishers?$filter=customizationprefix eq '${prefix}'`);
      return response.value?.[0] || null;
    } catch (error) {
      console.error(`Failed to get publisher with prefix ${prefix}:`, error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Get or create a publisher
   * @param {string} prefix - Publisher prefix
   * @param {boolean} allowCreate - Whether to create if not found (default: true)
   * @returns {Promise<Object>} Publisher information
   */
  async getOrCreatePublisher(prefix, allowCreate = true) {
    try {
      // Try to find existing publisher with this prefix
      const existingPublisher = await this.getPublisherByPrefix(prefix);
      if (existingPublisher) {
        console.log(`✅ Using existing publisher: ${existingPublisher.friendlyname} (${prefix})`);
        return existingPublisher;
      }

      if (!allowCreate) {
        throw new Error(`Publisher with prefix '${prefix}' not found and creation not allowed`);
      }

      // Create new publisher
      const publisherMetadata = {
        uniquename: `${prefix}Publisher`,
        friendlyname: `${prefix.toUpperCase()} Publisher`,
        description: `Publisher created by Mermaid to Dataverse Converter`,
        customizationprefix: prefix,
        customizationoptionvalueprefix: 10000 + Math.floor(Math.random() * 10000) // Random value prefix
      };

      console.log(`Creating new publisher with prefix: ${prefix}`);
      const createdPublisher = await this.makeRequest('POST', 'publishers', publisherMetadata);
      console.log(`✅ Publisher created: ${prefix}`);
      return createdPublisher;

    } catch (error) {
      console.error(`Failed to get/create publisher ${prefix}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Add an entity to a solution
   * @param {string} solutionName - Solution unique name  
   * @param {string} entityLogicalName - Entity logical name
   * @returns {Promise<void>}
   */
  async addEntityToSolution(solutionName, entityLogicalName) {
    try {
      // First get the solution ID
      const solutionResponse = await this.makeRequest('GET', `solutions?$filter=uniquename eq '${solutionName}'`);
      if (!solutionResponse.value || solutionResponse.value.length === 0) {
        throw new Error(`Solution '${solutionName}' not found`);
      }
      
      const solutionId = solutionResponse.value[0].solutionid;
      
      const solutionComponentData = {
        ComponentType: 1, // Entity component type
        'ObjectId@odata.bind': `/EntityDefinitions(LogicalName='${entityLogicalName}')`
      };

      await this.makeRequest('POST', `solutions(${solutionId})/solutioncomponents`, solutionComponentData);
      console.log(`✅ Added entity ${entityLogicalName} to solution ${solutionName}`);
    } catch (error) {
      console.error(`❌ Failed to add entity ${entityLogicalName} to solution ${solutionName}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Add a global choice set to a solution
   * @param {string} solutionName - Solution unique name
   * @param {string} globalChoiceSetId - Global choice set MetadataId
   * @returns {Promise<void>}
   */
  async addGlobalChoiceSetToSolution(solutionName, globalChoiceSetId) {
    try {
      // First get the solution ID
      const solutionResponse = await this.makeRequest('GET', `solutions?$filter=uniquename eq '${solutionName}'`);
      if (!solutionResponse.value || solutionResponse.value.length === 0) {
        throw new Error(`Solution '${solutionName}' not found`);
      }
      
      const solutionId = solutionResponse.value[0].solutionid;
      
      // Use the AddSolutionComponent action
      const actionData = {
        ComponentId: globalChoiceSetId,
        ComponentType: 9, // Global Option Set component type
        SolutionUniqueName: solutionName,
        AddRequiredComponents: false,
        DoNotIncludeSubcomponents: false
      };

      await this.makeRequest('POST', 'AddSolutionComponent', actionData);
      console.log(`✅ Added global choice set ${globalChoiceSetId} to solution ${solutionName}`);
    } catch (error) {
      console.error(`❌ Failed to add global choice set ${globalChoiceSetId} to solution ${solutionName}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create entities and relationships from schema
   * @param {Object} schema - Generated Dataverse schema
   * @param {Object} options - Creation options
   * @returns {Promise<Object>} Creation results
   */
  async createFromSchema(schema, options = {}) {
    const { 
      dryRun = false, 
      verbose = false, 
      solutionName = null,
      publisherPrefix = 'mmd',
      listPublishers = false,
      createPublisher = true
    } = options;
    const results = {
      entities: [],
      columns: [],
      relationships: [],
      errors: [],
      solution: null
    };

    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made to Dataverse');
      console.log('📋 Schema Preview:');
      console.log(JSON.stringify(schema, null, 2));
      return results;
    }

    try {
      // First, ensure solution exists if solution name provided
      if (solutionName) {
        this.solutionName = solutionName; // Set solution name for entity creation
        console.log(`🎯 Ensuring solution '${solutionName}' exists...`);
        try {
          const solution = await this.ensureSolution(solutionName, solutionName, publisherPrefix, {
            listPublishers,
            allowCreatePublisher: createPublisher
          });
          results.solution = solution;
          console.log(`✅ Solution ready: ${solutionName}`);
        } catch (error) {
          console.error(`❌ Failed to create/verify solution ${solutionName}:`, error.message);
          results.errors.push({
            type: 'solution',
            solution: solutionName,
            error: error.message
          });
          throw error;
        }
      }

      // Create global choice sets first (they need to exist before columns that reference them)
      const globalChoiceSets = new Map(); // Store choice set name -> ID mapping
      if (schema.globalChoiceSets && schema.globalChoiceSets.length > 0) {
        console.log('\n🎨 Creating global choice sets...');
        for (const choiceSet of schema.globalChoiceSets) {
          try {
            const exists = await this.globalChoiceSetExists(choiceSet.Name);
            if (exists) {
              console.log(`⚠️  Global choice set ${choiceSet.Name} already exists, skipping creation`);
              // Still need to get the ID for existing choice sets
              const existingResponse = await this.makeRequest('GET', `GlobalOptionSetDefinitions?$filter=Name eq '${choiceSet.Name}'&$select=MetadataId,Name`);
              if (existingResponse.value && existingResponse.value.length > 0) {
                globalChoiceSets.set(choiceSet.Name, existingResponse.value[0].MetadataId);
              }
              continue;
            }

            const createdChoiceSet = await this.createGlobalChoiceSet(choiceSet);
            globalChoiceSets.set(choiceSet.Name, createdChoiceSet.MetadataId);
            console.log(`✅ Created global choice set: ${choiceSet.Name} (ID: ${createdChoiceSet.MetadataId})`);
            
            // Add the global choice set to the solution if solution is specified
            if (solutionName) {
              try {
                await this.addGlobalChoiceSetToSolution(solutionName, createdChoiceSet.MetadataId);
              } catch (solutionError) {
                console.error(`⚠️  Failed to add global choice set ${choiceSet.Name} to solution ${solutionName}:`, solutionError.message);
                // Don't fail the whole process if we can't add to solution
              }
            }
            
            // Wait for choice set creation to complete
            await this.sleep(2000);
            
          } catch (error) {
            console.error(`❌ Failed to create global choice set ${choiceSet.Name}:`, error.message);
            results.errors.push({
              type: 'globalChoiceSet',
              choiceSet: choiceSet.Name,
              error: error.message
            });
          }
        }
      }

      // Create entities first (without custom attributes)
      for (const entity of schema.entities) {
        try {
          // Check if entity already exists
          const exists = await this.entityExists(entity.LogicalName);
          if (exists) {
            console.log(`⚠️  Entity ${entity.LogicalName} already exists, skipping creation`);
            continue;
          }

          // Create entity - it will be automatically added to solution via MSCRM.SolutionUniqueName header
          const createdEntity = await this.createEntity(entity);
          results.entities.push(createdEntity);

          // Wait longer for entity creation to complete before creating columns
          await this.sleep(5000);

        } catch (error) {
          console.error(`Failed to create entity ${entity.LogicalName}:`, error.message);
          results.errors.push({
            type: 'entity',
            entity: entity.LogicalName,
            error: error.message
          });
        }
      }

      // Create additional columns for each entity
      if (schema.additionalColumns && schema.additionalColumns.length > 0) {
        console.log('\n🏛️  Creating additional columns...');
        
        for (const columnInfo of schema.additionalColumns) {
          try {
            // Check if entity exists before creating column
            const entityExists = await this.entityExists(columnInfo.entityLogicalName);
            if (!entityExists) {
              console.log(`⚠️  Entity ${columnInfo.entityLogicalName} does not exist, skipping column creation`);
              continue;
            }

            // Check if column already exists
            const columnExists = await this.columnExists(columnInfo.entityLogicalName, columnInfo.columnMetadata.LogicalName);
            if (columnExists) {
              console.log(`⚠️  Column ${columnInfo.columnMetadata.LogicalName} already exists on entity ${columnInfo.entityLogicalName}, skipping creation`);
              continue;
            }

            // Resolve global choice set references if needed
            let resolvedColumnMetadata = { ...columnInfo.columnMetadata };
            if (resolvedColumnMetadata._globalChoiceSetName) {
              const choiceSetId = globalChoiceSets.get(resolvedColumnMetadata._globalChoiceSetName);
              if (choiceSetId) {
                // Use proper OData binding for global option set
                resolvedColumnMetadata['OptionSet@odata.bind'] = `/GlobalOptionSetDefinitions(${choiceSetId})`;
                delete resolvedColumnMetadata._globalChoiceSetName; // Remove the temporary property
              } else {
                console.error(`❌ Global choice set ${resolvedColumnMetadata._globalChoiceSetName} not found for column ${resolvedColumnMetadata.LogicalName}`);
                continue;
              }
            }

            await this.createColumn(columnInfo.entityLogicalName, resolvedColumnMetadata);
            results.columns.push({
              entity: columnInfo.entityLogicalName,
              column: columnInfo.columnMetadata.LogicalName
            });
            
            // Wait a bit between column creations
            await this.sleep(1000);

          } catch (error) {
            console.error(`Failed to create column ${columnInfo.columnMetadata.LogicalName} for entity ${columnInfo.entityLogicalName}:`, error.message);
            results.errors.push({
              type: 'column',
              entity: columnInfo.entityLogicalName,
              column: columnInfo.columnMetadata.LogicalName,
              error: error.message
            });
          }
        }
      }

      // Create relationships after all entities are created
      if (schema.relationships && schema.relationships.length > 0) {
        console.log('\n📎 Creating relationships...');
        
        for (const relationship of schema.relationships) {
          try {
            const createdRelationship = await this.createRelationship(relationship);
            results.relationships.push(createdRelationship);
            await this.sleep(2000); // Wait between relationship creations
          } catch (error) {
            console.error(`Failed to create relationship ${relationship.SchemaName}:`, error.message);
            results.errors.push({
              type: 'relationship',
              relationship: relationship.SchemaName,
              error: error.message
            });
          }
        }
      }

      // Publish customizations
      await this.publishCustomizations();

      // Summary
      console.log('\n📊 Creation Summary:');
      if (solutionName) {
        console.log(`🎯 Solution: ${solutionName}`);
      }
      console.log(`✅ Entities created: ${results.entities.length}`);
      console.log(`✅ Columns created: ${results.columns.length}`);
      console.log(`✅ Relationships created: ${results.relationships.length}`);
      if (results.errors.length > 0) {
        console.log(`❌ Errors encountered: ${results.errors.length}`);
        if (verbose) {
          results.errors.forEach(error => {
            console.log(`   - ${error.type}: ${error.error}`);
          });
        }
      }

    } catch (error) {
      console.error('❌ Failed to create schema:', error.message);
      results.errors.push({
        type: 'general',
        error: error.message
      });
    }

    return results;
  }

  /**
   * Sleep utility function
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
