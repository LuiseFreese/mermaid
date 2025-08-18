const http = require('http');
const url = require('url');
const fs = require('fs');

// Global variables for caching
let cachedPublishers = null;
let publishersCacheTime = null;
const PUBLISHERS_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

let cachedGlobalChoices = null;
let globalChoicesCacheTime = null;
const GLOBAL_CHOICES_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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
  console.log('Azure SDK and Key Vault config loaded successfully');
} catch (error) {
  console.error('Failed to load Azure SDK:', error.message);
  azureSDKLoaded = false;
}

// Load Mermaid processing modules
try {
  const { MermaidERDParser: Parser } = require('./mermaid-parser.js');
  const { DataverseClient: Client } = require('./dataverse-client.js');
  
  MermaidERDParser = Parser;
  DataverseClient = Client;
  
  console.log('Mermaid processing modules loaded successfully');
} catch (error) {
  console.error('Failed to load Mermaid processing modules:', error.message);
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
// Helper function to load config from environment variables
function getDataverseConfigFromEnv() {
  console.log(' getDataverseConfigFromEnv: Function called');
  const requiredEnvVars = {
    'DATAVERSE_ENVIRONMENT_URL': process.env.DATAVERSE_ENVIRONMENT_URL,
    'DATAVERSE_CLIENT_ID': process.env.DATAVERSE_CLIENT_ID,
    'DATAVERSE_CLIENT_SECRET': process.env.DATAVERSE_CLIENT_SECRET,
    'DATAVERSE_TENANT_ID': process.env.DATAVERSE_TENANT_ID
  };

  console.log(' getDataverseConfigFromEnv: Environment variables status:', {
    'DATAVERSE_ENVIRONMENT_URL': requiredEnvVars['DATAVERSE_ENVIRONMENT_URL'] ? '[SET]' : '[NOT SET]',
    'DATAVERSE_CLIENT_ID': requiredEnvVars['DATAVERSE_CLIENT_ID'] ? '[SET]' : '[NOT SET]',
    'DATAVERSE_CLIENT_SECRET': requiredEnvVars['DATAVERSE_CLIENT_SECRET'] ? '[SET]' : '[NOT SET]',
    'DATAVERSE_TENANT_ID': requiredEnvVars['DATAVERSE_TENANT_ID'] ? '[SET]' : '[NOT SET]'
  });

  const missingVars = Object.entries(requiredEnvVars)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    console.log(' getDataverseConfigFromEnv: Missing environment variables:', missingVars);
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  console.log(' getDataverseConfigFromEnv: All environment variables present, creating config...');
  const config = {
    success: true,
    config: {
      dataverseUrl: requiredEnvVars['DATAVERSE_ENVIRONMENT_URL'],
      clientId: requiredEnvVars['DATAVERSE_CLIENT_ID'],
      clientSecret: requiredEnvVars['DATAVERSE_CLIENT_SECRET'],
      tenantId: requiredEnvVars['DATAVERSE_TENANT_ID']
    },
    source: 'environment_variables'
  };
  
  console.log(' getDataverseConfigFromEnv: Config created successfully:', {
    success: config.success,
    source: config.source,
    dataverseUrl: config.config.dataverseUrl ? '[SET]' : '[NOT SET]',
    hasOtherProps: Object.keys(config.config).length
  });
  
  return config;
}

async function getDataverseConfig() {
  console.log(' getDataverseConfig: Function called');
  try {
    // Check if we should use local environment variables
    if (process.env.USE_LOCAL_ENV === 'true') {
      console.log(' getDataverseConfig: Using local environment variables (Key Vault bypassed)');
      return getDataverseConfigFromEnv();
    }

    if (!azureSDKLoaded || !keyVaultConfig) {
      console.log(' getDataverseConfig: Azure SDK or Key Vault config not available, falling back to environment variables');
      console.log(' getDataverseConfig: azureSDKLoaded:', azureSDKLoaded);
      console.log(' getDataverseConfig: keyVaultConfig:', !!keyVaultConfig);
      return getDataverseConfigFromEnv();
    }

    console.log(' getDataverseConfig: Attempting to get Key Vault secrets...');
    const result = await keyVaultConfig.getKeyVaultSecrets();
    if (!result.success) {
      console.log(' getDataverseConfig: Key Vault failed, falling back to environment variables');
      console.log(' getDataverseConfig: Key Vault error:', result.error);
      return getDataverseConfigFromEnv();
    }

    // Extract secrets from the Key Vault result
    const secrets = {};
    const secretsToGet = ['DATAVERSE-URL', 'CLIENT-ID', 'CLIENT-SECRET', 'TENANT-ID', 'SOLUTION-NAME'];
    
    for (const secretName of secretsToGet) {
      if (result.secretResults && result.secretResults[secretName]) {
        if (result.secretResults[secretName].success) {
          // We need to actually get the secret value, not just check if it exists
          try {
            const keyVaultUrl = result.keyVaultUrl;
            const authType = result.authType;
            
            console.log(` Retrieving secret ${secretName} from ${keyVaultUrl}`);
            
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
            console.log(`Successfully retrieved secret ${secretName}`);
          } catch (error) {
            console.error(`Failed to get secret ${secretName}:`, error);
            throw new Error(`Failed to get secret ${secretName}: ${error.message}`);
          }
        } else {
          throw new Error(`Secret ${secretName} not available: ${result.secretResults[secretName].error}`);
        }
      } else {
        throw new Error(`Secret ${secretName} not found in Key Vault`);
      }
    }

    return {
      success: true,
      dataverseUrl: secrets.dataverse_url,
      clientId: secrets.client_id,
      clientSecret: secrets.client_secret,
      tenantId: secrets.tenant_id,
      solutionName: secrets.solution_name,
      apiVersion: '9.2',
      verbose: true,
      authMethod: result.authType
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

    // Log warnings if any
    if (parsed.warnings && parsed.warnings.length > 0) {
      console.log(`Found ${parsed.warnings.length} warnings during parsing:`);
      parsed.warnings.forEach((warning, index) => {
        console.log(`   ${index + 1}. [${warning.severity.toUpperCase()}] ${warning.message}`);
        if (warning.suggestion) {
          console.log(`       Suggestion: ${warning.suggestion}`);
        }
      });
    }

    return {
      success: true,
      message: 'Mermaid file parsed successfully',
      entities: parsed.entities,
      relationships: parsed.relationships,
      warnings: parsed.warnings || [],
      summary: {
        entityCount: parsed.entities.length,
        relationshipCount: parsed.relationships.length,
        totalAttributes: parsed.entities.reduce((sum, entity) => sum + entity.attributes.length, 0),
        warningCount: (parsed.warnings || []).length
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
    
    console.log(`Generating comprehensive Dataverse schema with prefix: ${publisherPrefix}`);
    console.log(`Input: ${entities.length} entities, ${relationships.length} relationships`);
    
    // Transform parsed entities to Dataverse entity format for validation
    const dataverseEntities = entities.map(entity => {
      // Find the primary key attribute
      const primaryKeyAttr = entity.attributes.find(attr => attr.isPrimaryKey);
      if (!primaryKeyAttr) {
        throw new Error(`Entity '${entity.name}' must have a primary key attribute marked with PK`);
      }
  
      const logicalName = `${publisherPrefix.toLowerCase()}_${entity.name.toLowerCase()}`;
      const primaryAttributeLogicalName = `${publisherPrefix.toLowerCase()}_name`;
      
      console.log(`Creating entity: ${logicalName} (Display: "${entity.displayName}")`);
      
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
    
    console.log(` DEBUG: Starting column generation for ${entities.length} entities...`);
    
    entities.forEach(entity => {
      const entityLogicalName = `${publisherPrefix.toLowerCase()}_${entity.name.toLowerCase()}`;
      
      console.log(` DEBUG: Processing entity ${entity.name} with ${entity.attributes.length} attributes:`);
      entity.attributes.forEach(attr => {
        console.log(`   - ${attr.name} (${attr.type}) PK:${attr.isPrimaryKey} FK:${attr.isForeignKey}`);
      });
      
      // Process each attribute that's not the primary key
      entity.attributes.forEach(attr => {
        if (!attr.isPrimaryKey) { // Skip primary key attributes
          const columnLogicalName = `${publisherPrefix.toLowerCase()}_${attr.name.toLowerCase()}`;
          
          console.log(`Creating column: ${entityLogicalName}.${columnLogicalName} (${attr.type})`);
          
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
    console.log(` Starting relationship generation from ${relationships.length} parsed relationships...`);
    const dataverseRelationships = [];
    
    relationships.forEach((rel, index) => {
      const relationshipNumber = index + 1;
      console.log(` Processing relationship ${relationshipNumber}/${relationships.length}:`);
      console.log(`   ↳ Raw: ${rel.fromEntity} → ${rel.toEntity} (${rel.type})`);
      
      const referencingEntity = `${publisherPrefix.toLowerCase()}_${rel.fromEntity.toLowerCase()}`;
      const referencedEntity = `${publisherPrefix.toLowerCase()}_${rel.toEntity.toLowerCase()}`;
      
      console.log(`   ↳ Dataverse: ${referencingEntity} → ${referencedEntity}`);
      
      try {
        const relationshipMetadata = generateRelationshipMetadata(rel, publisherPrefix);
        if (relationshipMetadata) {
          dataverseRelationships.push(relationshipMetadata);
          console.log(`   Generated relationship metadata: ${relationshipMetadata.SchemaName}`);
        } else {
          console.log(`   No metadata generated for relationship ${relationshipNumber}`);
        }
      } catch (error) {
        console.error(`   Error generating relationship ${relationshipNumber}:`, error.message);
      }
    });
    
    console.log(`🏁 Relationship generation complete: ${dataverseRelationships.length}/${relationships.length} successful`);
    
    if (dataverseRelationships.length > 0) {
      console.log(` Generated relationships:`);
      dataverseRelationships.forEach((rel, index) => {
        console.log(`   ${index + 1}. ${rel.SchemaName}: ${rel.ReferencingEntity} → ${rel.ReferencedEntity}`);
      });
    }
    
    console.log(`Schema generation complete:`);
    console.log(`   Entities: ${dataverseEntities.length}`);
    console.log(`   Additional Columns: ${additionalColumns.length}`);
    console.log(`    Relationships: ${dataverseRelationships.length}`);

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
    console.error('Schema generation failed:', error);
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
      console.log(`Unknown attribute type: ${attribute.type}, defaulting to String`);
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
  console.log(`Generating relationship metadata:`);
  console.log(`   ↳ Input: ${relationship.fromEntity} → ${relationship.toEntity}`);
  console.log(`   ↳ Publisher prefix: ${publisherPrefix}`);
  
  // Validate input
  if (!relationship.fromEntity || !relationship.toEntity) {
    console.error(`   Invalid relationship: missing fromEntity or toEntity`);
    return null;
  }
  
  if (!publisherPrefix) {
    console.error(`   Invalid relationship: missing publisherPrefix`);
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
      SchemaName: `${publisherPrefix}_${relationship.toEntity}Lookup`, // Add "Lookup" suffix to avoid conflicts
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
  
  console.log(`   Relationship metadata generated successfully`);
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

    // Extract config directly from the result
    const dvConfig = {
      dataverseUrl: dataverseConfigResult.dataverseUrl,
      clientId: dataverseConfigResult.clientId,
      clientSecret: dataverseConfigResult.clientSecret,
      tenantId: dataverseConfigResult.tenantId,
      apiVersion: dataverseConfigResult.apiVersion || '9.2',
      verbose: dataverseConfigResult.verbose || true,
      authMethod: dataverseConfigResult.authMethod
    };

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
    
    const creationResult = await client.createEntitiesFromMermaid(schema.entities, {
      publisherPrefix: publisherPrefix,
      dryRun: config.dryRun || false,
      createPublisher: config.createPublisher !== false,
      additionalColumns: schema.additionalColumns || [],
      relationships: schema.relationships || []
    });

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
          logFunction(`Solution created: ${creationResult.solutionInfo.name} (${creationResult.solutionInfo.name})`);
        } else if (creationResult.solutionInfo.exists) {
          logFunction(`Using existing solution: ${creationResult.solutionInfo.name}`);
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
    } else {
      logFunction(`Entity creation failed: ${creationResult.error || 'Unknown error'}`);
      if (creationResult.entitiesFailed && creationResult.entitiesFailed.length > 0) {
        logFunction(`Failed entities: ${creationResult.entitiesFailed.join(', ')}`);
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

    // Extract config directly from the result
    const dvConfig = {
      dataverseUrl: dataverseConfigResult.dataverseUrl,
      clientId: dataverseConfigResult.clientId,
      clientSecret: dataverseConfigResult.clientSecret,
      tenantId: dataverseConfigResult.tenantId,
      apiVersion: dataverseConfigResult.apiVersion || '9.2',
      verbose: dataverseConfigResult.verbose || true,
      authMethod: dataverseConfigResult.authMethod
    };

    // Override solution name with the one from form options
    dvConfig.solutionName = config.solutionName || 'MermaidSolution';
    console.log(`🎯 Using solution name: ${dvConfig.solutionName}`);

    if (!DataverseClient) {
      throw new Error('Dataverse client not available');
    }

    // Generate Dataverse schema from parsed entities first
    console.log('Generating Dataverse schema for entity creation...');
    const schema = await generateDataverseSchema(parsedMermaid.entities, parsedMermaid.relationships || [], {
      publisherPrefix: config.publisherPrefix || 'mmd',
      solutionName: config.solutionName || 'MermaidSolution'
    });
    
    if (!schema.success) {
      throw new Error(`Schema generation failed: ${schema.error}`);
    }
    
    console.log(`Generated ${schema.entities.length} Dataverse entities for creation`);

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
        console.log(`Publisher created: ${creationResult.publisherInfo.uniqueName}`);
      } else if (creationResult.publisherInfo.existing) {
        console.log(` Using existing publisher: ${creationResult.publisherInfo.uniqueName}`);
      }
    }
    
    if (creationResult.solutionInfo) {
      if (creationResult.solutionInfo.created) {
        console.log(`Solution created: ${creationResult.solutionInfo.uniqueName}`);
      } else if (creationResult.solutionInfo.existing) {
        console.log(` Using existing solution: ${creationResult.solutionInfo.uniqueName}`);
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

// Deployment handler for JSON data from the wizard
function handleDeployment(req, res) {
  console.log(' handleDeployment: Function called');
  let body = '';
  
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', async () => {
    try {
      console.log(' handleDeployment: Request body received, length:', body.length);
      console.log(' handleDeployment: Body preview:', body.substring(0, 200) + (body.length > 200 ? '...' : ''));
      
      // Parse JSON deployment data
      let deploymentData;
      try {
        deploymentData = JSON.parse(body);
        console.log(' handleDeployment: JSON parsed successfully');
        console.log(' handleDeployment: Deployment data keys:', Object.keys(deploymentData));
        console.log(' handleDeployment: dryRun flag:', deploymentData.dryRun);
        console.log(' handleDeployment: RAW selectedChoices on arrival:', JSON.stringify(deploymentData.selectedChoices));
      } catch (parseError) {
        console.error(' handleDeployment: JSON parse failed:', parseError.message);
        throw new Error(`Invalid JSON: ${parseError.message}`);
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

      function sendSimpleLog(message) {
        // Only send key deployment steps for simplified UI
        const logData = JSON.stringify({ type: 'log', message: message }) + '\n';
        res.write(logData);
      }

      // Helper function to send final result
      function sendResult(success, message, data = null) {
        const resultData = JSON.stringify({ 
          type: 'result', 
          success: success, 
          message: message,
          data: data,
          deploymentComplete: success // Add flag to indicate deployment is complete
        }) + '\n';
        res.write(resultData);
        res.end();
      }

      // Validate required data
      if (!deploymentData.entities || !deploymentData.entities.length) {
        throw new Error('No entities found in deployment data');
      }
      
      if (!deploymentData.solutionName) {
        throw new Error('Solution name is required');
      }

      sendSimpleLog('Starting Dataverse deployment...');

      // Simplified configuration display - only key info
      sendSimpleLog(`Solution: ${deploymentData.solutionName}`);
      
      let choicesText = '';
      if (deploymentData.selectedChoices && deploymentData.selectedChoices.length > 0) {
        choicesText += `${deploymentData.selectedChoices.length} selected`;
      }
      if (deploymentData.uploadedGlobalChoices && deploymentData.uploadedGlobalChoices.count > 0) {
        if (choicesText) choicesText += ' + ';
        choicesText += `${deploymentData.uploadedGlobalChoices.count} custom`;
      }
      if (!choicesText) choicesText = '0';
      
      sendSimpleLog(`Entities: ${deploymentData.entities.length} | Relationships: ${deploymentData.relationships ? deploymentData.relationships.length : 0} | Global Choices: ${choicesText}`);

      // Determine publisher info
      let publisherInfo;
      console.log(' handleDeployment: Publisher data received:', {
        hasPublisher: !!deploymentData.publisher,
        createPublisher: deploymentData.createPublisher,
        publisherName: deploymentData.publisherName,
        publisherPrefix: deploymentData.publisherPrefix
      });
      
      if (deploymentData.publisher && (deploymentData.publisher.id || deploymentData.publisher.publisherid)) {
        // Using existing publisher
        publisherInfo = deploymentData.publisher;
        sendSimpleLog(`Using existing publisher: ${publisherInfo.friendlyName} (${publisherInfo.prefix})`);
        console.log(' handleDeployment: Using existing publisher:', publisherInfo);
      } else if (deploymentData.createPublisher && deploymentData.publisherPrefix) {
        // Creating new publisher (wizard format)
        publisherInfo = {
          name: deploymentData.publisherName,
          uniqueName: deploymentData.publisherUniqueName,
          prefix: deploymentData.publisherPrefix
        };
        sendSimpleLog(`Creating new publisher: ${publisherInfo.name} (${publisherInfo.prefix})`);
        console.log(' handleDeployment: Creating new publisher:', publisherInfo);
      } else if (deploymentData.publisher && deploymentData.publisher.prefix) {
        // Creating new publisher (legacy format)
        publisherInfo = deploymentData.publisher;
        sendSimpleLog(`Creating new publisher: ${publisherInfo.name} (${publisherInfo.prefix})`);
        console.log(' handleDeployment: Using legacy publisher format:', publisherInfo);
      } else {
        throw new Error('Publisher information is required');
      }

      sendSimpleLog('Validating configuration...');

      // Create Dataverse client if not in dry run mode
      if (!deploymentData.dryRun) {
        try {
          sendLog(' Connecting to Dataverse...');
          sendLog(' Loading Dataverse configuration...');
          
          // Load Dataverse configuration
          const dataverseConfigResult = await getDataverseConfig();
          
          if (!dataverseConfigResult.success) {
            sendSimpleLog(`Configuration error: ${dataverseConfigResult.error}`);
            sendSimpleLog('Falling back to dry-run mode...');
            
            // Force dry run mode due to configuration issues
            deploymentData.dryRun = true;
          } else {
            sendSimpleLog(`Connected to: ${dataverseConfigResult.dataverseUrl}`);
            
            const Client = require('./dataverse-client.js').DataverseClient;
            const client = new Client(dataverseConfigResult);
            
            // Set solution name on the client for proper solution management
            client.solutionName = deploymentData.solutionName;
            
            sendSimpleLog('Testing connection...');
            // Test connection
            await client.testConnection();
            sendSimpleLog('Connection verified');
            
            try {
              // Process uploaded custom global choices first (if any)
              if (deploymentData.uploadedGlobalChoices && deploymentData.uploadedGlobalChoices.data) {
                sendSimpleLog(`Processing ${deploymentData.uploadedGlobalChoices.count} custom global choices...`);
                console.log(' handleDeployment: About to process uploaded global choices:', {
                  count: deploymentData.uploadedGlobalChoices.count,
                  hasData: !!deploymentData.uploadedGlobalChoices.data,
                  filename: deploymentData.uploadedGlobalChoices.filename
                });
                
                try {
                  console.log(' handleDeployment: Calling createGlobalChoicesFromJson...');
                  const choicesResult = await client.createGlobalChoicesFromJson(deploymentData.uploadedGlobalChoices.data);
                  console.log(' handleDeployment: Global choices result:', choicesResult);
                  
                  if (choicesResult.success) {
                    if (choicesResult.created > 0) {
                      sendSimpleLog(`Created ${choicesResult.created} new global choice sets`);
                    }
                    if (choicesResult.skipped > 0) {
                      sendSimpleLog(`Skipped ${choicesResult.skipped} existing global choice sets`);
                    }
                  } else {
                    sendSimpleLog(`Warning: Some global choices failed to create (${choicesResult.errors.length} errors)`);
                    console.log(' handleDeployment: Global choices errors:', choicesResult.errors);
                  }
                } catch (choicesError) {
                  console.error(' handleDeployment: Global choices processing error:', choicesError);
                  sendSimpleLog(`Warning: Custom global choices processing failed: ${choicesError.message}`);
                  // Don't fail the entire deployment for global choices errors
                }
              } else {
                console.log(' handleDeployment: No uploaded global choices to process');
              }
              
              // Parse the Mermaid content to get entities and relationships
              if (!deploymentData.entities || !Array.isArray(deploymentData.entities)) {
                throw new Error('No entities found in deployment data');
              }
              
              // Prepare deployment options
              const deploymentOptions = {
                publisherPrefix: publisherInfo.prefix,
                publisherId: deploymentData.publisher?.id || deploymentData.publisher?.publisherid || null,
                publisherName: publisherInfo.uniqueName || publisherInfo.name,
                publisherFriendlyName: publisherInfo.friendlyName || publisherInfo.name,
                publisherUniqueName: publisherInfo.uniqueName,
                solutionName: deploymentData.solutionName,
                dryRun: false, // This is a real deployment
                selectedChoices: deploymentData.selectedChoices && deploymentData.selectedChoices.length > 0 ? 
                  deploymentData.selectedChoices.filter(choice => choice && choice.trim() !== '') : [],
                createPublisher: deploymentData.createPublisher || (!deploymentData.publisher?.id && !deploymentData.publisher?.publisherid)
              };
              
              console.log(' handleDeployment: Raw selectedChoices:', deploymentData.selectedChoices);
              console.log(' handleDeployment: Filtered selectedChoices:', deploymentOptions.selectedChoices);
              console.log(' handleDeployment: selectedChoices length:', deploymentOptions.selectedChoices.length);
              
              console.log(' handleDeployment: Deployment options created:');
              console.log(' - publisherPrefix:', deploymentOptions.publisherPrefix);
              console.log(' - selectedChoices:', deploymentOptions.selectedChoices);
              console.log(' - selectedChoices count:', deploymentOptions.selectedChoices.length);
              console.log(' - selectedChoices details:', JSON.stringify(deploymentOptions.selectedChoices, null, 2));
              
              // Generate Dataverse schema from entities
              sendSimpleLog('Generating Dataverse schema...');
              const schema = await generateDataverseSchema(
                deploymentData.entities, 
                deploymentData.relationships || [], 
                deploymentOptions
              );
              
              if (!schema.success) {
                throw new Error(`Schema generation failed: ${schema.error}`);
              }
              
              sendSimpleLog(`Schema ready: ${schema.entities.length} entities, ${schema.relationships?.length || 0} relationships`);
              
              // Create entities in Dataverse using the generated schema
              sendSimpleLog('Creating entities in Dataverse...');
              
              try {
                const creationResult = await client.createEntitiesFromMermaid(schema.entities, {
                  publisherPrefix: deploymentOptions.publisherPrefix,
                  publisherId: deploymentOptions.publisherId, // Pass the existing publisher ID
                  publisherName: deploymentOptions.publisherUniqueName || deploymentOptions.publisherFriendlyName, // Use unique name or fallback to friendly name
                  publisherFriendlyName: deploymentOptions.publisherFriendlyName,
                  publisherUniqueName: deploymentOptions.publisherUniqueName,
                  solutionName: deploymentOptions.solutionName,
                  dryRun: false,
                  createPublisher: deploymentOptions.createPublisher,
                  additionalColumns: schema.additionalColumns || [],
                  relationships: schema.relationships || [],
                  selectedChoices: deploymentOptions.selectedChoices || []
                });
                
                console.log(' DEBUG: createEntitiesFromMermaid completed, result:', JSON.stringify(creationResult, null, 2));
                console.log(' DEBUG: Server received result back from client');
                
                console.log(' DEBUG: Checking creation result success:', creationResult.success);
                if (!creationResult.success) {
                  console.log(' DEBUG: Creation failed with error:', creationResult.error);
                  sendSimpleLog(`Entity creation failed: ${creationResult.error}`);
                  throw new Error(`Entity creation failed: ${creationResult.error}`);
                }
                
                console.log(' DEBUG: Creation successful, sending completion messages...');
                sendSimpleLog(`Successfully created ${creationResult.entitiesCreated.length || 0} entities, ${creationResult.relationships.length || 0} relationships`);
                
                // Process pending global choices after solution creation
                if (deploymentData.uploadedGlobalChoices && deploymentData.uploadedGlobalChoices.data) {
                  try {
                    sendSimpleLog('Adding uploaded global choices to solution...');
                    console.log(' DEBUG: Processing pending global choices for solution addition...');
                    
                    const globalChoicesResult = await client.addPendingGlobalChoicesToSolution();
                    
                    if (globalChoicesResult.added > 0) {
                      sendSimpleLog(`Successfully added ${globalChoicesResult.added} global choices to solution`);
                    }
                    if (globalChoicesResult.failed > 0) {
                      sendSimpleLog(`Warning: ${globalChoicesResult.failed} global choices failed to be added to solution`);
                      console.warn(' DEBUG: Global choice solution addition errors:', globalChoicesResult.errors);
                    }
                  } catch (globalChoicesError) {
                    sendSimpleLog(`Warning: Failed to add global choices to solution: ${globalChoicesError.message}`);
                    console.error(' DEBUG: Global choices solution addition error:', globalChoicesError);
                  }
                }
                
                if (deploymentOptions.selectedChoices && deploymentOptions.selectedChoices.length > 0) {
                  sendSimpleLog(`Added ${deploymentOptions.selectedChoices.length} global choices to solution`);
                  // Force completion signal right after global choices message
                  setTimeout(() => {
                    console.log(' DEBUG: Sending forced completion signal after global choices');
                    sendSimpleLog('Deployment completed successfully!');
                    sendResult(true, 'Deployment completed successfully', {
                      solution: deploymentOptions.solutionName,
                      entitiesCreated: creationResult.entitiesCreated || 0,
                      publisherPrefix: deploymentOptions.publisherPrefix
                    });
                  }, 100);
                } else {
                  // No global choices, send completion immediately
                  sendSimpleLog('Deployment completed successfully!');
                  sendResult(true, 'Deployment completed successfully', {
                    solution: deploymentOptions.solutionName,
                    entitiesCreated: creationResult.entitiesCreated || 0,
                    publisherPrefix: deploymentOptions.publisherPrefix
                  });
                }
                return; // Exit here for successful deployment
                
              } catch (creationError) {
                sendLog(` Entity creation method failed: ${creationError.message}`);
                
                // Check if it's a publisher conflict (412 error)
                if (creationError.message.includes('412')) {
                  sendLog(` HTTP 412 Error detected - this usually means:`);
                  sendLog(`   • Publisher with prefix "${deploymentOptions.publisherPrefix}" already exists`);
                  sendLog(`   • Solution "${deploymentOptions.solutionName}" already exists`);
                  sendLog(`   • There's a naming conflict in Dataverse`);
                  sendLog(``);
                  sendLog(` Suggested fixes:`);
                  sendLog(`   1. Try a different publisher prefix (current: "${deploymentOptions.publisherPrefix}")`);
                  sendLog(`   2. Try a different solution name (current: "${deploymentOptions.solutionName}")`);
                  sendLog(`   3. Check if these already exist in your Dataverse environment`);
                  sendLog(`   4. Consider using an existing publisher instead of creating a new one`);
                }
                
                throw creationError; // Re-throw for outer catch
              }
              
            } catch (deploymentError) {
              sendLog(` Deployment execution failed: ${deploymentError.message}`);
              sendLog(` Deployment error stack: ${deploymentError.stack}`);
              throw deploymentError; // Re-throw to be caught by outer catch
            }
            return; // Exit here for successful deployment
          }
        } catch (error) {
          sendSimpleLog(`Deployment failed: ${error.message}`);
          sendResult(false, `Deployment failed: ${error.message}`);
          return; // Exit here for failed deployment
        }
      }
      
      // Handle dry run mode (either original or fallback)
      if (deploymentData.dryRun) {
        // Dry run - just validate
        sendSimpleLog('Validation completed successfully (dry-run mode)');
        sendSimpleLog(`Summary: ${deploymentData.entities.length} entities, ${deploymentData.relationships ? deploymentData.relationships.length : 0} relationships, ${deploymentData.selectedChoices ? deploymentData.selectedChoices.length : 0} global choices`);
        sendSimpleLog('Ready for deployment! Uncheck "Dry Run" to proceed.');
        
        sendResult(true, 'Validation completed successfully (dry run mode)');
      }

    } catch (error) {
      console.error('Deployment error:', error);
      
      // Send error via streaming format (headers already sent)
      try {
        const errorData = JSON.stringify({
          type: 'result',
          success: false,
          message: `Deployment failed: ${error.message}`
        }) + '\n';
        res.write(errorData);
        res.end();
      } catch (streamError) {
        console.error('Error sending error response:', streamError);
        // If streaming fails, just end the response
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            type: 'result',
            success: false,
            message: `Deployment failed: ${error.message}`
          }));
        } else {
          res.end();
        }
      }
    }
  });
}

// Serve interface selector
function serveInterfaceSelector(res) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mermaid to Dataverse Converter</title>
    <style>
        :root {
            --color-primary: #0078d4;
            --color-primary-dark: #106ebe;
            --color-success: #107c10;
            --color-neutral: #8a8886;
            --border-radius: 8px;
            --spacing-xl: 32px;
            --spacing-l: 24px;
            --spacing-m: 16px;
        }

        * {
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #323130;
            line-height: 1.4;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
            padding: var(--spacing-xl);
        }

        .header {
            background: white;
            padding: var(--spacing-xl);
            border-radius: var(--border-radius);
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            text-align: center;
            margin-bottom: var(--spacing-l);
        }

        .header h1 {
            margin: 0 0 var(--spacing-m) 0;
            color: var(--color-primary);
            font-size: 32px;
            font-weight: 600;
        }

        .header .icon {
            font-size: 48px;
            margin-bottom: var(--spacing-m);
        }

        .header p {
            margin: 0;
            color: #605e5c;
            font-size: 18px;
        }

        .interface-options {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: var(--spacing-l);
            margin-top: var(--spacing-l);
        }

        .interface-card {
            background: white;
            border-radius: var(--border-radius);
            padding: var(--spacing-xl);
            box-shadow: 0 4px 16px rgba(0,0,0,0.1);
            text-decoration: none;
            color: inherit;
            transition: all 0.3s ease;
            border: 2px solid transparent;
        }

        .interface-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 8px 24px rgba(0,0,0,0.15);
            border-color: var(--color-primary);
        }

        .card-icon {
            font-size: 48px;
            margin-bottom: var(--spacing-m);
            display: block;
        }

        .card-title {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: var(--spacing-m);
            color: var(--color-primary);
        }

        .card-description {
            color: #605e5c;
            margin-bottom: var(--spacing-m);
            line-height: 1.5;
        }

        .card-features {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .card-features li {
            padding: 4px 0;
            color: #605e5c;
            font-size: 14px;
        }

        .card-features li:before {
            content: "✓";
            color: var(--color-success);
            font-weight: bold;
            margin-right: 8px;
        }

        .recommended {
            position: relative;
        }

        .recommended:before {
            content: "RECOMMENDED";
            position: absolute;
            top: -12px;
            right: 16px;
            background: var(--color-success);
            color: white;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.5px;
        }

        .footer {
            text-align: center;
            margin-top: var(--spacing-xl);
            color: white;
            opacity: 0.8;
        }

        @media (max-width: 768px) {
            .interface-options {
                grid-template-columns: 1fr;
            }
            
            .container {
                padding: var(--spacing-m);
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="icon">🔄</div>
            <h1>Mermaid to Dataverse Converter</h1>
            <p>Transform your Entity Relationship Diagrams into Microsoft Dataverse solutions</p>
        </div>

        <div class="interface-options">
            <a href="/wizard" class="interface-card recommended">
                <span class="card-icon">🧙‍♂️</span>
                <h2 class="card-title">Wizard Interface</h2>
                <p class="card-description">
                    Modern, step-by-step guided experience with advanced features for enterprise deployments.
                </p>
                <ul class="card-features">
                    <li>5-step guided workflow</li>
                    <li>CDM integration support</li>
                    <li>Automatic ERD correction</li>
                    <li>Side-by-side comparison</li>
                    <li>Advanced validation</li>
                    <li>Modern UI with Fluent Design</li>
                </ul>
            </a>

            <a href="/basic" class="interface-card">
                <span class="card-icon">📝</span>
                <h2 class="card-title">Basic Interface</h2>
                <p class="card-description">
                    Simple, direct form interface for quick deployments and familiar users.
                </p>
                <ul class="card-features">
                    <li>Single-page workflow</li>
                    <li>Quick setup</li>
                    <li>Basic validation</li>
                    <li>Lightweight interface</li>
                    <li>Fast processing</li>
                    <li>Minimal learning curve</li>
                </ul>
            </a>
        </div>

        <div class="footer">
            <p>Choose the interface that best fits your needs • Both support full Dataverse deployment</p>
        </div>
    </div>
</body>
</html>
  `;
  
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
}

// Serve static HTML upload form
function serveUploadForm(res) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mermaid to Dataverse Converter - Basic Interface</title>
    <link href="https://cdn.jsdelivr.net/npm/@fluentui/web-components@2.0.0/dist/web-components.min.css" rel="stylesheet">
    <script type="module" src="https://cdn.jsdelivr.net/npm/@fluentui/web-components@2.0.0/dist/web-components.min.js"></script>
    <style>
        :root {
            --color-primary: #0078d4;
            --color-primary-dark: #106ebe;
            --color-success: #107c10;
            --color-warning: #ff8c00;
            --color-error: #d13438;
            --color-info: #0078d4;
            --border-radius: 4px;
            --spacing-xs: 4px;
            --spacing-s: 8px;
            --spacing-m: 16px;
            --spacing-l: 24px;
            --spacing-xl: 32px;
        }

        * {
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
            color: #323130;
            line-height: 1.4;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: var(--spacing-l);
        }

        .header {
            background: white;
            padding: var(--spacing-l);
            margin-bottom: var(--spacing-l);
            border-radius: var(--border-radius);
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .header h1 {
            margin: 0 0 var(--spacing-s) 0;
            color: var(--color-primary);
            font-size: 24px;
            font-weight: 600;
        }

        .header p {
            margin: 0;
            color: #605e5c;
        }

        /* Progress Indicator */
        .progress-container {
            background: white;
            padding: var(--spacing-l);
            margin-bottom: var(--spacing-l);
            border-radius: var(--border-radius);
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .progress-steps {
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: relative;
            margin-bottom: var(--spacing-l);
        }

        .progress-line {
            position: absolute;
            top: 20px;
            left: 40px;
            right: 40px;
            height: 2px;
            background: #edebe9;
            z-index: 1;
        }

        .progress-line-active {
            background: var(--color-primary);
            height: 2px;
            position: absolute;
            top: 0;
            left: 0;
            transition: width 0.3s ease;
            z-index: 2;
        }

        .step {
            display: flex;
            flex-direction: column;
            align-items: center;
            position: relative;
            z-index: 3;
            min-width: 120px;
        }

        .step-circle {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: #edebe9;
            color: #605e5c;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            margin-bottom: var(--spacing-s);
            transition: all 0.3s ease;
        }

        .step-circle.active {
            background: var(--color-primary);
            color: white;
        }

        .step-circle.completed {
            background: var(--color-success);
            color: white;
        }

        .step-label {
            font-size: 14px;
            font-weight: 500;
            text-align: center;
            color: #605e5c;
        }

        .step.active .step-label {
            color: var(--color-primary);
            font-weight: 600;
        }

        .step.completed .step-label {
            color: var(--color-success);
        }

        /* Main Content */
        .main-content {
            background: white;
            padding: var(--spacing-xl);
            border-radius: var(--border-radius);
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            min-height: 500px;
        }

        .step-content {
            display: none;
        }

        .step-content.active {
            display: block;
        }

        .step-title {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: var(--spacing-m);
            color: #323130;
        }

        .step-description {
            color: #605e5c;
            margin-bottom: var(--spacing-l);
            line-height: 1.5;
        }

        /* Form Styles */
        .form-group {
            margin-bottom: var(--spacing-l);
        }

        .form-label {
            display: block;
            font-weight: 600;
            margin-bottom: var(--spacing-s);
            color: #323130;
        }

        .form-input, .form-select, .form-textarea {
            width: 100%;
            padding: var(--spacing-s) var(--spacing-m);
            border: 1px solid #8a8886;
            border-radius: var(--border-radius);
            font-size: 14px;
            font-family: inherit;
            transition: border-color 0.2s ease;
        }

        .form-input:focus, .form-select:focus, .form-textarea:focus {
            outline: none;
            border-color: var(--color-primary);
            box-shadow: 0 0 0 1px var(--color-primary);
        }

        .form-help {
            font-size: 12px;
            color: #605e5c;
            margin-top: var(--spacing-xs);
        }

        /* File Upload */
        .file-upload {
            border: 2px dashed #8a8886;
            border-radius: var(--border-radius);
            padding: var(--spacing-xl);
            text-align: center;
            cursor: pointer;
            transition: all 0.2s ease;
            background: #faf9f8;
        }

        .file-upload:hover {
            border-color: var(--color-primary);
            background: #f3f2f1;
        }

        .file-upload.dragover {
            border-color: var(--color-primary);
            background: #deecf9;
        }

        .file-upload-icon {
            font-size: 48px;
            color: #8a8886;
            margin-bottom: var(--spacing-m);
        }

        .file-upload-text {
            font-size: 16px;
            font-weight: 500;
            color: #323130;
            margin-bottom: var(--spacing-s);
        }

        .file-upload-help {
            font-size: 14px;
            color: #605e5c;
        }

        /* Validation Messages */
        .validation-container {
            margin-bottom: var(--spacing-l);
        }

        .validation-item {
            display: flex;
            align-items: flex-start;
            padding: var(--spacing-m);
            margin-bottom: var(--spacing-s);
            border-radius: var(--border-radius);
            border-left: 4px solid;
        }

        .validation-item.success {
            background: #f3f9f1;
            border-color: var(--color-success);
        }

        .validation-item.warning {
            background: #fff4e5;
            border-color: var(--color-warning);
        }

        .validation-item.error {
            background: #fef0f0;
            border-color: var(--color-error);
        }

        .validation-item.info {
            background: #f3f2f1;
            border-color: var(--color-info);
        }

        .validation-content {
            flex: 1;
        }

        .validation-message {
            font-weight: 500;
            margin-bottom: var(--spacing-xs);
        }

        .validation-suggestion {
            font-size: 14px;
            color: #605e5c;
        }

        /* Publisher Selection */
        .erd-comparison-container {
            display: flex;
            gap: 20px;
            margin-top: 16px;
            max-height: 400px;
            overflow: hidden;
        }
        
        .erd-comparison-side {
            flex: 1;
            border: 1px solid #ddd;
            border-radius: 4px;
            overflow: hidden;
        }
        
        .erd-comparison-side h4 {
            margin: 0;
            padding: 12px;
            background: #f3f2f1;
            border-bottom: 1px solid #ddd;
            font-size: 14px;
            font-weight: 600;
        }
        
        .erd-code {
            margin: 0;
            padding: 16px;
            background: #f8f8f8;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.4;
            white-space: pre-wrap;
            overflow-y: auto;
            max-height: 320px;
        }
        
        .erd-comparison-controls {
            margin-top: 12px;
            display: flex;
            gap: 12px;
        }

        .publisher-option {
            display: flex;
            align-items: center;
            padding: var(--spacing-m);
            border: 1px solid #edebe9;
            border-radius: var(--border-radius);
            margin-bottom: var(--spacing-s);
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .publisher-option:hover {
            background: #f3f2f1;
            border-color: var(--color-primary);
        }

        .publisher-option.selected {
            background: #deecf9;
            border-color: var(--color-primary);
        }

        .publisher-radio {
            margin-right: var(--spacing-m);
        }

        .publisher-info {
            flex: 1;
        }

        .publisher-name {
            font-weight: 600;
            margin-bottom: var(--spacing-xs);
        }

        .publisher-details {
            font-size: 14px;
            color: #605e5c;
        }

        /* Choice Sets */
        .choice-set-item {
            display: flex;
            align-items: center;
            padding: var(--spacing-s) var(--spacing-m);
            border: 1px solid #edebe9;
            border-radius: var(--border-radius);
            margin-bottom: var(--spacing-s);
        }

        .choice-set-checkbox {
            margin-right: var(--spacing-m);
        }

        .choice-set-info {
            flex: 1;
        }

        .choice-set-name {
            font-weight: 500;
            margin-bottom: var(--spacing-xs);
        }

        .choice-set-description {
            font-size: 14px;
            color: #605e5c;
        }

        /* Choice Type Badges */
        .choice-type-badge {
            font-size: 11px;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 10px;
            margin-left: 8px;
            text-transform: uppercase;
        }

        .choice-type-badge.built-in {
            background: #0078d4;
            color: white;
        }

        .choice-type-badge.custom {
            background: #107c10;
            color: white;
        }

        /* Choice Group Styling */
        .choice-group {
            margin-bottom: var(--spacing-l);
        }

        /* Choice Set Badges */
        .choice-badge {
            font-size: 11px;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 10px;
            margin-left: 8px;
            text-transform: uppercase;
        }

        .choice-badge.custom {
            background: #107c10;
            color: white;
        }

        .choice-badge.builtin {
            background: #0078d4;
            color: white;
        }

        .custom-choice {
            border-left: 3px solid #107c10;
        }

        .builtin-choice {
            border-left: 3px solid #0078d4;
            opacity: 0.85;
        }

        /* Buttons */
        .btn {
            display: inline-flex;
            align-items: center;
            padding: var(--spacing-s) var(--spacing-l);
            border-radius: var(--border-radius);
            font-size: 14px;
            font-weight: 600;
            text-decoration: none;
            cursor: pointer;
            transition: all 0.2s ease;
            border: 1px solid transparent;
            min-height: 32px;
        }

        .btn-primary {
            background: var(--color-primary);
            color: white;
        }

        .btn-primary:hover {
            background: var(--color-primary-dark);
        }

        .btn-primary:disabled {
            background: #a19f9d;
            cursor: not-allowed;
        }

        .btn-secondary {
            background: transparent;
            color: var(--color-primary);
            border-color: var(--color-primary);
        }

        .btn-secondary:hover {
            background: #f3f2f1;
        }

        .btn-success {
            background: var(--color-success);
            color: white;
        }

        .btn-success:hover {
            background: #0e6b0e;
        }

        /* Navigation */
        .step-navigation {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: var(--spacing-xl);
            padding-top: var(--spacing-l);
            border-top: 1px solid #edebe9;
        }

        .nav-left, .nav-right {
            display: flex;
            gap: var(--spacing-m);
        }

        /* Loading and Status */
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: var(--spacing-xl);
        }

        .loading-spinner {
            width: 24px;
            height: 24px;
            border: 2px solid #edebe9;
            border-top: 2px solid var(--color-primary);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-right: var(--spacing-m);
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .summary-section {
            background: #f3f2f1;
            padding: var(--spacing-l);
            border-radius: var(--border-radius);
            margin-bottom: var(--spacing-l);
        }

        .summary-title {
            font-weight: 600;
            margin-bottom: var(--spacing-m);
        }

        .summary-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .summary-list li {
            padding: var(--spacing-xs) 0;
            border-bottom: 1px solid #edebe9;
        }

        .summary-list li:last-child {
            border-bottom: none;
        }

        /* Deployment Summary Accordions */
        .summary-accordion-item {
            border-bottom: 1px solid #edebe9;
            padding: var(--spacing-xs) 0;
        }

        .summary-accordion-item:last-child {
            border-bottom: none;
        }

        .summary-accordion-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            padding: var(--spacing-xs) 0;
            user-select: none;
        }

        .summary-accordion-header:hover {
            background: rgba(0, 120, 212, 0.05);
            border-radius: var(--border-radius);
            padding-left: var(--spacing-xs);
            padding-right: var(--spacing-xs);
        }

        .summary-accordion-content {
            display: none;
            padding: var(--spacing-s) var(--spacing-l);
            background: #f8f8f8;
            border-radius: var(--border-radius);
            margin-top: var(--spacing-xs);
            font-size: 14px;
            line-height: 1.4;
        }

        .summary-accordion-content.expanded {
            display: block;
        }

        .summary-chevron {
            font-size: 12px;
            color: #605e5c;
            transition: transform 0.2s ease;
            margin-left: var(--spacing-s);
        }

        .summary-chevron.expanded {
            transform: rotate(180deg);
        }

        .summary-item-list {
            margin: 0;
            padding: 0;
            list-style: none;
        }

        .summary-item-list li {
            padding: var(--spacing-xs) 0;
            border-bottom: 1px solid #e1dfdd;
            font-size: 13px;
        }

        .summary-item-list li:last-child {
            border-bottom: none;
        }

        .summary-item-badge {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 8px;
            font-weight: 600;
            margin-left: var(--spacing-xs);
        }

        .summary-item-badge.entity {
            background: #e1f5fe;
            color: #0078d4;
        }

        .summary-item-badge.relationship {
            background: #f3e5f5;
            color: #8764b8;
        }

        .summary-item-badge.custom {
            background: #e6ffed;
            color: #107c10;
        }

        .summary-item-badge.builtin {
            background: #deecf9;
            color: #0078d4;
        }

        /* Responsive */
        @media (max-width: 768px) {
            .container {
                padding: var(--spacing-m);
            }

            .progress-steps {
                flex-wrap: wrap;
                gap: var(--spacing-m);
            }

            .step {
                min-width: auto;
                flex: 1;
            }

            .step-navigation {
                flex-direction: column;
                gap: var(--spacing-m);
            }

            .nav-left, .nav-right {
                width: 100%;
                justify-content: center;
            }
        }

        /* Schema Overview Accordion Styles */
        .schema-overview-content {
            margin-top: var(--spacing-m);
        }

        .schema-accordion-item {
            border: 1px solid #edebe9;
            border-radius: var(--border-radius);
            margin-bottom: var(--spacing-s);
            overflow: hidden;
        }

        .schema-accordion-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: var(--spacing-m);
            background: #f8f8f8;
            cursor: pointer;
            user-select: none;
            transition: background-color 0.2s ease;
            font-size: 14px;
        }

        .schema-accordion-header:hover {
            background: #f3f2f1;
        }

        .schema-header-left {
            display: flex;
            align-items: center;
            gap: var(--spacing-s);
        }

        .schema-entity-name {
            font-weight: 600;
            color: #323130;
        }

        .schema-entity-meta {
            color: #605e5c;
            font-size: 13px;
        }

        .schema-chevron {
            font-size: 12px;
            color: #605e5c;
            transition: transform 0.2s ease;
        }

        .schema-accordion-content {
            display: none;
            padding: var(--spacing-m);
            background: white;
            border-top: 1px solid #edebe9;
        }

        .schema-entity-details {
            margin-bottom: var(--spacing-m);
        }

        .schema-detail-row {
            margin-bottom: var(--spacing-xs);
            font-size: 14px;
        }

        .schema-detail-row strong {
            color: #323130;
            font-weight: 600;
        }

        .schema-attributes-section strong {
            color: #323130;
            font-weight: 600;
            font-size: 14px;
        }

        .schema-attributes-list {
            margin-top: var(--spacing-s);
        }

        .schema-attribute-item {
            display: flex;
            align-items: center;
            gap: var(--spacing-s);
            padding: var(--spacing-xs) var(--spacing-s);
            margin-bottom: var(--spacing-xs);
            background: #f8f8f8;
            border-radius: var(--border-radius);
            font-size: 13px;
        }

        .schema-attribute-item.primary-key {
            background: #e1f5fe;
            border-left: 3px solid var(--color-primary);
        }

        .attribute-name {
            font-weight: 500;
            color: #323130;
        }

        .attribute-type {
            color: #605e5c;
            font-style: italic;
        }

        .pk-badge {
            background: var(--color-primary);
            color: white;
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 600;
        }

        .no-attributes {
            color: #605e5c;
            font-style: italic;
            font-size: 13px;
        }

        .schema-relationships-list {
            margin-top: var(--spacing-s);
        }

        .schema-relationship-item {
            display: flex;
            align-items: center;
            gap: var(--spacing-s);
            padding: var(--spacing-s);
            margin-bottom: var(--spacing-xs);
            background: #f8f8f8;
            border-radius: var(--border-radius);
            font-size: 13px;
        }

        .rel-from, .rel-to {
            font-weight: 500;
            color: #323130;
        }

        .rel-arrow {
            color: var(--color-primary);
            font-weight: 600;
        }

        .rel-name {
            color: #605e5c;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <h1>Mermaid to Dataverse Converter - Basic Interface</h1>
            <p>Transform your Entity Relationship Diagrams into Microsoft Dataverse solutions with automated validation and best practices.</p>
            <p><small><a href="/" style="color: #0078d4;">← Back to interface selection</a> | <a href="/wizard" style="color: #0078d4;">Try the Wizard Interface →</a></small></p>
        </div>

        <!-- Progress Indicator -->
        <div class="progress-container">
            <div class="progress-steps">
                <div class="progress-line">
                    <div class="progress-line-active" id="progressLineActive"></div>
                </div>
                
                <div class="step active" data-step="1">
                    <div class="step-circle">1</div>
                    <div class="step-label">ERD Validation</div>
                </div>
                
                <div class="step" data-step="2">
                    <div class="step-circle">2</div>
                    <div class="step-label">Publisher Setup</div>
                </div>
                
                <div class="step" data-step="3">
                    <div class="step-circle">3</div>
                    <div class="step-label">Global Choices</div>
                </div>
                
                <div class="step" data-step="4">
                    <div class="step-circle">4</div>
                    <div class="step-label">Final Review</div>
                </div>
            </div>
        </div>

        <!-- Main Content -->
        <div class="main-content">
            <!-- Step 1: ERD Validation -->
            <div class="step-content active" id="step-1">
                <div class="step-title">Upload and validate your ERD</div>
                <div class="step-description">
                    Upload your Mermaid ERD file to begin the conversion process. We'll validate the structure and check for potential issues.
                </div>

                <div class="form-group">
                    <label class="form-label" for="mermaidFile">Mermaid ERD File</label>
                    <div class="file-upload" id="fileUpload">
                        <div class="file-upload-icon">📄</div>
                        <div class="file-upload-text">Click to select or drag & drop your .mmd file</div>
                        <div class="file-upload-help">Supported formats: .mmd, .md, .txt</div>
                        <input type="file" id="mermaidFile" accept=".mmd,.md,.txt" style="display: none;">
                    </div>
                    <div class="form-help">Select a Mermaid Entity Relationship Diagram file to validate and convert.</div>
                    <div id="fileDetails" class="file-details" style="display: none; margin-top: 8px; padding: 8px; background: #f3f2f1; border-radius: 4px; font-size: 14px;"></div>
                </div>

                <div id="validationResults" class="validation-container" style="display: none;">
                    <!-- Validation results will be populated here -->
                </div>
            </div>

            <!-- Step 2: Publisher Setup -->
            <div class="step-content" id="step-2">
                <div class="step-title">Publisher Configuration</div>
                <div class="step-description">
                    Configure your solution name and choose an existing publisher or create a new one. The publisher defines the prefix for all custom entities and fields.
                </div>

                <div class="form-group">
                    <label class="form-label" for="solutionName">Solution Name *</label>
                    <input type="text" id="solutionName" class="form-input" placeholder="Enter solution name (required)" required>
                    <div class="form-help">Name of the Dataverse solution to create or update (required field)</div>
                </div>

                <div class="form-group">
                    <label class="form-label" for="publisherSelect">Choose Publisher</label>
                    <div class="loading" id="publishersLoading">
                        <div class="loading-spinner"></div>
                        <span>Loading publishers...</span>
                    </div>
                    <div id="publishersContainer" style="display: none;">
                        <select id="publisherSelect" class="form-input" onchange="handlePublisherSelection()">
                            <option value="">Select a publisher...</option>
                            <!-- Publishers will be populated here -->
                        </select>
                        <div class="form-help">Choose an existing publisher or create a new one</div>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">
                        <input type="checkbox" id="createNewPublisher" onchange="toggleNewPublisherForm()">
                        Create New Publisher
                    </label>
                    <div id="newPublisherForm" style="display: none; margin-top: 16px; padding: 16px; background: #f3f2f1; border-radius: 4px;">
                        <div class="form-group">
                            <label class="form-label" for="publisherFriendlyName">Publisher Display Name</label>
                            <input type="text" id="publisherFriendlyName" class="form-input" placeholder="Fancy New Publisher" pattern="[a-zA-Z0-9\s]+" oninput="generatePublisherUniqueName()">
                            <div class="form-help">Display name for the publisher (letters, numbers and spaces only)</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="publisherUniqueName">Publisher Unique Name (Internal)</label>
                            <input type="text" id="publisherUniqueName" class="form-input" placeholder="FancyNewPublisher" pattern="[a-zA-Z][a-zA-Z0-9]*" readonly>
                            <div class="form-help">
                                Auto-generated internal unique name for Dataverse (no spaces, letters and numbers only).<br>
                                <small>This is automatically created from the display name above. You can edit it if needed.</small>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="publisherPrefix">Prefix (3-8 characters)</label>
                            <input type="text" id="publisherPrefix" class="form-input" placeholder="myco" maxlength="8" pattern="[a-zA-Z]{3,8}">
                            <div class="form-help">Auto-generated prefix for all custom entities and fields (letters only, 3-8 characters). You can edit this if needed.</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Step 3: Global Choices -->
            <div class="step-content" id="step-3">
                <div class="step-title">Global Choice Sets</div>
                <div class="step-description">
                    Add existing global choice sets to your solution or upload custom definitions.
                </div>

                <div class="form-group">
                    <h3>Available Global Choice Sets</h3>
                    <div class="loading" id="choicesLoading">
                        <div class="loading-spinner"></div>
                        <span>Loading global choice sets...</span>
                    </div>
                    <div id="choiceSetsContainer" style="display: none;">
                        <!-- Choice sets will be populated here -->
                    </div>
                </div>

                <div class="form-group">
                    <h3>Upload Custom Choice Definitions</h3>
                    <input type="file" id="choicesFile" class="form-input" accept=".json">
                    <div class="form-help">Optional: Upload a JSON file with custom global choice definitions</div>
                </div>
            </div>

            <!-- Step 4: Final Review -->
            <div class="step-content" id="step-4">
                <div class="step-title">Final Review and Deployment</div>
                <div class="step-description">
                    Review your configuration before deploying to Dataverse.
                </div>

                <div class="summary-section">
                    <div class="summary-title">Deployment Summary</div>
                    <ul class="summary-list" id="deploymentSummary">
                        <!-- Summary will be populated here -->
                    </ul>
                </div>

                <div class="form-group">
                    <label class="form-label">
                        <input type="checkbox" id="dryRun" checked>
                        Dry Run (Preview only, don't create entities)
                    </label>
                    <div class="form-help">Enable to validate the deployment without making actual changes</div>
                </div>

                <div id="deploymentResults" style="display: none;">
                    <!-- Deployment results will appear here -->
                </div>
            </div>

            <!-- Navigation -->
            <div class="step-navigation">
                <div class="nav-left">
                    <button class="btn btn-secondary" id="prevBtn" onclick="previousStep()" style="display: none;">
                        ← Previous
                    </button>
                </div>
                <div class="nav-right">
                    <button class="btn btn-primary" id="nextBtn" onclick="nextStep()" disabled>
                        Next →
                    </button>
                    <button class="btn btn-success" id="deployBtn" onclick="deployToDataverse()" style="display: none;">
                        Deploy to Dataverse
                    </button>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Global state
        let currentStep = 1;
        let totalSteps = 4;
        let erdData = null;
        let validationResults = null;
        let currentValidationResult = null;
        let currentERDContent = '';
        let publishers = [];
        let selectedPublisher = null;
        let globalChoices = [];
        let selectedChoices = [];
        let uploadedGlobalChoices = null;

        // Global function for schema accordion
        function toggleSchemaAccordion(elementId) {
            const content = document.getElementById('content-' + elementId);
            const chevron = document.getElementById('chevron-' + elementId);
            
            if (content.style.display === 'none' || content.style.display === '') {
                content.style.display = 'block';
                chevron.textContent = '▲';
            } else {
                content.style.display = 'none';
                chevron.textContent = '▼';
            }
        }

        // Test function to manually call the API
        async function testAPICall() {
            console.log('=== MANUAL API TEST ===');
            try {
                const response = await fetch('/api/publishers?manual=true&t=' + Date.now());
                console.log('Manual test - Response status:', response.status);
                console.log('Manual test - Response headers:', Object.fromEntries(response.headers.entries()));
                const data = await response.json();
                console.log('Manual test - Response data:', data);
            } catch (error) {
                console.error('Manual test - Error:', error);
            }
        }

        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            setupFileUpload();
            updateProgress();
            setupEventDelegation();
        });

        // Setup event delegation for dynamically created accordion headers
        function setupEventDelegation() {
            document.addEventListener('click', function(e) {
                // Handle schema accordion headers
                if (e.target.closest('.schema-accordion-header')) {
                    const header = e.target.closest('.schema-accordion-header');
                    const entityId = header.getAttribute('data-entity-id');
                    if (entityId) {
                        toggleSchemaAccordion(entityId);
                    }
                }
            });
            
            // Handle choice set checkboxes
            document.addEventListener('change', function(e) {
                if (e.target.classList.contains('choice-set-checkbox')) {
                    const choiceId = e.target.getAttribute('data-choice-id');
                    if (choiceId) {
                        toggleChoiceSet(choiceId);
                    }
                }
            });
        }

        // File upload handling
        function setupFileUpload() {
            const fileUpload = document.getElementById('fileUpload');
            const fileInput = document.getElementById('mermaidFile');
            const choicesFileInput = document.getElementById('choicesFile');

            console.log('Setting up file upload handlers...');
            console.log('choicesFileInput found:', !!choicesFileInput);

            fileUpload.addEventListener('click', () => fileInput.click());
            fileUpload.addEventListener('dragover', handleDragOver);
            fileUpload.addEventListener('drop', handleDrop);
            fileInput.addEventListener('change', handleFileSelect);

            // Global choices file upload - try direct attachment first
            if (choicesFileInput) {
                console.log('Adding change event listener to choicesFile input');
                choicesFileInput.addEventListener('change', handleGlobalChoicesFileSelect);
            } else {
                console.error('choicesFile input not found at startup!');
            }

            // Publisher radio buttons
            document.addEventListener('change', function(e) {
                if (e.target.name === 'publisherChoice') {
                    handlePublisherChoice(e.target.value);
                }
                
                // Handle global choices file upload with event delegation
                if (e.target.id === 'choicesFile') {
                    console.log('Global choices file changed via event delegation');
                    handleGlobalChoicesFileSelect(e);
                }
            });
            
            // Add event listeners for new publisher form fields
            document.addEventListener('input', function(e) {
                if (e.target.id === 'publisherFriendlyName' || e.target.id === 'publisherUniqueName' || e.target.id === 'publisherPrefix') {
                    updateNextButton(); // Just revalidate the next button when user types
                }
            });
        }

        function handleDragOver(e) {
            e.preventDefault();
            e.currentTarget.classList.add('dragover');
        }

        function handleDrop(e) {
            e.preventDefault();
            e.currentTarget.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                processFile(files[0]);
            }
        }

        function handleFileSelect(e) {
            if (e.target.files.length > 0) {
                processFile(e.target.files[0]);
            }
        }

        async function processFile(file) {
            if (!file.name.match(/\.(mmd|md|txt)$/)) {
                alert('Please select a valid Mermaid file (.mmd, .md, or .txt)');
                return;
            }

            const content = await file.text();
            currentERDContent = content; // Store the original content
            
            // Update file details display
            const fileDetails = document.getElementById('fileDetails');
            if (fileDetails) {
                // Escape filename to prevent XSS
                const escapedName = file.name.replace(/[<>&"']/g, function(char) {
                    const entities = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
                    return entities[char];
                });
                fileDetails.innerHTML = '<strong>' + escapedName + '</strong> - ' + file.size + ' bytes';
                fileDetails.style.display = 'block';
            }
            
            await validateERD(content);
        }

        async function handleGlobalChoicesFileSelect(e) {
            if (e.target.files.length === 0) return;
            
            const file = e.target.files[0];
            console.log('Global choices file selected:', file.name);
            
            if (!file.name.match(/\.json$/)) {
                alert('Please select a valid JSON file (.json)');
                return;
            }
            
            try {
                const content = await file.text();
                console.log('File content read, length:', content.length);
                
                const choicesData = JSON.parse(content);
                console.log('JSON parsed successfully:', choicesData);
                
                // Validate JSON structure
                if (!choicesData.globalChoices || !Array.isArray(choicesData.globalChoices)) {
                    alert('Invalid JSON format. File must contain a "globalChoices" array.');
                    return;
                }
                
                // Store for later use in deployment
                uploadedGlobalChoices = {
                    filename: file.name,
                    data: choicesData,
                    count: choicesData.globalChoices.length
                };
                
                console.log('uploadedGlobalChoices set to:', uploadedGlobalChoices);
                
                // Update UI to show file is loaded
                const choicesContainer = document.getElementById('choiceSetsContainer');
                if (choicesContainer) {
                    const fileInfo = document.createElement('div');
                    fileInfo.className = 'file-info';
                    fileInfo.innerHTML = 
                        '<div style="padding: 10px; background: #e8f5e8; border: 1px solid #4CAF50; border-radius: 4px; margin-top: 10px;">' +
                            '<strong>Custom choices loaded:</strong> ' + file.name + '<br>' +
                            '<small>' + choicesData.globalChoices.length + ' choice set(s) ready for deployment</small>' +
                        '</div>';
                    
                    // Remove any existing file info
                    const existingInfo = choicesContainer.querySelector('.file-info');
                    if (existingInfo) existingInfo.remove();
                    
                    choicesContainer.appendChild(fileInfo);
                }
                
                console.log('Global choices file processed: ' + choicesData.globalChoices.length + ' choice sets');
                
                // Update deployment summary
                updateDeploymentSummary();
                
            } catch (error) {
                console.error('Error processing global choices file:', error);
                if (error instanceof SyntaxError) {
                    alert('Invalid JSON file format. Please check your file syntax.');
                } else {
                    alert('Error reading global choices file: ' + error.message);
                }
            }
        }

        async function validateERD(content) {
            try {
                const response = await fetch('/api/validate-erd', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mermaidContent: content })
                });

                const result = await response.json();
                erdData = result;
                validationResults = result.validation;
                currentValidationResult = result; // Store the full result for corrected ERD access
                
                displayValidationResults(result);
                updateNextButton();
            } catch (error) {
                console.error('Validation error:', error);
                alert('Error validating ERD: ' + error.message);
            }
        }

        function displayValidationResults(result) {
            const container = document.getElementById('validationResults');
            container.innerHTML = '';
            container.style.display = 'block';

            // Display validation summary
            const validation = result.validation;
            
            if (validation.status === 'success') {
                container.innerHTML += createValidationItem('success', 'Validation Passed', 'Your ERD structure is valid and ready for deployment.');
            }

            // Display errors
            validation.errors.forEach(error => {
                container.innerHTML += createValidationItem('error', error.message, error.suggestion, error.documentationLink);
            });

            // Display warnings
            validation.warnings.forEach(warning => {
                container.innerHTML += createValidationItem('warning', warning.message, warning.suggestion, warning.documentationLink);
            });

            // Display info messages
            validation.info.forEach(info => {
                container.innerHTML += createValidationItem('info', info.message, info.suggestion, info.documentationLink);
            });

            // Display corrected ERD if available and there are warnings/errors
            // TEMPORARILY DISABLED FOR DEBUGGING
            /*
            if (result.correctedERD && (validation.warnings.length > 0 || validation.errors.length > 0)) {
                container.innerHTML += createCorrectedERDDisplay(currentERDContent, result.correctedERD);
            }
            */

            // Display summary
            if (result.summary) {
                const s = result.summary;
                container.innerHTML += createValidationItem('info', 
                    'Summary: ' + s.entityCount + ' entities, ' + s.relationshipCount + ' relationships, ' + s.totalAttributes + ' attributes',
                    'Found ' + validation.totalIssues + ' validation issues'
                );
            }

            // Display schema overview
            // TEMPORARILY DISABLED FOR DEBUGGING
            /*
            if (result.entities && result.entities.length > 0) {
                container.innerHTML += createSchemaOverview(result.entities, result.relationships || []);
            }
            */
        }

        function createSchemaOverview(entities, relationships) {
            console.log('DEBUG: Creating schema overview with', entities.length, 'entities');
            
            // Escape HTML content to prevent JavaScript injection
            function escapeHtml(text) {
                if (!text) return '';
                return text
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            }
            
            let entitiesHtml = '';
            entities.forEach((entity, index) => {
                const entityId = 'entity-' + index;
                const entityName = escapeHtml(entity.displayName || entity.name);
                entitiesHtml += 
                    '<div class="schema-accordion-item">' +
                        '<div class="schema-accordion-header" data-entity-id="' + entityId + '">' +
                            '<div class="schema-header-left">' +
                                '<span class="schema-entity-name">' + entityName + '</span>' +
                                '<span class="schema-entity-meta">(' + (entity.attributes ? entity.attributes.length : 0) + ' attributes)</span>' +
                            '</div>' +
                            '<span class="schema-chevron" id="chevron-' + entityId + '">▼</span>' +
                        '</div>' +
                        '<div class="schema-accordion-content" id="content-' + entityId + '">' +
                            '<div class="schema-entity-details">' +
                                '<div class="schema-detail-row">' +
                                    '<strong>Logical Name:</strong> ' + escapeHtml(entity.name) +
                                '</div>' +
                                '<div class="schema-detail-row">' +
                                    '<strong>Display Name:</strong> ' + entityName +
                                '</div>' +
                            '</div>' +
                            '<div class="schema-attributes-section">' +
                                '<strong>Attributes:</strong>' +
                                '<div class="schema-attributes-list">' +
                                    (entity.attributes ? entity.attributes.map(attr => 
                                        '<div class="schema-attribute-item ' + (attr.isPrimaryKey ? 'primary-key' : '') + '">' +
                                            '<span class="attribute-name">' + escapeHtml(attr.name) + '</span>' +
                                            '<span class="attribute-type">' + escapeHtml(attr.type || 'String') + '</span>' +
                                            (attr.isPrimaryKey ? '<span class="pk-badge">PK</span>' : '') +
                                        '</div>'
                                    ).join('') : '<div class="no-attributes">No attributes defined</div>') +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>';
            });

            let relationshipsHtml = '';
            if (relationships.length > 0) {
                relationshipsHtml = 
                    '<div class="schema-accordion-item">' +
                        '<div class="schema-accordion-header" data-entity-id="relationships">' +
                            '<div class="schema-header-left">' +
                                '<span class="schema-entity-name">Relationships</span>' +
                                '<span class="schema-entity-meta">(' + relationships.length + ' connections)</span>' +
                            '</div>' +
                            '<span class="schema-chevron" id="chevron-relationships">▼</span>' +
                        '</div>' +
                        '<div class="schema-accordion-content" id="content-relationships">' +
                            '<div class="schema-relationships-list">' +
                                relationships.map(rel => 
                                    '<div class="schema-relationship-item">' +
                                        '<span class="rel-from">' + escapeHtml(rel.fromEntity) + '</span>' +
                                        '<span class="rel-arrow">→</span>' +
                                        '<span class="rel-to">' + escapeHtml(rel.toEntity) + '</span>' +
                                        '<span class="rel-name">(' + escapeHtml(rel.name || 'unnamed') + ')</span>' +
                                    '</div>'
                                ).join('') +
                            '</div>' +
                        '</div>' +
                    '</div>';
            }

            return (
                '<div class="validation-item info schema-overview">' +
                    '<div class="validation-content">' +
                        '<div class="validation-message">Parsed Schema Overview</div>' +
                        '<div class="validation-suggestion">Expand sections to view detailed entity and relationship information</div>' +
                        '<div class="schema-overview-content">' +
                            entitiesHtml +
                            relationshipsHtml +
                        '</div>' +
                    '</div>' +
                '</div>');
        }

        function createValidationItem(type, message, suggestion, link) {
            // Escape HTML content to prevent JavaScript injection
            function escapeHtml(text) {
                if (!text) return '';
                return text
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            }
            
            return (
                '<div class="validation-item ' + type + '">' +
                    '<div class="validation-content">' +
                        '<div class="validation-message">' + escapeHtml(message) + '</div>' +
                        (suggestion ? '<div class="validation-suggestion">' + escapeHtml(suggestion) + '</div>' : '') +
                        (link ? '<div class="validation-suggestion"><a href="' + escapeHtml(link) + '" target="_blank">View Documentation</a></div>' : '') +
                    '</div>' +
                '</div>');
        }

        function createCorrectedERDDisplay(originalERD, correctedERD) {
            // Debug: Check if originalERD has content
            if (!originalERD || originalERD.trim() === '') {
                console.warn('Original ERD content is empty:', originalERD);
                originalERD = 'No original ERD content available';
            }
            
            // Escape HTML content to prevent JavaScript injection
            function escapeHtml(text) {
                if (!text) return '';
                return text
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            }
            
            const escapedOriginal = escapeHtml(originalERD);
            const escapedCorrected = escapeHtml(correctedERD);
            
            return (
                '<div class="validation-item info">' +
                    '<div class="validation-content">' +
                        '<div class="validation-message">Corrected ERD Available</div>' +
                        '<div class="validation-suggestion">We have generated a corrected version of your ERD that addresses the validation issues.</div>' +
                        '<div class="erd-comparison">' +
                            '<div class="erd-comparison-controls">' +
                                '<button type="button" class="btn btn-secondary" onclick="showERDComparison()">' +
                                    'View Side-by-Side Comparison' +
                                '</button>' +
                                '<button type="button" class="btn btn-primary" onclick="useCorrectedERD()">' +
                                    'Use Corrected ERD' +
                                '</button>' +
                            '</div>' +
                            '<div id="erdComparisonContainer" class="erd-comparison-container" style="display: none;">' +
                                '<div class="erd-comparison-side">' +
                                    '<h4>Original ERD</h4>' +
                                    '<pre class="erd-code">' + escapedOriginal + '</pre>' +
                                '</div>' +
                                '<div class="erd-comparison-side">' +
                                    '<h4>Corrected ERD</h4>' +
                                    '<pre class="erd-code">' + escapedCorrected + '</pre>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>');
        }

        function showERDComparison() {
            const container = document.getElementById('erdComparisonContainer');
            if (container.style.display === 'none') {
                container.style.display = 'flex';
            } else {
                container.style.display = 'none';
            }
        }

        function useCorrectedERD() {
            if (currentValidationResult && currentValidationResult.correctedERD) {
                // Update the current ERD content
                currentERDContent = currentValidationResult.correctedERD;
                
                // Update the file input display
                const fileDetails = document.getElementById('fileDetails');
                if (fileDetails) {
                    fileDetails.innerHTML = '<strong>Using corrected ERD</strong> - Validation issues have been automatically fixed';
                }
                
                // Re-validate the corrected ERD
                validateERD(currentValidationResult.correctedERD);
                
                alert('Corrected ERD is now being used. The validation has been updated.');
            }
        }

        // Navigation
        function nextStep() {
            if (currentStep < totalSteps) {
                if (validateCurrentStep()) {
                    currentStep++;
                    updateSteps();
                    updateProgress();
                }
            }
        }

        function previousStep() {
            if (currentStep > 1) {
                currentStep--;
                updateSteps();
                updateProgress();
            }
        }

        function validateCurrentStep() {
            switch (currentStep) {
                case 1:
                    return erdData && validationResults && validationResults.isValid;
                case 2:
                    // Check if a publisher is selected from dropdown OR create new publisher checkbox is checked with valid data
                    const selectedFromDropdown = document.getElementById('publisherSelect').value;
                    const createNewChecked = document.getElementById('createNewPublisher').checked;
                    const publisherFriendlyName = document.getElementById('publisherFriendlyName').value.trim();
                    const publisherUniqueName = document.getElementById('publisherUniqueName').value.trim();
                    const publisherPrefix = document.getElementById('publisherPrefix').value.trim();
                    
                    // Must have either a selected publisher OR all required fields for new publisher
                    return selectedFromDropdown || (createNewChecked && publisherFriendlyName && publisherUniqueName && publisherPrefix);
                case 3:
                    return true; // Global choices are optional
                case 4:
                    return true;
                default:
                    return false;
            }
        }

        function updateSteps() {
            console.log('updateSteps: Current step is', currentStep);
            
            // Hide all step content
            document.querySelectorAll('.step-content').forEach(content => {
                content.classList.remove('active');
            });

            // Show current step content
            document.getElementById('step-' + currentStep).classList.add('active');

            // Update step indicators
            document.querySelectorAll('.step').forEach((step, index) => {
                const stepNumber = index + 1;
                const circle = step.querySelector('.step-circle');
                
                step.classList.remove('active', 'completed');
                circle.classList.remove('active', 'completed');
                
                if (stepNumber < currentStep) {
                    step.classList.add('completed');
                    circle.classList.add('completed');
                    circle.innerHTML = stepNumber;
                } else if (stepNumber === currentStep) {
                    step.classList.add('active');
                    circle.classList.add('active');
                    circle.innerHTML = stepNumber;
                } else {
                    circle.innerHTML = stepNumber;
                }
            });

            // Load data for current step
            loadStepData();
        }

        function updateProgress() {
            const progressLine = document.getElementById('progressLineActive');
            const progressPercent = ((currentStep - 1) / (totalSteps - 1)) * 100;
            progressLine.style.width = progressPercent + '%';

            // Update navigation buttons
            const prevBtn = document.getElementById('prevBtn');
            const nextBtn = document.getElementById('nextBtn');
            const deployBtn = document.getElementById('deployBtn');

            prevBtn.style.display = currentStep > 1 ? 'inline-flex' : 'none';
            
            if (currentStep === totalSteps) {
                nextBtn.style.display = 'none';
                deployBtn.style.display = 'inline-flex';
            } else {
                nextBtn.style.display = 'inline-flex';
                deployBtn.style.display = 'none';
            }

            updateNextButton();
        }

        function updateNextButton() {
            const nextBtn = document.getElementById('nextBtn');
            const isValid = validateCurrentStep();
            nextBtn.disabled = !isValid;
        }

        async function loadStepData() {
            console.log('loadStepData: Loading data for step', currentStep);
            
            switch (currentStep) {
                case 2:
                    console.log('loadStepData: Loading publishers for step 2');
                    await loadPublishers();
                    break;
                case 3:
                    await loadGlobalChoices();
                    break;
                case 4:
                    updateDeploymentSummary();
                    break;
            }
        }

        async function loadPublishers() {
            const container = document.getElementById('publishersContainer');
            const loading = document.getElementById('publishersLoading');
            
            console.log('loadPublishers: Starting to load publishers...');
            console.log('loadPublishers: Current publishers array:', publishers);
            
            try {
                console.log('loadPublishers: Making fetch request to /api/publishers...');
                const response = await fetch('/api/publishers?t=' + Date.now(), {
                    method: 'GET',
                    cache: 'no-cache',
                    headers: {
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    }
                });
                console.log('loadPublishers: Fetch response received, status:', response.status);
                console.log('loadPublishers: Response headers:', Object.fromEntries(response.headers.entries()));
                const result = await response.json();
                console.log('loadPublishers: JSON parsed successfully');
                
                console.log('loadPublishers: API response:', result);
                
                if (result.success) {
                    publishers = result.publishers;
                    console.log('loadPublishers: Publishers array:', publishers);
                    displayPublishers(publishers);
                    container.style.display = 'block';
                    loading.style.display = 'none';
                } else {
                    console.error('loadPublishers: API returned success=false:', result);
                    loading.innerHTML = '<div style="color: var(--color-error);">Failed to load publishers</div>';
                }
            } catch (error) {
                console.error('Error loading publishers:', error);
                loading.innerHTML = '<div style="color: var(--color-error);">Error loading publishers</div>';
            }
        }

        function displayPublishers(publishers) {
            const container = document.getElementById('publishersContainer');
            const loading = document.getElementById('publishersLoading');
            const select = document.getElementById('publisherSelect');
            
            console.log('displayPublishers: Called with', publishers.length, 'publishers');
            
            // Clear existing options except the first one
            select.innerHTML = '<option value="">Select a publisher...</option>';
            
            // Add publisher options
            publishers.forEach(publisher => {
                const isDefault = publisher.isDefault;
                const option = document.createElement('option');
                option.value = publisher.id;
                option.textContent = publisher.friendlyName + (isDefault ? ' (Default)' : '') + ' - Prefix: ' + publisher.prefix;
                option.setAttribute('data-prefix', publisher.prefix);
                option.setAttribute('data-unique-name', publisher.uniqueName);
                select.appendChild(option);
                console.log('displayPublishers: Added option for', publisher.friendlyName, 'with prefix', publisher.prefix);
            });
            
            console.log('displayPublishers: Total options in select now:', select.options.length);
            
            // Show the dropdown and hide loading
            loading.style.display = 'none';
            container.style.display = 'block';
        }

        function handlePublisherSelection() {
            const select = document.getElementById('publisherSelect');
            const selectedValue = select.value;
            
            if (selectedValue) {
                selectedPublisher = publishers.find(p => p.id === selectedValue);
                // Uncheck create new publisher if an existing one is selected
                document.getElementById('createNewPublisher').checked = false;
                document.getElementById('newPublisherForm').style.display = 'none';
            } else {
                selectedPublisher = null;
            }
            
            updateNextButton();
        }

        function toggleNewPublisherForm() {
            const checkbox = document.getElementById('createNewPublisher');
            const form = document.getElementById('newPublisherForm');
            const select = document.getElementById('publisherSelect');
            
            if (checkbox.checked) {
                form.style.display = 'block';
                select.value = ''; // Clear dropdown selection
                selectedPublisher = null;
            } else {
                form.style.display = 'none';
            }
            
            updateNextButton();
        }

        function generatePublisherUniqueName() {
            const friendlyName = document.getElementById('publisherFriendlyName').value;
            const uniqueNameField = document.getElementById('publisherUniqueName');
            const prefixField = document.getElementById('publisherPrefix');
            
            if (!friendlyName) {
                uniqueNameField.value = '';
                prefixField.value = '';
                updateNextButton();
                return;
            }
            
            // Auto-generate unique name by removing spaces and special chars, keeping only letters and numbers
            let uniqueName = friendlyName
                .replace(/[^a-zA-Z0-9]/g, '') // Remove all non-alphanumeric characters including spaces
                .replace(/^\d+/, ''); // Remove leading numbers
            
            // Ensure it starts with a letter
            if (uniqueName && !/^[a-zA-Z]/.test(uniqueName)) {
                uniqueName = 'Publisher' + uniqueName;
            }
            
            // Set the unique name field
            uniqueNameField.value = uniqueName;
            uniqueNameField.readOnly = false; // Allow manual editing after auto-generation
            
            // Auto-generate prefix from first 3-8 characters of unique name
            if (uniqueName) {
                let prefix = uniqueName.substring(0, 8).toLowerCase();
                // Ensure minimum 3 characters
                if (prefix.length < 3) {
                    prefix = (prefix + 'pub').substring(0, 8);
                }
                prefixField.value = prefix;
            } else {
                prefixField.value = '';
            }
            
            updateNextButton();
        }

        function handlePublisherChoice(choice) {
            const newPublisherForm = document.getElementById('newPublisherForm');
            
            if (choice === 'new') {
                newPublisherForm.style.display = 'block';
                selectedPublisher = null;
            } else {
                newPublisherForm.style.display = 'none';
                selectPublisher(choice);
            }
            
            updateNextButton();
        }

        async function loadGlobalChoices() {
            const container = document.getElementById('choiceSetsContainer');
            const loading = document.getElementById('choicesLoading');

            try {
                const response = await fetch('/api/global-choices-list');
                const result = await response.json();
                
                if (result.success) {
                    globalChoices = result.all || result.choiceSets || []; // Support both old and new structure
                    displayGlobalChoices(globalChoices);
                    container.style.display = 'block';
                    loading.style.display = 'none';
                }
            } catch (error) {
                console.error('Error loading global choices:', error);
                loading.innerHTML = '<div style="color: var(--color-error);"> Error loading global choice sets</div>';
            }
        }

        function displayGlobalChoices(choices) {
            const container = document.getElementById('choiceSetsContainer');
            container.innerHTML = '';

            let html = '';

            if (choices.length > 0) {
                // Group choices into built-in and custom using the new API structure
                const builtInChoices = choices.filter(choice => !choice.isCustom);
                const customChoices = choices.filter(choice => choice.isCustom);

                html += '<h4 style="margin: 16px 0 8px 0; color: #323130; font-size: 16px;">Available Global Choice Sets (' + choices.length + ')</h4>';

                // Display custom choices first
                if (customChoices.length > 0) {
                    html += '<div class="choice-group">';
                    html += '<h5 style="margin: 12px 0 8px 0; color: #605e5c; font-size: 14px; font-weight: 600;">Custom Choice Sets (' + customChoices.length + ')</h5>';
                    customChoices.forEach(choice => {
                        const safeDisplayName = escapeHtml(choice.displayName || '');
                        const safeDescription = escapeHtml(choice.description || 'No description available');
                        const safeId = escapeHtml(choice.id || '');
                        
                        html += '<div class="choice-set-item">';
                        html += '<input type="checkbox" class="choice-set-checkbox" value="' + safeId + '" data-choice-id="' + safeId + '">';
                        html += '<div class="choice-set-info">';
                        html += '<div class="choice-set-name">' + safeDisplayName + ' <span class="choice-type-badge custom">Custom</span></div>';
                        html += '<div class="choice-set-description">' + safeDescription + '</div>';
                        html += '</div>';
                        html += '</div>';
                    });
                    html += '</div>';
                }

                // Display built-in choices
                if (builtInChoices.length > 0) {
                    html += '<div class="choice-group">';
                    html += '<h5 style="margin: 12px 0 8px 0; color: #605e5c; font-size: 14px; font-weight: 600;">Built-in Choice Sets (' + builtInChoices.length + ')</h5>';
                    builtInChoices.forEach(choice => {
                        const safeDisplayName = escapeHtml(choice.displayName || '');
                        const safeDescription = escapeHtml(choice.description || 'No description available');
                        const safeId = escapeHtml(choice.id || '');
                        
                        html += '<div class="choice-set-item">';
                        html += '<input type="checkbox" class="choice-set-checkbox" value="' + safeId + '" data-choice-id="' + safeId + '">';
                        html += '<div class="choice-set-info">';
                        html += '<div class="choice-set-name">' + safeDisplayName + ' <span class="choice-type-badge built-in">Built-in</span></div>';
                        html += '<div class="choice-set-description">' + safeDescription + '</div>';
                        html += '</div>';
                        html += '</div>';
                    });
                    html += '</div>';
                }
            } else {
                html += '<p>No global choice sets available.</p>';
            }

            container.innerHTML = html;
        }

        // Helper function to escape HTML
        function escapeHtml(text) {
            if (!text) return '';
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function toggleChoiceSet(choiceId) {
            const index = selectedChoices.indexOf(choiceId);
            if (index > -1) {
                selectedChoices.splice(index, 1);
            } else {
                selectedChoices.push(choiceId);
            }
        }

        function updateDeploymentSummary() {
            const summaryList = document.getElementById('deploymentSummary');
            let summaryHtml = '';

            // ERD Summary - Simple List
            if (erdData && erdData.summary) {
                const s = erdData.summary;
                summaryHtml += '<li> ERD Structure: ' + s.entityCount + ' entities, ' + s.relationshipCount + ' relationships, ' + s.totalAttributes + ' attributes</li>';
            }

            // Publisher Summary - Simple
            if (selectedPublisher) {
                summaryHtml += '<li>Publisher: ' + selectedPublisher.friendlyName + ' (Prefix: ' + selectedPublisher.prefix + ')</li>';
            } else {
                const prefix = document.getElementById('publisherPrefix').value;
                const friendlyName = document.getElementById('publisherFriendlyName').value;
                const uniqueName = document.getElementById('publisherUniqueName').value;
                if (prefix && friendlyName && uniqueName) {
                    summaryHtml += '<li>New Publisher: ' + friendlyName + ' (' + uniqueName + ', Prefix: ' + prefix + ')</li>';
                }
            }

            // Solution Summary - Simple
            const solutionName = document.getElementById('solutionName').value;
            summaryHtml += '<li>Solution: ' + solutionName + '</li>';

            // Global Choices Summary - Simple Count
            if (selectedChoices.length > 0) {
                summaryHtml += '<li>Global Choice Sets: ' + selectedChoices.length + ' selected</li>';
            }

            // Uploaded Custom Global Choices
            if (uploadedGlobalChoices) {
                summaryHtml += '<li>Custom Global Choices: ' + uploadedGlobalChoices.count + ' from ' + uploadedGlobalChoices.filename + '</li>';
            }

            summaryList.innerHTML = summaryHtml;
        }

        // Function to toggle summary accordions
        // toggleSummaryAccordion function removed - no longer needed

        async function deployToDataverse() {
            const deployBtn = document.getElementById('deployBtn');
            const resultsContainer = document.getElementById('deploymentResults');
            const isDryRun = document.getElementById('dryRun').checked;

            deployBtn.disabled = true;
            deployBtn.innerHTML = 'Deploying...';
            resultsContainer.style.display = 'block';
            resultsContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><span>Processing deployment...</span></div>';

            try {
                // Convert selected choice IDs to full choice objects
                const selectedChoiceObjects = selectedChoices.map(choiceId => {
                    const choice = globalChoices.find(choice => choice.id === choiceId);
                    // Transform to the format expected by the backend (using name as LogicalName)
                    if (choice) {
                        return {
                            LogicalName: choice.name,
                            Name: choice.name,
                            displayName: choice.displayName,
                            id: choice.id
                        };
                    }
                    return null;
                }).filter(choice => choice !== null);

                // Log for debugging if needed
                if (selectedChoices.length > 0) {
                    console.log('Converting', selectedChoices.length, 'selected choices to objects, found', selectedChoiceObjects.length);
                    console.log('First choice object:', selectedChoiceObjects[0]);
                }

                // Prepare deployment data
                const deploymentData = {
                    entities: erdData.entities,
                    relationships: erdData.relationships,
                    solutionName: document.getElementById('solutionName').value,
                    dryRun: isDryRun,
                    publisher: selectedPublisher || {
                        friendlyName: document.getElementById('publisherFriendlyName').value,
                        uniqueName: document.getElementById('publisherUniqueName').value,
                        prefix: document.getElementById('publisherPrefix').value
                    },
                    selectedChoices: selectedChoiceObjects,
                    cdmChoices: getCDMChoices(),
                    uploadedGlobalChoices: uploadedGlobalChoices
                };

                // Debug deployment data
                console.log('Deployment data being sent:', {
                    entitiesCount: deploymentData.entities?.length || 0,
                    relationshipsCount: deploymentData.relationships?.length || 0,
                    selectedChoicesCount: deploymentData.selectedChoices?.length || 0,
                    hasUploadedGlobalChoices: !!deploymentData.uploadedGlobalChoices,
                    uploadedGlobalChoicesInfo: deploymentData.uploadedGlobalChoices ? {
                        filename: deploymentData.uploadedGlobalChoices.filename,
                        count: deploymentData.uploadedGlobalChoices.count,
                        hasData: !!deploymentData.uploadedGlobalChoices.data
                    } : null
                });

                // Start deployment
                const response = await fetch('/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(deploymentData)
                });

                // Handle streaming response
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let logs = [];

                resultsContainer.innerHTML = '<div id="deploymentLogs"></div>';
                const logsContainer = document.getElementById('deploymentLogs');

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\\n').filter(line => line.trim());

                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line);
                            console.log('Parsed data:', data);
                            if (data.type === 'log') {
                                logs.push(data.message);
                                logsContainer.innerHTML += '<div>' + data.message + '</div>';
                                
                                // Check if this is the deployment completion message
                                if (data.message === 'Deployment completed successfully!') {
                                    console.log('Deployment completion detected - changing button to DONE');
                                    const deployBtn = document.getElementById('deployBtn');
                                    deployBtn.innerHTML = 'DONE';
                                    deployBtn.onclick = function() {
                                        // Return to step 1
                                        currentStep = 1;
                                        showStep(currentStep);
                                        // Reset the button for future deployments
                                        deployBtn.innerHTML = 'Deploy to Dataverse';
                                        deployBtn.onclick = deployToDataverse;
                                        // Clear deployment results
                                        document.getElementById('deploymentResults').innerHTML = '';
                                    };
                                }
                            } else if (data.type === 'result') {
                                console.log('Calling displayDeploymentResult with:', data);
                                displayDeploymentResult(data);
                            }
                        } catch (e) {
                            console.log('Failed to parse JSON line:', line, 'Error:', e);
                        }
                    }
                }

            } catch (error) {
                console.error('Deployment error:', error);
                resultsContainer.innerHTML = 
                    '<div class="validation-item error">' +
                        '<div class="validation-content">' +
                            '<div class="validation-message">Deployment failed: ' + error.message + '</div>' +
                        '</div>' +
                    '</div>';
            } finally {
                deployBtn.disabled = false;
                deployBtn.innerHTML = 'Deploy to Dataverse';
            }
        }

        function displayDeploymentResult(result) {
            const container = document.getElementById('deploymentResults');
            const type = result.success ? 'success' : 'error';
            const icon = result.success ? '[OK]' : '[ERROR]';

            // Debug logging
            console.log('displayDeploymentResult called with:', result);
            console.log('result.success:', result.success);
            console.log('result.deploymentComplete:', result.deploymentComplete);

            container.innerHTML += 
                '<div class="validation-item ' + type + '">' +
                    '<div class="validation-content">' +
                        '<div class="validation-message">' + (result.success ? 'Deployment completed successfully!' : 'Deployment failed') + '</div>' +
                        (result.message ? '<div class="validation-suggestion">' + result.message + '</div>' : '') +
                    '</div>' +
                '</div>';

            // If deployment completed successfully, change button to DONE
            if (result.success && result.deploymentComplete) {
                console.log('Changing button to DONE');
                const deployBtn = document.getElementById('deployBtn');
                deployBtn.innerHTML = 'DONE';
                deployBtn.onclick = function() {
                    // Return to step 1
                    currentStep = 1;
                    showStep(currentStep);
                    // Reset the button for future deployments
                    deployBtn.innerHTML = 'Deploy to Dataverse';
                    deployBtn.onclick = deployToDataverse;
                    // Clear deployment results
                    document.getElementById('deploymentResults').innerHTML = '';
                };
            }
        }

        function getCDMChoices() {
            // CDM entity selection was removed from the wizard
            // Return empty object for backward compatibility
            return {};
        }
    </script>
</body>
</html>
  `;

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
}
// Serve wizard UI
function serveWizardUI(res) {
  try {
    const path = require('path');
    const fs = require('fs');
    const wizardPath = path.join(__dirname, 'wizard-ui.html');
    
    if (!fs.existsSync(wizardPath)) {
      console.error(`Wizard UI file not found at: ${wizardPath}`);
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Wizard UI Not Available</title></head>
        <body style="font-family: 'Segoe UI', sans-serif; padding: 40px; text-align: center;">
          <h1>Wizard UI Temporarily Unavailable</h1>
          <p>The wizard interface is currently not available.</p>
          <p><a href="/" style="color: #0078d4;">Use the basic interface instead</a></p>
        </body>
        </html>
      `);
      return;
    }
    
    const html = fs.readFileSync(wizardPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } catch (error) {
    console.error('Error serving wizard UI:', error);
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head><title>Error Loading Wizard</title></head>
      <body style="font-family: 'Segoe UI', sans-serif; padding: 40px; text-align: center;">
        <h1>Error Loading Wizard UI</h1>
        <p>There was an error loading the wizard interface.</p>
        <p><a href="/" style="color: #0078d4;">Use the basic interface instead</a></p>
        <p><small>Error: ${error.message}</small></p>
      </body>
      </html>
    `);
  }
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
      // Serve interface selection page
      serveInterfaceSelector(res);
      
    } else if (pathname === '/basic') {
      // Serve the basic upload form
      serveUploadForm(res);
      
    } else if (pathname === '/wizard') {
      // Serve the new wizard UI
      serveWizardUI(res);
      
    } else if (pathname === '/upload' && req.method === 'POST') {
      // Handle deployment from the wizard
      handleDeployment(req, res);
      
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
      try {
        const config = await getDataverseConfig();
        
        // Add environment and authentication method info
        const response = {
          ...config,
          environment: {
            nodeEnv: process.env.NODE_ENV || 'development',
            useLocalEnv: process.env.USE_LOCAL_ENV === 'true',
            azureSDKLoaded: azureSDKLoaded,
            keyVaultConfigured: !!keyVaultConfig
          }
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response, null, 2));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: false, 
          error: error.message,
          environment: {
            nodeEnv: process.env.NODE_ENV || 'development',
            useLocalEnv: process.env.USE_LOCAL_ENV === 'true',
            azureSDKLoaded: azureSDKLoaded,
            keyVaultConfigured: !!keyVaultConfig
          }
        }, null, 2));
      }
      
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
            console.error(' JSON Parse Error:', parseError.message);
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
          
          // Extract config directly from the result
          const dvConfig = {
            dataverseUrl: dataverseConfigResult.dataverseUrl,
            clientId: dataverseConfigResult.clientId,
            clientSecret: dataverseConfigResult.clientSecret,
            tenantId: dataverseConfigResult.tenantId,
            apiVersion: dataverseConfigResult.apiVersion || '9.2',
            verbose: true,
            authMethod: dataverseConfigResult.authMethod
          };
          
          dvConfig.solutionName = data.solutionName || 'TestSolution';
          
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
              console.log(' Connection test:', connectionTest);
              
              // 2. List existing solutions and publishers
              const solutionsList = await client.listSolutions();
              console.log(' Solutions list:', solutionsList);
              
              const publishersList = await client.listPublishers();
              console.log(' Publishers list:', publishersList);
              
              // 3. Test solution check/create
              const solutionTest = await client.ensureSolutionExists(data.solutionName || 'TestSolution');
              console.log(' Solution test:', solutionTest);
              
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
          console.error(' Dataverse test error:', error);
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
      
    } else if (pathname === '/api/global-choices' && req.method === 'POST') {
      // Handle global choices upload and creation
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          // Parse multipart form data to get file content
          const boundary = req.headers['content-type']?.split('boundary=')[1];
          if (!boundary) {
            throw new Error('No boundary found in Content-Type header');
          }
          
          // Parse the multipart data
          const parts = body.split(`--${boundary}`);
          let globalChoicesContent = '';
          let solutionName = 'MermaidSolution';
          let dryRun = false;
          
          for (const part of parts) {
            if (part.includes('name="globalChoicesFile"')) {
              // Extract file content
              const contentStart = part.indexOf('\r\n\r\n') + 4;
              const contentEnd = part.lastIndexOf('\r\n');
              if (contentStart < contentEnd) {
                globalChoicesContent = part.slice(contentStart, contentEnd);
              }
            } else if (part.includes('name="solutionName"')) {
              const contentStart = part.indexOf('\r\n\r\n') + 4;
              const contentEnd = part.lastIndexOf('\r\n');
              if (contentStart < contentEnd) {
                solutionName = part.slice(contentStart, contentEnd).trim();
              }
            } else if (part.includes('name="dryRun"')) {
              dryRun = true;
            }
          }
          
          if (!globalChoicesContent.trim()) {
            throw new Error('No global choices file content found');
          }
          
          // Parse JSON content
          let globalChoicesData;
          try {
            globalChoicesData = JSON.parse(globalChoicesContent);
          } catch (parseError) {
            throw new Error(`Invalid JSON in global choices file: ${parseError.message}`);
          }
          
          if (!globalChoicesData.globalChoices || !Array.isArray(globalChoicesData.globalChoices)) {
            throw new Error('Global choices file must contain a "globalChoices" array');
          }
          
          console.log(`🎯 Processing ${globalChoicesData.globalChoices.length} global choices for solution: ${solutionName}`);
          console.log(` Dry run mode: ${dryRun ? 'enabled' : 'disabled'}`);
          
          // Get Dataverse configuration
          const dataverseConfigResult = await getDataverseConfig();
          if (!dataverseConfigResult.success) {
            throw new Error(dataverseConfigResult.error);
          }
          
          // Extract config directly from the result
          const dvConfig = {
            dataverseUrl: dataverseConfigResult.dataverseUrl,
            clientId: dataverseConfigResult.clientId,
            clientSecret: dataverseConfigResult.clientSecret,
            tenantId: dataverseConfigResult.tenantId,
            apiVersion: dataverseConfigResult.apiVersion || '9.2',
            verbose: true,
            authMethod: dataverseConfigResult.authMethod
          };
          
          dvConfig.solutionName = solutionName;
          
          const client = new DataverseClient(dvConfig);
          
          if (dryRun) {
            // Dry run: validate and preview global choices
            const results = [];
            for (const choice of globalChoicesData.globalChoices) {
              try {
                // Check if global choice exists
                const exists = await client.checkGlobalChoiceExists(choice.name);
                results.push({
                  name: choice.name,
                  displayName: choice.displayName,
                  description: choice.description,
                  optionsCount: choice.options?.length || 0,
                  exists: exists.exists,
                  action: exists.exists ? 'skip (already exists)' : 'would create',
                  valid: true
                });
              } catch (error) {
                results.push({
                  name: choice.name,
                  displayName: choice.displayName,
                  error: error.message,
                  valid: false
                });
              }
            }
            
            const summary = {
              totalChoices: globalChoicesData.globalChoices.length,
              existing: results.filter(r => r.exists).length,
              toCreate: results.filter(r => r.valid && !r.exists).length,
              invalid: results.filter(r => !r.valid).length
            };
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              dryRun: true,
              summary,
              results,
              timestamp: new Date().toISOString()
            }, null, 2));
          } else {
            // Create global choices
            console.log(` About to create global choices with config:`, {
              serverUrl: dvConfig.serverUrl,
              solutionName: dvConfig.solutionName,
              authMethod: dvConfig.authMethod || 'default',
              hasCredentials: !!(dvConfig.clientId || dvConfig.tenantId)
            });
            
            console.log(` Global choices to process:`, globalChoicesData.globalChoices.map(gc => ({
              name: gc.name,
              displayName: gc.displayName,
              optionsCount: gc.options?.length || 0
            })));
            
            let result;
            try {
              result = await client.createGlobalChoicesFromJson(globalChoicesData);
              console.log(`🎯 Global choices creation result:`, {
                success: result.success,
                created: result.created,
                skipped: result.skipped,
                errorCount: result.errors?.length || 0
              });
            } catch (createError) {
              console.error(` Global choices creation failed:`, {
                error: createError.message,
                stack: createError.stack,
                name: createError.name
              });
              throw createError;
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: result.success,
              message: result.message || (result.success ? 'Global choices processed successfully' : 'Global choices processing completed with errors'),
              created: result.created || 0,
              skipped: result.skipped || 0,
              errors: result.errors || [],
              timestamp: new Date().toISOString()
            }, null, 2));
          }
          
        } catch (error) {
          console.error(' Global choices processing error:', error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: 'Global choices processing failed',
            error: error.message,
            timestamp: new Date().toISOString()
          }));
        }
      });
      
    } else if (pathname === '/api/publishers' && req.method === 'GET') {
      // Get all publishers from Dataverse
      console.log(' ENDPOINT HIT: /api/publishers - Request received');
      
      try {
        // Check cache first
        const now = Date.now();
        const forceRefresh = url.parse(req.url, true).query.refresh === 'true';
        
        if (!forceRefresh && cachedPublishers && publishersCacheTime && (now - publishersCacheTime < PUBLISHERS_CACHE_DURATION)) {
          const remainingTime = Math.round((PUBLISHERS_CACHE_DURATION - (now - publishersCacheTime)) / 1000);
          console.log(` /api/publishers: Returning cached publishers (${remainingTime}s remaining)`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            publishers: cachedPublishers,
            cached: true,
            cacheTimeRemaining: remainingTime
          }));
          return;
        }

        console.log(' /api/publishers: Cache miss or refresh requested, fetching fresh data...');
        const configResult = await getDataverseConfig();
        console.log(' /api/publishers: Config result:', { 
          success: configResult.success, 
          hasDataverseUrl: !!configResult.dataverseUrl,
          hasClientId: !!configResult.clientId,
          hasClientSecret: !!configResult.clientSecret,
          hasTenantId: !!configResult.tenantId
        });
        
        if (!configResult.success) {
          console.log(' /api/publishers: Config failed, returning mock data');
          // Return mock data for development when Dataverse is not configured
          const mockPublishers = [
            {
              id: 'mock-default-publisher',
              uniqueName: 'DefaultPublisher',
              friendlyName: 'Default Publisher',
              description: 'Default system publisher',
              prefix: 'new',
              isDefault: true
            },
            {
              id: 'mock-custom-publisher',
              uniqueName: 'CustomPublisher',
              friendlyName: 'Custom Publisher',
              description: 'Custom publisher for custom entities',
              prefix: 'cust',
              isDefault: false
            }
          ];
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            publishers: mockPublishers,
            usingMockData: true
          }));
          return;
        }

        console.log(' /api/publishers: Config successful, creating Dataverse client...');
        const client = new DataverseClient(configResult);
        console.log(' /api/publishers: Client created, config:', {
          dataverseUrl: configResult.dataverseUrl,
          hasClientId: !!configResult.clientId,
          hasClientSecret: !!configResult.clientSecret,
          hasTenantId: !!configResult.tenantId
        });
        
        // Test connection first
        console.log(' /api/publishers: Testing Dataverse connection...');
        try {
          const connectionTest = await client.testConnection();
          console.log(' /api/publishers: Connection test result:', connectionTest);
          
          if (!connectionTest.success) {
            console.error(' /api/publishers: Connection test failed, returning mock data');
            throw new Error(`Connection test failed: ${connectionTest.message}`);
          }
        } catch (connectionError) {
          console.error(' /api/publishers: Connection test threw error:', connectionError.message);
          throw connectionError;
        }
        
        console.log(' /api/publishers: Connection successful, calling client.getPublishers()...');
        let publishers;
        try {
          publishers = await client.getPublishers();
          console.log(' /api/publishers: getPublishers() completed successfully');
        } catch (publishersError) {
          console.error(' /api/publishers: getPublishers() threw an error:', publishersError.message);
          console.error(' /api/publishers: Full error details:', publishersError);
          throw publishersError; // Re-throw to trigger the catch block
        }
        
        console.log(' /api/publishers: Publishers received:', publishers ? publishers.length : 'null/undefined');
        console.log(' /api/publishers: Publishers data:', JSON.stringify(publishers, null, 2));
        
        // If no publishers found, return mock data for development
        if (!publishers || publishers.length === 0) {
          console.log(' /api/publishers: No publishers found, returning mock data');
          const mockPublishers = [
            {
              id: 'mock-default-publisher',
              uniqueName: 'DefaultPublisher',
              friendlyName: 'Default Publisher',
              description: 'Default system publisher',
              prefix: 'new',
              isDefault: true
            },
            {
              id: 'mock-custom-publisher',
              uniqueName: 'CustomPublisher',
              friendlyName: 'Custom Publisher',
              description: 'Custom publisher for custom entities',
              prefix: 'cust',
              isDefault: false
            }
          ];
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            publishers: mockPublishers,
            usingMockData: true
          }));
          return;
        }
        
        console.log(' /api/publishers: Success! Returning', publishers.length, 'real publishers');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          publishers: publishers
        }));
      } catch (error) {
        console.error(' /api/publishers: ERROR occurred:', error.message);
        console.error(' /api/publishers: Error stack:', error.stack);
        console.error(' /api/publishers: Full error details:', error);
        
        // Check if it's an authentication error
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          console.error(' /api/publishers: Authentication failed - check Dataverse credentials');
        }
        
        // Check if it's a network error
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
          console.error(' /api/publishers: Network error - check Dataverse URL');
        }
        
        // Return mock data when there's an error accessing Dataverse
        const mockPublishers = [
          {
            id: 'mock-default-publisher',
            uniqueName: 'DefaultPublisher',
            friendlyName: 'Default Publisher',
            description: 'Default system publisher',
            prefix: 'new',
            isDefault: true
          },
          {
            id: 'mock-custom-publisher',
            uniqueName: 'CustomPublisher',
            friendlyName: 'Custom Publisher',
            description: 'Custom publisher for custom entities',
            prefix: 'cust',
            isDefault: false
          }
        ];
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          publishers: mockPublishers,
          usingMockData: true,
          error: error.message
        }));
      }
      
    } else if (pathname === '/api/cache/clear' && req.method === 'POST') {
      // Clear all caches
      console.log(' ENDPOINT HIT: /api/cache/clear - Clearing all caches');
      
      cachedPublishers = null;
      publishersCacheTime = null;
      cachedGlobalChoices = null;
      globalChoicesCacheTime = null;
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'All caches cleared successfully'
      }));

    } else if (pathname === '/api/global-choices-list' && req.method === 'GET') {
      // Get all global choice sets from Dataverse
      console.log(' ENDPOINT HIT: /api/global-choices-list - Request received');
      
      try {
        // Check cache first
        const now = Date.now();
        const forceRefresh = url.parse(req.url, true).query.refresh === 'true';
        
        if (!forceRefresh && cachedGlobalChoices && globalChoicesCacheTime && (now - globalChoicesCacheTime < GLOBAL_CHOICES_CACHE_DURATION)) {
          const remainingTime = Math.round((GLOBAL_CHOICES_CACHE_DURATION - (now - globalChoicesCacheTime)) / 1000);
          console.log(` /api/global-choices-list: Returning cached choices (${remainingTime}s remaining)`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            ...cachedGlobalChoices, // This includes all, grouped, summary
            cached: true,
            cacheTimeRemaining: remainingTime
          }));
          return;
        }

        console.log(' /api/global-choices-list: Cache miss or refresh requested, fetching fresh data...');
        const configResult = await getDataverseConfig();
        
        if (!configResult.success) {
          // Return mock data for development when Dataverse is not configured
          const mockChoiceSets = [
            {
              id: 'mock-status-choice',
              name: 'statuscode',
              displayName: 'Status Reason',
              options: [
                { value: 1, label: 'Active' },
                { value: 2, label: 'Inactive' }
              ]
            },
            {
              id: 'mock-priority-choice',
              name: 'prioritycode',
              displayName: 'Priority',
              options: [
                { value: 1, label: 'High' },
                { value: 2, label: 'Normal' },
                { value: 3, label: 'Low' }
              ]
            }
          ];
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            choiceSets: mockChoiceSets,
            usingMockData: true
          }));
          return;
        }

        console.log(' /api/global-choices-list: Creating Dataverse client...');
        const client = new DataverseClient(configResult);
        
        // Test connection
        const connectionTest = await client.testConnection();
        if (!connectionTest.success) {
          throw new Error(`Connection test failed: ${connectionTest.message}`);
        }
        
        console.log(' /api/global-choices-list: Fetching global choice sets...');
        const choiceData = await client.getGlobalChoiceSets();
        
        // Check if we got the new grouped structure or handle backward compatibility
        if (!choiceData || (!choiceData.all && !choiceData.length)) {
          console.log(' /api/global-choices-list: No choice sets found, returning mock data');
          const mockChoiceData = {
            all: [
              {
                id: 'mock-status-choice',
                name: 'statuscode',
                displayName: 'Status Reason',
                isCustom: false,
                category: 'Built-in',
                options: []
              }
            ],
            grouped: {
              custom: [],
              builtIn: [
                {
                  id: 'mock-status-choice',
                  name: 'statuscode',
                  displayName: 'Status Reason',
                  isCustom: false,
                  category: 'Built-in',
                  options: []
                }
              ]
            },
            summary: { total: 1, custom: 0, builtIn: 1 }
          };
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            ...mockChoiceData,
            usingMockData: true
          }));
          return;
        }

        // Cache the results
        cachedGlobalChoices = choiceData;
        globalChoicesCacheTime = now;
        
        console.log(` /api/global-choices-list: Successfully fetched ${choiceData.summary.total} choice sets (${choiceData.summary.custom} custom, ${choiceData.summary.builtIn} built-in), cached for ${GLOBAL_CHOICES_CACHE_DURATION/1000/60} minutes`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          ...choiceData, // This includes all, grouped, summary
          cached: false,
          fetchTime: now
        }));

      } catch (error) {
        console.error(' /api/global-choices-list: Error occurred:', error.message);
        
        // Return mock data on error with grouped structure
        const mockChoiceData = {
          all: [
            {
              id: 'mock-fallback-choice',
              name: 'statuscode',
              displayName: 'Status (Connection Failed)',
              isCustom: false,
              category: 'Built-in',
              options: []
            }
          ],
          grouped: {
            custom: [],
            builtIn: [
              {
                id: 'mock-fallback-choice',
                name: 'statuscode',
                displayName: 'Status (Connection Failed)',
                isCustom: false,
                category: 'Built-in',
                options: []
              }
            ]
          },
          summary: { total: 1, custom: 0, builtIn: 1 }
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          ...mockChoiceData,
          usingMockData: true,
          error: error.message
        }));
      }
      
    } else if (pathname === '/api/cdm-entities' && req.method === 'POST') {
      // Check CDM entity availability
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const configResult = await getDataverseConfig();
          
          if (!configResult.success) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'Dataverse configuration not available'
            }));
            return;
          }

          const client = new DataverseClient(configResult);
          const entityMap = await client.checkCDMEntities(data.entityNames || []);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            entities: entityMap
          }));
        } catch (error) {
          console.error(' Error checking CDM entities:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: error.message
          }));
        }
      });
      
    } else if (pathname === '/api/validate-erd' && req.method === 'POST') {
      // Enhanced ERD validation with detailed messages
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          
          if (!data.mermaidContent) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'mermaidContent is required'
            }));
            return;
          }

          try {
            // Parse and validate the ERD
            const parser = new MermaidERDParser();
            const parseResult = parser.parse(data.mermaidContent);
            
            // Get validation summary from parser
            const validationSummary = parser.getValidationSummary();
            
            // Add corrected ERD if there are warnings
            let responseData = {
              success: true,
              entities: parseResult.entities || [],
              relationships: parseResult.relationships || [],
              warnings: parseResult.warnings || [],
              validation: validationSummary,
              summary: {
                entityCount: parseResult.entities ? parseResult.entities.length : 0,
                relationshipCount: parseResult.relationships ? parseResult.relationships.length : 0,
                totalAttributes: parseResult.entities ? parseResult.entities.reduce((sum, entity) => sum + entity.attributes.length, 0) : 0
              }
            };

            // Include corrected ERD if there are warnings
            if (validationSummary.warnings && validationSummary.warnings.length > 0) {
              responseData.correctedERD = parser.generateCorrectedERD();
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(responseData));
          } catch (parseError) {
            console.error(' Error parsing ERD:', parseError);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: parseError.message,
              entities: [],
              relationships: [],
              warnings: [],
              validation: {
                isValid: false,
                status: 'error',
                errors: [{ message: parseError.message }],
                warnings: [],
                info: [],
                totalIssues: 1
              }
            }));
          }
        } catch (error) {
          console.error(' Error validating ERD:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: error.message
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
            console.error(' JSON Parse Error in /api/validate:', parseError.message);
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
          
          console.log(' Validating entities with options:', options);
          console.log(' Raw parsed entities received:', data.entities.length);
          
          // Generate Dataverse schema from parsed entities first
          const schema = await generateDataverseSchema(data.entities, [], options);
          if (!schema.success) {
            throw new Error(schema.error);
          }
          
          console.log(' Generated Dataverse entities:', schema.entities.length);
          
          // Get Dataverse config
          const dataverseConfigResult = await getDataverseConfig();
          if (!dataverseConfigResult.success) {
            throw new Error(dataverseConfigResult.error);
          }
          
          // Extract config directly from the result
          const dvConfig = {
            dataverseUrl: dataverseConfigResult.dataverseUrl,
            clientId: dataverseConfigResult.clientId,
            clientSecret: dataverseConfigResult.clientSecret,
            tenantId: dataverseConfigResult.tenantId,
            apiVersion: dataverseConfigResult.apiVersion || '9.2',
            verbose: dataverseConfigResult.verbose || true,
            authMethod: dataverseConfigResult.authMethod
          };
          
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
          console.error(' Validation error:', error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: 'Validation failed',
            error: error.message,
            timestamp: new Date().toISOString()
          }));
        }
      });
      
    } else if (pathname === '/api/test-publisher-creation' && req.method === 'POST') {
      // Test endpoint for isolating publisher creation
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          const { publisherName, publisherPrefix } = JSON.parse(body);
          
          console.log(`🧪 TEST: Creating publisher with name: "${publisherName}", prefix: "${publisherPrefix}"`);
          
          // Initialize DataverseClient
          const config = await getDataverseConfig();
          if (!config.success) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: false, 
              error: 'Configuration loading failed', 
              details: config.error 
            }));
            return;
          }

          const client = new DataverseClient({
            dataverseUrl: config.dataverseUrl,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            tenantId: config.tenantId,
            apiVersion: config.apiVersion || '9.2',
            verbose: true
          });

          console.log('🧪 TEST: Testing connection...');
          const connectionTest = await client.testConnection();
          if (!connectionTest.success) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: false, 
              error: 'Dataverse connection failed', 
              details: connectionTest.error 
            }));
            return;
          }

          console.log('🧪 TEST: Connection successful, creating publisher...');
          
          // Create publisher directly
          const publisherResult = await client.createPublisher({
            uniqueName: publisherName,
            friendlyName: publisherName,
            description: `Test publisher: ${publisherName}`,
            customizationPrefix: publisherPrefix,
            optionValuePrefix: 10000
          });

          console.log('🧪 TEST: Publisher creation result:', publisherResult);

          if (publisherResult.success) {
            // Try to fetch the created publisher
            console.log('🧪 TEST: Fetching created publisher...');
            const checkResult = await client.checkPublisherExists(publisherName);
            console.log('🧪 TEST: Check result:', checkResult);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              creation: publisherResult,
              verification: checkResult
            }));
          } else {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'Publisher creation failed',
              details: publisherResult
            }));
          }

        } catch (error) {
          console.error('🧪 TEST: Error during publisher test:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: error.message,
            stack: error.stack
          }));
        }
      });
      
    } else if (pathname === '/api/test-fetch-uni-publisher' && req.method === 'POST') {
      // Test endpoint to fetch the uni publisher
      try {
        console.log('🧪 TEST: Fetching uni publisher...');
        
        // Initialize DataverseClient
        const config = await getDataverseConfig();
        if (!config.success) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Configuration loading failed', 
            details: config.error 
          }));
          return;
        }

        const client = new DataverseClient({
          dataverseUrl: config.dataverseUrl,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          tenantId: config.tenantId,
          apiVersion: config.apiVersion || '9.2',
          verbose: true
        });

        console.log('🧪 TEST: Testing connection...');
        const connectionTest = await client.testConnection();
        if (!connectionTest.success) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Dataverse connection failed', 
            details: connectionTest.error 
          }));
          return;
        }

        console.log('🧪 TEST: Connection successful, checking for uniPublisher...');
        
        // Check for publisher with different names
        const testNames = ['uni', 'uniPublisher'];
        const results = {};
        
        for (const name of testNames) {
          console.log(`🧪 TEST: Checking for publisher: "${name}"`);
          const checkResult = await client.checkPublisherExists(name);
          console.log(`🧪 TEST: Result for "${name}":`, checkResult);
          results[name] = checkResult;
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          results: results
        }));

      } catch (error) {
        console.error('🧪 TEST: Error during publisher fetch test:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: error.message,
          stack: error.stack
        }));
      }
      
    } else if (pathname === '/api/test-config' && req.method === 'POST') {
      // Test endpoint to check configuration values
      try {
        console.log('🧪 TEST: Checking configuration...');
        
        const config = await getDataverseConfig();
        if (!config.success) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Configuration loading failed', 
            details: config.error 
          }));
          return;
        }

        // Return configuration info (without secrets for security)
        const configInfo = {
          success: true,
          dataverseUrl: config.dataverseUrl,
          tenantId: config.tenantId,
          clientId: config.clientId,
          clientSecretLength: config.clientSecret ? config.clientSecret.length : 0,
          clientSecretEmpty: !config.clientSecret || config.clientSecret.trim() === '',
          apiVersion: config.apiVersion || '9.2'
        };

        console.log('🧪 TEST: Configuration check results:', configInfo);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(configInfo));

      } catch (error) {
        console.error('🧪 TEST: Error during config test:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: error.message,
          stack: error.stack
        }));
      }
      
    } else if (pathname === '/api/deploy' && req.method === 'POST') {
      // Deploy to Dataverse
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          
          if (!data.mermaidContent) {
            throw new Error('Mermaid content is required');
          }
          
          // Parse Mermaid content
          const parser = new MermaidERDParser();
          const parseResult = parser.parse(data.mermaidContent);
          
          if (!parseResult.validation.isValid) {
            throw new Error(`Schema validation failed: ${parseResult.validation.errors.map(e => e.message).join(', ')}`);
          }
          
          // Prepare deployment options
          const options = {
            publisherPrefix: data.publisherData?.selectedPublisher ? 
              JSON.parse(data.publisherData.selectedPublisher).prefix : 
              data.publisherData?.newPublisher?.prefix || 'mmd',
            solutionName: data.solutionName || 'MermaidSolution',
            dryRun: data.dryRun || false,
            selectedCDMEntities: data.selectedCDMEntities || [],
            selectedChoices: data.selectedChoices || [],
            customChoices: data.customChoices
          };
          
          console.log(' Publisher data received:', JSON.stringify(data.publisherData, null, 2));
          console.log(' Extracted publisher prefix:', options.publisherPrefix);
          console.log(' Publisher type:', data.publisherData?.type);
          
          // Get Dataverse config
          const dataverseConfigResult = await getDataverseConfig();
          if (!dataverseConfigResult.success) {
            throw new Error(dataverseConfigResult.error);
          }
          
          // Extract config directly from the result (not from a nested config property)
          const dvConfig = {
            dataverseUrl: dataverseConfigResult.dataverseUrl,
            clientId: dataverseConfigResult.clientId,
            clientSecret: dataverseConfigResult.clientSecret,
            tenantId: dataverseConfigResult.tenantId,
            apiVersion: dataverseConfigResult.apiVersion || '9.2',
            verbose: dataverseConfigResult.verbose || true,
            authMethod: dataverseConfigResult.authMethod
          };
          
          const client = new DataverseClient(dvConfig);
          
          // Generate schema
          const schema = await generateDataverseSchema(
            parseResult.entities, 
            parseResult.relationships, 
            options
          );
          
          if (!schema.success) {
            throw new Error(schema.error);
          }
          
          let deploymentResult;
          
          if (options.dryRun) {
            // Dry run - just validate
            deploymentResult = {
              success: true,
              message: 'Dry run completed - no entities were created',
              entities: schema.entities.map(e => ({
                name: e.LogicalName,
                displayName: e.DisplayName?.UserLocalizedLabel?.Label,
                primaryNameAttribute: e.PrimaryNameAttribute
              })),
              dryRun: true
            };
          } else {
            // Actual deployment
            const results = [];
            let successCount = 0;
            let skipCount = 0;
            
            for (const entity of schema.entities) {
              try {
                const result = await client.createEntity(entity);
                if (result.success) {
                  successCount++;
                }
                results.push({
                  entityName: entity.LogicalName,
                  success: result.success,
                  message: result.message,
                  entityId: result.entityId
                });
              } catch (error) {
                // Check if it's a "already exists" error
                const isExistsError = error.message && (
                  error.message.includes('is not unique') || 
                  error.message.includes('already exists') ||
                  error.message.includes('0x80044363')
                );
                
                if (isExistsError) {
                  skipCount++;
                  results.push({
                    entityName: entity.LogicalName,
                    success: false,
                    skipped: true,
                    message: `Entity already exists: ${entity.LogicalName}`
                  });
                  console.log(` Skipped existing entity: ${entity.LogicalName}`);
                } else {
                  results.push({
                    entityName: entity.LogicalName,
                    success: false,
                    message: error.message
                  });
                  console.error(` Failed to create entity ${entity.LogicalName}:`, error.message);
                }
              }
            }
            
            const hasActualFailures = results.some(r => !r.success && !r.skipped);
            
            deploymentResult = {
              success: !hasActualFailures, // Success if no real failures (skipped entities are OK)
              message: `Deployment completed: ${successCount} created, ${skipCount} already existed, ${results.filter(r => !r.success && !r.skipped).length} failed`,
              results,
              dryRun: false,
              summary: {
                created: successCount,
                skipped: skipCount,
                failed: results.filter(r => !r.success && !r.skipped).length
              }
            };
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(deploymentResult, null, 2));
          
        } catch (error) {
          console.error(' Deployment error:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
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
          '/ (Upload Form)', '/wizard (Wizard UI)', '/upload (POST)', '/health', '/keyvault', 
          '/managed-identity', '/api/dataverse-config', '/api/global-choices (POST)', 
          '/api/validate (POST)', '/api/validate-erd (POST)', '/api/test-dataverse (POST)',
          '/api/publishers (GET)', '/api/global-choices-list (GET)', '/api/cdm-entities (POST)',
          '/api/deploy (POST)'
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

const PORT = process.env.PORT || 8082;

server.listen(PORT, () => {
  console.log(`Mermaid to Dataverse Server running on port ${PORT}`);
  console.log(`Configuration:
  - Azure SDK: ${azureSDKLoaded ? 'Loaded' : 'Not loaded'}
  - Key Vault: ${process.env.KEY_VAULT_URI || 'Not configured'}
  - Auth Mode: ${process.env.AUTH_MODE || 'default'}
  - Client ID: ${process.env.MANAGED_IDENTITY_CLIENT_ID || 'Not set'}
  - MSI Endpoint: ${process.env.MSI_ENDPOINT ? 'Available' : 'Not available'}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please stop other Node.js processes or use a different port.`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
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



