/**
 * Phase 3 Complete Integration Test
 * Validates the complete modularization of FileUploadStep
 */

const fs = require('fs');
const path = require('path');

describe('Phase 3: Complete FileUploadStep Modularization', () => {
  const baseDir = path.resolve(__dirname, '../../src/frontend/src/components/wizard/steps/file-upload');

  test('Main FileUploadStep orchestrator should exist and be properly structured', () => {
    const orchestratorPath = path.join(baseDir, 'FileUploadStep.tsx');
    expect(fs.existsSync(orchestratorPath)).toBe(true);
    
    const content = fs.readFileSync(orchestratorPath, 'utf8');
    
    // Should import all custom hooks
    expect(content).toContain("import { useFileProcessing }");
    expect(content).toContain("import { useCDMDetection }");
    expect(content).toContain("import { useERDValidation }");
    expect(content).toContain("import { useAutoFix }");
    expect(content).toContain("import { useMermaidRenderer }");
    
    // Should import all UI components
    expect(content).toContain("FileUploadZone");
    expect(content).toContain("MermaidDiagramViewer");
    expect(content).toContain("CDMDetectionCard");
    expect(content).toContain("ERDValidationPanel");
    expect(content).toContain("AutoFixSuggestions");
    expect(content).toContain("ERDSummaryAccordion");
    
    // Should export the main component
    expect(content).toContain("export const FileUploadStep");
  });

  test('All Phase 1 utilities and hooks should exist', () => {
    const phase1Files = [
      'utils/cdmEntityList.ts',
      'utils/erdParser.ts', 
      'utils/validationRules.ts',
      'types/file-upload.types.ts',
      'types/validation.types.ts',
      'hooks/useFileProcessing.ts',
      'hooks/useCDMDetection.ts',
      'hooks/useERDValidation.ts',
      'hooks/useAutoFix.ts',
      'hooks/useMermaidRenderer.ts'
    ];

    phase1Files.forEach(file => {
      const filePath = path.join(baseDir, file);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  test('All Phase 3 UI components should exist', () => {
    const componentFiles = [
      'components/FileUploadZone.tsx',
      'components/MermaidDiagramViewer.tsx',
      'components/CDMDetectionCard.tsx',
      'components/ERDValidationPanel.tsx',
      'components/AutoFixSuggestions.tsx',
      'components/ERDSummaryAccordion.tsx'
    ];

    componentFiles.forEach(file => {
      const filePath = path.join(baseDir, file);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  test('All components should have corresponding CSS modules', () => {
    const componentNames = [
      'FileUploadZone',
      'MermaidDiagramViewer',
      'CDMDetectionCard', 
      'ERDValidationPanel',
      'AutoFixSuggestions',
      'ERDSummaryAccordion',
      'FileUploadStep' // Main orchestrator
    ];

    componentNames.forEach(component => {
      const cssPath = path.join(baseDir, component === 'FileUploadStep' ? 
        'FileUploadStep.module.css' : 
        `components/${component}.module.css`);
      expect(fs.existsSync(cssPath)).toBe(true);
    });
  });

  test('Index files should properly export all modules', () => {
    // Main index file
    const mainIndexPath = path.join(baseDir, 'index.ts');
    expect(fs.existsSync(mainIndexPath)).toBe(true);
    
    const mainIndexContent = fs.readFileSync(mainIndexPath, 'utf8');
    expect(mainIndexContent).toContain('export { FileUploadStep }');
    expect(mainIndexContent).toContain('export {');
    expect(mainIndexContent).toContain('FileUploadZone');
    expect(mainIndexContent).toContain('export type {');
    
    // Components index file
    const componentsIndexPath = path.join(baseDir, 'components/index.ts');
    expect(fs.existsSync(componentsIndexPath)).toBe(true);
    
    const componentsIndexContent = fs.readFileSync(componentsIndexPath, 'utf8');
    expect(componentsIndexContent).toContain('export { FileUploadZone }');
    expect(componentsIndexContent).toContain('export { ERDSummaryAccordion }');
    
    // Hooks index file
    const hooksIndexPath = path.join(baseDir, 'hooks/index.ts');
    expect(fs.existsSync(hooksIndexPath)).toBe(true);
    
    const hooksIndexContent = fs.readFileSync(hooksIndexPath, 'utf8');
    expect(hooksIndexContent).toContain('export { useFileProcessing }');
    expect(hooksIndexContent).toContain('export { useMermaidRenderer }');
  });

  test('Directory structure should be properly organized', () => {
    const expectedStructure = [
      '',                    // Root
      'components',          // UI Components
      'hooks',              // Custom Hooks  
      'types',              // Type Definitions
      'utils'               // Utility Functions
    ];

    expectedStructure.forEach(dir => {
      const dirPath = path.join(baseDir, dir);
      expect(fs.existsSync(dirPath)).toBe(true);
      
      if (dir) {
        const stats = fs.statSync(dirPath);
        expect(stats.isDirectory()).toBe(true);
      }
    });
  });

  test('TypeScript types should be properly structured', () => {
    const typesPath = path.join(baseDir, 'types/file-upload.types.ts');
    const typesContent = fs.readFileSync(typesPath, 'utf8');
    
    // Core data types
    expect(typesContent).toContain('interface UploadedFile');
    expect(typesContent).toContain('interface CDMDetectionResult');
    expect(typesContent).toContain('interface ERDValidationResult');
    expect(typesContent).toContain('interface ValidationIssue');
    
    // Component props
    expect(typesContent).toContain('interface FileUploadZoneProps');
    expect(typesContent).toContain('interface ERDSummaryAccordionProps');
    
    // Utility types
    expect(typesContent).toContain('interface AutoFix');
    expect(typesContent).toContain('interface ERDStructure');
  });

  test('Modularization should achieve separation of concerns', () => {
    const orchestratorPath = path.join(baseDir, 'FileUploadStep.tsx');
    const orchestratorContent = fs.readFileSync(orchestratorPath, 'utf8');
    
    // Should focus on orchestration, not implementation details
    expect(orchestratorContent).toContain('useFileProcessing');
    expect(orchestratorContent).toContain('useCDMDetection');
    expect(orchestratorContent).not.toContain('mermaid.render');
    expect(orchestratorContent).not.toContain('fetch(');
    expect(orchestratorContent).not.toContain('XMLHttpRequest');
    
    // UI components should be cleanly separated
    const componentFiles = [
      'components/FileUploadZone.tsx',
      'components/CDMDetectionCard.tsx',
      'components/ERDValidationPanel.tsx'
    ];
    
    componentFiles.forEach(file => {
      const filePath = path.join(baseDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Each component should be focused and not contain business logic
      expect(content).toContain('React.FC');
      expect(content).toContain('export const');
      expect(content).not.toContain('axios');
      expect(content).not.toContain('useState');
    });
  });

  test('All phases should be successfully integrated', () => {
    // Phase 1: Utilities, types, and hooks ✓
    const phase1Complete = [
      'utils/cdmEntityList.ts',
      'hooks/useFileProcessing.ts',
      'types/file-upload.types.ts'
    ].every(file => fs.existsSync(path.join(baseDir, file)));
    
    // Phase 2: Rendering logic ✓
    const phase2Complete = [
      'hooks/useMermaidRenderer.ts',
      'hooks/useERDValidation.ts'
    ].every(file => fs.existsSync(path.join(baseDir, file)));
    
    // Phase 3: UI components ✓
    const phase3Complete = [
      'components/FileUploadZone.tsx',
      'components/ERDSummaryAccordion.tsx',
      'FileUploadStep.tsx'
    ].every(file => fs.existsSync(path.join(baseDir, file)));
    
    expect(phase1Complete).toBe(true);
    expect(phase2Complete).toBe(true);
    expect(phase3Complete).toBe(true);
  });

  test('Modularization should enable maintainability', () => {
    // Each hook should be focused and testable
    const hookFiles = [
      'hooks/useFileProcessing.ts',
      'hooks/useCDMDetection.ts',
      'hooks/useERDValidation.ts',
      'hooks/useAutoFix.ts',
      'hooks/useMermaidRenderer.ts'
    ];

    hookFiles.forEach(file => {
      const filePath = path.join(baseDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      expect(content).toContain('export const use');
      expect(content).toContain('useState');
      expect(content).toContain('useCallback');
    });

    // Each component should be reusable and well-typed
    const componentFiles = [
      'components/FileUploadZone.tsx',
      'components/CDMDetectionCard.tsx',
      'components/ERDValidationPanel.tsx'
    ];

    componentFiles.forEach(file => {
      const filePath = path.join(baseDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      expect(content).toContain('Props>');
      expect(content).toContain('className');
      expect(content).toContain('module.css');
    });
  });
});
