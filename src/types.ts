// ===== Color Types =====

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface ColorInfo {
  hex: string;
  rgb: string;
  hsl: string;
  name: string;
}

export interface PaletteColor {
  hex: string;
  rgb: string;
  hsl: string;
  role: string;
  usage: string;
}

export interface ColorPalette {
  [key: string]: unknown;
  scheme: string;
  base_color: string;
  colors: PaletteColor[];
  css_variables: Record<string, string>;
}

// ===== Typography Types =====

export interface FontInfo {
  name: string;
  family: string;
  category: string;
  weights: number[];
  fallback: string;
}

export interface FontPairing {
  [key: string]: unknown;
  display_font: FontInfo;
  body_font: FontInfo;
  style: string;
  google_fonts_link: string;
  css_snippet: string;
  usage_notes: string[];
}

export interface TypeScaleItem {
  name: string;
  size: string;
  rem: string;
  line_height: string;
  weight: number;
  usage: string;
}

export interface TypographyScale {
  [key: string]: unknown;
  base_size: number;
  ratio: string;
  scale: TypeScaleItem[];
}

// ===== Spacing Types =====

export interface SpacingItem {
  name: string;
  px: number;
  rem: string;
  usage: string;
}

export interface SpacingScale {
  [key: string]: unknown;
  base_unit: number;
  strategy: string;
  scale: SpacingItem[];
  css_variables: Record<string, string>;
}

// ===== Shadow Types =====

export interface ShadowItem {
  name: string;
  css: string;
  usage: string;
}

export interface ShadowSystem {
  [key: string]: unknown;
  style: string;
  shadows: ShadowItem[];
  css_variables: Record<string, string>;
}

// ===== Border Radius Types =====

export interface RadiusItem {
  name: string;
  px: string;
  rem: string;
  usage: string;
}

export interface RadiusScale {
  [key: string]: unknown;
  style: string;
  scale: RadiusItem[];
  css_variables: Record<string, string>;
}

// ===== Design Tokens Types =====

export interface DesignTokens {
  [key: string]: unknown;
  style: string;
  tokens: {
    colors: Record<string, string>;
    typography: Record<string, string>;
    spacing: Record<string, string>;
    shadows: Record<string, string>;
    radii: Record<string, string>;
    transitions: Record<string, string>;
  };
  css: string;
}

// ===== Contrast Types =====

export interface ContrastResult {
  [key: string]: unknown;
  foreground: string;
  background: string;
  ratio: number;
  ratio_formatted: string;
  aa_normal: boolean;
  aa_large: boolean;
  aaa_normal: boolean;
  aaa_large: boolean;
  grade: string;
  recommendation: string;
}

// ===== Gradient Types =====

export interface GradientResult {
  [key: string]: unknown;
  type: string;
  css: string;
  colors: string[];
  angle: string;
  raw_stops: string[];
}

// ===== Breakpoint Types =====

export interface BreakpointItem {
  name: string;
  min_width: string;
  px: number;
  container_max: string;
  usage: string;
}

export interface BreakpointSystem {
  [key: string]: unknown;
  framework: string;
  strategy: string;
  breakpoints: BreakpointItem[];
  css: string;
}
