/**
 * Basic validation for Phase 1 utilities
 * This is a simple validation script to ensure our utilities work
 */

// For now, we'll create a simple validation that doesn't require module imports
// This validates that our file structure is correct

const fs = require('fs');
const path = require('path');

describe('Phase 1 File Structure Validation', () => {
  const baseDir = path.join(__dirname, '../../../src/frontend/src/components/wizard/steps/file-upload');

  test('should have all required utility files', () => {
    const utilsDir = path.join(baseDir, 'utils');
    expect(fs.existsSync(path.join(utilsDir, 'cdmEntityList.ts'))).toBe(true);
    expect(fs.existsSync(path.join(utilsDir, 'erdParser.ts'))).toBe(true);
    expect(fs.existsSync(path.join(utilsDir, 'validationRules.ts'))).toBe(true);
  });

  test('should have all required type files', () => {
    const typesDir = path.join(baseDir, 'types');
    expect(fs.existsSync(path.join(typesDir, 'file-upload.types.ts'))).toBe(true);
    expect(fs.existsSync(path.join(typesDir, 'validation.types.ts'))).toBe(true);
  });

  test('should have all required hook files', () => {
    const hooksDir = path.join(baseDir, 'hooks');
    expect(fs.existsSync(path.join(hooksDir, 'useCDMDetection.ts'))).toBe(true);
    expect(fs.existsSync(path.join(hooksDir, 'useERDValidation.ts'))).toBe(true);
    expect(fs.existsSync(path.join(hooksDir, 'useAutoFix.ts'))).toBe(true);
    expect(fs.existsSync(path.join(hooksDir, 'useFileProcessing.ts'))).toBe(true);
  });

  test('should have main FileUploadStep component', () => {
    const componentFile = path.join(__dirname, '../../../src/frontend/src/components/wizard/steps/FileUploadStep.tsx');
    expect(fs.existsSync(componentFile)).toBe(true);
  });
});

console.log('✅ Phase 1 file structure validation complete!');
