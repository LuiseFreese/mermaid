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

async function testFixMissingForeignKey() {
    console.log('🔧 TEST: fixMissingForeignKey Method');
    console.log('==========================================');
    
    // Let me manually call fixMissingForeignKey to see the FK description issue
    
    // Simulate an ERD where the entity has been renamed but the FK description still refers to old name
    const erdWithRenamedEntity = `erDiagram
    CustomTask {
        guid taskId PK
        string subject
        datetime createdOn
        string description
    }
    
    Contact {
        guid ContactId PK
        string FullName
        string EmailPrimary
    }
    
    CustomTask ||--o{ Contact : "assigned_to"`;
    
    console.log('📋 ERD with missing FK in CustomTask:');
    console.log(erdWithRenamedEntity);
    console.log('\n');
    
    // Create a fake warning that would trigger the FK fix
    const fakeWarning = {
        id: 'test_warning_123',
        type: 'missing_foreign_key',
        message: 'Missing foreign key for relationship',
        entity: 'CustomTask',
        isAutoFixable: true,
        fixData: {
            entityName: 'CustomTask',
            columnName: 'contact_id',  // This would be the new FK column
            referencedEntity: 'Contact'  // This is the key - it still refers to "Contact", not the current name
        }
    };
    
    console.log('🔧 Fake warning (simulating missing FK after entity rename):');
    console.log(JSON.stringify(fakeWarning, null, 2));
    console.log('\n');
    
    // Test the fixMissingForeignKey method directly
    console.log('🔧 Testing fixMissingForeignKey method:');
    try {
        const fixResult = validationService.fixMissingForeignKey(erdWithRenamedEntity, fakeWarning);
        
        console.log('✅ Fix result:', JSON.stringify(fixResult, null, 2));
        console.log('\n📋 Updated ERD after FK fix:');
        console.log(fixResult.content);
        
        // Check the FK description in the result
        if (fixResult.content && fixResult.content.includes('Foreign key to')) {
            const fkDescriptionMatch = fixResult.content.match(/FK "([^"]+)"/);
            if (fkDescriptionMatch) {
                console.log('\n🎯 FK Description found:', fkDescriptionMatch[1]);
                
                if (fkDescriptionMatch[1].includes('Contact')) {
                    console.log('🔍 Issue confirmed: FK description still refers to "Contact"');
                    console.log('💡 Expected: It should refer to the current entity name');
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Error testing fixMissingForeignKey:', error.message);
    }
    
    console.log('\n' + '='.repeat(50));
    
    // Now test the scenario where entity gets renamed after FK exists
    const erdWithExistingFK = `erDiagram
    CustomTask {
        guid taskId PK
        string subject
        datetime createdOn
        string description
        string contact_id FK "Foreign key to Contact"
    }
    
    CustomContact {
        guid ContactId PK
        string FullName
        string EmailPrimary
    }
    
    CustomTask ||--o{ CustomContact : "assigned_to"`;
    
    console.log('\n🔧 Testing scenario with existing FK but renamed entity:');
    console.log('📋 ERD with FK referencing old entity name in description:');
    console.log(erdWithExistingFK);
    console.log('\n');
    
    // This should show a warning about FK description mismatch
    const validationResult = await validationService.validateERD({ 
        mermaidContent: erdWithExistingFK, 
        options: { entityChoice: 'cdm' } 
    });
    
    console.log('⚠️  Validation warnings:', validationResult.warnings.length);
    
    // Look for warnings related to FK descriptions
    const fkDescriptionWarnings = validationResult.warnings.filter(w => 
        w.message && w.message.includes('Foreign key') || 
        (w.fixData && w.fixData.referencedEntity)
    );
    
    console.log('🔍 FK-related warnings:', fkDescriptionWarnings.length);
    
    for (const warning of fkDescriptionWarnings) {
        console.log('\n🔍 FK Warning:');
        console.log('   Type:', warning.type);
        console.log('   Message:', warning.message);
        console.log('   Entity:', warning.entity);
        console.log('   Is Auto-fixable:', warning.isAutoFixable);
        
        if (warning.fixData) {
            console.log('   Fix data:', JSON.stringify(warning.fixData, null, 2));
        }
    }
    
    console.log('\n✅ Test completed');
}

// Run the test
testFixMissingForeignKey().catch(console.error);