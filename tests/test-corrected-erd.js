const { MermaidERDParser } = require('../src/backend/mermaid-parser');
const fs = require('fs');

console.log('🧜‍♀️ Testing Corrected ERD Generation');
console.log('====================================\n');

function testCorrectedERD() {
  try {
    // Read the test ERD file
    const erdPath = 'test-fk-validation.mmd';
    const erdContent = fs.readFileSync(erdPath, 'utf8');
    
    console.log('📄 Original ERD:');
    console.log(erdContent);
    console.log('\n');
    
    // Parse the ERD
    const parser = new MermaidERDParser();
    const result = parser.parse(erdContent);
    
    console.log('⚠️  Validation Warnings:');
    if (result.warnings.length === 0) {
      console.log('   No warnings found!');
    } else {
      result.warnings.forEach((warning, i) => {
        console.log(`   ${i + 1}. ${warning.type}: ${warning.message}`);
      });
    }
    console.log('\n');
    
    // Generate corrected ERD
    const correctedERD = parser.generateCorrectedERD(result.warnings);
    
    console.log('🔧 Corrected ERD:');
    console.log(correctedERD);
    console.log('\n');
    
    // Validate the corrected ERD
    const correctedParser = new MermaidERDParser();
    const correctedResult = correctedParser.parse(correctedERD);
    console.log('✅ Corrected ERD Validation:');
    if (correctedResult.warnings.length === 0) {
      console.log('   No warnings found! ✨');
    } else {
      console.log('   Remaining warnings:');
      correctedResult.warnings.forEach((warning, i) => {
        console.log(`   ${i + 1}. ${warning.type}: ${warning.message}`);
      });
    }
    
    console.log('\n🎉 Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testCorrectedERD();
