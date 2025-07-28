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
    this.apiVersion = config.apiVersion || '9.2';
    this.solutionName = config.solutionName || null; // Will be set when working with solutions
    this.verbose = config.verbose || false; // Enable verbose logging
    
    // Store choice sets for later reference
    this.globalChoiceSets = new Map(); // Maps choice set name to MetadataId
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
    // Minimal logging - the batch process will handle overall status reporting
    try {
      // Add solution header if solution name is available
      const headers = {};
      if (this.solutionName) {
        headers['MSCRM.SolutionUniqueName'] = this.solutionName;
      }
      
      const response = await this.makeRequest('POST', 'EntityDefinitions', entityMetadata, headers);
      return response;
    } catch (error) {
      console.error(`❌ Failed to create entity ${entityMetadata.LogicalName}:`, error.message);
      
      if (error.response?.data) {
        console.error(`   API Error Details:`, JSON.stringify(error.response.data, null, 2));
      }
      
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
      // Clean the metadata for API (remove display-only properties)
      const cleanMetadata = { ...relationshipMetadata };
      delete cleanMetadata.RelationshipType; // This is for display only, not for API
      delete cleanMetadata.DisplayRelationshipType; // This is for display only, not for API
      
      // ✅ Get the real primary key attribute dynamically
      if (cleanMetadata.ReferencedEntity) {
        console.log('🔍 Getting real primary key attribute...');
        try {
          const meta = await this.makeRequest(
            'GET',
            `EntityDefinitions(LogicalName='${cleanMetadata.ReferencedEntity}')?$select=PrimaryIdAttribute,LogicalName`
          );
          const actualPrimaryKey = meta.PrimaryIdAttribute;
          cleanMetadata.ReferencedAttribute = actualPrimaryKey;
          
          // Also update the Lookup LogicalName to match
          if (cleanMetadata.Lookup) {
            cleanMetadata.Lookup.LogicalName = actualPrimaryKey;
          }
          
          console.log(`✅ Using actual PrimaryIdAttribute: ${actualPrimaryKey}`);
        } catch (pkError) {
          console.warn(`⚠️  Could not fetch PrimaryIdAttribute, using default:`, pkError.message);
        }
      }
      
      // ✅ Diagnostic check: Verify ReferencedAttribute exists
      if (cleanMetadata.ReferencedEntity && cleanMetadata.ReferencedAttribute) {
        console.log('🔍 ReferencedAttribute exists? Checking...');
        try {
          const attributes = await this.makeRequest(
            'GET',
            `EntityDefinitions(LogicalName='${cleanMetadata.ReferencedEntity}')/Attributes`
          );

          const found = attributes.value.find(attr =>
            attr.LogicalName === cleanMetadata.ReferencedAttribute
          );

          if (!found) {
            throw new Error(`ReferencedAttribute ${cleanMetadata.ReferencedAttribute} not found on ${cleanMetadata.ReferencedEntity}`);
          }
          
          console.log(`✅ ReferencedAttribute ${cleanMetadata.ReferencedAttribute} verified on ${cleanMetadata.ReferencedEntity}`);
        } catch (attrError) {
          console.error(`❌ Failed to verify ReferencedAttribute:`, attrError.response?.data || attrError.message);
          throw attrError;
        }
      }
      
      // Debug: Always log the cleaned payload to help with debugging
      console.log('🔍 Relationship payload being sent to API:', JSON.stringify(cleanMetadata, null, 2));
      
      // ✅ Use the plain RelationshipDefinitions endpoint (not the typed sub-path)
      const endpoint = 'RelationshipDefinitions';

      const response = await this.makeRequest('POST', endpoint, cleanMetadata);
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
  /**
   * Check if a column exists on an entity
   * @param {string} entityLogicalName - Entity logical name
   * @param {string} columnLogicalName - Column logical name
   * @returns {Promise<boolean>} True if column exists
   */
  async columnExists(entityLogicalName, columnLogicalName) {
    try {
      // Check by LogicalName first
      await this.makeRequest('GET', `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes(LogicalName='${columnLogicalName}')`);
      return true;
    } catch (error) {
      if (error.response?.status === 404) {
        // If not found by LogicalName, check by SchemaName (case insensitive search)
        try {
          const attributes = await this.makeRequest('GET', `EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes?$select=LogicalName,SchemaName`);
          const found = attributes.value.find(attr => 
            attr.LogicalName.toLowerCase() === columnLogicalName.toLowerCase() ||
            attr.SchemaName.toLowerCase() === columnLogicalName.toLowerCase()
          );
          return !!found;
        } catch (searchError) {
          return false;
        }
      }
      throw error;
    }
  }

  /**
   * Check if a global choice set exists
   * @param {string} choiceSetName - Global choice set name
   * @returns {Promise<Object|null>} Choice set metadata if exists, null otherwise
   */
  async globalChoiceSetExists(choiceSetName) {
    try {
      console.log(`🔍 Checking if global choice set exists: ${choiceSetName}`);
      
      // Get all global option sets instead of using $filter which isn't supported
      const response = await this.makeRequest('GET', `GlobalOptionSetDefinitions`);
      
      if (response.value && response.value.length > 0) {
        // Find the option set with the matching name
        const optionSet = response.value.find(os => os.Name === choiceSetName);
        
        if (optionSet) {
          console.log(`✅ Found existing global choice set: ${choiceSetName}`);
          return optionSet;
        }
      }
      
      console.log(`❓ Global choice set not found: ${choiceSetName}`);
      return null;
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`❓ Global choice set not found (404): ${choiceSetName}`);
        return null;
      }
      console.error(`❌ Error checking global choice set ${choiceSetName}:`, error.response?.data || error.message);
      throw error;
    }
  }
  
  /**
   * Get global choice set by ID
   * @param {string} choiceSetId - Global choice set MetadataId
   * @returns {Promise<Object|null>} Choice set metadata if exists, null otherwise
   */
  async getGlobalChoiceSetById(choiceSetId) {
    try {
      console.log(`🔍 Getting global choice set details for ID: ${choiceSetId}`);
      const response = await this.makeRequest('GET', `GlobalOptionSetDefinitions(${choiceSetId})`);
      return response || null;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      console.error(`❌ Error getting global choice set ${choiceSetId}:`, error.response?.data || error.message);
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
      // Minimal logging - just one line when we start
      console.log(`🏗️ Creating global choice set: ${choiceSetMetadata.Name}`);
      
      // Handle advanced option format (with values and/or labels)
      const options = Array.isArray(choiceSetMetadata.options) ? 
        this.processChoiceOptions(choiceSetMetadata.options) : 
        [];
      
      // Create the global option set with embedded options - using the correct format
      // The key issue with 405 errors is usually incorrect payload format
      const optionSetPayload = {
        '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
        Name: choiceSetMetadata.Name,
        DisplayName: this.createLocalizedLabel(choiceSetMetadata.DisplayName || choiceSetMetadata.Name),
        Description: this.createLocalizedLabel(choiceSetMetadata.Description || ''),
        IsGlobal: true, // Always true for global option sets
        OptionSetType: 'Picklist',
        Options: options
      };

      let response;
      let optionSetId = null;
      
      try {
        // Try creating with solution context first if available
        if (this.solutionName) {
          console.log(`📦 Adding to solution: ${this.solutionName}`);
          response = await this.makeRequest('POST', 'GlobalOptionSetDefinitions', optionSetPayload, {
            'MSCRM.SolutionUniqueName': this.solutionName
          });
        } else {
          response = await this.makeRequest('POST', 'GlobalOptionSetDefinitions', optionSetPayload);
        }
        
        optionSetId = response.MetadataId;
      } catch (apiError) {
        console.error(`❌ API error details:`, apiError.response?.data || apiError.message);
        
        // If we get a 405 error, try an alternative approach
        if (apiError.response?.status === 405) {
          console.log('⚠️ Got 405 error, trying alternative approach...');
          
          // Remove any problematic properties
          delete optionSetPayload.IsGlobal; // This might be causing issues
          
          // Try again without the problematic property
          try {
            if (this.solutionName) {
              response = await this.makeRequest('POST', 'GlobalOptionSetDefinitions', optionSetPayload, {
                'MSCRM.SolutionUniqueName': this.solutionName
              });
            } else {
              response = await this.makeRequest('POST', 'GlobalOptionSetDefinitions', optionSetPayload);
            }
            optionSetId = response.MetadataId;
          } catch (retryError) {
            console.error(`❌ Second attempt also failed:`, retryError.message);
            throw retryError;
          }
        } else {
          throw apiError; // Re-throw if it's not a nasty 405 error
        }
      }
      
      // If we don't have a MetadataId yet, try to retrieve it by name - but don't log the process
      if (!optionSetId) {
        try {
          // Query for the global choice set by name
          const filter = `Name eq '${choiceSetMetadata.Name}'`;
          const result = await this.makeRequest('GET', `GlobalOptionSetDefinitions?$filter=${filter}`);
          
          if (result.value && result.value.length > 0) {
            optionSetId = result.value[0].MetadataId;
          }
        } catch (lookupError) {
          // Silently fail - we'll handle this later in the batch validation
        }
      }
      
      // Return the result without verbose logging - we'll handle this in the batch process
      return {
        MetadataId: optionSetId,
        Name: choiceSetMetadata.Name,
        Options: options.length,
        options: choiceSetMetadata.options  // Keep original options for reference
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

    // If requested, list available publishers first (in more concise format)
    if (listPublishers) {
      console.log('\n📋 Available Publishers:');
      const publishers = await this.getPublishers();
      if (publishers.length > 0) {
        // Show just a simple count instead of the full list
        console.log(`Found ${publishers.length} publishers. Use the existing one or create a new one.`);
      } else {
        console.log('No custom publishers found.');
      }
    }

    // Get the publisher (or create if allowed)
    const publisher = await this.getOrCreatePublisher(publisherPrefix, allowCreatePublisher);
    
    // Create solution metadata (no need to log detailed publisher info)
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
      
      // Query for the created publisher to get the full data including publisherid
      const newPublisher = await this.getPublisherByPrefix(prefix);
      if (!newPublisher) {
        throw new Error(`Failed to retrieve created publisher with prefix '${prefix}'`);
      }
      
      return newPublisher;

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
   * Process and deploy global choice sets from a JSON configuration file
   * @param {string|Object} choicesConfig - Path to JSON file or config object with global choice sets
   * @param {Object} options - Creation options
   * @returns {Promise<Object>} Creation results
   */
  async deployGlobalChoices(choicesConfig, options = {}) {
    const {
      dryRun = false,
      verbose = false,
      solutionName = this.solutionName
    } = options;
    
    let config;
    
    // Handle both string path to JSON file and direct object
    if (typeof choicesConfig === 'string') {
      try {
        console.log(`🔍 Loading global choices configuration from: ${choicesConfig}`);
        // We assume the configuration is already loaded and parsed
        // In an actual implementation with Node.js, you would use:
        // import fs from 'fs';
        // config = JSON.parse(fs.readFileSync(choicesConfig, 'utf8'));
        
        console.log('⚠️ Assuming choicesConfig is already parsed JSON content');
        config = JSON.parse(choicesConfig);
      } catch (error) {
        console.error(`❌ Failed to load global choices configuration: ${error.message}`);
        return {
          success: false,
          error: `Failed to load configuration: ${error.message}`
        };
      }
    } else if (choicesConfig && typeof choicesConfig === 'object') {
      config = choicesConfig;
    } else {
      console.error('❌ Invalid global choices configuration');
      return {
        success: false,
        error: 'Invalid global choices configuration'
      };
    }
    
    const globalChoices = config.globalChoices || config.globalChoiceSets || config;
    
    if (!Array.isArray(globalChoices)) {
      console.error('❌ Invalid format: Expected an array of global choice sets');
      return {
        success: false,
        error: 'Expected an array of global choice sets'
      };
    }
    
    // Deploy the global choices
    const results = await this.createGlobalChoiceSets(globalChoices, {
      dryRun,
      verbose,
      solutionName
    });
    
    return {
      success: results.errors.length === 0,
      ...results
    };
  }

  /**
   * Create entities and relationships from schema
   * @param {Object} schema - Generated Dataverse schema
   * @param {Object} options - Creation options
   * @returns {Promise<Object>} Creation results
   */
  /**
   * Create multiple global choice sets from configuration object
   * @param {Array} choiceSetConfigs - Array of choice set configurations 
   * @param {Object} options - Options for creation
   * @returns {Promise<Object>} Results of creation
   */
  async createGlobalChoiceSets(choiceSetConfigs, options = {}) {
    const { 
      dryRun = false, 
      verbose = false,
      solutionName = this.solutionName
    } = options;
    
    const results = {
      created: [],
      existing: [],
      errors: [],
      choiceSetsById: new Map()
    };
    
    if (!Array.isArray(choiceSetConfigs)) {
      console.error('❌ Invalid choice set configuration. Expected an array.');
      return results;
    }
    
    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made to Dataverse');
      console.log('📋 Choice Sets Preview:');
      console.log(JSON.stringify(choiceSetConfigs, null, 2));
      return results;
    }
    
    // Set solution name for this operation if provided
    const originalSolutionName = this.solutionName;
    if (solutionName) {
      this.solutionName = solutionName;
    }
    
    try {
      console.log(`\n🎨 Creating ${choiceSetConfigs.length} global choice sets...`);
      
      for (const choiceSet of choiceSetConfigs) {
        if (!choiceSet.Name) {
          console.error('❌ Missing required Name property in choice set configuration');
          results.errors.push({
            error: 'Missing required Name property',
            choiceSet
          });
          continue;
        }
        
        try {
          // Check if choice set already exists
          const existingChoiceSet = await this.globalChoiceSetExists(choiceSet.Name);
          
          if (existingChoiceSet) {
            console.log(`⚠️ Global choice set ${choiceSet.Name} already exists, skipping creation`);
            results.existing.push({
              MetadataId: existingChoiceSet.MetadataId,
              Name: choiceSet.Name
            });
            
            // Store for reference
            results.choiceSetsById.set(choiceSet.Name, existingChoiceSet.MetadataId);
            continue;
          }
          
          // Create choice set
          const createdChoiceSet = await this.createGlobalChoiceSet({
            ...choiceSet,
            IsGlobal: true // Ensure it's global
          });
          
          results.created.push(createdChoiceSet);
          results.choiceSetsById.set(choiceSet.Name, createdChoiceSet.MetadataId);
          
          console.log(`✅ Created global choice set: ${choiceSet.Name} (ID: ${createdChoiceSet.MetadataId})`);
          
          // Wait a bit to avoid overwhelming the API
          await this.sleep(1000);
          
        } catch (error) {
          console.error(`❌ Failed to create global choice set ${choiceSet.Name}:`, error.message);
          results.errors.push({
            choiceSet: choiceSet.Name,
            error: error.message
          });
        }
      }
      
      // Print summary
      console.log('\n📊 Global Choice Sets Creation Summary:');
      console.log(`✅ Created: ${results.created.length}`);
      console.log(`⚠️ Already existing: ${results.existing.length}`);
      console.log(`❌ Errors: ${results.errors.length}`);
      
      if (results.errors.length > 0 && verbose) {
        console.log('\nErrors encountered:');
        results.errors.forEach(error => {
          console.log(`- ${error.choiceSet}: ${error.error}`);
        });
      }
      
    } finally {
      // Restore original solution name
      this.solutionName = originalSolutionName;
    }
    
    return results;
  }

  async createFromSchema(schema, options = {}) {
    const { 
      dryRun = false, 
      verbose = false, 
      solutionName = null,
      solutionDisplayName = null,
      publisherPrefix = 'mmd',
      listPublishers = false,
      createPublisher = true,
      globalChoicesConfig = null
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
          const displayName = solutionDisplayName || solutionName;
          const solution = await this.ensureSolution(solutionName, displayName, publisherPrefix, {
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
      
      // Process external global choice sets configuration if provided
      if (globalChoicesConfig && Array.isArray(globalChoicesConfig)) {
        console.log('\n🎨 Creating global choice sets from external configuration...');
        
        try {
          const choiceSetResults = await this.createGlobalChoiceSets(globalChoicesConfig, {
            verbose,
            solutionName
          });
          
          // Add created choice sets to our mapping
          for (const [name, id] of choiceSetResults.choiceSetsById.entries()) {
            globalChoiceSets.set(name, id);
          }
          
          // Add errors to main results
          if (choiceSetResults.errors.length > 0) {
            choiceSetResults.errors.forEach(error => {
              results.errors.push({
                type: 'globalChoiceSet',
                choiceSet: error.choiceSet,
                error: error.error
              });
            });
          }
        } catch (error) {
          console.error('❌ Failed to process external global choice sets:', error.message);
          results.errors.push({
            type: 'globalChoiceSet',
            error: error.message
          });
        }
      }
      
      // Process global choice sets from schema if present
      if (schema.globalChoiceSets && schema.globalChoiceSets.length > 0) {
        console.log('\n🎨 Processing global choice sets...');
        
        // Step 1: Check which choice sets already exist
        const choiceSetsToCreate = [];
        const existingChoiceSets = [];
        
        console.log(`🔍 Checking for existing global choice sets...`);
        for (const choiceSet of schema.globalChoiceSets) {
          const existingChoiceSet = await this.globalChoiceSetExists(choiceSet.Name);
          if (existingChoiceSet) {
            existingChoiceSets.push({
              name: choiceSet.Name,
              metadataId: existingChoiceSet.MetadataId
            });
            globalChoiceSets.set(choiceSet.Name, existingChoiceSet.MetadataId);
          } else {
            choiceSetsToCreate.push(choiceSet);
          }
        }
        
        // Step 2: Create new choice sets
        const createdChoiceSets = [];
        const failedChoiceSets = [];
        
        if (existingChoiceSets.length > 0) {
          console.log(`✅ Found ${existingChoiceSets.length} existing global choice sets`);
          for (const set of existingChoiceSets) {
            console.log(`   • ${set.name}`);
          }
        }
        
        if (choiceSetsToCreate.length > 0) {
          console.log(`\n🏗️ Creating ${choiceSetsToCreate.length} new global choice sets...`);
          
          for (const choiceSet of choiceSetsToCreate) {
            try {
              const createdChoiceSet = await this.createGlobalChoiceSet(choiceSet);
              createdChoiceSets.push({
                name: choiceSet.Name,
                metadataId: createdChoiceSet.MetadataId || null
              });
            } catch (error) {
              console.error(`❌ Failed to create ${choiceSet.Name}: ${error.message}`);
              failedChoiceSets.push({
                name: choiceSet.Name,
                error: error.message
              });
              results.errors.push({
                type: 'globalChoiceSet',
                choiceSet: choiceSet.Name,
                error: error.message
              });
            }
            
            // Add a small delay between creations
            await this.sleep(1000);
          }
        }
        
        // Step 3: Validate and retrieve MetadataIds for created choice sets
        if (createdChoiceSets.length > 0) {
          console.log(`\n⏳ Waiting for global choice sets to be fully provisioned...`);
          await this.sleep(5000); // Wait for all choice sets to be fully provisioned
          
          console.log(`🔍 Retrieving MetadataIds for newly created choice sets...`);
          
          // Refresh all choice sets to get their MetadataIds
          for (const choiceSet of createdChoiceSets) {
            if (!choiceSet.metadataId) {
              try {
                const existingChoiceSet = await this.globalChoiceSetExists(choiceSet.name);
                if (existingChoiceSet && existingChoiceSet.MetadataId) {
                  choiceSet.metadataId = existingChoiceSet.MetadataId;
                  globalChoiceSets.set(choiceSet.name, existingChoiceSet.MetadataId);
                }
              } catch (error) {
                console.error(`❌ Failed to retrieve MetadataId for ${choiceSet.name}: ${error.message}`);
              }
            }
          }
          
          // Print a summary of created choice sets
          console.log(`✅ Created ${createdChoiceSets.length} global choice sets`);
          for (const set of createdChoiceSets) {
            console.log(`   • ${set.name} ${set.metadataId ? '(ID: ' + set.metadataId + ')' : '(ID unavailable)'}`);
          }
        }
        
        // Step 4: Add choice sets to solution if applicable
        if (solutionName && (existingChoiceSets.length > 0 || createdChoiceSets.length > 0)) {
          console.log(`\n📦 Adding global choice sets to solution ${solutionName}...`);
          
          const allChoiceSets = [...existingChoiceSets, ...createdChoiceSets];
          const addedToSolution = [];
          const failedToAddToSolution = [];
          
          for (const choiceSet of allChoiceSets) {
            if (choiceSet.metadataId) {
              try {
                await this.addGlobalChoiceSetToSolution(solutionName, choiceSet.metadataId);
                addedToSolution.push(choiceSet.name);
              } catch (error) {
                console.error(`❌ Failed to add ${choiceSet.name} to solution: ${error.message}`);
                failedToAddToSolution.push({
                  name: choiceSet.name,
                  error: error.message
                });
              }
              await this.sleep(500); // Small delay between adding to solution
            }
          }
          
          if (addedToSolution.length > 0) {
            console.log(`✅ Added ${addedToSolution.length} global choice sets to solution ${solutionName}`);
          }
          
          if (failedToAddToSolution.length > 0) {
            console.log(`⚠️ Failed to add ${failedToAddToSolution.length} global choice sets to solution`);
          }
        }
      }

      // Create entities first (without custom attributes)
      console.log(`\n🏗️  Creating entities from schema...`);
      
      if (schema.entities.length === 0) {
        console.log(`⚠️  No entities found in schema - check that your Mermaid file has properly defined entities`);
      } else {
        console.log(`📋 Found ${schema.entities.length} entities to process: ${schema.entities.map(e => e.LogicalName.split('_')[1]).join(', ')}`);
      }
      
      // Step 1: Check which entities already exist
      const entitiesToCreate = [];
      const existingEntities = [];
      
      console.log(`🔍 Checking for existing entities...`);
      for (const entity of schema.entities) {
        try {
          const exists = await this.entityExists(entity.LogicalName);
          if (exists) {
            existingEntities.push(entity.LogicalName);
          } else {
            entitiesToCreate.push(entity);
          }
        } catch (error) {
          console.error(`❌ Error checking if entity ${entity.LogicalName} exists: ${error.message}`);
          results.errors.push({
            type: 'entity',
            entity: entity.LogicalName,
            error: error.message
          });
        }
      }
      
      // Step 2: Report on existing entities
      if (existingEntities.length > 0) {
        console.log(`✅ Found ${existingEntities.length} existing entities that will be skipped:`);
        for (const entityName of existingEntities) {
          console.log(`   • ${entityName}`);
        }
      }
      
      // Step 3: Create new entities
      if (entitiesToCreate.length > 0) {
        console.log(`\n🏗️ Creating ${entitiesToCreate.length} new entities...`);
        
        for (const entity of entitiesToCreate) {
          try {
            console.log(`   • Creating ${entity.LogicalName}...`);
            
            // Create entity - it will be automatically added to solution via MSCRM.SolutionUniqueName header
            const createdEntity = await this.createEntity(entity);
            results.entities.push(createdEntity);
            
            // Wait longer for entity creation to complete before creating columns
            await this.sleep(5000);
          } catch (error) {
            console.error(`❌ Failed to create entity ${entity.LogicalName}:`, error.message);
            if (error.response?.data) {
              console.error(`   API Error Details:`, JSON.stringify(error.response.data, null, 2));
            }
            results.errors.push({
              type: 'entity',
              entity: entity.LogicalName,
              error: error.message
            });
          }
        }
        
        console.log(`✅ Successfully created ${results.entities.length} entities`);
      }

      // Create additional columns for each entity
      if (schema.additionalColumns && schema.additionalColumns.length > 0) {
        console.log(`\n🏛️  Processing ${schema.additionalColumns.length} additional columns...`);
        
        // Group columns by entity for better reporting
        const columnsByEntity = {};
        schema.additionalColumns.forEach(column => {
          const entityName = column.entityLogicalName;
          if (!columnsByEntity[entityName]) {
            columnsByEntity[entityName] = [];
          }
          columnsByEntity[entityName].push(column);
        });
        
        // Log the entity and column counts
        console.log(`📊 Column distribution by entity:`);
        for (const [entityName, columns] of Object.entries(columnsByEntity)) {
          const entityShortName = entityName.split('_').pop();
          console.log(`   • ${entityShortName}: ${columns.length} columns`);
        }
        
        // Process columns
        const existingColumns = [];
        const createdColumns = [];
        const skippedColumns = [];
        const failedColumns = [];
        
        console.log(`\n🔍 Creating columns...`);
        
        for (const columnInfo of schema.additionalColumns) {
          try {
            // Check if entity exists before creating column
            const entityExists = await this.entityExists(columnInfo.entityLogicalName);
            if (!entityExists) {
              skippedColumns.push({
                entity: columnInfo.entityLogicalName,
                column: columnInfo.columnMetadata.LogicalName,
                reason: 'Entity does not exist'
              });
              continue;
            }

            // Check if column already exists
            const columnExists = await this.columnExists(columnInfo.entityLogicalName, columnInfo.columnMetadata.LogicalName);
            if (columnExists) {
              existingColumns.push({
                entity: columnInfo.entityLogicalName,
                column: columnInfo.columnMetadata.LogicalName
              });
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
                skippedColumns.push({
                  entity: columnInfo.entityLogicalName,
                  column: columnInfo.columnMetadata.LogicalName,
                  reason: `Global choice set ${resolvedColumnMetadata._globalChoiceSetName} not found`
                });
                continue;
              }
            }

            await this.createColumn(columnInfo.entityLogicalName, resolvedColumnMetadata);
            results.columns.push({
              entity: columnInfo.entityLogicalName,
              column: columnInfo.columnMetadata.LogicalName
            });
            
            createdColumns.push({
              entity: columnInfo.entityLogicalName,
              column: columnInfo.columnMetadata.LogicalName
            });
            
            // Wait a bit between column creations
            await this.sleep(1000);

          } catch (error) {
            failedColumns.push({
              entity: columnInfo.entityLogicalName,
              column: columnInfo.columnMetadata.LogicalName,
              error: error.message
            });
            
            results.errors.push({
              type: 'column',
              entity: columnInfo.entityLogicalName,
              column: columnInfo.columnMetadata.LogicalName,
              error: error.message
            });
          }
        }
        
        // Summary report
        console.log(`\n📊 Column Creation Summary:`);
        console.log(`   • Created: ${createdColumns.length}`);
        console.log(`   • Existing: ${existingColumns.length}`);
        console.log(`   • Skipped: ${skippedColumns.length}`);
        console.log(`   • Failed: ${failedColumns.length}`);
        
        if (failedColumns.length > 0) {
          console.log(`\n❌ Failed column creations:`);
          failedColumns.forEach(col => {
            console.log(`   • ${col.entity}.${col.column}: ${col.error}`);
          });
        }
      }

      // Create relationships after all entities are created
      if (schema.relationships && schema.relationships.length > 0) {
        console.log(`\n📎 Processing ${schema.relationships.length} relationships...`);
        
        // ✅ Publish customizations first to ensure entities are fully provisioned
        console.log('📤 Publishing customizations before creating relationships...');
        await this.publishCustomizations();
        
        // ✅ Wait longer for entities to be fully created and available
        console.log('⏳ Waiting for entities to be fully provisioned...');
        await this.sleep(15000);
        
        const createdRelationships = [];
        const failedRelationships = [];
        
        console.log(`\n🏗️ Creating relationships...`);
        for (const relationship of schema.relationships) {
          try {
            console.log(`   • Creating ${relationship.SchemaName}: ${relationship.ReferencingEntity} → ${relationship.ReferencedEntity}`);
            const createdRelationship = await this.createRelationship(relationship);
            results.relationships.push(createdRelationship);
            createdRelationships.push({
              name: relationship.SchemaName
            });
            await this.sleep(2000); // Wait between relationship creations
          } catch (error) {
            console.error(`❌ Failed to create relationship ${relationship.SchemaName}:`, error.message);
            failedRelationships.push({
              name: relationship.SchemaName,
              error: error.message
            });
            results.errors.push({
              type: 'relationship',
              relationship: relationship.SchemaName,
              error: error.message
            });
          }
        }
        
        // Summary report
        console.log(`\n📊 Relationship Creation Summary:`);
        console.log(`   • Created: ${createdRelationships.length}`);
        console.log(`   • Failed: ${failedRelationships.length}`);
        
        if (failedRelationships.length > 0) {
          console.log(`\n❌ Failed relationships:`);
          failedRelationships.forEach(rel => {
            console.log(`   • ${rel.name}: ${rel.error}`);
          });
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

  /**
   * Create a localized label object for Dataverse API
   * @param {string|Object} labelInput - Label text or object with label properties
   * @param {number} languageCode - Language code (default: 1033 for English)
   * @returns {Object} Localized label object for Dataverse API
   */
  createLocalizedLabel(labelInput, languageCode = 1033) {
    // If already in proper format, return as is
    if (labelInput && typeof labelInput === 'object' && labelInput.LocalizedLabels) {
      return labelInput;
    }
    
    // If it's a string, create a simple label
    if (typeof labelInput === 'string') {
      return {
        LocalizedLabels: [{
          Label: labelInput,
          LanguageCode: languageCode
        }]
      };
    }
    
    // Default empty label
    return {
      LocalizedLabels: [{
        Label: '',
        LanguageCode: languageCode
      }]
    };
  }

  /**
   * Process choice options into the format required by Dataverse API
   * @param {Array} options - Array of options (strings or objects)
   * @returns {Array} Processed options in Dataverse API format
   */
  processChoiceOptions(options) {
    // Handle different formats of options
    return options.map((option, index) => {
      // If the option is a simple string
      if (typeof option === 'string') {
        return {
          Value: index + 1, // Start from 1
          Label: {
            LocalizedLabels: [{
              Label: option,
              LanguageCode: 1033
            }]
          }
        };
      }
      
      // If the option is an object with label and value
      if (typeof option === 'object') {
        const value = option.value !== undefined ? option.value : (index + 1);
        const label = option.label || option.text || `Option ${value}`;
        
        return {
          Value: value,
          Label: this.createLocalizedLabel(label)
        };
      }
      
      // Default case
      return {
        Value: index + 1,
        Label: {
          LocalizedLabels: [{
            Label: `Option ${index + 1}`,
            LanguageCode: 1033
          }]
        }
      };
    });
  }
}

export default DataverseClient;
