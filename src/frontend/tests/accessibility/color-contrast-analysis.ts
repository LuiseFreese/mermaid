/**
 * Color Contrast Analysis for Dark Mode
 * Manual analysis of color combinations used in the dark theme
 */

// WCAG 2.1 Guidelines:
// - Level AA: Normal text requires 4.5:1 contrast ratio
// - Level AA: Large text (18pt+/14pt+ bold) requires 3:1 contrast ratio
// - Level AAA: Normal text requires 7:1 contrast ratio
// - Level AAA: Large text requires 4.5:1 contrast ratio

interface ColorCombination {
  name: string;
  background: string;
  foreground: string;
  usage: string;
  wcagLevel: 'AA' | 'AAA';
  textSize: 'normal' | 'large';
}

const lightThemeColors: ColorCombination[] = [
  {
    name: 'Primary Text on Background',
    background: '#ffffff', // --color-background
    foreground: '#212529', // --color-text-primary
    usage: 'Main content, headings, primary text',
    wcagLevel: 'AA',
    textSize: 'normal'
  },
  {
    name: 'Secondary Text on Background',
    background: '#ffffff', // --color-background
    foreground: '#6c757d', // --color-text-secondary
    usage: 'Helper text, labels, secondary information',
    wcagLevel: 'AA',
    textSize: 'normal'
  },
  {
    name: 'Primary Button',
    background: '#0078d4', // --color-primary
    foreground: '#ffffff',
    usage: 'Primary action buttons, CTAs',
    wcagLevel: 'AA',
    textSize: 'normal'
  },
  {
    name: 'Text on Surface',
    background: '#f8f9fa', // --color-surface
    foreground: '#212529', // --color-text-primary
    usage: 'Content on cards, panels',
    wcagLevel: 'AA',
    textSize: 'normal'
  }
];

const darkThemeColors: ColorCombination[] = [
  {
    name: 'Primary Text on Dark Background',
    background: '#1e1e1e', // --color-background
    foreground: '#ffffff', // --color-text-primary
    usage: 'Main content, headings, primary text',
    wcagLevel: 'AA',
    textSize: 'normal'
  },
  {
    name: 'Secondary Text on Dark Background',
    background: '#1e1e1e', // --color-background
    foreground: '#cccccc', // --color-text-secondary
    usage: 'Helper text, labels, secondary information',
    wcagLevel: 'AA',
    textSize: 'normal'
  },
  {
    name: 'Primary Button Dark Mode',
    background: '#4fc3f7', // --color-primary (dark mode)
    foreground: '#000000', // Should be dark text for this light blue
    usage: 'Primary action buttons, CTAs',
    wcagLevel: 'AA',
    textSize: 'normal'
  },
  {
    name: 'Text on Dark Surface',
    background: '#2d2d30', // --color-surface
    foreground: '#ffffff', // --color-text-primary
    usage: 'Content on cards, panels',
    wcagLevel: 'AA',
    textSize: 'normal'
  },
  {
    name: 'Error Text',
    background: '#1e1e1e', // --color-background
    foreground: '#f44336', // --color-error
    usage: 'Error messages, validation text',
    wcagLevel: 'AA',
    textSize: 'normal'
  },
  {
    name: 'Success Text',
    background: '#1e1e1e', // --color-background
    foreground: '#4caf50', // --color-success
    usage: 'Success messages, confirmations',
    wcagLevel: 'AA',
    textSize: 'normal'
  },
  {
    name: 'Warning Text',
    background: '#1e1e1e', // --color-background
    foreground: '#ff9800', // --color-warning
    usage: 'Warning messages, alerts',
    wcagLevel: 'AA',
    textSize: 'normal'
  }
];

/**
 * Convert hex to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * Calculate relative luminance
 */
function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;

  const { r, g, b } = rgb;
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors
 */
function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  const lightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (lightest + 0.05) / (darkest + 0.05);
}

/**
 * Check if contrast meets WCAG requirements
 */
function meetsWCAG(ratio: number, level: 'AA' | 'AAA', textSize: 'normal' | 'large'): boolean {
  if (level === 'AA') {
    return textSize === 'large' ? ratio >= 3 : ratio >= 4.5;
  } else {
    return textSize === 'large' ? ratio >= 4.5 : ratio >= 7;
  }
}

/**
 * Analyze color combinations
 */
function analyzeColorCombinations(combinations: ColorCombination[], themeName: string) {
  console.log(`\n=== ${themeName} Color Contrast Analysis ===\n`);
  
  let totalCombinations = 0;
  let passingCombinations = 0;
  
  combinations.forEach(combo => {
    const ratio = getContrastRatio(combo.background, combo.foreground);
    const passes = meetsWCAG(ratio, combo.wcagLevel, combo.textSize);
    const status = passes ? '✅ PASS' : '❌ FAIL';
    
    totalCombinations++;
    if (passes) passingCombinations++;
    
    console.log(`${status} ${combo.name}`);
    console.log(`  Background: ${combo.background}`);
    console.log(`  Foreground: ${combo.foreground}`);
    console.log(`  Contrast Ratio: ${ratio.toFixed(2)}:1`);
    console.log(`  Required: ${combo.wcagLevel} ${combo.textSize === 'large' ? '(Large Text)' : '(Normal Text)'}`);
    console.log(`  Usage: ${combo.usage}`);
    console.log('');
  });
  
  console.log(`Summary: ${passingCombinations}/${totalCombinations} combinations pass WCAG requirements\n`);
  
  return {
    total: totalCombinations,
    passing: passingCombinations,
    percentage: (passingCombinations / totalCombinations) * 100
  };
}

// Export for testing
export {
  lightThemeColors,
  darkThemeColors,
  getContrastRatio,
  meetsWCAG,
  analyzeColorCombinations
};

// Run analysis if this file is executed directly
if (typeof window !== 'undefined') {
  console.log('🎨 Running Color Contrast Analysis for Theme System...\n');
  
  const lightResults = analyzeColorCombinations(lightThemeColors, 'Light Theme');
  const darkResults = analyzeColorCombinations(darkThemeColors, 'Dark Theme');
  
  console.log('📊 Overall Results:');
  console.log(`Light Theme: ${lightResults.percentage.toFixed(1)}% passing`);
  console.log(`Dark Theme: ${darkResults.percentage.toFixed(1)}% passing`);
  
  if (darkResults.percentage < 100) {
    console.log('\n⚠️  Issues found in dark theme color combinations!');
    console.log('Consider adjusting colors to meet WCAG 2.1 AA standards.');
  } else {
    console.log('\n✅ All color combinations meet accessibility standards!');
  }
}
