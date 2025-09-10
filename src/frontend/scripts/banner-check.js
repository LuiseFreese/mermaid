// Quick banner contrast check
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

// Banner contrast check
const bannerBg = '#0078d4'; // Primary blue
const bannerText = '#ffffff'; // White text
const ratio = getContrastRatio(bannerBg, bannerText);

console.log(`Banner Contrast Analysis:`);
console.log(`Background: ${bannerBg}`);
console.log(`Text: ${bannerText}`);
console.log(`Contrast Ratio: ${ratio.toFixed(2)}:1`);
console.log(`WCAG AA Compliant: ${ratio >= 4.5 ? 'Yes' : 'No'}`);
console.log(`WCAG AAA Compliant: ${ratio >= 7 ? 'Yes' : 'No'}`);
