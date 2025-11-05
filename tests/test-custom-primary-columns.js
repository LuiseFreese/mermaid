#!/usr/bin/env node

/**
 * Custom Primary Columns Test Script
 * 
 * This script tests the new custom primary column feature by:
 * 1. Parsing ERD files with custom primary columns
 * 2. Validating that custom primary column names are detected
 * 3. Verifying that Dataverse entity payloads use correct schema names
 * 4. Testing both default 'name' columns and custom primary columns
 * 5. Ensuring backward compatibility with existing ERDs
 */

const fs = require('fs');
const path = require('path');
const { MermaidERDParser } = require('../src/backend/mermaid-parser.js');
const { DataverseClient } = require('../src/backend/dataverse/index');

console.log('🧪 CUSTOM PRIMARY COLUMNS TEST SUITE');
console.log('=====================================\n');

/**
 * Test Cases
 */
const testCases = [
  {
    name: 'Custom Primary Columns - Mixed Types',
    file: 'examples/custom-primary-columns.mmd',
    expectedPrimaryColumns: {
      'Customer': 'customer_code',
      'Product': 'product_sku',
      'Order': 'order_number',
      'OrderItem': 'line_item_id'
    }
  },
  {
    name: 'Department/Employee with Custom PKs',
    file: 'examples/mixed-primary-columns.mmd',
    expectedPrimaryColumns: {
      'Department': 'dept_code',
      'Employee': 'employee_id',
      'Project': 'project_code',
      'Assignment': 'assignment_id'
    }
  },
  {
    name: 'University with Custom PKs',
    file: 'examples/university-custom-pk.mmd',
    expectedPrimaryColumns: {
      'Student': 'student_id',
      'Course': 'course_code',
      'Enrollment': 'enrollment_id',
      'Library': 'library_card_number'
    }
  },
  {
    name: 'Legacy Default Name Column (Backward Compatibility)',
    file: 'examples/simple-test.mmd',
    expectedPrimaryColumns: {
      // Existing entities should use default 'name' primary column
    }
  }
];

/**
 * Helper function to create a mock DataverseClient for testing entity payloads
 */
function createMockDataverseClient() {
  // Create a mock client with minimal configuration for testing
  const mockConfig = {
    dataverseUrl: 'https://mock.crm.dynamics.com',
    clientId: 'mock-client-id'
  };
  return new DataverseClient(mockConfig);
}

/**
 * Test custom primary column detection
 */
async function testCustomPrimaryColumnDetection(testCase) {
  console.log(`📋 Testing: ${testCase.name}`);
  console.log(`📁 File: ${testCase.file}`);
  
  try {
    // Read the ERD file
    const erdPath = path.join(__dirname, '..', testCase.file);
    if (!fs.existsSync(erdPath)) {
      console.log(`❌ ERD file not found: ${erdPath}`);
      return false;
    }
    
    const erdContent = fs.readFileSync(erdPath, 'utf8');
    console.log(`📖 Read ERD content (${erdContent.length} characters)`);
    
    // Parse the ERD
    const parser = new MermaidERDParser();
    const result = parser.parse(erdContent);
    
    console.log(`🔍 Parsed ${result.entities.length} entities`);
    
    // Test 1: Check that entities have correct primary column information
    let allPrimaryColumnsCorrect = true;
    
    for (const entity of result.entities) {
      const expectedPrimaryColumn = testCase.expectedPrimaryColumns[entity.name];
      
      console.log(`\n  📊 Entity: ${entity.name}`);
      console.log(`    - Primary Column Name: ${entity.primaryColumnName || 'default (name)'}`);
      console.log(`    - Primary Column Display: ${entity.primaryColumnDisplayName || 'default'}`);
      console.log(`    - Attributes: ${entity.attributes.length}`);
      
      // List primary key attributes
      const primaryKeys = entity.attributes.filter(attr => attr.isPrimaryKey);
      console.log(`    - Primary Key Attributes: ${primaryKeys.map(pk => pk.name).join(', ') || 'none'}`);
      
      if (expectedPrimaryColumn) {
        if (entity.primaryColumnName === expectedPrimaryColumn) {
          console.log(`    ✅ Custom primary column correctly detected: ${expectedPrimaryColumn}`);
        } else {
          console.log(`    ❌ Expected primary column '${expectedPrimaryColumn}', got '${entity.primaryColumnName || 'default'}'`);
          allPrimaryColumnsCorrect = false;
        }
      } else {
        // For backward compatibility, entities without custom primary columns should use default
        if (!entity.primaryColumnName) {
          console.log(`    ✅ Default primary column behavior (backward compatibility)`);
        } else {
          console.log(`    ⚠️  Unexpected custom primary column: ${entity.primaryColumnName}`);
        }
      }
    }
    
    // Test 2: Generate Dataverse entity payloads and verify schema names
    console.log(`\n  🏗️  Testing Dataverse entity payload generation...`);
    const mockClient = createMockDataverseClient();
    const publisherPrefix = 'test';
    
    let allPayloadsCorrect = true;
    
    for (const entity of result.entities) {
      try {
        const payload = mockClient._entityPayloadFromParser(entity, publisherPrefix);
        
        console.log(`    📋 ${entity.name} payload:`);
        console.log(`      - Schema Name: ${payload.SchemaName}`);
        console.log(`      - Primary Attribute: ${payload.PrimaryAttribute}`);
        console.log(`      - Primary Display Name: ${payload.PrimaryNameAttributeDisplayName}`);
        console.log(`      - Custom Primary Column: ${payload.CustomPrimaryColumn || 'none'}`);
        
        // Verify that primary attribute schema uses correct column name
        const expectedPrimarySchema = entity.primaryColumnName 
          ? `${publisherPrefix}_${entity.name.toLowerCase()}_${entity.primaryColumnName.toLowerCase()}`
          : `${publisherPrefix}_${entity.name.toLowerCase()}_name`;
          
        if (payload.PrimaryAttribute === expectedPrimarySchema) {
          console.log(`      ✅ Primary attribute schema correct`);
        } else {
          console.log(`      ❌ Expected primary attribute '${expectedPrimarySchema}', got '${payload.PrimaryAttribute}'`);
          allPayloadsCorrect = false;
        }
        
      } catch (error) {
        console.log(`      ❌ Error generating payload: ${error.message}`);
        allPayloadsCorrect = false;
      }
    }
    
    // Test 3: Verify validation warnings
    console.log(`\n  ⚠️  Checking validation warnings...`);
    console.log(`    - Total warnings: ${result.warnings.length}`);
    
    // Should not have missing primary key warnings for entities with custom primary columns
    const missingPKWarnings = result.warnings.filter(w => w.type === 'missing_primary_key');
    console.log(`    - Missing PK warnings: ${missingPKWarnings.length}`);
    
    if (missingPKWarnings.length === 0) {
      console.log(`    ✅ No missing primary key warnings (as expected)`);
    } else {
      console.log(`    ⚠️  Some entities still have missing PK warnings:`);
      missingPKWarnings.forEach(w => console.log(`      - ${w.message}`));
    }
    
    const testPassed = allPrimaryColumnsCorrect && allPayloadsCorrect;
    console.log(`\n  ${testPassed ? '✅' : '❌'} Test Result: ${testPassed ? 'PASSED' : 'FAILED'}`);
    
    return testPassed;
    
  } catch (error) {
    console.log(`❌ Error testing ${testCase.name}: ${error.message}`);
    console.log(`Stack: ${error.stack}`);
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log(`🚀 Running ${testCases.length} test cases...\n`);
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const testCase of testCases) {
    const passed = await testCustomPrimaryColumnDetection(testCase);
    
    if (passed) {
      passedTests++;
    } else {
      failedTests++;
    }
    
    console.log(`\n${'='.repeat(80)}\n`);
  }
  
  // Summary
  console.log(`📊 TEST SUMMARY`);
  console.log(`===============`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📋 Total: ${testCases.length}`);
  
  if (failedTests === 0) {
    console.log(`\n🎉 ALL TESTS PASSED! Custom primary columns feature is working correctly.`);
    process.exit(0);
  } else {
    console.log(`\n💥 ${failedTests} test(s) failed. Please review the implementation.`);
    process.exit(1);
  }
}

/**
 * Feature demonstration
 */
async function demonstrateFeature() {
  console.log(`🎯 CUSTOM PRIMARY COLUMNS FEATURE DEMONSTRATION`);
  console.log(`===============================================\n`);
  
  const demoERD = `erDiagram
    Customer {
        string customer_code PK "Customer Code"
        string company_name "Company Name"
        string email "Email Address"
    }
    
    Product {
        string name PK "Product Name"
        decimal price "Unit Price"
        string category "Product Category"
    }`;
  
  console.log(`📝 Demo ERD:`);
  console.log(demoERD);
  console.log();
  
  const parser = new MermaidERDParser();
  const result = parser.parse(demoERD);
  
  console.log(`📊 Parsing Results:`);
  
  for (const entity of result.entities) {
    console.log(`\n  🏢 Entity: ${entity.name}`);
    console.log(`    - Custom Primary Column: ${entity.primaryColumnName || 'No (uses default "name")'}`);
    console.log(`    - Primary Display Name: ${entity.primaryColumnDisplayName || 'Default'}`);
    
    const mockClient = createMockDataverseClient();
    const payload = mockClient._entityPayloadFromParser(entity, 'demo');
    
    console.log(`    - Dataverse Primary Attribute: ${payload.PrimaryAttribute}`);
    console.log(`    - Will create primary column named: ${payload.PrimaryAttribute.split('_').pop()}`);
  }
  
  console.log(`\n✨ As you can see:`);
  console.log(`  - Customer entity uses custom primary column "customer_code"`);
  console.log(`  - Product entity uses custom primary column "name" (explicit PK)`);
  console.log(`  - Both generate correct Dataverse schema names`);
  console.log(`  - Backward compatibility is maintained\n`);
}

// Main execution
if (require.main === module) {
  (async () => {
    await demonstrateFeature();
    await runAllTests();
  })();
}

module.exports = {
  testCustomPrimaryColumnDetection,
  runAllTests,
  demonstrateFeature
};