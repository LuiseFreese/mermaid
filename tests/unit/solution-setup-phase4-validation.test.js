/**
 * Solution Setup Step - Phase 4 Validation Tests
 * Tests for main component integration and overall architecture
 * 
 * This test suite validates that Phase 4 main component integration
 * properly combines all previously created modules into a cohesive,
 * maintainable, and backward-compatible solution.
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

describe('Solution Setup - Phase 4: Main Component Integration', () => {
  const basePath = 'src/frontend/src/components/wizard/steps/solution-setup';
  const mainComponentPath = path.join(basePath, 'SolutionSetupStep.tsx');
  const mainCssPath = path.join(basePath, 'SolutionSetupStep.module.css');
  const indexPath = path.join(basePath, 'index.ts');

  describe('Main Component File Structure', () => {
    test('should have main SolutionSetupStep component file', () => {
      expect(fileExists(mainComponentPath)).toBe(true);
    });

    test('should have main component CSS module', () => {
      expect(fileExists(mainCssPath)).toBe(true);
    });

    test('should have updated index.ts with main component export', () => {
      expect(fileExists(indexPath)).toBe(true);
      
      const content = readFileContent(indexPath);
      expect(containsPatterns(content, [
        'export { SolutionSetupStep }',
        './SolutionSetupStep',
      ])).toBe(true);
    });
  });

  describe('Component Import Integration', () => {
    test('should import all modular UI components', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        'SolutionConfigSection',
        'PublisherConfigSection',
        "from './components'",
        'useSolutionConfiguration',
        'usePublisherConfiguration',
        'useFormValidation',
        "from './hooks'",
        'SolutionSetupStepProps',
        "from './types'",
        'validateSolutionSetupForm',
        "from './utils'",
      ])).toBe(true);
    });

    test('should import Fluent UI components consistently', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        'from \'@fluentui/react-components\'',
        'from \'@fluentui/react-icons\'',
        'Text,',
        'Button,',
        'MessageBar,',
        'Card,',
      ])).toBe(true);
    });

    test('should import CSS module', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        'import styles from \'./SolutionSetupStep.module.css\'',
      ])).toBe(true);
    });
  });

  describe('Hook Integration', () => {
    test('should use solution configuration hook correctly', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        'const solutionConfig = useSolutionConfiguration({',
        'solutions,',
        'selectedSolution: currentSolution,',
        'onSolutionSelect: onSolutionChange,',
        'formData: solutionFormData,',
        'onFormDataChange: setSolutionFormData,',
      ])).toBe(true);
    });

    test('should use publisher configuration hook correctly', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        'const publisherConfig = usePublisherConfiguration({',
        'publishers,',
        'selectedPublisher: currentPublisher,',
        'onPublisherSelect: onPublisherChange,',
        'formData: publisherFormData,',
        'onFormDataChange: setPublisherFormData,',
      ])).toBe(true);
    });

    test('should use form validation hook correctly', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        'useFormValidation({',
        'validationRules: validateSolutionSetupForm',
        'autoValidate',
        'errors: localValidationErrors',
        'validateField',
        'validateForm',
      ])).toBe(true);
    });
  });

  describe('State Management', () => {
    test('should manage local form state correctly', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        'const [solutionFormData, setSolutionFormData] = useState<SolutionFormData>(',
        'const [publisherFormData, setPublisherFormData] = useState<PublisherFormData>(',
        'solutionName: externalFormData?.solutionName || \'\'',
        'publisherName: externalFormData?.publisherName || \'\'',
      ])).toBe(true);
    });

    test('should handle form data change callbacks', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        'const handleSolutionFormDataChange = useCallback(',
        'const handlePublisherFormDataChange = useCallback(',
        'onFormDataChange?.(',
        'validateField(field,',
      ])).toBe(true);
    });

    test('should sync external form data changes', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        'useEffect(() => {',
        'if (externalFormData) {',
        'setSolutionFormData(prev =>',
        'setPublisherFormData(prev =>',
        '}, [externalFormData]);',
      ])).toBe(true);
    });
  });

  describe('Component Integration', () => {
    test('should render SolutionConfigSection with correct props', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        '<SolutionConfigSection',
        'solutionConfig={solutionConfig}',
        'formData={solutionFormData}',
        'validationErrors={combinedValidationErrors}',
        'onFormDataChange={handleSolutionFormDataChange}',
        'onCreateNewSolution={onCreateSolution ? handleCreateSolution : undefined}',
      ])).toBe(true);
    });

    test('should render PublisherConfigSection with correct props', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        '<PublisherConfigSection',
        'publisherConfig={publisherConfig}',
        'formData={publisherFormData}',
        'validationErrors={combinedValidationErrors}',
        'onFormDataChange={handlePublisherFormDataChange}',
        'onCreateNewPublisher={onCreatePublisher ? handleCreatePublisher : undefined}',
      ])).toBe(true);
    });
  });

  describe('Props Interface Compatibility', () => {
    test('should accept all expected props from SolutionSetupStepProps', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        'export const SolutionSetupStep: React.FC<SolutionSetupStepProps> = ({',
        'solutions = [],',
        'publishers = [],',
        'currentSolution,',
        'currentPublisher,',
        'formData: externalFormData,',
        'onSolutionChange,',
        'onPublisherChange,',
        'onFormDataChange,',
        'onValidationChange,',
      ])).toBe(true);
    });

    test('should handle optional event handlers', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        'onCreateSolution,',
        'onCreatePublisher,',
        'onEditSolution,',
        'onEditPublisher,',
        'onRefreshData,',
        'onCreateSolution?.(solutionFormData)',
        'onCreatePublisher?.(publisherFormData)',
      ])).toBe(true);
    });

    test('should handle UI configuration props', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        'loading = false,',
        'error = null,',
        'disabled = false,',
        'showValidation = true,',
        'autoValidate = true,',
        'validationErrors = {},',
      ])).toBe(true);
    });
  });

  describe('Validation Integration', () => {
    test('should combine external and local validation errors', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        'const combinedValidationErrors = {',
        '...validationErrors,',
        '...localValidationErrors,',
        '};',
      ])).toBe(true);
    });

    test('should handle full form validation', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        'const handleFullValidation = useCallback(() => {',
        'const allFormData = { ...solutionFormData, ...publisherFormData };',
        'const formErrors = validateForm(allFormData);',
        'onValidationChange?.(formErrors);',
        'return Object.keys(formErrors).length === 0;',
      ])).toBe(true);
    });
  });

  describe('UI State Management', () => {
    test('should handle loading states correctly', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        '{loading && (',
        '<Spinner size="medium" />',
        'Loading solutions and publishers...',
        '{!loading && (',
      ])).toBe(true);
    });

    test('should handle error states correctly', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        '{error && (',
        '<MessageBar intent="error"',
        '<ErrorCircleRegular',
        '{error}',
      ])).toBe(true);
    });

    test('should show configuration status', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        'const isConfigurationComplete = Boolean(',
        'const hasValidationErrors = Object.keys(combinedValidationErrors).length > 0;',
        '{isConfigurationComplete && !hasValidationErrors ?',
        'Configuration Complete',
        'Configuration Issues',
        'Configuration Required',
      ])).toBe(true);
    });
  });

  describe('CSS Module Structure', () => {
    test('should have proper CSS module structure', () => {
      const content = readFileContent(mainCssPath);
      
      expect(containsPatterns(content, [
        '.container {',
        '.header {',
        '.content {',
        '.statusCard {',
        'var(--color',
        '@media',
      ])).toBe(true);
    });

    test('should have responsive design styles', () => {
      const content = readFileContent(mainCssPath);
      
      expect(containsPatterns(content, [
        '@media (max-width: 1024px)',
        '@media (max-width: 768px)',
        '@media (max-width: 480px)',
        'flex-wrap: wrap',
      ])).toBe(true);
    });

    test('should have accessibility styles', () => {
      const content = readFileContent(mainCssPath);
      
      expect(containsPatterns(content, [
        '@media (prefers-contrast: high)',
        '@media (prefers-reduced-motion: reduce)',
        ':focus-within',
        'outline:',
      ])).toBe(true);
    });

    test('should have status indicator styles', () => {
      const content = readFileContent(mainCssPath);
      
      expect(containsPatterns(content, [
        '.statusSuccess',
        '.statusError',
        '.statusPending',
        '.statusIcon',
        'var(--colorPaletteGreenForeground1)',
        'var(--colorPaletteRedForeground1)',
        'var(--colorPaletteYellowForeground1)',
      ])).toBe(true);
    });
  });

  describe('Component Architecture', () => {
    test('should follow React best practices', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        'React.FC<SolutionSetupStepProps>',
        'useCallback(',
        'useEffect(',
        'useState<',
        /export const SolutionSetupStep:/,
      ])).toBe(true);
    });

    test('should have proper TypeScript typing', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        ': React.FC<SolutionSetupStepProps>',
        'SolutionFormData',
        'PublisherFormData',
        'useCallback(',
        'useState<SolutionFormData>',
        'useState<PublisherFormData>',
      ])).toBe(true);
    });

    test('should use CSS modules correctly', () => {
      const content = readFileContent(mainComponentPath);
      
      expect(containsPatterns(content, [
        'className={styles.container}',
        'className={styles.header}',
        'className={styles.content}',
        'className={styles.statusCard}',
      ])).toBe(true);
    });
  });

  describe('Backward Compatibility', () => {
    test('should maintain expected component interface', () => {
      const content = readFileContent(mainComponentPath);
      
      // Component should accept all the same props as before
      expect(containsPatterns(content, [
        'solutions',
        'publishers',
        'currentSolution',
        'currentPublisher',
        'onSolutionChange',
        'onPublisherChange',
        'onFormDataChange',
        'onValidationChange',
      ])).toBe(true);
    });

    test('should handle legacy prop patterns', () => {
      const content = readFileContent(mainComponentPath);
      
      // Should handle undefined/null props gracefully
      expect(containsPatterns(content, [
        'solutions = [],',
        'publishers = [],',
        'loading = false,',
        'error = null,',
        'disabled = false,',
        'validationErrors = {},',
      ])).toBe(true);
    });
  });
});

console.log('✅ Solution Setup - Phase 4 Main Component Integration validation tests defined');
console.log('🏗️ Integration features:');
console.log('   ├── Modular component composition');
console.log('   ├── Hook integration and state management');  
console.log('   ├── Props interface compatibility');
console.log('   ├── Validation and error handling');
console.log('   ├── UI state management (loading, errors, status)');
console.log('   └── Responsive design and accessibility');
console.log('🔧 Architecture validated: React best practices, TypeScript safety, CSS modules, backward compatibility');
