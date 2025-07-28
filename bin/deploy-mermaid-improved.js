/**
 * Improved Mermaid to Dataverse Deployment Script
 * 
 * - Sanitizes solution names (removes invalid characters)
 * - Validates publisher prefix
 * - Reduces verbosity in console output
 * - Handles errors gracefully
 */

// Import required modules
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import process from 'process';
import { fileURLToPath } from 'url';
import { DataverseClient } from '../../../src/dataverse-client.js';
import { MermaidERDParser } from '../../../src/parser.js';
import { DataverseSchemaGenerator } from '../../../src/schema-generator.js';

// Load .env file
dotenv.config();

// Banner display function
function showBanner(title, publisherPrefix, mermaidFile) {
  console.log(`
┌─────────────────────────────────────────────────┐
│                                                 │
│  ${title.padEnd(45)}│
│  Publisher: ${publisherPrefix.padEnd(34)}│
│  File: ${path.basename(mermaidFile).padEnd(37)}│
│                                                 │
└─────────────────────────────────────────────────┘
`);
}

// Main deployment function
async function deployMermaid(options = {}) {
  const {
    publisherPrefix = 'mint',
    mermaidFile = './examples/employee-projects.mmd',
    globalChoicesFile = './global-choices.json',
    verbose = false
  } = options;
  
  showBanner('Mermaid to Dataverse Deployment', publisherPrefix, mermaidFile);
  
  try {
    // Validate publisher prefix
    if (!publisherPrefix.match(/^[a-zA-Z0-9]+$/)) {
      throw new Error(`Invalid publisher prefix: ${publisherPrefix}. Only alphanumeric characters are allowed.`);
    }
    
    // Check if file exists
    if (!fs.existsSync(mermaidFile)) {
      throw new Error(`Mermaid file not found: ${mermaidFile}`);
    }
    
    // Read mermaid file
    const mermaidContent = fs.readFileSync(mermaidFile, 'utf8');
    
    // Parse mermaid content
    console.log("Parsing Mermaid diagram...");
    const parser = new MermaidERDParser();
    const parsedDiagram = parser.parse(mermaidContent);
    
    // Debug parsed diagram data
    console.log(`📊 Parsed Mermaid diagram - Entities: ${parsedDiagram.entities.length}, Relationships: ${parsedDiagram.relationships.length}`);
    if (parsedDiagram.entities.length === 0) {
      console.error("⚠️  No entities found in Mermaid diagram! Please check the file format.");
    }
    
    // Generate Dataverse schema
    console.log("Generating Dataverse schema...");
    const generator = new DataverseSchemaGenerator(publisherPrefix);
    const schema = await generator.generateSchema(parsedDiagram);
    
    // Debug generated schema
    console.log(`📊 Generated schema - Entities: ${schema.entities?.length || 0}, Columns: ${schema.additionalColumns?.length || 0}, Relationships: ${schema.relationships?.length || 0}, Global Choices: ${schema.globalChoiceSets?.length || 0}`);
    
    if (!schema.entities || schema.entities.length === 0) {
      console.error("⚠️  No entities generated in the schema! Check if schema generation is working correctly.");
    }
    
    // Initialize empty arrays if they don't exist to prevent "not iterable" errors
    if (!schema.entities) schema.entities = [];
    if (!schema.additionalColumns) schema.additionalColumns = [];
    if (!schema.relationships) schema.relationships = [];
    if (!schema.globalChoiceSets) schema.globalChoiceSets = [];
    
    // Load global choices from JSON file if it exists
    if (fs.existsSync(globalChoicesFile)) {
      try {
        console.log(`Loading global choices from ${path.basename(globalChoicesFile)}...`);
        const globalChoicesData = JSON.parse(fs.readFileSync(globalChoicesFile, 'utf8'));
        
        // Check if the file has the expected structure
        if (globalChoicesData.globalChoices && Array.isArray(globalChoicesData.globalChoices)) {
          // Convert the global choices to the format expected by the schema
          // Do not add the publisher prefix here - it will be added in the applyPublisherPrefix method
          const loadedChoices = globalChoicesData.globalChoices.map(choice => ({
            Name: choice.name.toLowerCase(),
            DisplayName: {
              LocalizedLabels: [{
                Label: choice.displayName,
                LanguageCode: 1033
              }]
            },
            Description: {
              LocalizedLabels: [{
                Label: choice.description || `Global choice set for ${choice.displayName}`,
                LanguageCode: 1033
              }]
            },
            IsGlobal: true,
            options: choice.options // Store options for separate creation
          }));
          
          console.log(`Loaded ${loadedChoices.length} global choice sets from file`);
          
          // Add or replace global choices in the schema
          schema.globalChoiceSets = loadedChoices;
        } else {
          console.log('⚠️  Invalid global choices file structure. Expected "globalChoices" array.');
        }
      } catch (error) {
        console.log(`⚠️  Error loading global choices: ${error.message}`);
      }
    } else {
      console.log(`⚠️  Global choices file not found: ${globalChoicesFile}`);
    }
    
    // Process the schema with publisher prefix
    console.log(`Adding publisher prefix to schema components: ${publisherPrefix}_`);
    applyPublisherPrefix(schema, publisherPrefix);
    
    // Initialize Dataverse client
    console.log("Initializing Dataverse client...");
    const client = new DataverseClient({
      dataverseUrl: process.env.DATAVERSE_URL,
      clientId: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      tenantId: process.env.TENANT_ID,
      verbose: verbose
    });
    
    // Generate solution name from file name
    const baseName = path.basename(mermaidFile, '.mmd');
    // Remove any invalid characters - only allow letters, numbers, and underscore
    const safeBaseName = baseName.replace(/[^a-zA-Z0-9_]/g, '');
    const solutionName = `${publisherPrefix}_${safeBaseName}`;
    const solutionDisplayName = `${publisherPrefix.toUpperCase()} ${baseName.replace(/[-_]/g, ' ')}`;
    
    // Create solution
    console.log(`Creating solution: ${solutionName}`);
    await client.ensureSolution(
      solutionName, 
      solutionDisplayName,
      publisherPrefix,
      { listPublishers: false, allowCreatePublisher: true }
    );
    
    // Set solution name for subsequent operations
    client.solutionName = solutionName;
    
    // Deploy schema to Dataverse
    console.log('Deploying schema to Dataverse...');
    const results = await client.createFromSchema(schema, {
      verbose: verbose,
      solutionName: solutionName,
      publisherPrefix: publisherPrefix
    });
    
    // Publish customizations
    await client.publishCustomizations();
    
    // Display summary
    showDeploymentSummary(results, solutionName, publisherPrefix);
    
    return results;
  } catch (error) {
    console.error('\n❌ Deployment Error:');
    console.error(`   ${error.message}`);
    if (error.response?.data) {
      console.error('   API Error Details:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Apply publisher prefix to all schema components
function applyPublisherPrefix(schema, prefix) {
  // Process entities - first check if entities is an array
  if (schema.entities && Array.isArray(schema.entities)) {
    schema.entities.forEach(entity => {
      if (!entity.LogicalName.startsWith(`${prefix}_`)) {
        entity.LogicalName = `${prefix}_${entity.LogicalName.toLowerCase()}`;
      }
      if (entity.SchemaName && !entity.SchemaName.startsWith(`${prefix}_`)) {
        entity.SchemaName = `${prefix}_${entity.SchemaName}`;
      }
    });
  }
  
  // Process columns/attributes
  if (schema.additionalColumns && Array.isArray(schema.additionalColumns)) {
    schema.additionalColumns.forEach(column => {
      // Update entity logical name
      if (!column.entityLogicalName.startsWith(`${prefix}_`)) {
        column.entityLogicalName = `${prefix}_${column.entityLogicalName.toLowerCase()}`;
      }
      
      // Update column logical name
      if (!column.columnMetadata.LogicalName.startsWith(`${prefix}_`)) {
        column.columnMetadata.LogicalName = `${prefix}_${column.columnMetadata.LogicalName.toLowerCase()}`;
      }
      
      // Update schema name
      if (column.columnMetadata.SchemaName && !column.columnMetadata.SchemaName.startsWith(`${prefix}_`)) {
        column.columnMetadata.SchemaName = `${prefix}_${column.columnMetadata.SchemaName}`;
      }
      
      // Update global choice set reference
      if (column.columnMetadata._globalChoiceSetName && !column.columnMetadata._globalChoiceSetName.startsWith(`${prefix}_`)) {
        column.columnMetadata._globalChoiceSetName = `${prefix}_${column.columnMetadata._globalChoiceSetName.toLowerCase()}`;
      }
    });
  }
  
  // Process relationships
  if (schema.relationships && Array.isArray(schema.relationships)) {
    schema.relationships.forEach(relationship => {
      // Update relationship name
      if (!relationship.SchemaName.startsWith(`${prefix}_`)) {
        relationship.SchemaName = `${prefix}_${relationship.SchemaName}`;
      }
      
      // Update referenced entity
      if (!relationship.ReferencedEntity.startsWith(`${prefix}_`)) {
        relationship.ReferencedEntity = `${prefix}_${relationship.ReferencedEntity.toLowerCase()}`;
      }
      
      // Update referencing entity
      if (!relationship.ReferencingEntity.startsWith(`${prefix}_`)) {
        relationship.ReferencingEntity = `${prefix}_${relationship.ReferencingEntity.toLowerCase()}`;
      }
    });
  }
  
  // Process global choice sets
  if (schema.globalChoiceSets && Array.isArray(schema.globalChoiceSets)) {
    schema.globalChoiceSets.forEach(choiceSet => {
      // Check if the choice set name already contains any prefix (like mmd_)
      const nameParts = choiceSet.Name.split('_');
      let baseName = choiceSet.Name;
      
      // If name contains a prefix like "mmd_", remove it
      if (nameParts.length > 1 && nameParts[0].match(/^[a-zA-Z]+$/)) {
        baseName = nameParts.slice(1).join('_');
      }
      
      // Apply the user-specified publisher prefix
      choiceSet.Name = `${prefix}_${baseName.toLowerCase()}`;
      
      if (choiceSet.ExternalName) {
        // Also clean up external name if present
        const externalNameParts = choiceSet.ExternalName.split('_');
        let baseExternalName = choiceSet.ExternalName;
        
        if (externalNameParts.length > 1 && externalNameParts[0].match(/^[a-zA-Z]+$/)) {
          baseExternalName = externalNameParts.slice(1).join('_');
        }
        
        choiceSet.ExternalName = `${prefix}_${baseExternalName}`;
      }
    });
  }
}

// Display deployment summary
function showDeploymentSummary(results, solutionName, publisherPrefix) {
  console.log('\n✅ Deployment completed successfully!');
  console.log(`┌───────────────────────────────────────────────┐`);
  console.log(`│ Deployment Summary                            │`);
  console.log(`├───────────────────────────────────────────────┤`);
  console.log(`│ Solution:      ${solutionName.padEnd(30)} │`);
  console.log(`│ Publisher:     ${publisherPrefix.padEnd(30)} │`);
  console.log(`│ Entities:      ${String(results.entities.length).padEnd(30)} │`);
  console.log(`│ Columns:       ${String(results.columns.length).padEnd(30)} │`);
  console.log(`│ Relationships: ${String(results.relationships.length).padEnd(30)} │`);
  
  if (results.errors.length > 0) {
    console.log(`├───────────────────────────────────────────────┤`);
    console.log(`│ ⚠️ Errors:      ${String(results.errors.length).padEnd(30)} │`);
  }
  
  console.log(`└───────────────────────────────────────────────┘`);
  
  if (results.errors.length > 0) {
    console.log('\n⚠️ Errors:');
    results.errors.forEach(error => {
      console.log(`   - ${error.type}: ${error.error}`);
    });
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let publisherPrefix = 'mint';
  let mermaidFile = './examples/employee-projects.mmd';
  let globalChoicesFile = './global-choices.json';
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--publisher=')) {
      publisherPrefix = arg.substring('--publisher='.length);
    } else if (arg.startsWith('--file=')) {
      mermaidFile = arg.substring('--file='.length);
    } else if (arg.startsWith('--choices=')) {
      globalChoicesFile = arg.substring('--choices='.length);
    } else if (arg === '--verbose') {
      verbose = true;
    }
  }

  return { publisherPrefix, mermaidFile, globalChoicesFile, verbose };
}

// Execute if run directly
const args = parseArgs();
deployMermaid(args).catch(console.error);
