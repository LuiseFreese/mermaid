/**
 * Test Schema Generation
 * This script tests the schema generation functionality without Dataverse deployment
 */

import fs from 'fs';
import { DataverseSchemaGenerator } from '../../../src/schema-generator.js';
import { MermaidERDParser } from '../../../src/parser.js';

// Get process object for Node.js environment
const process = globalThis.process;

// Test function
async function testSchemaGeneration(mermaidFilePath, publisherPrefix = 'test') {
  console.log('Testing schema generation with:', mermaidFilePath);
  
  try {
    // Read Mermaid file
    const mermaidContent = fs.readFileSync(mermaidFilePath, 'utf8');
    console.log(`Read ${mermaidContent.length} characters from file`);
    
    // Parse Mermaid content
    console.log("Parsing Mermaid diagram...");
    const parser = new MermaidERDParser();
    const parsedDiagram = parser.parse(mermaidContent);
    
    // Generate Dataverse schema with non-interactive mode
    console.log("Generating Dataverse schema...");
    const generator = new DataverseSchemaGenerator(publisherPrefix, { 
      interactive: false, 
      nonInteractive: true, 
      enableValidation: true 
    });
    
    // Generate the schema
    const schema = await generator.generateSchema(parsedDiagram);
    
    // Check if schema components exist
    console.log("\nSCHEMA VALIDATION RESULTS:");
    console.log("=========================");
    console.log("Entities:", Array.isArray(schema.entities) ? `✅ Array with ${schema.entities.length} items` : "❌ Not an array");
    console.log("Relationships:", Array.isArray(schema.relationships) ? `✅ Array with ${schema.relationships.length} items` : "❌ Not an array");
    console.log("Additional Columns:", Array.isArray(schema.additionalColumns) ? `✅ Array with ${schema.additionalColumns.length} items` : "❌ Not an array");
    console.log("Global Choice Sets:", Array.isArray(schema.globalChoiceSets) ? `✅ Array with ${schema.globalChoiceSets.length} items` : "❌ Not an array");
    
    console.log("\nMETADATA:");
    console.log("Publisher Prefix:", schema.metadata.publisherPrefix);
    console.log("Generated At:", schema.metadata.generatedAt);
    console.log("Validation Enabled:", schema.metadata.validationEnabled);
    
    console.log("\n✅ TEST SUCCESSFUL: Schema generated without errors");
    return true;
  } catch (error) {
    console.error("\n❌ TEST FAILED:");
    console.error(`  ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    return false;
  }
}

// Run the test with command line arguments
const args = process.argv.slice(2);
const mermaidFile = args[0] || './examples/eventerd.mmd';
const publisherPrefix = args[1] || 'test';

testSchemaGeneration(mermaidFile, publisherPrefix)
  .then(success => {
    if (success) {
      console.log("\nSchema generation test completed successfully!");
    } else {
      console.log("\nSchema generation test failed!");
      process.exit(1);
    }
  })
  .catch(err => {
    console.error("Unexpected error:", err);
    process.exit(1);
  });
