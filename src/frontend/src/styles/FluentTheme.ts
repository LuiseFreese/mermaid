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

// Pink brand ramp for the pink theme 🌸
const pinkBrandRamp: BrandVariants = {
  10: "#2D0A1A",
  20: "#4A0E2B",
  30: "#66123C",
  40: "#83164D",
  50: "#9F1A5E",
  60: "#BB1E6F",
  70: "#C71585", // Our accessible Medium Violet Red
  80: "#D71A95",
  90: "#E71EA5",
  100: "#F722B5",
  110: "#F73BC1",
  120: "#F854CD",
  130: "#F96DD9",
  140: "#FA86E5",
  150: "#FB9FF1",
  160: "#FCB8FD"
};

// Neon brand ramp for the synthwave/retrowave theme 🌈✨
const neonBrandRamp: BrandVariants = {
  10: "#0A0015",
  20: "#1A0033", 
  30: "#2D1B4E",
  40: "#4A2C7A",
  50: "#663DA6",
  60: "#8A2BE2", // BlueViolet - core neon purple
  70: "#9A44ED",
  80: "#AA5DF8",
  90: "#BA76FF",
  100: "#CA8FFF",
  110: "#DA8FFF",
  120: "#EA9FFF",
  130: "#FAAFFF",
  140: "#FF007F", // Neon pink accent
  150: "#FF4DA6",
  160: "#FF80CC"
};

export const lightTheme = createLightTheme(brandRamp);
export const darkTheme = createDarkTheme(brandRamp);
export const pinkTheme = createLightTheme(pinkBrandRamp);
export const neonTheme = createDarkTheme(neonBrandRamp);

// Export for use in other components
export { brandRamp, pinkBrandRamp, neonBrandRamp };
