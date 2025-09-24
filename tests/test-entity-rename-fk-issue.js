const { ValidationService } = require('../src/backend/services/validation-service');
const { MermaidERDParser } = require('../src/backend/mermaid-parser');

// Mock dependencies
const mockCdmUtils = {};
const mockGlobalChoicesService = {
    updateChoicesInERD: async (content) => ({ updatedERD: content, hasUpdates: false })
};

// Create instances
const parser = new MermaidERDParser();
const validationService = new ValidationService({ 
    mermaidParser: parser,
    cdmRegistry: mockCdmUtils, 
    globalChoicesService: mockGlobalChoicesService 
});

async function testEntityRenameScenario() {
    console.log('🔧 TEST: Entity Rename FK Description Issue');
    console.log('==============================================');
    
    // This scenario simulates:
    // 1. Original entity was "Contact"
    // 2. Entity got renamed to "CustomContact" 
    // 3. But FK description still references "Contact"
    // 4. Now the referenced entity "Contact" no longer exists
    
    const erdWithRenamedEntity = `erDiagram
    CustomTask {
        guid taskId PK
        string subject
        datetime createdOn
        string description
    }
    
    CustomContact {
        guid ContactId PK
        string FullName
        string EmailPrimary
    }
    
    CustomTask ||--o{ CustomContact : "assigned_to"`;
    
    console.log('📋 ERD with renamed entity (Contact -> CustomContact):');
    console.log(erdWithRenamedEntity);
    console.log('\n');
    
    // Create a warning that references the OLD entity name
    const fkWarningWithOldEntityName = {
        id: 'test_warning_456',
        type: 'missing_foreign_key',
        message: 'Missing foreign key for relationship',
        entity: 'CustomTask',
        isAutoFixable: true,
        fixData: {
            entityName: 'CustomTask',
            columnName: 'contact_id',  // FK column name
            referencedEntity: 'Contact'  // OLD entity name that no longer exists!
        }
    };
    
    console.log('🔧 Warning with OLD entity name in referencedEntity:');
    console.log(JSON.stringify(fkWarningWithOldEntityName, null, 2));
    console.log('\n');
    
    // Test the fix
    console.log('🔧 Testing fixMissingForeignKey with missing referenced entity:');
    try {
        const fixResult = validationService.fixMissingForeignKey(erdWithRenamedEntity, fkWarningWithOldEntityName);
        
        console.log('✅ Fix result success:', fixResult.success);
        console.log('📋 Applied fix:', fixResult.appliedFix);
        
        if (fixResult.content) {
            console.log('\n📋 Updated ERD:');
            console.log(fixResult.content);
            
            // Check what the FK description says
            const fkDescriptionMatch = fixResult.content.match(/FK "([^"]+)"/);
            if (fkDescriptionMatch) {
                console.log('\n🎯 FK Description:', fkDescriptionMatch[1]);
                
                if (fkDescriptionMatch[1].includes('Contact') && !erdWithRenamedEntity.includes('Contact {')) {
                    console.log('❌ PROBLEM: FK description references "Contact" but entity is now "CustomContact"');
                    console.log('💡 SOLUTION: FK description should reference "CustomContact" instead');
                } else {
                    console.log('✅ FK description looks correct');
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
    
    console.log('\n' + '='.repeat(50));
    
    // Now test what the correct behavior should be
    console.log('\n🔧 Testing with corrected referencedEntity:');
    
    const fkWarningWithCurrentEntityName = {
        ...fkWarningWithOldEntityName,
        id: 'test_warning_789',
        fixData: {
            ...fkWarningWithOldEntityName.fixData,
            referencedEntity: 'CustomContact'  // CURRENT entity name
        }
    };
    
    console.log('🔧 Warning with CURRENT entity name:');
    console.log(JSON.stringify(fkWarningWithCurrentEntityName, null, 2));
    
    try {
        const correctFixResult = validationService.fixMissingForeignKey(erdWithRenamedEntity, fkWarningWithCurrentEntityName);
        
        if (correctFixResult.content) {
            const correctFkDescriptionMatch = correctFixResult.content.match(/FK "([^"]+)"/);
            if (correctFkDescriptionMatch) {
                console.log('\n✅ Correct FK Description:', correctFkDescriptionMatch[1]);
            }
        }
        
    } catch (error) {
        console.error('❌ Error with correct entity name:', error.message);
    }
    
    console.log('\n✅ Test completed');
}

// Run the test
testEntityRenameScenario().catch(console.error);