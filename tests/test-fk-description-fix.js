const { ValidationService } = require('../src/backend/services/validation-service');
const { MermaidERDParser } = require('../src/backend/mermaid-parser');
const fs = require('fs');

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

async function testFKDescriptionFix() {
    console.log('🔧 TEST: FK Description Fix after Entity Rename');
    console.log('==================================================');
    
    // Load the CDM-only example that has entity rename scenarios
    const erdPath = 'examples/cdm-only.mmd';
    const originalContent = fs.readFileSync(erdPath, 'utf8');
    
    console.log('📋 Original content:');
    console.log(originalContent);
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Parse and validate the original content
    console.log('🔍 Step 1: Parse and validate original ERD');
    const parseResult = parser.parse(originalContent);
    console.log('📊 Parse result entities:', parseResult.entities.map(e => e.name));
    console.log('📊 Parse result CDM matches:', parseResult.cdmDetections?.matches);
    
    const validationResult = await validationService.validateERD({ 
        mermaidContent: originalContent, 
        options: { entityChoice: 'cdm' } 
    });
    console.log('⚠️  Total warnings:', validationResult.warnings.length);
    
    // Filter for auto-fixable warnings
    const autoFixableWarnings = validationResult.warnings.filter(w => w.isAutoFixable);
    console.log('🔧 Auto-fixable warnings:', autoFixableWarnings.length);
    
    // Apply all auto-fixes
    let currentContent = originalContent;
    let fixCount = 0;
    
    console.log('\n🔧 Step 2: Apply all auto-fixes');
    for (const warning of autoFixableWarnings) {
        console.log(`🔧 Fixing warning ${fixCount + 1}: ${warning.type} - ${warning.message}`);
        
        if (warning.fixData) {
            console.log(`   Fix data:`, JSON.stringify(warning.fixData, null, 2));
        }
        
        const fixResult = await validationService.fixIndividualWarning({
            mermaidContent: currentContent,
            warningId: warning.id,
            options: { entityChoice: 'cdm' }
        });
        
        if (fixResult.success && fixResult.updatedERD) {
            currentContent = fixResult.updatedERD;
            fixCount++;
            console.log(`   ✅ Fix applied (${fixCount}/${autoFixableWarnings.length})`);
        } else {
            console.log(`   ❌ Fix failed:`, fixResult.error || 'Unknown error');
        }
    }
    
    console.log('\n📋 ERD after all fixes:');
    console.log(currentContent);
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Validate the final result
    console.log('🔍 Step 3: Validate final result');
    const finalValidation = await validationService.validateERD({ 
        mermaidContent: currentContent, 
        options: { entityChoice: 'cdm' } 
    });
    console.log('⚠️  Final warnings count:', finalValidation.warnings.length);
    
    // Focus on any remaining warnings that contain FK description issues
    const remainingWarnings = finalValidation.warnings.filter(w => w.isAutoFixable);
    console.log('🔧 Remaining auto-fixable warnings:', remainingWarnings.length);
    
    for (const warning of remainingWarnings) {
        console.log('\n🔍 Remaining warning:');
        console.log('   Type:', warning.type);
        console.log('   Message:', warning.message);
        console.log('   Entity:', warning.entity);
        console.log('   Is Auto-fixable:', warning.isAutoFixable);
        
        if (warning.fixData) {
            console.log('   Fix data:', JSON.stringify(warning.fixData, null, 2));
        }
        
        // Check if this is the FK description issue
        if (warning.message && warning.message.includes('Foreign key to')) {
            console.log('   🎯 This appears to be the FK description issue!');
            console.log('   Expected entity name vs actual entity name in description');
        }
    }
    
    console.log('\n✅ Test completed');
    console.log(`🔧 Applied ${fixCount} fixes`);
    console.log(`⚠️  ${remainingWarnings.length} auto-fixable warnings remain`);
    
    return {
        fixCount,
        remainingWarnings: remainingWarnings.length,
        finalContent: currentContent
    };
}

// Run the test
testFKDescriptionFix().catch(console.error);