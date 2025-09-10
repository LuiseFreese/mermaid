import { createLightTheme, createDarkTheme, BrandVariants } from '@fluentui/react-components';

// Custom brand ramp for the application
const brandRamp: BrandVariants = {
  10: "#020305",
  20: "#111418", 
  30: "#16202D",
  40: "#1B2B42",
  50: "#203757",
  60: "#25446C",
  70: "#2A5282",
  80: "#2F5F97",
  90: "#346DAC",
  100: "#387CC1",
  110: "#3D8AD6",
  120: "#4299EB",
  130: "#47A7FF",
  140: "#62B4FF",
  150: "#7CC2FF",
  160: "#96CFFF"
};

export const lightTheme = createLightTheme(brandRamp);
export const darkTheme = createDarkTheme(brandRamp);

// Export for use in other components
export { brandRamp };
