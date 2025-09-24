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

async function testFKDescriptionIssue() {
    console.log('🔧 TEST: FK Description Issue with Entity Rename');
    console.log('=======================================================');
    
    // Create a scenario that mirrors the real issue:
    // 1. CDM entity gets renamed (Contact -> CustomContact)
    // 2. FK is missing and gets auto-added
    // 3. But FK description still refers to old entity name
    
    const problematicERD = `erDiagram
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
    
    console.log('📋 Problematic ERD (after entity rename):');
    console.log(problematicERD);
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Step 1: Validate to get warnings
    console.log('🔍 Step 1: Validate and identify missing FKs');
    const validationResult = await validationService.validateERD({ 
        mermaidContent: problematicERD, 
        options: { entityChoice: 'cdm' } 
    });
    
    console.log('⚠️  Total warnings:', validationResult.warnings.length);
    
    // Look for missing FK warnings
    const missingFKWarnings = validationResult.warnings.filter(w => 
        w.type === 'missing_foreign_key' && w.isAutoFixable
    );
    console.log('🔧 Missing FK warnings (auto-fixable):', missingFKWarnings.length);
    
    for (const warning of missingFKWarnings) {
        console.log('\n🔍 Missing FK Warning:');
        console.log('   Message:', warning.message);
        console.log('   Entity:', warning.entity);
        console.log('   Fix data:', JSON.stringify(warning.fixData, null, 2));
    }
    
    // Step 2: Apply FK fixes
    let currentContent = problematicERD;
    console.log('\n🔧 Step 2: Apply FK fixes');
    
    for (const warning of missingFKWarnings) {
        console.log(`🔧 Fixing missing FK: ${warning.message}`);
        
        const fixResult = await validationService.fixIndividualWarning({
            mermaidContent: currentContent,
            warningId: warning.id,
            options: { entityChoice: 'cdm' }
        });
        
        if (fixResult.success && fixResult.updatedERD) {
            currentContent = fixResult.updatedERD;
            console.log('   ✅ FK fix applied');
        } else {
            console.log('   ❌ FK fix failed:', fixResult.error || 'Unknown error');
        }
    }
    
    console.log('\n📋 ERD after FK fixes:');
    console.log(currentContent);
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Step 3: Check for FK description warnings
    console.log('🔍 Step 3: Check for FK description issues');
    const finalValidation = await validationService.validateERD({ 
        mermaidContent: currentContent, 
        options: { entityChoice: 'cdm' } 
    });
    
    console.log('⚠️  Final warnings count:', finalValidation.warnings.length);
    
    // Look for any remaining auto-fixable warnings
    const remainingAutoFixable = finalValidation.warnings.filter(w => w.isAutoFixable);
    console.log('🔧 Remaining auto-fixable warnings:', remainingAutoFixable.length);
    
    for (const warning of remainingAutoFixable) {
        console.log('\n🔍 Remaining Warning:');
        console.log('   Type:', warning.type);
        console.log('   Message:', warning.message);
        console.log('   Entity:', warning.entity);
        
        if (warning.fixData) {
            console.log('   Fix data:', JSON.stringify(warning.fixData, null, 2));
        }
        
        // Check if this relates to FK description
        if (warning.message && (warning.message.includes('Foreign key to') || warning.message.includes('description'))) {
            console.log('   🎯 This appears to be the FK description mismatch!');
        }
    }
    
    console.log('\n✅ Test completed');
    
    return {
        missingFKs: missingFKWarnings.length,
        remainingWarnings: remainingAutoFixable.length,
        finalContent: currentContent
    };
}

// Run the test
testFKDescriptionIssue().catch(console.error);