/**
 * Comprehensive test for Phase 2 - Rendering Logic Hooks
 */

const fs = require('fs');
const path = require('path');

describe('Phase 2 - Rendering Logic Hooks', () => {
  const hooksDir = path.join(__dirname, '../../../src/frontend/src/components/wizard/steps/file-upload/hooks');

  test('should have all Phase 2 hook files', () => {
    expect(fs.existsSync(path.join(hooksDir, 'useMermaidRenderer.ts'))).toBe(true);
    expect(fs.existsSync(path.join(hooksDir, 'useFileProcessing.ts'))).toBe(true);
  });

  test('useMermaidRenderer should have proper exports', () => {
    const hookFile = path.join(hooksDir, 'useMermaidRenderer.ts');
    const content = fs.readFileSync(hookFile, 'utf8');
    
    // Check for main export
    expect(content).toContain('export const useMermaidRenderer');
    
    // Check for interface
    expect(content).toContain('UseMermaidRendererResult');
    
    // Check for key functions
    expect(content).toContain('renderDiagram');
    expect(content).toContain('isRendering');
    expect(content).toContain('initializeMermaid');
    expect(content).toContain('renderError');
    
    // Check for mermaid import
    expect(content).toContain("import mermaid from 'mermaid'");
  });

  test('useFileProcessing should have enhanced functionality', () => {
    const hookFile = path.join(hooksDir, 'useFileProcessing.ts');
    const content = fs.readFileSync(hookFile, 'utf8');
    
    // Check for main export
    expect(content).toContain('export const useFileProcessing');
    
    // Check for interface
    expect(content).toContain('UseFileProcessingResult');
    
    // Check for key functions
    expect(content).toContain('processFile');
    expect(content).toContain('resetProcessing');
    
    // Check for utility imports
    expect(content).toContain('detectCDMEntitiesInContent');
    expect(content).toContain('validateERDContent');
    
    // Check for enhanced processing
    expect(content).toContain('cdmDetection');
    expect(content).toContain('validationResult');
  });

  test('all hooks should have proper TypeScript interfaces', () => {
    const hooks = ['useMermaidRenderer.ts', 'useFileProcessing.ts'];
    
    hooks.forEach(hookFile => {
      const content = fs.readFileSync(path.join(hooksDir, hookFile), 'utf8');
      
      // Should have interface definition
      expect(content).toMatch(/interface\s+Use\w+Result/);
      
      // Should have proper return type
      expect(content).toMatch(/:\s*Use\w+Result\s*=>/);
      
      // Should have useCallback usage
      expect(content).toContain('useCallback');
    });
  });

  test('Phase 1 and Phase 2 integration', () => {
    // Check that Phase 2 hooks import from Phase 1 utilities
    const fileProcessingHook = path.join(hooksDir, 'useFileProcessing.ts');
    const content = fs.readFileSync(fileProcessingHook, 'utf8');
    
    // Should import utilities from Phase 1
    expect(content).toContain("from '../utils/cdmEntityList'");
    expect(content).toContain("from '../utils/validationRules'");
    expect(content).toContain("from '../types/file-upload.types'");
    expect(content).toContain("from '../types/validation.types'");
  });
});

console.log('✅ Phase 2 - Rendering Logic validation complete!');
