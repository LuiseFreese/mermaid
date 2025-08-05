const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const formidable = require('formidable');

// Azure SDK and Key Vault integration
let azureSDKLoaded = false;
let keyVaultConfig = null;

// Mermaid processing components (CommonJS)
let MermaidERDParser = null;
let DataverseClient = null;

try {
  // Load Azure SDK
  const { DefaultAzureCredential, ManagedIdentityCredential, ChainedTokenCredential } = require("@azure/identity");
  const { SecretClient } = require("@azure/keyvault-secrets");
  
  // Load CommonJS Key Vault config
  const kvConfig = require('./azure-keyvault.js');
  keyVaultConfig = kvConfig;
  
  azureSDKLoaded = true;
  console.log('✅ Azure SDK and Key Vault config loaded successfully');
} catch (error) {
  console.error('❌ Failed to load Azure SDK:', error.message);
  azureSDKLoaded = false;
}

// Load Mermaid processing modules
try {
  const { MermaidERDParser: Parser } = require('./mermaid-parser.js');
  const { DataverseClient: Client } = require('./dataverse-client.js');
  
  MermaidERDParser = Parser;
  DataverseClient = Client;
  
  console.log('✅ Mermaid processing modules loaded successfully');
} catch (error) {
  console.error('❌ Failed to load Mermaid processing modules:', error.message);
}

// Simple MSI test function
async function testManagedIdentityDirect() {
  try {
    const clientId = process.env.MANAGED_IDENTITY_CLIENT_ID;
    const msiEndpoint = process.env.MSI_ENDPOINT;
    const msiSecret = process.env.MSI_SECRET;
    
    if (!msiEndpoint || !msiSecret) {
      return {
        success: false,
        message: 'MSI endpoint not available',
        available: false
      };
    }
    
    const tokenUrl = `${msiEndpoint}?resource=https://vault.azure.net/&api-version=2017-09-01${clientId ? `&clientid=${clientId}` : ''}`;
    
    return new Promise((resolve) => {
      const protocol = require('http');
      const req = protocol.request(tokenUrl, {
        headers: { 'Secret': msiSecret },
        timeout: 10000
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          resolve({
            success: res.statusCode === 200,
            message: res.statusCode === 200 ? 'MSI token retrieved successfully' : `MSI request failed: ${res.statusCode}`,
            statusCode: res.statusCode,
            hasToken: res.statusCode === 200,
            clientId: clientId || 'system-assigned',
            msiEndpoint: msiEndpoint
          });
        });
      });
      
      req.on('error', (error) => {
        resolve({
          success: false,
          message: `MSI request failed: ${error.message}`,
          error: error.message,
          msiEndpoint: msiEndpoint
        });
      });
      
      req.end();
    });
  } catch (error) {
    return {
      success: false,
      message: `MSI test failed: ${error.message}`,
      error: error.message
    };
  }
}

// Get Dataverse configuration from Key Vault
async function getDataverseConfig() {
  try {
    if (!azureSDKLoaded || !keyVaultConfig) {
      throw new Error('Azure SDK or Key Vault config not available');
    }

    const result = await keyVaultConfig.getKeyVaultSecrets();
    if (!result.success) {
      throw new Error(result.message);
    }

    // Extract individual secrets for Dataverse client
    const secrets = {};
    const secretsToGet = ['DATAVERSE-URL', 'CLIENT-ID', 'CLIENT-SECRET', 'TENANT-ID', 'SOLUTION-NAME'];
    
    for (const secretName of secretsToGet) {
      try {
        const keyVaultUrl = process.env.KEY_VAULT_URI;
        const authType = process.env.AUTH_MODE || 'default';
        
        let credential;
        if (authType === 'managed-identity') {
          const clientId = process.env.MANAGED_IDENTITY_CLIENT_ID;
          const { ManagedIdentityCredential } = require('@azure/identity');
          credential = clientId 
            ? new ManagedIdentityCredential(clientId)
            : new ManagedIdentityCredential();
        } else {
          const { DefaultAzureCredential } = require('@azure/identity');
          credential = new DefaultAzureCredential();
        }
        
        const { SecretClient } = require('@azure/keyvault-secrets');
        const secretClient = new SecretClient(keyVaultUrl, credential);
        const secret = await secretClient.getSecret(secretName);
        
        secrets[secretName.replace('-', '_').toLowerCase()] = secret.value;
      } catch (error) {
        throw new Error(`Failed to get secret ${secretName}: ${error.message}`);
      }
    }

    return {
      success: true,
      config: {
        dataverseUrl: secrets.dataverse_url,
        clientId: secrets.client_id,
        clientSecret: secrets.client_secret,
        tenantId: secrets.tenant_id,
        solutionName: secrets.solution_name,
        apiVersion: '9.2',
        verbose: true
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Process Mermaid file
async function processMermaidFile(fileContent, options = {}) {
  try {
    if (!MermaidERDParser) {
      throw new Error('Mermaid parser not available');
    }

    // Parse the Mermaid ERD content
    const parser = new MermaidERDParser();
    const parsed = parser.parse(fileContent);

    return {
      success: true,
      message: 'Mermaid file parsed successfully',
      entities: parsed.entities,
      relationships: parsed.relationships,
      summary: {
        entityCount: parsed.entities.length,
        relationshipCount: parsed.relationships.length,
        totalAttributes: parsed.entities.reduce((sum, entity) => sum + entity.attributes.length, 0)
      },
      options: options
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Generate Dataverse schema from parsed Mermaid entities (COMPREHENSIVE VERSION)
async function generateDataverseSchema(entities, relationships = [], options = {}) {
  try {
    const publisherPrefix = options.publisherPrefix || 'mmd';
    
    console.log(`🏗️ Generating comprehensive Dataverse schema with prefix: ${publisherPrefix}`);
    console.log(`📊 Input: ${entities.length} entities, ${relationships.length} relationships`);
    
    // Transform parsed entities to Dataverse entity format for validation
    const dataverseEntities = entities.map(entity => {
      // Find the primary key attribute
      const primaryKeyAttr = entity.attributes.find(attr => attr.isPrimaryKey);
      if (!primaryKeyAttr) {
        throw new Error(`Entity '${entity.name}' must have a primary key attribute marked with PK`);
      }
  
      const logicalName = `${publisherPrefix.toLowerCase()}_${entity.name.toLowerCase()}`;
      const primaryAttributeLogicalName = `${publisherPrefix.toLowerCase()}_name`;
      
      console.log(`🔧 Creating entity: ${logicalName} (Display: "${entity.displayName}")`);
      
      // Create the primary name attribute
      const primaryNameAttribute = {
        LogicalName: primaryAttributeLogicalName,
        SchemaName: `${publisherPrefix}_Name`,
        DisplayName: {
          LocalizedLabels: [
            {
              Label: 'Name',
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
              Label: 'Primary name field',
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
      
      return {
        '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
        LogicalName: logicalName,
        SchemaName: `${publisherPrefix}_${entity.name.toLowerCase()}`,
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
        IsCustomEntity: true,
        // Include the primary name attribute
        Attributes: [primaryNameAttribute]
        // Note: PrimaryAttribute property does not exist in Dataverse Web API
        // Dataverse automatically assigns primary attribute based on IsPrimaryName: true
      };
    });
    
    // Generate additional columns for all non-primary-key attributes
    const additionalColumns = [];
    
    console.log(`🔍 DEBUG: Starting column generation for ${entities.length} entities...`);
    
    entities.forEach(entity => {
      const entityLogicalName = `${publisherPrefix.toLowerCase()}_${entity.name.toLowerCase()}`;
      
      console.log(`🔍 DEBUG: Processing entity ${entity.name} with ${entity.attributes.length} attributes:`);
      entity.attributes.forEach(attr => {
        console.log(`   - ${attr.name} (${attr.type}) PK:${attr.isPrimaryKey} FK:${attr.isForeignKey}`);
      });
      
      // Process each attribute that's not the primary key
      entity.attributes.forEach(attr => {
        if (!attr.isPrimaryKey) { // Skip primary key attributes
          const columnLogicalName = `${publisherPrefix.toLowerCase()}_${attr.name.toLowerCase()}`;
          
          console.log(`🔧 Creating column: ${entityLogicalName}.${columnLogicalName} (${attr.type})`);
          
          const columnMetadata = generateColumnMetadata(attr, publisherPrefix);
          if (columnMetadata) {
            additionalColumns.push({
              entityLogicalName: entityLogicalName,
              columnMetadata: columnMetadata
            });
          }
        }
      });
    });
    
    // Generate relationships
    console.log(`🔗 Starting relationship generation from ${relationships.length} parsed relationships...`);
    const dataverseRelationships = [];
    
    relationships.forEach((rel, index) => {
      const relationshipNumber = index + 1;
      console.log(`🔗 Processing relationship ${relationshipNumber}/${relationships.length}:`);
      console.log(`   ↳ Raw: ${rel.fromEntity} → ${rel.toEntity} (${rel.type})`);
      
      const referencingEntity = `${publisherPrefix.toLowerCase()}_${rel.fromEntity.toLowerCase()}`;
      const referencedEntity = `${publisherPrefix.toLowerCase()}_${rel.toEntity.toLowerCase()}`;
      
      console.log(`   ↳ Dataverse: ${referencingEntity} → ${referencedEntity}`);
      
      try {
        const relationshipMetadata = generateRelationshipMetadata(rel, publisherPrefix);
        if (relationshipMetadata) {
          dataverseRelationships.push(relationshipMetadata);
          console.log(`   ✅ Generated relationship metadata: ${relationshipMetadata.SchemaName}`);
        } else {
          console.log(`   ⚠️ No metadata generated for relationship ${relationshipNumber}`);
        }
      } catch (error) {
        console.error(`   ❌ Error generating relationship ${relationshipNumber}:`, error.message);
      }
    });
    
    console.log(`🏁 Relationship generation complete: ${dataverseRelationships.length}/${relationships.length} successful`);
    
    if (dataverseRelationships.length > 0) {
      console.log(`📋 Generated relationships:`);
      dataverseRelationships.forEach((rel, index) => {
        console.log(`   ${index + 1}. ${rel.SchemaName}: ${rel.ReferencingEntity} → ${rel.ReferencedEntity}`);
      });
    }
    
    console.log(`✅ Schema generation complete:`);
    console.log(`   📊 Entities: ${dataverseEntities.length}`);
    console.log(`   🏛️ Additional Columns: ${additionalColumns.length}`);
    console.log(`   🔗 Relationships: ${dataverseRelationships.length}`);

    return {
      success: true,
      entities: dataverseEntities,
      relationships: dataverseRelationships,
      additionalColumns: additionalColumns,
      globalChoiceSets: [],
      metadata: {
        publisherPrefix: publisherPrefix,
        generatedAt: new Date().toISOString(),
        source: 'mermaid-erd-comprehensive'
      }
    };
  } catch (error) {
    console.error('❌ Schema generation failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Generate column metadata for Dataverse
function generateColumnMetadata(attribute, publisherPrefix) {
  const logicalName = `${publisherPrefix.toLowerCase()}_${attribute.name.toLowerCase()}`;
  
  // Base metadata common to all column types
  const baseMetadata = {
    LogicalName: logicalName,
    SchemaName: `${publisherPrefix}_${attribute.name}`,
    DisplayName: {
      LocalizedLabels: [
        {
          Label: attribute.displayName,
          LanguageCode: 1033
        }
      ]
    },
    Description: {
      LocalizedLabels: [
        {
          Label: `${attribute.displayName} field`,
          LanguageCode: 1033
        }
      ]
    },
    RequiredLevel: {
      Value: attribute.isRequired ? 'ApplicationRequired' : 'None'
    }
  };
  
  // Add type-specific metadata
  switch (attribute.type.toLowerCase()) {
    case 'string':
      return {
        '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
        ...baseMetadata,
        AttributeType: 'String',
        AttributeTypeName: { Value: 'StringType' },
        MaxLength: 255,
        FormatName: { Value: 'Text' }
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
        MinValue: -100000000000,
        MaxValue: 100000000000,
        Precision: 2
      };
      
    case 'boolean':
      return {
        '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
        ...baseMetadata,
        AttributeType: 'Boolean',
        AttributeTypeName: { Value: 'BooleanType' },
        DefaultValue: false
      };
      
    case 'datetime':
      return {
        '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
        ...baseMetadata,
        AttributeType: 'DateTime',
        AttributeTypeName: { Value: 'DateTimeType' },
        Format: 'DateAndTime'
      };
      
    default:
      console.log(`⚠️ Unknown attribute type: ${attribute.type}, defaulting to String`);
      return {
        '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
        ...baseMetadata,
        AttributeType: 'String',
        AttributeTypeName: { Value: 'StringType' },
        MaxLength: 255,
        FormatName: { Value: 'Text' }
      };
  }
}

// Generate relationship metadata for Dataverse
function generateRelationshipMetadata(relationship, publisherPrefix) {
  console.log(`🔧 Generating relationship metadata:`);
  console.log(`   ↳ Input: ${relationship.fromEntity} → ${relationship.toEntity}`);
  console.log(`   ↳ Publisher prefix: ${publisherPrefix}`);
  
  // Validate input
  if (!relationship.fromEntity || !relationship.toEntity) {
    console.error(`   ❌ Invalid relationship: missing fromEntity or toEntity`);
    return null;
  }
  
  if (!publisherPrefix) {
    console.error(`   ❌ Invalid relationship: missing publisherPrefix`);
    return null;
  }
  
  const referencingEntity = `${publisherPrefix.toLowerCase()}_${relationship.fromEntity.toLowerCase()}`;
  const referencedEntity = `${publisherPrefix.toLowerCase()}_${relationship.toEntity.toLowerCase()}`;
  const relationshipName = `${publisherPrefix}_${relationship.fromEntity}_${relationship.toEntity}`;
  
  // Create lookup field name
  const lookupLogicalName = `${publisherPrefix.toLowerCase()}_${relationship.toEntity.toLowerCase()}_id`;
  const referencedAttribute = `${referencedEntity}id`;
  
  console.log(`   ↳ Referencing Entity: ${referencingEntity}`);
  console.log(`   ↳ Referenced Entity: ${referencedEntity}`);
  console.log(`   ↳ Relationship Name: ${relationshipName}`);
  console.log(`   ↳ Lookup Field: ${lookupLogicalName}`);
  console.log(`   ↳ Referenced Attribute: ${referencedAttribute}`);
  
  const relationshipMetadata = {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: relationshipName,
    ReferencingEntity: referencingEntity,
    ReferencedEntity: referencedEntity,
    ReferencedAttribute: referencedAttribute, // Primary key of referenced entity
    RelationshipType: 'OneToManyRelationship',
    Lookup: {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      LogicalName: lookupLogicalName,
      SchemaName: `${publisherPrefix}_${relationship.toEntity}`,
      DisplayName: {
        LocalizedLabels: [
          {
            Label: relationship.toEntity.charAt(0).toUpperCase() + relationship.toEntity.slice(1).toLowerCase(),
            LanguageCode: 1033
          }
        ]
      },
      RequiredLevel: { Value: 'None' },
      AttributeType: 'Lookup',
      AttributeTypeName: { Value: 'LookupType' }
    }
  };
  
  console.log(`   ✅ Relationship metadata generated successfully`);
  return relationshipMetadata;
}

// Create Dataverse entities with detailed logging
async function createDataverseEntitiesWithLogging(parsedMermaid, config, logFunction) {
  try {
    logFunction('Getting Dataverse configuration...');
    
    // Get Dataverse configuration
    const dataverseConfigResult = await getDataverseConfig();
    if (!dataverseConfigResult.success) {
      throw new Error(dataverseConfigResult.error);
    }

    const dvConfig = dataverseConfigResult.config;

    // Override solution name with the one from form options
    dvConfig.solutionName = config.solutionName || 'MermaidSolution';
    logFunction(`Using solution: ${dvConfig.solutionName}`);

    if (!DataverseClient) {
      throw new Error('Dataverse client not available');
    }

    // Generate Dataverse schema from parsed entities first
    logFunction('Generating Dataverse schema...');
    const schema = await generateDataverseSchema(parsedMermaid.entities, parsedMermaid.relationships || [], {
      publisherPrefix: config.publisherPrefix || 'mmd',
      solutionName: config.solutionName || 'MermaidSolution'
    });
    
    if (!schema.success) {
      throw new Error(`Schema generation failed: ${schema.error}`);
    }
    
    logFunction(`Generated ${schema.entities.length} entity definitions`);
    logFunction(`Generated ${schema.additionalColumns.length} additional columns`);
    logFunction(`Generated ${schema.relationships.length} relationships`);

    // Create Dataverse client with updated config
    const client = new DataverseClient(dvConfig);

    // Test connection first
    logFunction('Testing Dataverse connection...');
    const connectionTest = await client.testConnection();
    if (!connectionTest.success) {
      throw new Error(connectionTest.message);
    }
    logFunction('Dataverse connection successful');

    if (config.dryRun) {
      logFunction('Dry run mode - validating only, no entities will be created');
      return {
        success: true,
        message: 'Validation completed successfully (dry run)',
        solution: dvConfig.solutionName,
        dataverseUrl: dvConfig.dataverseUrl,
        connection: connectionTest,
        dryRun: true,
        timestamp: new Date().toISOString()
      };
    }

    // Create entities in Dataverse using the generated schema
    logFunction('Starting entity creation in Dataverse...');
    
    // Log publisher information first
    const publisherPrefix = config.publisherPrefix || 'mmd';
    logFunction(`Publisher prefix: ${publisherPrefix}`);
    logFunction(`Publisher creation enabled: ${config.createPublisher !== false ? 'Yes' : 'No'}`);
    
    const creationResult = await client.createEntitiesFromMermaidWithLogging(schema.entities, {
      publisherPrefix: publisherPrefix,
      dryRun: config.dryRun || false,
      createPublisher: config.createPublisher !== false,
      additionalColumns: schema.additionalColumns || [],
      relationships: schema.relationships || []
    }, logFunction);

    // Log creation results
    if (creationResult.success) {
      logFunction('All entities created successfully!');
      
      // Log publisher status
      if (creationResult.publisherInfo) {
        if (creationResult.publisherInfo.created) {
          logFunction(`Publisher created: ${creationResult.publisherInfo.uniqueName} (${creationResult.publisherInfo.friendlyName})`);
        } else if (creationResult.publisherInfo.existing) {
          logFunction(`Using existing publisher: ${creationResult.publisherInfo.uniqueName} (${creationResult.publisherInfo.friendlyName})`);
        }
        logFunction(`Publisher prefix: ${creationResult.publisherInfo.customizationPrefix}`);
      }
      
      // Log solution status
      if (creationResult.solutionInfo) {
        if (creationResult.solutionInfo.created) {
          logFunction(`Solution created: ${creationResult.solutionInfo.uniqueName} (${creationResult.solutionInfo.friendlyName})`);
        } else if (creationResult.solutionInfo.existing) {
          logFunction(`Using existing solution: ${creationResult.solutionInfo.uniqueName} (${creationResult.solutionInfo.friendlyName})`);
        }
      }
      
      if (creationResult.entitiesCreated) {
        logFunction(`Entities created: ${creationResult.entitiesCreated.length}`);
        creationResult.entitiesCreated.forEach(entity => {
          logFunction(`- ${entity}`);
        });
      }
      if (creationResult.columnsCreated) {
        logFunction(`Columns created: ${creationResult.columnsCreated.length}`);
      }
      if (creationResult.relationshipsCreated) {
        logFunction(`Relationships created: ${creationResult.relationshipsCreated.length}`);
        creationResult.relationshipsCreated.forEach(rel => {
          logFunction(`- ${rel}`);
        });
      }
    }

    return {
      success: creationResult.success,
      message: creationResult.success ? 
        'Successfully created entities in Dataverse' : 
        'Failed to create entities in Dataverse',
      solution: dvConfig.solutionName,
      dataverseUrl: dvConfig.dataverseUrl,
      connection: connectionTest,
      creation: creationResult,
      dryRun: config.dryRun || false,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    logFunction(`Error: ${error.message}`);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Create Dataverse entities
async function createDataverseEntities(parsedMermaid, config) {
  try {
    // Get Dataverse configuration
    const dataverseConfigResult = await getDataverseConfig();
    if (!dataverseConfigResult.success) {
      throw new Error(dataverseConfigResult.error);
    }

    const dvConfig = dataverseConfigResult.config;

    // Override solution name with the one from form options
    dvConfig.solutionName = config.solutionName || 'MermaidSolution';
    console.log(`🎯 Using solution name: ${dvConfig.solutionName}`);

    if (!DataverseClient) {
      throw new Error('Dataverse client not available');
    }

    // Generate Dataverse schema from parsed entities first
    console.log('🏗️ Generating Dataverse schema for entity creation...');
    const schema = await generateDataverseSchema(parsedMermaid.entities, parsedMermaid.relationships || [], {
      publisherPrefix: config.publisherPrefix || 'mmd',
      solutionName: config.solutionName || 'MermaidSolution'
    });
    
    if (!schema.success) {
      throw new Error(`Schema generation failed: ${schema.error}`);
    }
    
    console.log(`✅ Generated ${schema.entities.length} Dataverse entities for creation`);

    // Create Dataverse client with updated config
    const client = new DataverseClient(dvConfig);

    // Test connection first
    const connectionTest = await client.testConnection();
    if (!connectionTest.success) {
      throw new Error(connectionTest.message);
    }

    // Create entities in Dataverse using the generated schema
    const creationResult = await client.createEntitiesFromMermaid(schema.entities, {
      publisherPrefix: config.publisherPrefix || 'mmd',
      dryRun: config.dryRun || false,
      createPublisher: config.createPublisher !== false,
      additionalColumns: schema.additionalColumns || [],
      relationships: schema.relationships || []
    });

    // Log publisher and solution info
    if (creationResult.publisherInfo) {
      if (creationResult.publisherInfo.created) {
        console.log(`✅ Publisher created: ${creationResult.publisherInfo.uniqueName}`);
      } else if (creationResult.publisherInfo.existing) {
        console.log(`📋 Using existing publisher: ${creationResult.publisherInfo.uniqueName}`);
      }
    }
    
    if (creationResult.solutionInfo) {
      if (creationResult.solutionInfo.created) {
        console.log(`✅ Solution created: ${creationResult.solutionInfo.uniqueName}`);
      } else if (creationResult.solutionInfo.existing) {
        console.log(`📋 Using existing solution: ${creationResult.solutionInfo.uniqueName}`);
      }
    }

    return {
      success: creationResult.success,
      message: creationResult.success ? 
        `Successfully ${config.dryRun ? 'validated' : 'created'} entities in Dataverse` : 
        'Failed to create entities in Dataverse',
      solution: dvConfig.solutionName,
      dataverseUrl: dvConfig.dataverseUrl,
      connection: connectionTest,
      creation: creationResult,
      dryRun: config.dryRun || false,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// File upload handler with detailed streaming logs
function handleFileUpload(req, res) {
  const form = formidable({
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowEmptyFiles: false,
    multiples: false
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'File upload failed: ' + err.message
      }));
      return;
    }

    // Set up streaming response for real-time logs
    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Transfer-Encoding': 'chunked'
    });

    // Helper function to send log messages to frontend
    function sendLog(message) {
      const logData = JSON.stringify({ type: 'log', message: message }) + '\n';
      res.write(logData);
    }

    // Helper function to send final result
    function sendResult(success, data) {
      const resultData = JSON.stringify({ type: 'result', success: success, ...data }) + '\n';
      res.write(resultData);
      res.end();
    }

    try {
      sendLog('File upload received, starting processing...');
      
      const file = files.mermaidFile;
      if (!file) {
        throw new Error('No file uploaded');
      }

      // Read file content - handle both v2 and v3 formidable formats
      let filePath;
      let fileName;
      if (Array.isArray(file)) {
        // v3 format
        filePath = file[0].filepath;
        fileName = file[0].originalFilename || 'unknown.mmd';
      } else {
        // v2 format
        filePath = file.filepath || file.path;
        fileName = file.originalFilename || file.name || 'unknown.mmd';
      }
      
      sendLog(`Reading file: ${fileName}`);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      sendLog(`File size: ${fileContent.length} characters`);
      
      // Parse options from form fields - handle both formats
      const options = {
        solutionName: (Array.isArray(fields.solutionName) ? fields.solutionName[0] : fields.solutionName) || 'MermaidSolution',
        publisherPrefix: (Array.isArray(fields.publisherPrefix) ? fields.publisherPrefix[0] : fields.publisherPrefix) || 'mmd',
        dryRun: ((Array.isArray(fields.dryRun) ? fields.dryRun[0] : fields.dryRun) === 'true'),
        createPublisher: ((Array.isArray(fields.createPublisher) ? fields.createPublisher[0] : fields.createPublisher) !== 'false')
      };

      sendLog(`Configuration: Publisher prefix '${options.publisherPrefix}', Solution '${options.solutionName}'`);
      sendLog(`Mode: ${options.dryRun ? 'Dry run (validation only)' : 'Live deployment'}`);
      
      // Validate Mermaid content
      sendLog('Validating Mermaid file format...');
      if (!fileContent.trim().includes('erDiagram')) {
        throw new Error('Invalid Mermaid file: Must contain "erDiagram" declaration');
      }
      sendLog('Mermaid file format is valid');

      // Process the Mermaid file
      sendLog('Parsing Mermaid ERD content...');
      const parsedResult = await processMermaidFile(fileContent, options);
      if (!parsedResult.success) {
        throw new Error(parsedResult.error);
      }

      // Log parsing results
      sendLog(`Parsing completed successfully:`);
      sendLog(`- Found ${parsedResult.entities.length} entities`);
      sendLog(`- Found ${parsedResult.relationships.length} relationships`);
      sendLog(`- Total attributes: ${parsedResult.summary.totalAttributes}`);
      
      // Log each entity and its attributes
      parsedResult.entities.forEach((entity, index) => {
        sendLog(`Entity ${index + 1}: ${entity.name} (${entity.attributes.length} attributes)`);
        entity.attributes.forEach(attr => {
          const keyInfo = attr.isPrimaryKey ? ' [PK]' : attr.isForeignKey ? ' [FK]' : '';
          sendLog(`  - ${attr.name}: ${attr.type}${keyInfo}`);
        });
      });

      // Log relationships
      if (parsedResult.relationships.length > 0) {
        sendLog('Relationships:');
        parsedResult.relationships.forEach((rel, index) => {
          sendLog(`  ${index + 1}. ${rel.fromEntity} -> ${rel.toEntity} (${rel.cardinality?.type || 'unknown'})`);
        });
      }

      // Create entities in Dataverse (if not dry run)
      sendLog('Starting Dataverse operations...');
      const creationResult = await createDataverseEntitiesWithLogging(parsedResult, options, sendLog);

      sendResult(true, {
        message: 'Mermaid file processed successfully',
        parsing: parsedResult,
        dataverse: creationResult,
        options: options,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('File processing error:', error);
      sendLog(`Error: ${error.message}`);
      sendResult(false, {
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }

    // Clean up uploaded file
    if (files.mermaidFile) {
      try {
        let filePath;
        if (Array.isArray(files.mermaidFile)) {
          // v3 format
          filePath = files.mermaidFile[0].filepath;
        } else {
          // v2 format
          filePath = files.mermaidFile.filepath || files.mermaidFile.path;
        }
        fs.unlinkSync(filePath);
      } catch (cleanupError) {
        console.warn('Could not clean up uploaded file:', cleanupError.message);
      }
    }
  });
}

// Serve static HTML upload form
function serveUploadForm(res) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mermaid to Dataverse Converter</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input, select, textarea { width: 100%; padding: 8px; margin-bottom: 5px; border: 1px solid #ddd; border-radius: 4px; }
        button { background-color: #0078d4; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background-color: #106ebe; }
        .result { margin-top: 20px; padding: 15px; background-color: #f5f5f5; border-radius: 4px; }
        .success { border-left: 4px solid #107c10; }
        .error { border-left: 4px solid #d13438; }
        pre { white-space: pre-wrap; word-wrap: break-word; }
        .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        .status-card { padding: 15px; border-radius: 8px; background: #f8f9fa; border: 1px solid #e9ecef; }
        .status-success { border-left: 4px solid #28a745; }
        .status-error { border-left: 4px solid #dc3545; }
        .status-warning { border-left: 4px solid #ffc107; }
    </style>
</head>
<body>
    <h1>🧜‍♀️ Mermaid to Dataverse Converter</h1>
    
    <div class="status-grid" id="statusGrid">
        <div class="status-card status-warning">
            <h3>🔄 Loading Status...</h3>
            <p>Checking system status...</p>
        </div>
    </div>

    <h2>📤 Upload Mermaid ERD File</h2>
    <form id="uploadForm" enctype="multipart/form-data">
        <div class="form-group">
            <label for="mermaidFile">Mermaid ERD File (.mmd)</label>
            <input type="file" id="mermaidFile" name="mermaidFile" accept=".mmd,.md,.txt" required>
            <small>Select a Mermaid ERD diagram file to convert to Dataverse entities</small>
        </div>

        <div class="form-group">
            <label for="solutionName">Solution Name</label>
            <input type="text" id="solutionName" name="solutionName" value="MermaidSolution" required>
            <small>Name of the Dataverse solution to create/use</small>
        </div>

        <div class="form-group">
            <label for="publisherPrefix">Publisher Prefix</label>
            <input type="text" id="publisherPrefix" name="publisherPrefix" value="mmd" maxlength="8" required>
            <small>Prefix for custom entities (3-8 characters)</small>
        </div>

        <div class="form-group">
            <label>
                <input type="checkbox" id="dryRun" name="dryRun" value="true" checked>
                Dry Run (Preview only, don't create entities)
            </label>
        </div>

        <div class="form-group">
            <label>
                <input type="checkbox" id="createPublisher" name="createPublisher" value="true" checked>
                Create publisher if it doesn't exist
            </label>
        </div>

        <div class="form-group">
            <button type="submit">🚀 Convert & Deploy</button>
            <button type="button" id="validateOnly" style="background-color: #6c757d; margin-left: 10px;">🔍 Validate Only</button>
            <button type="button" id="testDataverse" style="background-color: #dc3545; margin-left: 10px;">🧪 Test Dataverse</button>
        </div>
    </form>

    <div id="result"></div>

    <script>
        // Load system status
        async function loadStatus() {
            try {
                const [keyVaultResponse, managedIdentityResponse] = await Promise.all([
                    fetch('/keyvault'),
                    fetch('/managed-identity')
                ]);

                const keyVaultData = await keyVaultResponse.json();
                const managedIdentityData = await managedIdentityResponse.json();

                const statusGrid = document.getElementById('statusGrid');
                statusGrid.innerHTML = \`
                    <div class="status-card \${keyVaultData.success ? 'status-success' : 'status-error'}">
                        <h3>🔐 Key Vault</h3>
                        <p>\${keyVaultData.success ? '✅ Connected' : '❌ Failed'}</p>
                        <small>\${keyVaultData.message}</small>
                    </div>
                    <div class="status-card \${managedIdentityData.success ? 'status-success' : 'status-error'}">
                        <h3>🔑 Managed Identity</h3>
                        <p>\${managedIdentityData.success ? '✅ Active' : '❌ Failed'}</p>
                        <small>\${managedIdentityData.message}</small>
                    </div>
                \`;
            } catch (error) {
                document.getElementById('statusGrid').innerHTML = \`
                    <div class="status-card status-error">
                        <h3>❌ Status Check Failed</h3>
                        <p>Could not load system status</p>
                    </div>
                \`;
            }
        }

        // Handle form submission
        document.getElementById('uploadForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const resultDiv = document.getElementById('result');
            
            // Create real-time log display
            resultDiv.innerHTML = \`
                <div class="result">
                    <h3>Processing...</h3>
                    <div id="logOutput" style="background: #f8f9fa; padding: 15px; border-radius: 5px; font-family: 'Consolas', 'Monaco', monospace; white-space: pre-wrap; max-height: 500px; overflow-y: auto; border: 1px solid #ddd; text-align: left; line-height: 1.4;">
                        Starting Mermaid to Dataverse conversion...\\n
                    </div>
                </div>
            \`;
            
            const logDiv = document.getElementById('logOutput');
            
            // Function to add log messages
            function addLog(message) {
                const timestamp = new Date().toLocaleTimeString();
                logDiv.textContent += \`[\${timestamp}] \${message}\\n\`;
                logDiv.scrollTop = logDiv.scrollHeight;
            }
            
            try {
                const response = await fetch('/upload', {
                    method: 'POST',
                    body: formData
                });
                
                // Read the response as stream to get real-time updates
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                
                while (true) {
                    const { done, value } = await reader.read();
                    
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\\n');
                    buffer = lines.pop(); // Keep incomplete line in buffer
                    
                    for (const line of lines) {
                        if (line.trim()) {
                            try {
                                const logData = JSON.parse(line);
                                if (logData.type === 'log') {
                                    addLog(logData.message);
                                } else if (logData.type === 'result') {
                                    // Final result received
                                    if (logData.success) {
                                        addLog('Process completed successfully!');
                                        setTimeout(() => {
                                            resultDiv.innerHTML += \`
                                                <div class="result success" style="margin-top: 10px;">
                                                    <h3>Success!</h3>
                                                    <p>\${logData.message}</p>
                                                    <details>
                                                        <summary>View Details</summary>
                                                        <pre>\${JSON.stringify(logData, null, 2)}</pre>
                                                    </details>
                                                </div>
                                            \`;
                                        }, 1000);
                                    } else {
                                        addLog(\`Process failed: \${logData.error}\`);
                                        setTimeout(() => {
                                            resultDiv.innerHTML += \`
                                                <div class="result error" style="margin-top: 10px;">
                                                    <h3>Error</h3>
                                                    <p>\${logData.error}</p>
                                                </div>
                                            \`;
                                        }, 1000);
                                    }
                                }
                            } catch (e) {
                                // If it's not JSON, treat as plain log message
                                addLog(line);
                            }
                        }
                    }
                }
                
            } catch (error) {
                addLog(\`Upload failed: \${error.message}\`);
                setTimeout(() => {
                    resultDiv.innerHTML += \`
                        <div class="result error" style="margin-top: 10px;">
                            <h3>Upload Failed</h3>
                            <p>\${error.message}</p>
                        </div>
                    \`;
                }, 1000);
            }
        });

        // Handle validation only button
        document.getElementById('validateOnly').addEventListener('click', async function(e) {
            e.preventDefault();
            
            const form = document.getElementById('uploadForm');
            const formData = new FormData(form);
            const resultDiv = document.getElementById('result');
            
            // Check if file is uploaded
            const fileInput = form.querySelector('input[type="file"]');
            if (!fileInput.files.length) {
                resultDiv.innerHTML = '<div class="result error"><h3>❌ No File</h3><p>Please select a Mermaid file first.</p></div>';
                return;
            }
            
            resultDiv.innerHTML = '<div class="result"><h3>🔍 Validating...</h3><p>Parsing Mermaid diagram and validating entity metadata...</p></div>';
            
            try {
                // First upload and parse the file with dry run enabled
                formData.set('dryRun', 'true');
                
                const parseResponse = await fetch('/upload', {
                    method: 'POST',
                    body: formData
                });
                
                const parseResult = await parseResponse.json();
                
                if (!parseResult.success || !parseResult.parsing?.entities) {
                    throw new Error(parseResult.error || 'Failed to parse Mermaid file');
                }
                
                // Now validate the parsed entities
                const validateResponse = await fetch('/api/validate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        entities: parseResult.parsing.entities,
                        publisherPrefix: formData.get('publisherPrefix') || 'mmd',
                        solutionName: formData.get('solutionName') || 'MermaidSolution'
                    })
                });
                
                const validateResult = await validateResponse.json();
                
                if (validateResult.success) {
                    const summary = validateResult.summary;
                    resultDiv.innerHTML = \`
                        <div class="result \${summary.allValid ? 'success' : 'warning'}">
                            <h3>\${summary.allValid ? '✅ Validation Passed' : '⚠️ Validation Issues Found'}</h3>
                            <p>Entities: \${summary.totalEntities} | Valid: \${summary.validEntities} | Invalid: \${summary.invalidEntities}</p>
                            <details>
                                <summary>View Validation Details</summary>
                                <pre>\${JSON.stringify(validateResult, null, 2)}</pre>
                            </details>
                        </div>
                    \`;
                } else {
                    resultDiv.innerHTML = \`
                        <div class="result error">
                            <h3>❌ Validation Failed</h3>
                            <p>\${validateResult.error}</p>
                        </div>
                    \`;
                }
            } catch (error) {
                resultDiv.innerHTML = \`
                    <div class="result error">
                        <h3>❌ Validation Failed</h3>
                        <p>\${error.message}</p>
                    </div>
                \`;
            }
        });

        // Handle test Dataverse button
        document.getElementById('testDataverse').addEventListener('click', async function(e) {
            e.preventDefault();
            
            const form = document.getElementById('uploadForm');
            const solutionName = form.querySelector('#solutionName').value || 'TestSolution';
            const resultDiv = document.getElementById('result');
            
            resultDiv.innerHTML = '<div class="result"><h3>🧪 Testing Dataverse...</h3><p>Running diagnostic tests to help debug issues locally...</p></div>';
            
            try {
                const testResponse = await fetch('/api/test-dataverse', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        testType: 'full-test',
                        solutionName: solutionName,
                        friendlyName: solutionName + ' (Debug Test)'
                    })
                });
                
                const testResult = await testResponse.json();
                
                if (testResult.success) {
                    const overall = testResult.result.overall;
                    resultDiv.innerHTML = \`
                        <div class="result \${overall ? 'success' : 'error'}">
                            <h3>\${overall ? '✅ Dataverse Test Passed' : '❌ Dataverse Test Failed'}</h3>
                            <p>Connection: \${testResult.result.connection.success ? '✅' : '❌'} | Solution: \${testResult.result.solution.success ? '✅' : '❌'}</p>
                            <details>
                                <summary>View Test Details</summary>
                                <pre>\${JSON.stringify(testResult, null, 2)}</pre>
                            </details>
                        </div>
                    \`;
                } else {
                    resultDiv.innerHTML = \`
                        <div class="result error">
                            <h3>❌ Test Failed</h3>
                            <p>\${testResult.error}</p>
                            <details>
                                <summary>View Error Details</summary>
                                <pre>\${JSON.stringify(testResult, null, 2)}</pre>
                            </details>
                        </div>
                    \`;
                }
            } catch (error) {
                resultDiv.innerHTML = \`
                    <div class="result error">
                        <h3>❌ Test Request Failed</h3>
                        <p>\${error.message}</p>
                    </div>
                \`;
            }
        });

        // Load status on page load
        loadStatus();
    </script>
</body>
</html>
  `;

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  try {
    if (pathname === '/') {
      // Serve the upload form
      serveUploadForm(res);
      
    } else if (pathname === '/upload' && req.method === 'POST') {
      // Handle file upload and processing
      handleFileUpload(req, res);
      
    } else if (pathname === '/health') {
      // Health check endpoint
      const isHealthy = azureSDKLoaded;
      res.writeHead(isHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: isHealthy ? 'healthy' : 'degraded',
        azureSDK: azureSDKLoaded,
        managedIdentity: !!process.env.MSI_ENDPOINT,
        keyVault: !!process.env.KEY_VAULT_URI,
        timestamp: new Date().toISOString()
      }));
      
    } else if (pathname === '/keyvault') {
      // Key Vault connection test
      if (!azureSDKLoaded) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          message: 'Azure SDK not loaded'
        }));
        return;
      }
      
      const result = await keyVaultConfig.getKeyVaultSecrets();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result, null, 2));
      
    } else if (pathname === '/managed-identity') {
      // Managed identity test
      const result = await testManagedIdentityDirect();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result, null, 2));
      
    } else if (pathname === '/api/dataverse-config') {
      // Get Dataverse configuration
      const config = await getDataverseConfig();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(config, null, 2));
      
    } else if (pathname === '/api/test-dataverse' && req.method === 'POST') {
      // Test Dataverse operations locally for debugging
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          // Safely parse JSON with better error handling
          let data;
          try {
            if (!body.trim()) {
              throw new Error('Empty request body');
            }
            data = JSON.parse(body);
          } catch (parseError) {
            console.error('❌ JSON Parse Error:', parseError.message);
            console.error('📄 Raw body received:', body.substring(0, 200) + (body.length > 200 ? '...' : ''));
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              message: 'Invalid JSON in request body',
              error: parseError.message,
              bodyPreview: body.substring(0, 100)
            }));
            return;
          }
          
          const testType = data.testType || 'connection';
          
          console.log(`🧪 Testing Dataverse operation: ${testType}`);
          
          // Get Dataverse configuration
          const dataverseConfigResult = await getDataverseConfig();
          if (!dataverseConfigResult.success) {
            throw new Error(dataverseConfigResult.error);
          }
          
          const dvConfig = dataverseConfigResult.config;
          dvConfig.solutionName = data.solutionName || 'TestSolution';
          dvConfig.verbose = true; // Enable verbose logging for debugging
          
          const client = new DataverseClient(dvConfig);
          let result = {};
          
          switch (testType) {
            case 'connection': {
              result = await client.testConnection();
              break;
            }
              
            case 'solution-check': {
              const solutionName = data.solutionName || 'TestSolution';
              result = await client.checkSolutionExists(solutionName);
              break;
            }
              
            case 'solution-create': {
              const createSolutionName = data.solutionName || 'TestSolution';
              result = await client.ensureSolutionExists(createSolutionName, {
                friendlyName: data.friendlyName || createSolutionName,
                description: 'Test solution created from Mermaid ERD debug'
              });
              break;
            }
            
            case 'list-solutions': {
              result = await client.listSolutions();
              break;
            }
            
            case 'list-publishers': {
              result = await client.listPublishers();
              break;
            }
              
            case 'full-test': {
              // Test the full workflow
              console.log('🧪 Running full Dataverse test workflow...');
              
              // 1. Test connection
              const connectionTest = await client.testConnection();
              console.log('📋 Connection test:', connectionTest);
              
              // 2. List existing solutions and publishers
              const solutionsList = await client.listSolutions();
              console.log('📋 Solutions list:', solutionsList);
              
              const publishersList = await client.listPublishers();
              console.log('📋 Publishers list:', publishersList);
              
              // 3. Test solution check/create
              const solutionTest = await client.ensureSolutionExists(data.solutionName || 'TestSolution');
              console.log('📋 Solution test:', solutionTest);
              
              result = {
                connection: connectionTest,
                existingSolutions: solutionsList,
                existingPublishers: publishersList,
                solution: solutionTest,
                overall: connectionTest.success && solutionTest.success
              };
              break;
            }
              
            default:
              throw new Error(`Unknown test type: ${testType}`);
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            testType: testType,
            result: result,
            timestamp: new Date().toISOString()
          }, null, 2));
          
        } catch (error) {
          console.error('❌ Dataverse test error:', error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: 'Dataverse test failed',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
          }));
        }
      });
      
    } else if (pathname === '/api/validate' && req.method === 'POST') {
      // Validate entity metadata without creating
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          // Safely parse JSON with better error handling
          let data;
          try {
            if (!body.trim()) {
              throw new Error('Empty request body');
            }
            data = JSON.parse(body);
          } catch (parseError) {
            console.error('❌ JSON Parse Error in /api/validate:', parseError.message);
            console.error('📄 Raw body received:', body.substring(0, 200) + (body.length > 200 ? '...' : ''));
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              message: 'Invalid JSON in request body',
              error: parseError.message,
              bodyPreview: body.substring(0, 100)
            }));
            return;
          }
          
          if (!data.entities || !Array.isArray(data.entities)) {
            throw new Error('Invalid request: entities array required');
          }
          
          // Extract options from request
          const options = {
            publisherPrefix: data.publisherPrefix || 'mmd',
            solutionName: data.solutionName || 'MermaidSolution'
          };
          
          console.log('🔍 Validating entities with options:', options);
          console.log('📊 Raw parsed entities received:', data.entities.length);
          
          // Generate Dataverse schema from parsed entities first
          const schema = await generateDataverseSchema(data.entities, [], options);
          if (!schema.success) {
            throw new Error(schema.error);
          }
          
          console.log('🏗️ Generated Dataverse entities:', schema.entities.length);
          
          // Get Dataverse config
          const dataverseConfigResult = await getDataverseConfig();
          if (!dataverseConfigResult.success) {
            throw new Error(dataverseConfigResult.error);
          }
          
          const dvConfig = dataverseConfigResult.config;
          const client = new DataverseClient(dvConfig);
          
          // Validate each generated Dataverse entity
          const validationResults = [];
          
          for (const entity of schema.entities) {
            try {
              // Clean the entity metadata
              const cleanEntity = client.cleanEntityMetadata(entity);
              
              // Validate the cleaned entity
              const validation = client.validateEntityMetadata(cleanEntity);
              
              validationResults.push({
                entityName: entity.LogicalName || entity.name || 'Unknown',
                isValid: validation.isValid,
                errors: validation.errors,
                originalProperties: Object.keys(entity),
                cleanedProperties: Object.keys(cleanEntity)
              });
            } catch (error) {
              validationResults.push({
                entityName: entity.LogicalName || entity.name || 'Unknown',
                isValid: false,
                errors: [error.message],
                originalProperties: Object.keys(entity),
                cleanedProperties: []
              });
            }
          }
          
          const summary = {
            totalEntities: schema.entities.length,
            validEntities: validationResults.filter(r => r.isValid).length,
            invalidEntities: validationResults.filter(r => !r.isValid).length,
            allValid: validationResults.every(r => r.isValid)
          };
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            summary,
            validationResults,
            timestamp: new Date().toISOString()
          }, null, 2));
          
        } catch (error) {
          console.error('❌ Validation error:', error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: 'Validation failed',
            error: error.message,
            timestamp: new Date().toISOString()
          }));
        }
      });
      
    } else {
      // 404 for unknown endpoints
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        message: 'Endpoint not found',
        availableEndpoints: [
          '/ (Upload Form)', '/upload (POST)', '/health', '/keyvault', 
          '/managed-identity', '/api/dataverse-config'
        ]
      }));
    }
    
  } catch (error) {
    console.error('Server error:', error);
    
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      message: 'Internal server error',
      error: error.message
    }));
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🧜‍♀️ Mermaid to Dataverse Server running on port ${PORT}`);
  console.log(`📊 Configuration:
  - Azure SDK: ${azureSDKLoaded ? '✅ Loaded' : '❌ Not loaded'}
  - Key Vault: ${process.env.KEY_VAULT_URI || 'Not configured'}
  - Auth Mode: ${process.env.AUTH_MODE || 'default'}
  - Client ID: ${process.env.MANAGED_IDENTITY_CLIENT_ID || 'Not set'}
  - MSI Endpoint: ${process.env.MSI_ENDPOINT ? '✅ Available' : '❌ Not available'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});
