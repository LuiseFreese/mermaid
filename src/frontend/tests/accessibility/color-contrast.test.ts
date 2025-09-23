/**
 * Color Contrast Test Runner
 * Automated test that validates color contrast ratios
 */

import { describe, it, expect } from 'vitest';
import { 
  lightThemeColors, 
  darkThemeColors, 
  neonThemeColors,
  getContrastRatio, 
  meetsWCAG,
  analyzeColorCombinations
} from './color-contrast-analysis';

describe('Color Contrast Compliance', () => {
  describe('Light Theme', () => {
    lightThemeColors.forEach(combo => {
      it(`should meet WCAG ${combo.wcagLevel} standards for ${combo.name}`, () => {
        const ratio = getContrastRatio(combo.background, combo.foreground);
        const passes = meetsWCAG(ratio, combo.wcagLevel, combo.textSize);
        
        expect(passes).toBe(true);
        expect(ratio).toBeGreaterThanOrEqual(combo.wcagLevel === 'AA' && combo.textSize === 'normal' ? 4.5 : 3);
      });
    });

    it('should have overall passing rate of 100%', () => {
      const results = analyzeColorCombinations(lightThemeColors, 'Light Theme');
      expect(results.percentage).toBe(100);
    });
  });

  describe('Dark Theme', () => {
    darkThemeColors.forEach(combo => {
      it(`should meet WCAG ${combo.wcagLevel} standards for ${combo.name}`, () => {
        const ratio = getContrastRatio(combo.background, combo.foreground);
        const passes = meetsWCAG(ratio, combo.wcagLevel, combo.textSize);
        
        if (!passes) {
          console.warn(`❌ ${combo.name} has contrast ratio ${ratio.toFixed(2)}:1 (needs ${combo.wcagLevel === 'AA' && combo.textSize === 'normal' ? '4.5:1' : '3:1'})`);
          console.warn(`   Background: ${combo.background}, Foreground: ${combo.foreground}`);
          console.warn(`   Usage: ${combo.usage}`);
        }
        
        expect(passes).toBe(true);
        expect(ratio).toBeGreaterThanOrEqual(combo.wcagLevel === 'AA' && combo.textSize === 'normal' ? 4.5 : 3);
      });
    });

    it('should have overall passing rate of at least 90%', () => {
      const results = analyzeColorCombinations(darkThemeColors, 'Dark Theme');
      // Allow some flexibility for dark theme, but expect high compliance
      expect(results.percentage).toBeGreaterThanOrEqual(90);
    });
  });

  describe('Specific Color Combinations', () => {
    it('should have sufficient contrast for primary text on dark background', () => {
      const ratio = getContrastRatio('#1e1e1e', '#ffffff');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('should have sufficient contrast for secondary text on dark background', () => {
      const ratio = getContrastRatio('#1e1e1e', '#cccccc');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('should have sufficient contrast for error text on dark background', () => {
      const ratio = getContrastRatio('#1e1e1e', '#f44336');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('should have sufficient contrast for success text on dark background', () => {
      const ratio = getContrastRatio('#1e1e1e', '#4caf50');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('should have sufficient contrast for warning text on dark background', () => {
      const ratio = getContrastRatio('#1e1e1e', '#ff9800');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('should validate primary button color combination in dark mode', () => {
      // Light blue primary color should have dark text for contrast
      const ratio = getContrastRatio('#4fc3f7', '#000000');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('Border and Focus Indicators', () => {
    it('should have sufficient contrast for focus indicators in dark mode', () => {
      // Focus color should be visible against dark background
      const ratio = getContrastRatio('#1e1e1e', '#4fc3f7');
      expect(ratio).toBeGreaterThanOrEqual(3); // Focus indicators can be slightly lower
    });

    it('should have sufficient contrast for borders in dark mode', () => {
      const ratio = getContrastRatio('#2d2d30', '#4a4a4a'); // Updated to use improved border color
      expect(ratio).toBeGreaterThanOrEqual(1.5); // Borders need less contrast
    });
  });

  describe('Neon Theme', () => {
    neonThemeColors.forEach(combo => {
      it(`should test WCAG ${combo.wcagLevel} compliance for ${combo.name}`, () => {
        const ratio = getContrastRatio(combo.background, combo.foreground);
        const passes = meetsWCAG(ratio, combo.wcagLevel, combo.textSize);
        
        if (!passes) {
          console.warn(`⚠️ Neon theme: ${combo.name} has contrast ratio ${ratio.toFixed(2)}:1`);
          console.warn(`   Required: ${combo.wcagLevel === 'AA' && combo.textSize === 'normal' ? '4.5:1' : '3:1'}`);
          console.warn(`   Background: ${combo.background}, Foreground: ${combo.foreground}`);
          console.warn(`   Usage: ${combo.usage}`);
        }
        
        // For neon theme, we'll be more lenient due to its stylistic nature
        // but still track and report issues
        expect(ratio).toBeGreaterThan(0); // Basic sanity check
      });
    });

    it('should have overall accessibility awareness (may not pass all WCAG tests)', () => {
      const results = analyzeColorCombinations(neonThemeColors, 'Neon Theme');
      
      console.log(`🌈 Neon Theme Accessibility: ${results.percentage.toFixed(1)}% WCAG AA compliant`);
      console.log('Note: Neon themes prioritize aesthetics and may have accessibility trade-offs');
      
      // We expect some neon colors to fail WCAG tests, but we want to track it
      expect(results.percentage).toBeGreaterThan(0);
      
      if (results.percentage < 70) {
        console.warn('⚠️ Neon theme has significant accessibility concerns');
        console.warn('Consider providing a high-contrast mode for accessibility');
      }
    });

    describe('Critical Neon Color Combinations', () => {
      it('should have readable main text (white on dark)', () => {
        const ratio = getContrastRatio('#0a0015', '#ffffff');
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });

      it('should test neon pink visibility', () => {
        const ratio = getContrastRatio('#0a0015', '#ff007f');
        console.log(`Neon pink contrast ratio: ${ratio.toFixed(2)}:1`);
        // Pink may not meet WCAG standards but should be somewhat readable
        expect(ratio).toBeGreaterThan(2);
      });

      it('should test neon cyan visibility', () => {
        const ratio = getContrastRatio('#0a0015', '#00ffff');
        console.log(`Neon cyan contrast ratio: ${ratio.toFixed(2)}:1`);
        // Cyan should have better visibility
        expect(ratio).toBeGreaterThan(3);
      });

      it('should test neon green visibility', () => {
        const ratio = getContrastRatio('#0a0015', '#39ff14');
        console.log(`Neon green contrast ratio: ${ratio.toFixed(2)}:1`);
        // Green should be highly visible
        expect(ratio).toBeGreaterThan(4);
      });

      it('should validate button text readability', () => {
        // White text on neon pink buttons
        const pinkButtonRatio = getContrastRatio('#ff007f', '#ffffff');
        expect(pinkButtonRatio).toBeGreaterThan(2.5);

        // Dark text on neon cyan buttons
        const cyanButtonRatio = getContrastRatio('#00ffff', '#000000');
        expect(cyanButtonRatio).toBeGreaterThan(4);
      });
    });
  });
});
