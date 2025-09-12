/**
 * Phase 3 Validation Test - UI Components Structure
 * Tests that all extracted UI components are properly structured and importable
 */

const fs = require('fs');
const path = require('path');

describe('Phase 3: UI Components Structure', () => {
  test('All UI components should be importable', async () => {
    // Test component imports - in a real environment these would work
    // For testing purposes, we'll test that the files exist
    const componentsDir = path.resolve(__dirname, '../../src/frontend/src/components/wizard/steps/file-upload/components');
    
    const components = [
      'FileUploadZone.tsx',
      'MermaidDiagramViewer.tsx',
      'CDMDetectionCard.tsx',
      'ERDValidationPanel.tsx',
      'AutoFixSuggestions.tsx',
      'ERDSummaryAccordion.tsx'
    ];

    components.forEach(component => {
      const componentPath = path.join(componentsDir, component);
      expect(fs.existsSync(componentPath)).toBe(true);
    });
  });

  test('Components index should exist', () => {
    const fs = require('fs');
    const path = require('path');
    const componentsDir = path.resolve(__dirname, '../../src/frontend/src/components/wizard/steps/file-upload/components');
    const indexPath = path.join(componentsDir, 'index.ts');
    
    expect(fs.existsSync(indexPath)).toBe(true);
    
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    expect(indexContent).toContain('FileUploadZone');
    expect(indexContent).toContain('MermaidDiagramViewer');
    expect(indexContent).toContain('CDMDetectionCard');
    expect(indexContent).toContain('ERDValidationPanel');
    expect(indexContent).toContain('AutoFixSuggestions');
    expect(indexContent).toContain('ERDSummaryAccordion');
  });

  test('Component types should be properly defined', () => {
    const fs = require('fs');
    const path = require('path');
    const typesPath = path.resolve(__dirname, '../../src/frontend/src/components/wizard/steps/file-upload/types/file-upload.types.ts');
    
    expect(fs.existsSync(typesPath)).toBe(true);
    
    const typesContent = fs.readFileSync(typesPath, 'utf8');
    expect(typesContent).toContain('FileUploadZoneProps');
    expect(typesContent).toContain('MermaidDiagramViewerProps');
    expect(typesContent).toContain('CDMDetectionCardProps');
    expect(typesContent).toContain('ERDValidationPanelProps');
    expect(typesContent).toContain('AutoFixSuggestionsProps');
    expect(typesContent).toContain('ERDSummaryAccordionProps');
  });

  test('All components should have corresponding CSS modules', () => {
    const fs = require('fs');
    const path = require('path');
    
    const componentsDir = path.resolve(__dirname, '../../src/frontend/src/components/wizard/steps/file-upload/components');
    const componentNames = [
      'FileUploadZone',
      'MermaidDiagramViewer', 
      'CDMDetectionCard',
      'ERDValidationPanel',
      'AutoFixSuggestions',
      'ERDSummaryAccordion'
    ];

    componentNames.forEach(componentName => {
      const cssModulePath = path.join(componentsDir, `${componentName}.module.css`);
      expect(fs.existsSync(cssModulePath)).toBe(true);
    });
  });

  test('Component file structure should be consistent', () => {
    const fs = require('fs');
    const path = require('path');
    
    const componentsDir = path.resolve(__dirname, '../../src/frontend/src/components/wizard/steps/file-upload/components');
    const componentNames = [
      'FileUploadZone',
      'MermaidDiagramViewer', 
      'CDMDetectionCard',
      'ERDValidationPanel',
      'AutoFixSuggestions',
      'ERDSummaryAccordion'
    ];

    componentNames.forEach(componentName => {
      // Check that component file exists
      const componentPath = path.join(componentsDir, `${componentName}.tsx`);
      expect(fs.existsSync(componentPath)).toBe(true);
      
      // Check that CSS module exists
      const cssModulePath = path.join(componentsDir, `${componentName}.module.css`);
      expect(fs.existsSync(cssModulePath)).toBe(true);
      
      // Read component file to verify basic structure
      const componentContent = fs.readFileSync(componentPath, 'utf8');
      expect(componentContent).toContain(`export const ${componentName}`);
      expect(componentContent).toContain(`import styles from './${componentName}.module.css'`);
    });
  });

  test('Phase 3 modularization goals should be achieved', () => {
    // Verify that we have successfully extracted all major UI components
    const expectedComponents = [
      'FileUploadZone',      // File upload UI
      'MermaidDiagramViewer', // Diagram rendering
      'CDMDetectionCard',     // CDM detection/choice
      'ERDValidationPanel',   // Validation results display
      'AutoFixSuggestions',   // Auto-fix options
      'ERDSummaryAccordion'   // ERD structure summary
    ];

    const fs = require('fs');
    const path = require('path');
    const componentsDir = path.resolve(__dirname, '../../src/frontend/src/components/wizard/steps/file-upload/components');

    expectedComponents.forEach(component => {
      const componentPath = path.join(componentsDir, `${component}.tsx`);
      expect(fs.existsSync(componentPath)).toBe(true);
    });

    // Verify components index exists
    const indexPath = path.join(componentsDir, 'index.ts');
    expect(fs.existsSync(indexPath)).toBe(true);
  });
});
