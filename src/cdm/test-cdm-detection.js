/**
 * Test CDM Detection Functionality
 * Simple test to validate CDM entity detection
 */

const CDMEntityRegistry = require('./cdm-entity-registry');

// Test data - sample Mermaid entities
const testEntities = [
  {
    name: 'Account',
    attributes: [
      { name: 'name', type: 'string' },
      { name: 'email', type: 'string' },
      { name: 'phone', type: 'string' }
    ]
  },
  {
    name: 'Contact',
    attributes: [
      { name: 'firstName', type: 'string' },
      { name: 'lastName', type: 'string' },
      { name: 'email', type: 'string' }
    ]
  },
  {
    name: 'Customer',
    attributes: [
      { name: 'name', type: 'string' },
      { name: 'address', type: 'string' }
    ]
  },
  {
    name: 'Product',
    attributes: [
      { name: 'name', type: 'string' },
      { name: 'price', type: 'decimal' },
      { name: 'description', type: 'text' }
    ]
  },
  {
    name: 'CustomEntity',
    attributes: [
      { name: 'customField1', type: 'string' },
      { name: 'customField2', type: 'integer' }
    ]
  }
];

async function testCDMDetection() {
  console.log('🧪 Testing CDM Entity Detection...\n');

  try {
    // Initialize CDM registry (without Dataverse client for testing)
    const cdmRegistry = new CDMEntityRegistry();

    // Test CDM detection
    console.log('📋 Test Entities:');
    testEntities.forEach((entity, index) => {
      console.log(`   ${index + 1}. ${entity.name} (${entity.attributes.length} attributes)`);
    });
    console.log('');

    // Detect CDM entities
    const results = await cdmRegistry.processMermaidEntities(testEntities, {
      autoIntegrate: false,
      generateReport: true,
      updateDiagram: true
    });

    // Display results
    console.log('🔍 CDM Detection Results:');
    console.log('─'.repeat(50));
    console.log(`Total entities analyzed: ${results.detection.summary.totalEntities}`);
    console.log(`CDM matches found: ${results.detection.summary.cdmMatches}`);
    console.log(`Custom entities: ${results.detection.summary.customEntities}`);
    console.log(`Overall confidence: ${results.detection.summary.confidenceLevel}`);
    console.log('');

    // Show CDM matches
    if (results.detection.detectedCDM.length > 0) {
      console.log('✅ CDM Entities Detected:');
      results.detection.detectedCDM.forEach((match, index) => {
        console.log(`   ${index + 1}. "${match.originalEntity.name}" → CDM "${match.cdmEntity.displayName}"`);
        console.log(`      • Match Type: ${match.matchType}`);
        console.log(`      • Confidence: ${(match.confidence * 100).toFixed(1)}%`);
        console.log(`      • Category: ${match.cdmEntity.category}`);
        console.log(`      • Description: ${match.cdmEntity.description}`);
        console.log('');
      });
    }

    // Show custom entities
    if (results.detection.customEntities.length > 0) {
      console.log('🔧 Custom Entities (No CDM Match):');
      results.detection.customEntities.forEach((entity, index) => {
        console.log(`   ${index + 1}. ${entity.name}`);
      });
      console.log('');
    }

    // Show recommendations
    if (results.recommendations.length > 0) {
      console.log('💡 Recommendations:');
      results.recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. [${rec.priority.toUpperCase()}] ${rec.title}`);
        console.log(`      ${rec.description}`);
        if (rec.benefits) {
          console.log(`      Benefits:`);
          rec.benefits.forEach(benefit => console.log(`        • ${benefit}`));
        }
        console.log('');
      });
    }

    // Show diagram updates
    if (results.diagram && results.diagram.entityReplacements.length > 0) {
      console.log('🎨 Suggested Diagram Updates:');
      results.diagram.entityReplacements.forEach((update, index) => {
        console.log(`   ${index + 1}. Replace "${update.original}" with CDM "${update.cdm.name}" ${update.cdm.icon}`);
      });
      console.log('');
    }

    // Test individual CDM entity lookup
    console.log('🔎 Testing Individual CDM Entity Lookup:');
    const accountEntity = cdmRegistry.detector.getCDMEntity('account');
    if (accountEntity) {
      console.log(`   • Account Entity: ${accountEntity.displayName}`);
      console.log(`   • Key Attributes: ${accountEntity.keyAttributes.slice(0, 5).join(', ')}...`);
      console.log(`   • Common Aliases: ${accountEntity.commonAliases.join(', ')}`);
    }
    console.log('');

    // Test search functionality
    console.log('🔍 Testing CDM Entity Search:');
    const salesEntities = cdmRegistry.searchCDMEntities('', 'sales');
    console.log(`   • Sales entities found: ${salesEntities.length}`);
    salesEntities.forEach(entity => {
      console.log(`     - ${entity.displayName} (${entity.logicalName})`);
    });
    console.log('');

    console.log('✅ CDM Detection Test Completed Successfully!');

  } catch (error) {
    console.error('❌ CDM Detection Test Failed:', error);
    console.error(error.stack);
  }
}

// Run the test
if (require.main === module) {
  testCDMDetection();
}

module.exports = { testCDMDetection, testEntities };
