const { MermaidERDParser } = require('../src/backend/mermaid-parser');
const fs = require('fs');

console.log('🧜‍♀️ Testing Current ERD Issues');
console.log('==============================\n');

function testCurrentERD() {
  try {
    // Read the current test ERD file
    const erdPath = 'examples/test-erd.mmd';
    const erdContent = fs.readFileSync(erdPath, 'utf8');
    
    console.log('📄 Current ERD:');
    console.log(erdContent);
    console.log('\n');
    
    // Parse the ERD
    const parser = new MermaidERDParser();
    const result = parser.parse(erdContent);
    
    console.log('⚠️  Current Warnings:');
    if (result.warnings.length === 0) {
      console.log('   No warnings found!');
    } else {
      result.warnings.forEach((warning, i) => {
        console.log(`   ${i + 1}. ${warning.type} (${warning.severity}): ${warning.message}`);
        if (warning.suggestion) {
          console.log(`      💡 ${warning.suggestion}`);
        }
      });
    }
    console.log('\n');
    
    // Generate corrected ERD
    const correctedERD = parser.generateCorrectedERD();
    
    console.log('🔧 Corrected ERD:');
    console.log(correctedERD);
    console.log('\n');
    
    // Parse corrected ERD to check remaining warnings
    const correctedParser = new MermaidERDParser();
    const correctedResult = correctedParser.parse(correctedERD);
    
    console.log('✅ Remaining warnings after correction:');
    if (correctedResult.warnings.length === 0) {
      console.log('   No warnings found! ✨');
    } else {
      console.log('   ❌ These warnings should be resolved but are still present:');
      correctedResult.warnings.forEach((warning, i) => {
        console.log(`   ${i + 1}. ${warning.type} (${warning.severity}): ${warning.message}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testCurrentERD();
