#!/usr/bin/env node

/**
 *   .option('-s, --solution <name>', 'Solution name to create entities in (will prompt if not provided)')ermaid to Dataverse Converter CLI
 * Main entry point for the application
 */

import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { config } from 'dotenv';
import process from 'process';
import readline from 'readline/promises';
import { MermaidERDParser } from './parser.js';
import { DataverseSchemaGenerator } from './schema-generator.js';
import { DataverseClient } from './dataverse-client.js';

// Load environment variables
config();

const program = new Command();

program
  .name('mermaid-to-dataverse')
  .description('Convert Mermaid ERD diagrams to Microsoft Dataverse tables and relationships\n\nQuick start: npm start create examples/ecommerce-erd.mmd')
  .version('1.0.0');

program
  .command('convert')
  .description('Convert a Mermaid ERD file to Dataverse entities')
  .option('-i, --input <file>', 'Input Mermaid ERD file path')
  .option('-o, --output <file>', 'Output JSON schema file (optional)')
  .option('-s, --solution <name>', 'Solution name to create entities in (required for Dataverse creation)')
  .option('--dry-run', 'Preview the conversion without creating entities')
  .option('--verbose', 'Show detailed output')
  .option('--publisher-prefix <prefix>', 'Custom publisher prefix (default: mmd)', 'mmd')
  .option('--list-publishers', 'List available publishers before creating solution')
  .option('--no-create-publisher', 'Do not create publisher if it doesn\'t exist (fail instead)')
  .action(async (options) => {
    try {
      await convertMermaidToDataverse(options);
    } catch (error) {
      console.error('❌ Conversion failed:', error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Add a simple shortcut command for quick conversion
program
  .command('create [erdFile]')
  .description('Quick convert: Create Dataverse solution from ERD file (interactive)')
  .option('--dry-run', 'Preview the conversion without creating entities')
  .option('--verbose', 'Show detailed output')
  .option('--publisher-prefix <prefix>', 'Custom publisher prefix (default: mmd)', 'mmd')
  .action(async (erdFile, options) => {
    try {
      // If no erdFile provided, prompt for it
      if (!erdFile) {
        const { createInterface } = await import('readline/promises');
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        console.log('🚀 Mermaid to Dataverse Converter');
        console.log('================================');
        console.log('📁 Available examples:');
        console.log('   - examples/ecommerce-erd.mmd');
        console.log('   - examples/hr-system-erd.mmd\n');
        
        erdFile = await rl.question('📄 Enter ERD file path: ');
        rl.close();
        
        if (!erdFile.trim()) {
          console.error('❌ ERD file path is required');
          process.exit(1);
        }
      }
      
      // Set the input file and call the main convert function
      options.input = erdFile;
      await convertMermaidToDataverse(options);
    } catch (error) {
      console.error('❌ Conversion failed:', error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate a Mermaid ERD file syntax')
  .option('-i, --input <file>', 'Input Mermaid ERD file path')
  .action(async (options) => {
    try {
      await validateMermaidFile(options);
    } catch (error) {
      console.error('❌ Validation failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('publishers')
  .description('List available publishers in Dataverse')
  .action(async (options) => {
    try {
      await listPublishers(options);
    } catch (error) {
      console.error('❌ Failed to list publishers:', error.message);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Show current configuration')
  .action(() => {
    showConfiguration();
  });

program.parse();

/**
 * Create readline interface for user prompts
 */
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Generate a safe unique name for Dataverse solution
 * @param {string} displayName - User-friendly display name
 * @returns {string} Safe unique name (PascalCase, no spaces, special chars)
 */
function generateSolutionUniqueName(displayName) {
  if (!displayName) return displayName;
  
  // Create a safe unique name from display name using PascalCase convention
  let uniqueName = displayName
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special chars except spaces
    .split(/\s+/) // Split on whitespace
    .filter(word => word.length > 0) // Remove empty strings
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // PascalCase each word
    .join(''); // Join without separators
  
  // Ensure it starts with a letter
  if (uniqueName && !/^[a-zA-Z]/.test(uniqueName)) {
    uniqueName = 'Solution' + uniqueName;
  }
  
  // Limit length (Dataverse has limits)
  if (uniqueName.length > 100) {
    uniqueName = uniqueName.substring(0, 100);
  }
  
  return uniqueName;
}

/**
 * Sanitize publisher prefix to meet Dataverse requirements
 * @param {string} prefix - Raw publisher prefix
 * @returns {string} Sanitized publisher prefix
 */
/**
 * Sanitize publisher prefix to meet Dataverse requirements
 * @param {string} prefix - Raw publisher prefix
 * @returns {string} Sanitized publisher prefix
 */
function sanitizePublisherPrefix(prefix) {
  if (!prefix) return prefix;
  
  // Publisher prefix should be 2-8 characters, lowercase letters only
  let sanitized = prefix
    .toLowerCase()
    .replace(/[^a-z]/g, '') // Only lowercase letters
    .substring(0, 8); // Max 8 characters
  
  // Ensure minimum length
  if (sanitized.length < 2) {
    sanitized = 'mmd'; // Fallback to default
  }
  
  return sanitized;
}

/**
 * Prompt user for input with a default value
 * @param {Object} rl - Readline interface
 * @param {string} question - Question to ask
 * @param {string} defaultValue - Default value if user presses enter
 * @returns {Promise<string>} User input or default value
 */
async function promptWithDefault(rl, question, defaultValue = '') {
  const answer = await rl.question(question);
  return answer.trim() || defaultValue;
}

/**
 * Interactive prompts for solution creation
 * @param {Object} options - Current CLI options
 * @returns {Promise<Object>} Updated options with user input
 */
async function promptForSolutionDetails(options) {
  const rl = createReadlineInterface();
  
  try {
    console.log('📝 Solution Configuration');
    console.log('========================\n');
    
    // Prompt for solution name if not provided
    if (!options.solution) {
      console.log('💡 Solution names will be displayed exactly as you enter them in Dataverse.');
      console.log('   You can use spaces and descriptive names like:');
      console.log('   • "Customer Management System"');
      console.log('   • "Inventory Tracker 2025"');
      console.log('   • "HR Portal - Employee Data"');
      console.log('   ✅ Spaces and special characters are welcome!\n');
      
      const solutionDisplayName = await promptWithDefault(
        rl, 
        '📦 Enter solution display name (required): '
      );
      
      if (!solutionDisplayName) {
        throw new Error('Solution name is required to create entities in Dataverse.');
      }
      
      // Generate a safe unique name for internal use
      const solutionUniqueName = generateSolutionUniqueName(solutionDisplayName);
      
      console.log(`\n✅ Solution configured:`);
      console.log(`   📦 Display Name: "${solutionDisplayName}"`);
      console.log(`   🔧 Technical Name: "${solutionUniqueName}"`);
      
      // Store both names in options
      options.solution = solutionUniqueName;
      options.solutionDisplayName = solutionDisplayName;
    }
    
    // Ensure publisher prefix has a default value
    if (!options.publisherPrefix) {
      options.publisherPrefix = 'mmd';
    }
    
    // Prompt for publisher prefix if using default
    if (options.publisherPrefix === 'mmd') {
      console.log('\n💡 Publisher prefix should be 2-8 characters, unique to your organization.');
      console.log('   Examples: "contoso", "fabrikam", "acme", "myorg"');
      console.log('   ⚠️  Note: Only lowercase letters allowed, other characters will be removed.');
      console.log('   This will be used to prefix all entity and field names.\n');
      
      const publisherPrefix = await promptWithDefault(
        rl,
        `🏷️  Enter publisher prefix (default: ${options.publisherPrefix}): `,
        options.publisherPrefix
      );
      
      // Sanitize the publisher prefix
      const sanitizedPrefix = sanitizePublisherPrefix(publisherPrefix);
      
      if (sanitizedPrefix !== publisherPrefix) {
        console.log(`\n⚠️  Publisher prefix sanitized: "${publisherPrefix}" → "${sanitizedPrefix}"`);
        console.log('   (Only lowercase letters allowed, 2-8 characters)');
      }
      
      options.publisherPrefix = sanitizedPrefix;
    }
    
    // Show summary
    console.log('\n✅ Configuration Summary:');
    console.log(`   📦 Solution: ${options.solutionDisplayName || options.solution}`);
    console.log(`   🏷️  Publisher Prefix: ${options.publisherPrefix}`);
    console.log(`   📄 Input File: ${options.input}`);
    
    if (options.dryRun) {
      console.log('   🔍 Mode: Dry Run (preview only)');
    }
    
    console.log('');
    
    const confirm = await promptWithDefault(
      rl,
      '❓ Continue with this configuration? (Y/n): ',
      'Y'
    );
    
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log('❌ Operation cancelled by user.');
      process.exit(0);
    }
    
    return options;
    
  } finally {
    rl.close();
  }
}

/**
 * Convert Mermaid ERD to Dataverse entities
 * @param {Object} options - CLI options
 */
async function convertMermaidToDataverse(options) {
  console.log('🚀 Mermaid to Dataverse Converter');
  console.log('================================\n');

  // Validate input
  if (!options.input) {
    throw new Error('Input file is required. Use -i or --input option.');
  }

  if (!existsSync(options.input)) {
    throw new Error(`Input file not found: ${options.input}`);
  }

  // For non-dry-run operations, prompt for solution details interactively
  if (!options.dryRun && !options.output) {
    options = await promptForSolutionDetails(options);
  }

  // Validate solution name for actual Dataverse operations (not for dry run or output only)
  if (!options.dryRun && !options.output && !options.solution) {
    throw new Error('Solution name is required for Dataverse operations. Use -s or --solution option.');
  }

  // Read and parse Mermaid file
  console.log(`📖 Reading Mermaid ERD file: ${options.input}`);
  const mermaidContent = readFileSync(options.input, 'utf-8');

  console.log('🔍 Parsing Mermaid ERD...');
  const parser = new MermaidERDParser();
  const erdData = parser.parse(mermaidContent);

  if (options.verbose) {
    console.log('📋 Parsed ERD Data:');
    console.log(`   Entities: ${erdData.entities.length}`);
    erdData.entities.forEach(entity => {
      console.log(`     - ${entity.name} (${entity.attributes.length} attributes)`);
    });
    console.log(`   Relationships: ${erdData.relationships.length}`);
    erdData.relationships.forEach(rel => {
      console.log(`     - ${rel.fromEntity} ${rel.cardinality.type} ${rel.toEntity}`);
    });
    console.log();
  }

  // Generate Dataverse schema
  console.log('🏗️  Generating Dataverse schema...');
  const schemaGenerator = new DataverseSchemaGenerator();
  
  // Set custom publisher prefix if provided
  if (options.publisherPrefix) {
    schemaGenerator.publisherPrefix = options.publisherPrefix;
  }
  
  const schema = schemaGenerator.generateSchema(erdData);

  // Output schema to file if requested
  if (options.output) {
    const { writeFileSync } = await import('fs');
    writeFileSync(options.output, JSON.stringify(schema, null, 2));
    console.log(`💾 Schema saved to: ${options.output}`);
    
    // If only outputting schema (no dry run), exit here
    if (!options.dryRun) {
      console.log('✅ Schema export completed.');
      return;
    }
  }

  // If dry run, just show the schema and exit
  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - Schema Preview:');
    console.log('=================================');
    
    console.log('\n📊 Entities to be created:');
    schema.entities.forEach(entity => {
      console.log(`   - ${entity.LogicalName} (${entity.DisplayName.LocalizedLabels[0].Label})`);
      if (entity.Attributes) {
        entity.Attributes.forEach(attr => {
          console.log(`     * ${attr.LogicalName} (${attr['@odata.type'].split('.').pop()})`);
        });
      }
    });

    // Show additional columns that will be created after entities
    if (schema.additionalColumns && schema.additionalColumns.length > 0) {
      console.log('\n🏛️  Additional columns to be created:');
      const columnsByEntity = {};
      schema.additionalColumns.forEach(col => {
        if (!columnsByEntity[col.entityLogicalName]) {
          columnsByEntity[col.entityLogicalName] = [];
        }
        columnsByEntity[col.entityLogicalName].push(col.columnMetadata);
      });
      
      Object.entries(columnsByEntity).forEach(([entityName, columns]) => {
        const entity = schema.entities.find(e => e.LogicalName === entityName);
        const displayName = entity ? entity.DisplayName.LocalizedLabels[0].Label : entityName;
        console.log(`   - ${entityName} (${displayName}):`);
        columns.forEach(col => {
          console.log(`     * ${col.LogicalName} (${col['@odata.type'].split('.').pop()})`);
        });
      });
    }

    console.log('\n🔗 Relationships to be created:');
    schema.relationships.forEach(rel => {
      console.log(`   - ${rel.SchemaName} (${rel.RelationshipType})`);
    });

    console.log('\n✅ Dry run completed. Use without --dry-run to create entities in Dataverse.');
    return;
  }

  // Create entities in Dataverse
  console.log('🌐 Connecting to Dataverse...');
  
  const dataverseConfig = {
    dataverseUrl: process.env.DATAVERSE_URL,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    tenantId: process.env.TENANT_ID
  };

  // Validate configuration
  const missingConfig = Object.entries(dataverseConfig)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

  if (missingConfig.length > 0) {
    throw new Error(`Missing required environment variables: ${missingConfig.join(', ')}`);
  }

  const client = new DataverseClient(dataverseConfig);

  console.log('🔐 Authenticating...');
  await client.authenticate();
  console.log('✅ Authentication successful');

  console.log('\n🏗️  Creating entities and relationships...');
  
  // Debug: Log the options being passed
  if (options.verbose) {
    console.log('🔍 Debug - Options being passed to createFromSchema:');
    console.log(`   solutionName: ${options.solution}`);
    console.log(`   publisherPrefix: ${options.publisherPrefix}`);
    console.log(`   verbose: ${options.verbose}`);
  }
  
  const results = await client.createFromSchema(schema, {
    dryRun: false,
    verbose: options.verbose,
    solutionName: options.solution,
    solutionDisplayName: options.solutionDisplayName,
    publisherPrefix: options.publisherPrefix,
    listPublishers: options.listPublishers,
    createPublisher: options.createPublisher !== false // default true unless --no-create-publisher
  });

  // Final summary
  console.log('\n🎉 Conversion completed!');
  if (options.solution) {
    console.log(`   Solution: ${options.solutionDisplayName || options.solution}`);
  }
  console.log(`   Entities created: ${results.entities.length}`);
  console.log(`   Relationships created: ${results.relationships.length}`);
  
  if (results.errors.length > 0) {
    console.log(`   Errors: ${results.errors.length}`);
    console.log('\n⚠️  Some items could not be created. Check the logs above for details.');
  }

  console.log(`\n🌐 Visit your Dataverse environment to see the created entities:`);
  console.log(`   ${dataverseConfig.dataverseUrl}`);
}

/**
 * Validate Mermaid file syntax
 * @param {Object} options - CLI options
 */
async function validateMermaidFile(options) {
  if (!options.input) {
    throw new Error('Input file is required. Use -i or --input option.');
  }

  if (!existsSync(options.input)) {
    throw new Error(`Input file not found: ${options.input}`);
  }

  console.log(`🔍 Validating Mermaid ERD file: ${options.input}`);
  
  const mermaidContent = readFileSync(options.input, 'utf-8');
  const parser = new MermaidERDParser();
  
  try {
    const erdData = parser.parse(mermaidContent);
    
    console.log('✅ Mermaid ERD file is valid!');
    console.log(`   Found ${erdData.entities.length} entities and ${erdData.relationships.length} relationships`);
    
    // Show detailed validation results
    console.log('\n📊 Entities:');
    erdData.entities.forEach(entity => {
      console.log(`   - ${entity.name}`);
      entity.attributes.forEach(attr => {
        const constraints = [];
        if (attr.isPrimaryKey) constraints.push('PK');
        if (attr.isForeignKey) constraints.push('FK');
        if (attr.isUnique) constraints.push('UK');
        if (attr.isRequired) constraints.push('Required');
        
        const constraintsStr = constraints.length > 0 ? ` (${constraints.join(', ')})` : '';
        console.log(`     * ${attr.name}: ${attr.type}${constraintsStr}`);
      });
    });

    console.log('\n🔗 Relationships:');
    erdData.relationships.forEach(rel => {
      console.log(`   - ${rel.fromEntity} ${rel.cardinality.type} ${rel.toEntity}`);
    });

  } catch (error) {
    console.log('❌ Mermaid ERD file has syntax errors:');
    console.log(`   ${error.message}`);
    throw error;
  }
}

/**
 * List available publishers in Dataverse
 * @param {Object} options - CLI options
 */
async function listPublishers(options) {
  console.log('📋 Dataverse Publishers');
  console.log('=======================\n');

  // Get Dataverse configuration
  const dataverseConfig = {
    dataverseUrl: process.env.DATAVERSE_URL,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    tenantId: process.env.TENANT_ID
  };

  // Validate configuration
  const missingConfig = Object.entries(dataverseConfig)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

  if (missingConfig.length > 0) {
    throw new Error(`Missing required environment variables: ${missingConfig.join(', ')}`);
  }

  const client = new DataverseClient(dataverseConfig);

  console.log('🔐 Authenticating...');
  await client.authenticate();
  console.log('✅ Authentication successful\n');

  console.log('📋 Fetching publishers...');
  const publishers = await client.getPublishers();

  if (publishers.length === 0) {
    console.log('   No publishers found in this environment.');
    return;
  }

  console.log('\n┌────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ Available Publishers                                                           │');
  console.log('├─────────┬─────────────────────────────────┬─────────────────────────────────────┤');
  console.log('│ Prefix  │ Name                            │ Description                         │');
  console.log('├─────────┬─────────────────────────────────┬─────────────────────────────────────┤');

  publishers.forEach(pub => {
    const prefix = (pub.customizationprefix || '').substring(0, 7).padEnd(7);
    const name = (pub.friendlyname || '').substring(0, 31).padEnd(31);
    const desc = (pub.description || '').substring(0, 35).padEnd(35);
    console.log(`│ ${prefix} │ ${name} │ ${desc} │`);
  });

  console.log('└─────────┴─────────────────────────────────┴─────────────────────────────────────┘');
  
  console.log(`\n✅ Found ${publishers.length} publishers`);
  console.log('\nTo use a specific publisher when creating a solution:');
  console.log('  node src/index.js convert --input your-file.mmd --solution YourSolution --publisher-prefix <prefix>');
}

/**
 * Show current configuration
 */
function showConfiguration() {
  console.log('⚙️  Current Configuration:');
  console.log('========================');
  
  const configs = [
    { name: 'Dataverse URL', env: 'DATAVERSE_URL', value: process.env.DATAVERSE_URL },
    { name: 'Client ID', env: 'CLIENT_ID', value: process.env.CLIENT_ID },
    { name: 'Client Secret', env: 'CLIENT_SECRET', value: process.env.CLIENT_SECRET ? '[SET]' : undefined },
    { name: 'Tenant ID', env: 'TENANT_ID', value: process.env.TENANT_ID }
  ];

  configs.forEach(config => {
    const status = config.value ? '✅' : '❌';
    const value = config.value || '[NOT SET]';
    console.log(`${status} ${config.name}: ${value}`);
  });

  console.log('\n💡 Configuration Help:');
  console.log('• If values are missing, run: node scripts/setup.cjs');
  console.log('• For manual setup, see: docs/entra-id-setup.md');
}
