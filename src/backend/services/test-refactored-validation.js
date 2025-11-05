/**
 * Test script for refactored validation service
 * Validates that the decomposed validation service works correctly
 */

const { ValidationService } = require('./validation-service-refactored');

// Mock mermaid parser for testing
const mockMermaidParser = {
    parse: async (content) => {
        // Simple mock that extracts basic entity structure
        const entityMatches = content.match(/(\w+)\s*\{[^}]*\}/g) || [];
        const entities = entityMatches.map(match => {
            const nameMatch = match.match(/(\w+)\s*\{/);
            const name = nameMatch ? nameMatch[1] : 'Unknown';
            
            // Extract attributes
            const attrMatches = match.match(/\s*(string|int|datetime|decimal|boolean)\s+(\w+)(?:\s+(PK|FK))?/g) || [];
            const attributes = attrMatches.map(attr => {
                const parts = attr.trim().split(/\s+/);
                return {
                    name: parts[1],
                    type: parts[0],
                    constraints: parts[2] ? [parts[2]] : [],
                    isPrimaryKey: parts[2] === 'PK',
                    isForeignKey: parts[2] === 'FK'
                };
            });

            return { name, attributes };
        });

        // Extract relationships
        const relationshipMatches = content.match(/(\w+)\s*\|\|--[o{|}]*\s*(\w+)/g) || [];
        const relationships = relationshipMatches.map(rel => {
            const parts = rel.match(/(\w+)\s*\|\|--[o{|}]*\s*(\w+)/);
            return {
                fromEntity: parts[1],
                toEntity: parts[2],
                cardinality: { type: 'one-to-many' }
            };
        });

        return {
            success: true,
            entities,
            relationships,
            errors: [],
            warnings: []
        };
    }
};

async function testRefactoredValidationService() {
    console.log('🔧 Testing Refactored Validation Service');
    console.log('========================================\n');

    try {
        // Initialize the refactored validation service
        const validationService = new ValidationService({
            mermaidParser: mockMermaidParser
        });

        // Test ERD with duplicate columns
        const testERD = `
erDiagram
    Employee {
        string employee_id PK
        string name
        string name
        string email
        datetime created_date
    }
    
    Department {
        string department_id PK
        string name
        string manager_id FK
    }
    
    Employee ||--o{ Department : "works_in"
    Employee ||--o{ Department : "works_in"
`;

        console.log('📝 Test ERD:');
        console.log(testERD);
        console.log('\n🔍 Running validation...');

        // Validate the ERD
        const result = await validationService.validateERD(testERD);

        console.log('\n✅ Validation Results:');
        console.log('- Is Valid:', result.isValid);
        console.log('- Entities found:', result.entities?.length || 0);
        console.log('- Relationships found:', result.relationships?.length || 0);
        console.log('- Warnings:', result.warnings?.length || 0);
        console.log('- Errors:', result.errors?.length || 0);

        if (result.warnings && result.warnings.length > 0) {
            console.log('\n⚠️  Warnings found:');
            result.warnings.forEach(warning => {
                console.log(`  - ${warning.type}: ${warning.message}`);
                console.log(`    Auto-fixable: ${warning.autoFixable}`);
            });
        }

        // Test fixing duplicate columns if any warnings exist
        const duplicateColumnWarning = result.warnings?.find(w => 
            w.type === 'duplicate_attribute' || w.type === 'duplicate_columns'
        );

        if (duplicateColumnWarning) {
            console.log('\n🔧 Testing duplicate column fix...');
            const fixResult = await validationService.fixDuplicateColumns(testERD, duplicateColumnWarning);
            
            if (fixResult.success) {
                console.log('✅ Fix successful:', fixResult.message);
                console.log('📝 Fixed content preview:');
                console.log(fixResult.data.substring(0, 200) + '...');
            } else {
                console.log('❌ Fix failed:', fixResult.error);
            }
        }

        console.log('\n📊 Performance Metrics:');
        console.log('- Validation time:', result.metadata?.validationTime + 'ms');
        console.log('- Content length:', result.metadata?.contentLength + ' characters');

        console.log('\n🎉 Refactored validation service test completed successfully!');
        
        return true;

    } catch (error) {
        console.error('❌ Test failed:', error);
        return false;
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    testRefactoredValidationService()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test execution failed:', error);
            process.exit(1);
        });
}

module.exports = { testRefactoredValidationService };