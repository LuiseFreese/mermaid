// Simple test script to validate parsing locally
const { MermaidERDParser } = require('../src/mermaid-parser.js');
const fs = require('fs');
const path = require('path');

async function testParsing() {
    try {
        console.log('🧪 Testing Mermaid parsing locally...');
        
        // Read test file - use path.join to handle relative paths correctly
        const testFile = path.join(__dirname, '../examples/test-example.mmd');
        const mermaidContent = fs.readFileSync(testFile, 'utf8');
        console.log('📄 File content loaded');
        
        // Parse
        const parser = new MermaidERDParser();
        const result = parser.parse(mermaidContent);
        
        console.log('📊 Parsing Results:');
        console.log(`- Entities: ${result.entities.length}`);
        console.log(`- Relationships: ${result.relationships.length}`);
        
        // Log entities
        result.entities.forEach((entity, i) => {
            console.log(`  ${i+1}. ${entity.name} (${entity.attributes.length} attributes)`);
            entity.attributes.forEach(attr => {
                const flags = attr.isPrimaryKey ? '[PK]' : attr.isForeignKey ? '[FK]' : '';
                console.log(`     - ${attr.name}: ${attr.type} ${flags}`);
            });
        });
        
        // Log relationships  
        result.relationships.forEach((rel, i) => {
            console.log(`  Rel ${i+1}: ${rel.fromEntity} -> ${rel.toEntity}`);
        });
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testParsing();
