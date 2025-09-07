/**
 * Test Schema Generation
 * This script tests the Mermaid parsing and schema generation functionality
 * without actually deploying to Dataverse
 */

/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires */

const fs = require('fs');
const path = require('path');

// Import our CommonJS modules
const { MermaidERDParser } = require('../src/backend/mermaid-parser.js');

// Test function
async function testSchemaGeneration(mermaidFilePath, publisherPrefix = 'test') {
  console.log('🧪 Testing Mermaid parsing and schema generation...');
  console.log(`📄 File: ${mermaidFilePath}`);
  console.log(`🏷️  Publisher Prefix: ${publisherPrefix}`);
  
  try {
    // Check if file exists
    if (!fs.existsSync(mermaidFilePath)) {
      throw new Error(`Mermaid file not found: ${mermaidFilePath}`);
    }

    // Read Mermaid file
    const mermaidContent = fs.readFileSync(mermaidFilePath, 'utf8');
    console.log(`📊 Read ${mermaidContent.length} characters from file`);
    
    // Validate Mermaid content
    if (!mermaidContent.trim().includes('erDiagram')) {
      throw new Error('Invalid Mermaid file: Must contain "erDiagram" declaration');
    }
    
    // Parse Mermaid content
    console.log("Parsing Mermaid ERD diagram...");
    const parser = new MermaidERDParser();
    const parsedResult = parser.parse(mermaidContent);
    
    // Validate parsing results
    if (!parsedResult.entities || !Array.isArray(parsedResult.entities)) {
      throw new Error('Parsing failed: No entities found');
    }
    
    if (!parsedResult.relationships || !Array.isArray(parsedResult.relationships)) {
      throw new Error('Parsing failed: No relationships array found');
    }
    
    // Display parsing results
    console.log("\n📋 PARSING RESULTS:");
    console.log("==================");
    console.log(`Entities:  ${parsedResult.entities.length} found`);
    console.log(`Relationships:  ${parsedResult.relationships.length} found`);
    
    // Display entity details
    if (parsedResult.entities.length > 0) {
      console.log("\n🏛️  ENTITIES:");
      parsedResult.entities.forEach((entity, index) => {
        console.log(`  ${index + 1}. ${entity.name} (${entity.attributes.length} attributes)`);
        entity.attributes.forEach(attr => {
          const keyInfo = attr.isPrimaryKey ? ' [PK]' : attr.isForeignKey ? ' [FK]' : '';
          console.log(`     - ${attr.name}: ${attr.type}${keyInfo}`);
        });
      });
    }
    
    // Display relationship details
    if (parsedResult.relationships.length > 0) {
      console.log("\n🔗 RELATIONSHIPS:");
      parsedResult.relationships.forEach((rel, index) => {
        console.log(`  ${index + 1}. ${rel.fromEntity} → ${rel.toEntity} (${rel.cardinality?.type || 'unknown'})`);
      });
    }
    
    // Test schema generation logic (simplified version of what server.js does)
    console.log("\n🏗️  TESTING SCHEMA GENERATION:");
    console.log("===============================");
    
    const totalAttributes = parsedResult.entities.reduce((sum, entity) => sum + entity.attributes.length, 0);
    const primaryKeys = parsedResult.entities.filter(entity => 
      entity.attributes.some(attr => attr.isPrimaryKey)
    ).length;
    
    console.log(`Total Attributes: ${totalAttributes}`);
    console.log(`Entities with Primary Keys: ${primaryKeys}/${parsedResult.entities.length}`);
    
    // Validate that all entities have primary keys
    const entitiesWithoutPK = parsedResult.entities.filter(entity => 
      !entity.attributes.some(attr => attr.isPrimaryKey)
    );
    
    if (entitiesWithoutPK.length > 0) {
      console.log(`⚠️  Warning: ${entitiesWithoutPK.length} entities without primary keys:`);
      entitiesWithoutPK.forEach(entity => console.log(`   - ${entity.name}`));
    }
    
    // Test Dataverse naming conventions
    console.log("\n🏷️  DATAVERSE NAMING TEST:");
    console.log("===========================");
    parsedResult.entities.forEach(entity => {
      const logicalName = `${publisherPrefix.toLowerCase()}_${entity.name.toLowerCase()}`;
      const schemaName = `${publisherPrefix}_${entity.name}`;
      console.log(`${entity.name} → LogicalName: ${logicalName}, SchemaName: ${schemaName}`);
    });
    
    console.log("\n TEST SUCCESSFUL: All validations passed!");
    return {
      success: true,
      entities: parsedResult.entities.length,
      relationships: parsedResult.relationships.length,
      totalAttributes: totalAttributes,
      entitiesWithPK: primaryKeys
    };
    
  } catch (error) {
    console.error("\n❌ TEST FAILED:");
    console.error(`  ${error.message}`);
    if (error.stack) {
      console.error(`\n📄 Stack trace:\n${error.stack}`);
    }
    return { success: false, error: error.message };
  }
}

// Run the test with command line arguments
const args = process.argv.slice(2);
const mermaidFile = args[0] || path.join(__dirname, '..', 'examples', 'simple-sales.mmd');
const publisherPrefix = args[1] || 'test';

console.log('🧜‍♀️ Mermaid ERD Parser Test');
console.log('============================\n');

testSchemaGeneration(mermaidFile, publisherPrefix)
  .then(result => {
    if (result.success) {
      console.log("\n🎉 Schema generation test completed successfully!");
      console.log(`📊 Summary: ${result.entities} entities, ${result.relationships} relationships, ${result.totalAttributes} total attributes`);
    } else {
      console.log("\n💥 Schema generation test failed!");
      process.exit(1);
    }
  })
  .catch(err => {
    console.error("💥 Unexpected error:", err);
    process.exit(1);
  });
