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
   * @returns {Promise<Object>} API response
   */
  async makeRequest(method, endpoint, data = null) {
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
        'OData-Version': '4.0'
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
      const response = await this.makeRequest('POST', 'EntityDefinitions', entityMetadata);
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
      const solutionComponentData = {
        ComponentType: 1, // Entity component type
        'ObjectId@odata.bind': `/EntityDefinitions(LogicalName='${entityLogicalName}')`
      };

      await this.makeRequest('POST', `solutions(uniquename='${solutionName}')/solutioncomponents`, solutionComponentData);
      console.log(`✅ Added entity ${entityLogicalName} to solution ${solutionName}`);
    } catch (error) {
      console.error(`❌ Failed to add entity ${entityLogicalName} to solution ${solutionName}:`, error.response?.data || error.message);
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

      // Create entities first (without custom attributes)
      for (const entity of schema.entities) {
        try {
          // Check if entity already exists
          const exists = await this.entityExists(entity.LogicalName);
          if (exists) {
            console.log(`⚠️  Entity ${entity.LogicalName} already exists, skipping creation`);
            
            // Still try to add to solution if solution name provided
            if (solutionName) {
              try {
                await this.addEntityToSolution(solutionName, entity.LogicalName);
              } catch (solutionError) {
                console.log(`ℹ️  Entity ${entity.LogicalName} may already be in solution or unable to add`);
              }
            }
            continue;
          }

          // Create entity without custom attributes first
          const entityWithoutAttributes = { ...entity };
          delete entityWithoutAttributes.Attributes;

          const createdEntity = await this.createEntity(entityWithoutAttributes);
          results.entities.push(createdEntity);

          // Add entity to solution if solution name provided
          if (solutionName) {
            await this.addEntityToSolution(solutionName, entity.LogicalName);
          }

          // Wait a bit for entity creation to complete
          await this.sleep(2000);

          // Create custom attributes
          if (entity.Attributes && entity.Attributes.length > 0) {
            for (const attribute of entity.Attributes) {
              try {
                await this.createAttribute(entity.LogicalName, attribute);
                await this.sleep(1000); // Wait between attribute creations
              } catch (attrError) {
                console.error(`Failed to create attribute ${attribute.LogicalName}:`, attrError.message);
                results.errors.push({
                  type: 'attribute',
                  entity: entity.LogicalName,
                  attribute: attribute.LogicalName,
                  error: attrError.message
                });
              }
            }
          }

        } catch (error) {
          console.error(`Failed to create entity ${entity.LogicalName}:`, error.message);
          results.errors.push({
            type: 'entity',
            entity: entity.LogicalName,
            error: error.message
          });
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
