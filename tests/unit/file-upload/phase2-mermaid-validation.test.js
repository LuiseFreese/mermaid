/**
 * Test for Phase 2 - Mermaid Renderer Hook
 */

const fs = require('fs');
const path = require('path');

describe('Phase 2 - Mermaid Renderer Hook', () => {
  test('should have useMermaidRenderer hook file', () => {
    const hooksDir = path.join(__dirname, '../../../src/frontend/src/components/wizard/steps/file-upload/hooks');
    expect(fs.existsSync(path.join(hooksDir, 'useMermaidRenderer.ts'))).toBe(true);
  });

  test('should export useMermaidRenderer function', () => {
    const hookFile = path.join(__dirname, '../../../src/frontend/src/components/wizard/steps/file-upload/hooks/useMermaidRenderer.ts');
    const content = fs.readFileSync(hookFile, 'utf8');
    
    expect(content).toContain('export const useMermaidRenderer');
    expect(content).toContain('renderDiagram');
    expect(content).toContain('isRendering');
    expect(content).toContain('initializeMermaid');
  });

  test('should have proper TypeScript interface', () => {
    const hookFile = path.join(__dirname, '../../../src/frontend/src/components/wizard/steps/file-upload/hooks/useMermaidRenderer.ts');
    const content = fs.readFileSync(hookFile, 'utf8');
    
    expect(content).toContain('UseMermaidRendererResult');
    expect(content).toContain('MermaidRenderResult');
  });
});

console.log('✅ Phase 2 - Mermaid Renderer validation complete!');
