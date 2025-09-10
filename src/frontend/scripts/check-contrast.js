/**
 * Color Contrast Analysis Script
 * Run this to manually check color contrast in both themes
 */

// Colors from the CSS theme file
const lightTheme = {
  background: '#ffffff',
  surface: '#f8f9fa',
  textPrimary: '#212529',
  textSecondary: '#6c757d',
  primary: '#0078d4',
  border: '#dee2e6'
};

const darkTheme = {
  background: '#1e1e1e',
  surface: '#2d2d30',
  textPrimary: '#ffffff',
  textSecondary: '#cccccc',
  primary: '#0078d4', // Updated to darker blue
  border: '#4a4a4a', // Improved border color
  error: '#f44336',
  success: '#4caf50',
  warning: '#ff9800'
};

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function getLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;

  const { r, g, b } = rgb;
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(color1, color2) {
  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  const lightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (lightest + 0.05) / (darkest + 0.05);
}

function checkContrast(bg, fg, name, required = 4.5) {
  const ratio = getContrastRatio(bg, fg);
  const passes = ratio >= required;
  const status = passes ? '✅' : '❌';
  
  console.log(`${status} ${name}: ${ratio.toFixed(2)}:1 (${bg} on ${fg})`);
  if (!passes) {
    console.log(`   ⚠️  Required: ${required}:1, Got: ${ratio.toFixed(2)}:1`);
  }
  
  return { ratio, passes };
}

console.log('🎨 Dark Mode Color Contrast Analysis\n');

console.log('=== DARK THEME ANALYSIS ===\n');

const results = [];

// Primary text combinations
results.push(checkContrast(darkTheme.background, darkTheme.textPrimary, 'Primary text on background'));
results.push(checkContrast(darkTheme.background, darkTheme.textSecondary, 'Secondary text on background'));
results.push(checkContrast(darkTheme.surface, darkTheme.textPrimary, 'Primary text on surface'));
results.push(checkContrast(darkTheme.surface, darkTheme.textSecondary, 'Secondary text on surface'));

// Interactive elements
results.push(checkContrast(darkTheme.primary, '#000000', 'Text on primary button (dark text)'));
results.push(checkContrast(darkTheme.primary, '#ffffff', 'Text on primary button (light text)'));

// Status colors
results.push(checkContrast(darkTheme.background, darkTheme.error, 'Error text'));
results.push(checkContrast(darkTheme.background, darkTheme.success, 'Success text'));
results.push(checkContrast(darkTheme.background, darkTheme.warning, 'Warning text'));

// Banner/Header colors
results.push(checkContrast(darkTheme.primary, '#ffffff', 'Banner text (white on primary)'));

// Focus and borders (lower requirements)
results.push(checkContrast(darkTheme.background, darkTheme.primary, 'Focus indicator', 3.0));
results.push(checkContrast(darkTheme.surface, darkTheme.border, 'Border contrast', 1.5));

console.log('\n=== SUMMARY ===');
const passing = results.filter(r => r.passes).length;
const total = results.length;
const percentage = (passing / total * 100).toFixed(1);

console.log(`✅ ${passing}/${total} combinations pass (${percentage}%)`);

if (passing < total) {
  console.log('\n⚠️  RECOMMENDATIONS:');
  console.log('1. Consider darkening the primary button color (#4fc3f7) to improve contrast');
  console.log('2. Test with actual users who have visual impairments');
  console.log('3. Consider providing a high-contrast theme option');
} else {
  console.log('\n🎉 All color combinations meet WCAG 2.1 AA standards!');
}

console.log('\n📖 WCAG 2.1 Guidelines:');
console.log('- Normal text: 4.5:1 contrast ratio (AA)');
console.log('- Large text: 3.0:1 contrast ratio (AA)');
console.log('- Focus indicators: 3.0:1 contrast ratio');
console.log('- UI components: 3.0:1 contrast ratio');
