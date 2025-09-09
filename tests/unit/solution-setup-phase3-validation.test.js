/**
 * Solution Setup Step - Phase 3 Validation Tests
 * Tests for UI component extraction and integration
 * 
 * This test suite validates that all Phase 3 UI components are properly
 * structured, exported, and integrated with the solution setup system.
 */

const fs = require('fs');
const path = require('path');

// Test helper to check if file exists
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
}

// Test helper to read file content
function readFileContent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return '';
  }
}

// Test helper to check if content contains required patterns
function containsPatterns(content, patterns) {
  return patterns.every(pattern => {
    if (typeof pattern === 'string') {
      return content.includes(pattern);
    } else if (pattern instanceof RegExp) {
      return pattern.test(content);
    }
    return false;
  });
}

describe('Solution Setup - Phase 3: UI Component Extraction', () => {
  const basePath = 'src/frontend/src/components/wizard/steps/solution-setup';
  const componentsPath = path.join(basePath, 'components');

  describe('Component Directory Structure', () => {
    test('should have main components directory', () => {
      expect(fileExists(componentsPath)).toBe(true);
    });

    test('should have SearchableDropdown component directory', () => {
      const searchableDropdownPath = path.join(componentsPath, 'SearchableDropdown');
      expect(fileExists(searchableDropdownPath)).toBe(true);
    });

    test('should have SolutionConfigSection component directory', () => {
      const solutionConfigPath = path.join(componentsPath, 'SolutionConfigSection');
      expect(fileExists(solutionConfigPath)).toBe(true);
    });

    test('should have PublisherConfigSection component directory', () => {
      const publisherConfigPath = path.join(componentsPath, 'PublisherConfigSection');
      expect(fileExists(publisherConfigPath)).toBe(true);
    });
  });

  describe('SearchableDropdown Component', () => {
    const componentPath = path.join(componentsPath, 'SearchableDropdown');
    
    test('should have TypeScript component file', () => {
      const tsxPath = path.join(componentPath, 'SearchableDropdown.tsx');
      expect(fileExists(tsxPath)).toBe(true);
    });

    test('should have CSS module file', () => {
      const cssPath = path.join(componentPath, 'SearchableDropdown.module.css');
      expect(fileExists(cssPath)).toBe(true);
    });

    test('should have index export file', () => {
      const indexPath = path.join(componentPath, 'index.ts');
      expect(fileExists(indexPath)).toBe(true);
    });

    test('component should export SearchableDropdown and props interface', () => {
      const tsxPath = path.join(componentPath, 'SearchableDropdown.tsx');
      const content = readFileContent(tsxPath);
      
      expect(containsPatterns(content, [
        'export interface SearchableDropdownProps',
        'export const SearchableDropdown',
        'UseSearchableDropdownResult',
        'dropdownResult?:',
      ])).toBe(true);
    });

    test('component should have proper generic typing', () => {
      const tsxPath = path.join(componentPath, 'SearchableDropdown.tsx');
      const content = readFileContent(tsxPath);
      
      expect(containsPatterns(content, [
        /export const SearchableDropdown = React\.memo\(<T,>/,
        'items: T[]',
        'selectedItem: T | null',
        'onItemSelect: (item: T) => void',
      ])).toBe(true);
    });

    test('component should integrate with dropdown hook', () => {
      const tsxPath = path.join(componentPath, 'SearchableDropdown.tsx');
      const content = readFileContent(tsxPath);
      
      expect(containsPatterns(content, [
        'dropdownResult?.filteredItems',
        'dropdownResult?.selectedItem',
        'dropdownResult?.searchTerm',
        'dropdownResult?.isOpen',
        'dropdownResult.handleSearchChange',
        'dropdownResult.handleItemSelect',
      ])).toBe(true);
    });

    test('CSS should have responsive and accessible styles', () => {
      const cssPath = path.join(componentPath, 'SearchableDropdown.module.css');
      const content = readFileContent(cssPath);
      
      expect(containsPatterns(content, [
        '@media (max-width: 480px)',
        '@media (prefers-contrast: high)',
        '@media (prefers-reduced-motion: reduce)',
        ':focus',
        'animation:',
      ])).toBe(true);
    });

    test('index should export component and types', () => {
      const indexPath = path.join(componentPath, 'index.ts');
      const content = readFileContent(indexPath);
      
      expect(containsPatterns(content, [
        'export { SearchableDropdown }',
        'export type { SearchableDropdownProps }',
      ])).toBe(true);
    });
  });

  describe('SolutionConfigSection Component', () => {
    const componentPath = path.join(componentsPath, 'SolutionConfigSection');
    
    test('should have TypeScript component file', () => {
      const tsxPath = path.join(componentPath, 'SolutionConfigSection.tsx');
      expect(fileExists(tsxPath)).toBe(true);
    });

    test('should have CSS module file', () => {
      const cssPath = path.join(componentPath, 'SolutionConfigSection.module.css');
      expect(fileExists(cssPath)).toBe(true);
    });

    test('should have index export file', () => {
      const indexPath = path.join(componentPath, 'index.ts');
      expect(fileExists(indexPath)).toBe(true);
    });

    test('component should integrate solution configuration hook', () => {
      const tsxPath = path.join(componentPath, 'SolutionConfigSection.tsx');
      const content = readFileContent(tsxPath);
      
      expect(containsPatterns(content, [
        'UseSolutionConfigurationResult',
        'solutionConfig: UseSolutionConfigurationResult',
        'solutions,',
        'selectedSolution,',
        'searchDropdown,',
      ])).toBe(true);
    });

    test('component should use SearchableDropdown', () => {
      const tsxPath = path.join(componentPath, 'SolutionConfigSection.tsx');
      const content = readFileContent(tsxPath);
      
      expect(containsPatterns(content, [
        'import { SearchableDropdown }',
        '<SearchableDropdown',
        'renderItem={renderSolutionItem}',
        'dropdownResult={searchDropdown}',
      ])).toBe(true);
    });

    test('component should handle form data and validation', () => {
      const tsxPath = path.join(componentPath, 'SolutionConfigSection.tsx');
      const content = readFileContent(tsxPath);
      
      expect(containsPatterns(content, [
        'SolutionFormData',
        'SolutionValidationErrors',
        'formData: SolutionFormData',
        'validationErrors: SolutionValidationErrors',
        'onFormDataChange:',
      ])).toBe(true);
    });

    test('component should render solution items properly', () => {
      const tsxPath = path.join(componentPath, 'SolutionConfigSection.tsx');
      const content = readFileContent(tsxPath);
      
      expect(containsPatterns(content, [
        'renderSolutionItem = (solution: DataverseSolution)',
        'solution.friendlyname',
        'solution.ismanaged',
        'solution.version',
        'solution.description',
      ])).toBe(true);
    });
  });

  describe('PublisherConfigSection Component', () => {
    const componentPath = path.join(componentsPath, 'PublisherConfigSection');
    
    test('should have TypeScript component file', () => {
      const tsxPath = path.join(componentPath, 'PublisherConfigSection.tsx');
      expect(fileExists(tsxPath)).toBe(true);
    });

    test('should have CSS module file', () => {
      const cssPath = path.join(componentPath, 'PublisherConfigSection.module.css');
      expect(fileExists(cssPath)).toBe(true);
    });

    test('should have index export file', () => {
      const indexPath = path.join(componentPath, 'index.ts');
      expect(fileExists(indexPath)).toBe(true);
    });

    test('component should integrate publisher configuration hook', () => {
      const tsxPath = path.join(componentPath, 'PublisherConfigSection.tsx');
      const content = readFileContent(tsxPath);
      
      expect(containsPatterns(content, [
        'UsePublisherConfigurationResult',
        'publisherConfig: UsePublisherConfigurationResult',
        'publishers,',
        'selectedPublisher,',
        'searchDropdown,',
      ])).toBe(true);
    });

    test('component should use SearchableDropdown', () => {
      const tsxPath = path.join(componentPath, 'PublisherConfigSection.tsx');
      const content = readFileContent(tsxPath);
      
      expect(containsPatterns(content, [
        'import { SearchableDropdown }',
        '<SearchableDropdown',
        'renderItem={renderPublisherItem}',
        'dropdownResult={searchDropdown}',
      ])).toBe(true);
    });

    test('component should handle form data and validation', () => {
      const tsxPath = path.join(componentPath, 'PublisherConfigSection.tsx');
      const content = readFileContent(tsxPath);
      
      expect(containsPatterns(content, [
        'PublisherFormData',
        'PublisherValidationErrors',
        'formData: PublisherFormData',
        'validationErrors: PublisherValidationErrors',
        'onFormDataChange:',
      ])).toBe(true);
    });

    test('component should render publisher items properly', () => {
      const tsxPath = path.join(componentPath, 'PublisherConfigSection.tsx');
      const content = readFileContent(tsxPath);
      
      expect(containsPatterns(content, [
        'renderPublisherItem = (publisher: DataversePublisher)',
        'publisher.friendlyname',
        'publisher.isreadonly',
        'publisher.customizationprefix',
        'PersonRegular',
      ])).toBe(true);
    });
  });

  describe('Component Integration', () => {
    test('main components index should export all components', () => {
      const indexPath = path.join(componentsPath, 'index.ts');
      const content = readFileContent(indexPath);
      
      expect(containsPatterns(content, [
        'export { SearchableDropdown }',
        'export { SolutionConfigSection }',
        'export { PublisherConfigSection }',
        'export type { SearchableDropdownProps }',
        'export type { SolutionConfigSectionProps }',
        'export type { PublisherConfigSectionProps }',
      ])).toBe(true);
    });

    test('components should import from correct module paths', () => {
      const solutionConfigPath = path.join(componentsPath, 'SolutionConfigSection', 'SolutionConfigSection.tsx');
      const publisherConfigPath = path.join(componentsPath, 'PublisherConfigSection', 'PublisherConfigSection.tsx');
      
      const solutionContent = readFileContent(solutionConfigPath);
      const publisherContent = readFileContent(publisherConfigPath);
      
      expect(containsPatterns(solutionContent, [
        "import { SearchableDropdown } from '../SearchableDropdown'",
        "from '../../types'",
      ])).toBe(true);
      
      expect(containsPatterns(publisherContent, [
        "import { SearchableDropdown } from '../SearchableDropdown'",
        "from '../../types'",
      ])).toBe(true);
    });

    test('components should use Fluent UI consistently', () => {
      const searchableDropdownPath = path.join(componentsPath, 'SearchableDropdown', 'SearchableDropdown.tsx');
      const solutionConfigPath = path.join(componentsPath, 'SolutionConfigSection', 'SolutionConfigSection.tsx');
      const publisherConfigPath = path.join(componentsPath, 'PublisherConfigSection', 'PublisherConfigSection.tsx');
      
      [searchableDropdownPath, solutionConfigPath, publisherConfigPath].forEach(filePath => {
        const content = readFileContent(filePath);
        expect(containsPatterns(content, [
          "from '@fluentui/react-components'",
          "from '@fluentui/react-icons'",
        ])).toBe(true);
      });
    });
  });

  describe('TypeScript Integration', () => {
    test('components should use proper type imports', () => {
      const solutionConfigPath = path.join(componentsPath, 'SolutionConfigSection', 'SolutionConfigSection.tsx');
      const publisherConfigPath = path.join(componentsPath, 'PublisherConfigSection', 'PublisherConfigSection.tsx');
      
      const solutionContent = readFileContent(solutionConfigPath);
      const publisherContent = readFileContent(publisherConfigPath);
      
      expect(containsPatterns(solutionContent, [
        'DataverseSolution',
        'SolutionFormData',
        'SolutionValidationErrors',
        'UseSolutionConfigurationResult',
      ])).toBe(true);
      
      expect(containsPatterns(publisherContent, [
        'DataversePublisher',
        'PublisherFormData',
        'PublisherValidationErrors',
        'UsePublisherConfigurationResult',
      ])).toBe(true);
    });

    test('components should export proper TypeScript interfaces', () => {
      const searchableDropdownPath = path.join(componentsPath, 'SearchableDropdown', 'SearchableDropdown.tsx');
      const solutionConfigPath = path.join(componentsPath, 'SolutionConfigSection', 'SolutionConfigSection.tsx');
      const publisherConfigPath = path.join(componentsPath, 'PublisherConfigSection', 'PublisherConfigSection.tsx');
      
      const searchableContent = readFileContent(searchableDropdownPath);
      const solutionContent = readFileContent(solutionConfigPath);
      const publisherContent = readFileContent(publisherConfigPath);
      
      expect(containsPatterns(searchableContent, [
        'export interface SearchableDropdownProps<T>',
      ])).toBe(true);
      
      expect(containsPatterns(solutionContent, [
        'export interface SolutionConfigSectionProps',
      ])).toBe(true);
      
      expect(containsPatterns(publisherContent, [
        'export interface PublisherConfigSectionProps',
      ])).toBe(true);
    });
  });

  describe('CSS Module Structure', () => {
    test('all components should have proper CSS module naming', () => {
      const cssFiles = [
        path.join(componentsPath, 'SearchableDropdown', 'SearchableDropdown.module.css'),
        path.join(componentsPath, 'SolutionConfigSection', 'SolutionConfigSection.module.css'),
        path.join(componentsPath, 'PublisherConfigSection', 'PublisherConfigSection.module.css'),
      ];
      
      // SearchableDropdown uses .field instead of .container
      const searchableDropdownContent = readFileContent(cssFiles[0]);
      expect(containsPatterns(searchableDropdownContent, [
        '.field',
        'var(--color',
        '@media',
      ])).toBe(true);
      
      // Other components use .container
      [cssFiles[1], cssFiles[2]].forEach(cssFile => {
        const content = readFileContent(cssFile);
        expect(containsPatterns(content, [
          '.container',
          'var(--color',
          '@media',
        ])).toBe(true);
      });
    });

    test('CSS modules should have accessibility features', () => {
      const cssFiles = [
        path.join(componentsPath, 'SearchableDropdown', 'SearchableDropdown.module.css'),
        path.join(componentsPath, 'SolutionConfigSection', 'SolutionConfigSection.module.css'),
        path.join(componentsPath, 'PublisherConfigSection', 'PublisherConfigSection.module.css'),
      ];
      
      cssFiles.forEach(cssFile => {
        const content = readFileContent(cssFile);
        expect(containsPatterns(content, [
          ':focus',
          '@media (prefers-contrast: high)',
        ])).toBe(true);
      });
    });
  });
});

console.log('✅ Solution Setup - Phase 3 UI Component Extraction validation tests defined');
console.log('📁 Component structure:');
console.log('   └── components/');
console.log('       ├── SearchableDropdown/');
console.log('       ├── SolutionConfigSection/');
console.log('       ├── PublisherConfigSection/');
console.log('       └── index.ts');
console.log('🔧 Features tested: Generic typing, Hook integration, Fluent UI usage, Responsive design, Accessibility');
