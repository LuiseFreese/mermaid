/**
 * Mermaid to Dataverse Deployment CLI
 * 
 * This script deploys a Mermaid diagram to Dataverse with command-line arguments
 * for publisher prefix, Mermaid file path, and solution name.
 * 
 * Usage:
 *   node deploy-mermaid-cli.js --publisher=myprefix --file=./examples/employee-projects.mmd
 */

// Import required dependencies
import { DataverseClient } from '../../../src/dataverse-client.js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import process from 'process';

// Import the Mermaid converter
import * as mermaidConverter from '../../../src/index.js';
const { parseMermaid, generateDataverseSchema } = mermaidConverter;

// Get the directory name for relative paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
const envResult = dotenv.config();
if (envResult.error) {
  console.error('Error loading .env file:', envResult.error);
}

// Parse command line arguments
function parseArgs() {
  const args = {};
  const rawArgs = process.argv.slice(2);
  
  for (const arg of rawArgs) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      args[key] = value || true;
    }
  }
  
  return args;
}

const args = parseArgs();

// Configuration - With defaults that can be overridden by command line arguments
const config = {
  // Dataverse Connection - from .env file
  dataverseUrl: envResult.parsed?.DATAVERSE_URL,
  clientId: envResult.parsed?.CLIENT_ID,
  clientSecret: envResult.parsed?.CLIENT_SECRET,
  tenantId: envResult.parsed?.TENANT_ID,
  
  // Deployment settings - can be overridden by command line arguments
  publisherPrefix: args.publisher || "mint",
  mermaidFile: args.file || "./examples/employee-projects.mmd",
  solutionName: args.solution || null, // Will be generated based on publisher and file name
  verbose: args.verbose || true
};

// Print banner
console.log(`
┌─────────────────────────────────────────────────┐
│                                                 │
│  Mermaid to Dataverse Deployment                │
│  with Publisher: ${config.publisherPrefix.padEnd(24)}│
│                                                 │
└─────────────────────────────────────────────────┘
`);

// Main function
async function deployMermaid() {
  try {
    // Read the Mermaid diagram file
    console.log(`📄 Reading Mermaid file: ${config.mermaidFile}`);
    const mermaidContent = fs.readFileSync(config.mermaidFile, 'utf8');
    
    // Parse Mermaid content
    console.log('🔍 Parsing Mermaid diagram...');
    const parsedDiagram = parseMermaid(mermaidContent);
    
    // Generate Dataverse schema
    console.log('🏗️ Generating Dataverse schema...');
    const schema = generateDataverseSchema(parsedDiagram);
    
    // Add publisher prefix to all components
    const prefix = config.publisherPrefix;
    console.log(`🔖 Adding publisher prefix '${prefix}_' to all components...`);
    
    // Process entities
    if (schema.entities) {
      schema.entities.forEach(entity => {
        if (!entity.LogicalName.startsWith(`${prefix}_`)) {
          entity.LogicalName = `${prefix}_${entity.LogicalName.toLowerCase()}`;
        }
        if (entity.SchemaName && !entity.SchemaName.startsWith(`${prefix}_`)) {
          entity.SchemaName = `${prefix}_${entity.SchemaName}`;
        }
      });
    }
    
    // Process columns
    if (schema.additionalColumns) {
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
    if (schema.relationships) {
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
    
    // Extract global choice sets from the schema
    const globalChoiceSets = extractGlobalChoices(schema, prefix);
    console.log(`🎨 Found ${globalChoiceSets.length} global choice sets to create`);
    
    // Generate solution name if not provided
    if (!config.solutionName) {
      // Get filename without extension and path
      const filename = config.mermaidFile.split('/').pop().split('\\').pop();
      const baseName = filename.split('.')[0].replace(/[^a-zA-Z0-9]/g, '');
      config.solutionName = `${prefix}_${baseName.toLowerCase()}`;
    }
    console.log(`🎯 Using solution name: ${config.solutionName}`);
    
    // Initialize DataverseClient
    console.log('🔐 Initializing Dataverse client...');
    const client = new DataverseClient({
      dataverseUrl: config.dataverseUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      tenantId: config.tenantId,
      verbose: config.verbose
    });
    
    // Create or ensure the solution exists
    const solutionDisplayName = config.solutionName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    console.log(`🎯 Creating/ensuring solution: ${config.solutionName}`);
    
    await client.ensureSolution(
      config.solutionName,
      solutionDisplayName,
      prefix,
      {
        listPublishers: true,
        allowCreatePublisher: true
      }
    );
    
    // Set the solution name for subsequent operations
    client.solutionName = config.solutionName;
    
    // Create global choice sets
    if (globalChoiceSets.length > 0) {
      console.log('🎨 Creating global choice sets...');
      
      const choiceResults = await client.createGlobalChoiceSets(globalChoiceSets, {
        verbose: true,
        solutionName: config.solutionName
      });
      
      console.log(`✅ Created/found ${choiceResults.created.length + choiceResults.existing.length} global choice sets`);
    }
    
    // Deploy the schema to Dataverse
    console.log('🚀 Deploying schema to Dataverse...');
    const results = await client.createFromSchema(schema, {
      verbose: true,
      solutionName: config.solutionName,
      publisherPrefix: prefix
    });
    
    // Publish customizations
    await client.publishCustomizations();
    
    // Display summary
    console.log('\n✅ Deployment completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Solution: ${config.solutionName}`);
    console.log(`   - Publisher: ${prefix}`);
    console.log(`   - Entities created: ${results.entities.length}`);
    console.log(`   - Columns created: ${results.columns.length}`);
    console.log(`   - Relationships created: ${results.relationships.length}`);
    console.log(`   - Global choice sets created: ${globalChoiceSets.length}`);
    
    if (results.errors.length > 0) {
      console.log(`\n⚠️ Errors encountered: ${results.errors.length}`);
      results.errors.forEach(error => {
        console.log(`   - ${error.type}: ${error.error}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response?.data) {
      console.error('API Error Details:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Function to extract global choice sets from schema
function extractGlobalChoices(schema, prefix) {
  const choiceSets = new Map();
  
  if (schema.additionalColumns) {
    for (const column of schema.additionalColumns) {
      if (column.columnMetadata._globalChoiceSetName) {
        const choiceName = column.columnMetadata._globalChoiceSetName;
        
        if (!choiceSets.has(choiceName)) {
          // Try to get a better display name from the column display name
          let displayName = choiceName.replace(/^[^_]+_/, ''); // Remove prefix
          displayName = displayName.replace(/choice$/i, ''); // Remove "choice" suffix if present
          
          // Extract entity and field name for better choice options
          const entityName = column.entityLogicalName.replace(/^[^_]+_/, '');
          const fieldName = column.columnMetadata.LogicalName.replace(/^[^_]+_/, '');
          
          // Create better default options based on field name
          let options = [];
          
          if (fieldName.includes('status')) {
            options = ['Active', 'Pending', 'Completed', 'Cancelled'];
          } else if (fieldName.includes('priority')) {
            options = ['Low', 'Medium', 'High', 'Critical'];
          } else if (fieldName.includes('department')) {
            options = ['IT', 'HR', 'Finance', 'Marketing', 'Sales', 'Operations'];
          } else if (fieldName.includes('position')) {
            options = ['Manager', 'Developer', 'Analyst', 'Designer', 'Intern'];
          } else {
            options = [`Option 1`, `Option 2`, `Option 3`];
          }
          
          choiceSets.set(choiceName, {
            Name: choiceName,
            DisplayName: displayName.charAt(0).toUpperCase() + displayName.slice(1), // Capitalize
            Description: `Choice options for ${entityName} ${fieldName}`,
            options: options
          });
        }
      }
    }
  }
  
  return Array.from(choiceSets.values());
}

// Execute the deployment
deployMermaid().catch(console.error);
