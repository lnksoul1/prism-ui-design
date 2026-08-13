export const CHARACTER_LIMIT = 30000;

export const SERVER_NAME = "ui-design-mcp-server";
export const SERVER_VERSION = "1.1.0";

// ===== Style Presets =====

export interface StylePreset {
  name: string;
  description: string;
  base_hue: number;
  saturation: number;
  lightness: number;
  shadow_style: "subtle" | "medium" | "sharp";
  radius_style: "none" | "sharp" | "subtle" | "rounded" | "pill";
  spacing_base: number;
  bg_light: string;
  bg_dark: string;
  text_light: string;
  text_dark: string;
  // —— V2 扩展字段（可选，向后兼容；完整数据见 style-presets-v2.ts） ——
  slug?: string;
  category?: StyleCategory;
  inspiration?: string;
  colors?: StyleColorSystem;
  font?: FontSystem;
  spacingScale?: SpacingScale;
  radiusScale?: RadiusScale;
  elevation?: ElevationScale;
  breakpoints?: BreakpointSet;
  maxContentWidth?: number;
  gridColumns?: number;
  a11y?: A11ySpec;
  doRules?: string[];
  dontRules?: string[];
  writingTone?: string[];
  qualityGates?: string[];
  recommendedReactBits?: string[];
}

// ===== V2 辅助类型（S1: 数据化设计系统字段） =====

export type StyleCategory =
  | "foundational"
  | "expressive"
  | "textured"
  | "editorial"
  | "technical"
  | "retro"
  | "playful"
  | "immersive";

export interface SemanticColor {
  primary: string;
  onPrimary: string;
  primaryHover: string;
  primaryFocus: string;
  primaryPressed: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
}

export interface SurfaceScale {
  canvas: string;
  surface1: string;
  surface2: string;
  surface3: string;
  surface4: string;
}

export interface TextScale {
  ink: string;
  inkMuted: string;
  inkSubtle: string;
  inkTertiary: string;
}

export interface BorderScale {
  hairline: string;
  hairlineStrong: string;
  hairlineTertiary: string;
}

export interface StyleColorSystem {
  light: SemanticColor;
  dark: SemanticColor;
  surfaceLight: SurfaceScale;
  surfaceDark: SurfaceScale;
  textLight: TextScale;
  textDark: TextScale;
  borderLight: BorderScale;
  borderDark: BorderScale;
  inverse?: Partial<SemanticColor & SurfaceScale & TextScale>;
}

export interface FontDef {
  name: string;
  family: string;
  weights: number[];
  substitutes?: string[];
}

export interface TypeToken {
  name: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
}

export interface FontSystem {
  display: FontDef;
  body: FontDef;
  mono: FontDef;
  typeScale: TypeToken[];
}

export interface RadiusScale {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  pill: number;
  full: number;
}

export interface ElevationScale {
  e0: string;
  e1: string;
  e2: string;
  e3: string;
  e4: string;
}

export interface SpacingScale {
  xxs: number;
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  section: number;
}

export interface BreakpointSet {
  mobile: number;
  mobileLg: number;
  tablet: number;
  desktop: number;
  desktopXL: number;
}

export interface A11ySpec {
  wcagLevel: "AA" | "AAA";
  keyboardFirst: boolean;
  minTouchTarget: number;
  focusRingSpec: string;
}

// 14 style presets (spec 3.5): the original 6 + 8 trend-aligned styles.
export const STYLE_PRESETS: Record<string, StylePreset> = {
  minimal: {
    name: "Minimal",
    description: "中性灰、留白、无衬线 Inter 字体、4px 小圆角",
    base_hue: 220,
    saturation: 10,
    lightness: 50,
    shadow_style: "subtle",
    radius_style: "sharp",
    spacing_base: 8,
    bg_light: "#ffffff",
    bg_dark: "#0f1115",
    text_light: "#1a1a2e",
    text_dark: "#e8e8ec",
  },
  bold: {
    name: "Bold",
    description: "210° 蓝、高饱和、无圆角、强视觉层级",
    base_hue: 210,
    saturation: 80,
    lightness: 50,
    shadow_style: "medium",
    radius_style: "none",
    spacing_base: 8,
    bg_light: "#fafafa",
    bg_dark: "#12101f",
    text_light: "#0d0d0d",
    text_dark: "#f0f0f5",
  },
  playful: {
    name: "Playful",
    description: "330° 粉、Poppins/Nunito、黄金比例、16px 大圆角",
    base_hue: 330,
    saturation: 70,
    lightness: 60,
    shadow_style: "medium",
    radius_style: "pill",
    spacing_base: 8,
    bg_light: "#fff8f6",
    bg_dark: "#1a1015",
    text_light: "#2d1b2e",
    text_dark: "#fce8e4",
  },
  dark: {
    name: "Dark",
    description: "260° 紫、深色优先、JetBrains Mono 点缀",
    base_hue: 260,
    saturation: 60,
    lightness: 40,
    shadow_style: "sharp",
    radius_style: "rounded",
    spacing_base: 8,
    bg_light: "#f5f7fa",
    bg_dark: "#0a0e14",
    text_light: "#0a0e14",
    text_dark: "#c9d1d9",
  },
  editorial: {
    name: "Editorial",
    description: "30° 棕、Playfair Display 衬线、无圆角",
    base_hue: 30,
    saturation: 30,
    lightness: 40,
    shadow_style: "subtle",
    radius_style: "none",
    spacing_base: 8,
    bg_light: "#fdfcfa",
    bg_dark: "#161310",
    text_light: "#1c1917",
    text_dark: "#e7e5e4",
  },
  tech: {
    name: "Tech",
    description: "190° 青、Space Grotesk/JetBrains Mono、6px 小圆角",
    base_hue: 190,
    saturation: 70,
    lightness: 50,
    shadow_style: "sharp",
    radius_style: "subtle",
    spacing_base: 4,
    bg_light: "#f8fafc",
    bg_dark: "#080d14",
    text_light: "#0f172a",
    text_dark: "#cbd5e1",
  },
  glassmorphism: {
    name: "Glassmorphism",
    description: "240° 蓝、Outfit/Inter、12px 圆角、毛玻璃质感",
    base_hue: 240,
    saturation: 40,
    lightness: 55,
    shadow_style: "subtle",
    radius_style: "rounded",
    spacing_base: 8,
    bg_light: "#EEF2FF",
    bg_dark: "#111631",
    text_light: "#312E81",
    text_dark: "#E0E7FF",
  },
  neumorphism: {
    name: "Neumorphism",
    description: "220° 灰、Nunito Sans、12px 圆角、软 UI 双阴影",
    base_hue: 220,
    saturation: 8,
    lightness: 65,
    shadow_style: "medium",
    radius_style: "rounded",
    spacing_base: 8,
    bg_light: "#E0E5EC",
    bg_dark: "#23272E",
    text_light: "#4B5563",
    text_dark: "#D1D5DB",
  },
  claymorphism: {
    name: "Claymorphism",
    description: "320° 粉、Quicksand/Nunito、药丸圆角、3D 粘土质感",
    base_hue: 320,
    saturation: 50,
    lightness: 70,
    shadow_style: "medium",
    radius_style: "pill",
    spacing_base: 8,
    bg_light: "#FFF1F5",
    bg_dark: "#2A1520",
    text_light: "#4C1D2B",
    text_dark: "#FCE7F0",
  },
  aurora: {
    name: "Aurora",
    description: "270° 紫、Space Grotesk/Inter、12px 圆角、极光渐变",
    base_hue: 270,
    saturation: 70,
    lightness: 50,
    shadow_style: "medium",
    radius_style: "rounded",
    spacing_base: 8,
    bg_light: "#F5F0FF",
    bg_dark: "#0F0A1E",
    text_light: "#2E1065",
    text_dark: "#EDE9FE",
  },
  brutalism: {
    name: "Brutalism",
    description: "50° 黄、Archivo Black/Space Mono、无圆角、硬阴影",
    base_hue: 50,
    saturation: 90,
    lightness: 50,
    shadow_style: "sharp",
    radius_style: "none",
    spacing_base: 4,
    bg_light: "#FFFFFF",
    bg_dark: "#111111",
    text_light: "#111111",
    text_dark: "#F5F5F5",
  },
  cyberpunk: {
    name: "Cyberpunk",
    description: "180° 青、Orbitron/Share Tech Mono、无圆角、霓虹 HUD",
    base_hue: 180,
    saturation: 100,
    lightness: 50,
    shadow_style: "sharp",
    radius_style: "none",
    spacing_base: 4,
    bg_light: "#EAF6F8",
    bg_dark: "#0D0221",
    text_light: "#083344",
    text_dark: "#E0E7FF",
  },
  organic: {
    name: "Organic",
    description: "90° 绿、Fraunces/DM Sans、药丸圆角、仿生形态",
    base_hue: 90,
    saturation: 30,
    lightness: 50,
    shadow_style: "medium",
    radius_style: "pill",
    spacing_base: 8,
    bg_light: "#F6FBF2",
    bg_dark: "#10160E",
    text_light: "#1C2B1A",
    text_dark: "#E7F0E2",
  },
  luxury: {
    name: "Luxury",
    description: "45° 金、Cormorant Garamond/Jost、4px 圆角、黑金 OLED",
    base_hue: 45,
    saturation: 35,
    lightness: 50,
    shadow_style: "subtle",
    radius_style: "sharp",
    spacing_base: 8,
    bg_light: "#FDFBF5",
    bg_dark: "#0B0A08",
    text_light: "#1C1917",
    text_dark: "#F5EFE0",
  },
};

// ===== Motion Profiles (upgrade plan U4) =====
// Per-style default motion behavior. Looked up by the same key as STYLE_PRESETS.
// `engine: "css"` keeps exports dependency-free; `engine: "gsap"` opts into the
// premium runtime (Lenis + GSAP) when exportRuntime is "standard" or "full".

export interface MotionProfile {
  /** Default entry animation preset name (registered in the animations layer). */
  entry: string;
  /** Default hover animation preset name. */
  hover: string;
  /** Recommended duration in seconds. */
  duration: number;
  /** Default easing curve (CSS keyword or GSAP ease string). */
  easing: string;
  /** Stagger between sibling elements in seconds (0 = no stagger). */
  stagger: number;
  /** Preferred animation engine for this style. */
  engine: "css" | "gsap";
  /** Whether scroll-driven reveals fit this style. */
  scrollReveal: boolean;
}

export const STYLE_MOTION_PROFILES: Record<string, MotionProfile> = {
  minimal:       { entry: "fadeUp",     hover: "lift",      duration: 0.4, easing: "easeOut",        stagger: 0.08, engine: "css",  scrollReveal: true  },
  bold:          { entry: "scaleIn",   hover: "scaleUp",    duration: 0.5, easing: "back.out(1.7)", stagger: 0.06, engine: "gsap", scrollReveal: true  },
  playful:       { entry: "spring",    hover: "scaleUp",    duration: 0.6, easing: "easeOut",        stagger: 0.10, engine: "css",  scrollReveal: true  },
  dark:          { entry: "cinematic", hover: "glow",       duration: 0.8, easing: "power2.out",    stagger: 0.08, engine: "gsap", scrollReveal: true  },
  editorial:     { entry: "fadeIn",     hover: "lift",      duration: 0.7, easing: "easeOut",        stagger: 0.05, engine: "css",  scrollReveal: true  },
  tech:          { entry: "slideRight", hover: "glow",      duration: 0.4, easing: "power3.out",     stagger: 0.04, engine: "gsap", scrollReveal: true  },
  glassmorphism: { entry: "scaleIn",   hover: "lift",      duration: 0.6, easing: "power2.out",     stagger: 0.07, engine: "gsap", scrollReveal: true  },
  neumorphism:   { entry: "scaleIn",   hover: "scaleUp",    duration: 0.5, easing: "easeOut",        stagger: 0.06, engine: "css",  scrollReveal: false },
  claymorphism:  { entry: "spring",     hover: "scaleUp",    duration: 0.6, easing: "easeOut",        stagger: 0.09, engine: "css",  scrollReveal: false },
  aurora:        { entry: "fadeUp",     hover: "glow",      duration: 0.9, easing: "power2.out",     stagger: 0.08, engine: "gsap", scrollReveal: true  },
  brutalism:     { entry: "fadeIn",     hover: "ripple",    duration: 0.2, easing: "steps(2)",       stagger: 0.02, engine: "css",  scrollReveal: false },
  cyberpunk:     { entry: "glitch",     hover: "glow",      duration: 0.5, easing: "power4.out",     stagger: 0.03, engine: "gsap", scrollReveal: true  },
  organic:       { entry: "fadeUp",     hover: "lift",      duration: 0.8, easing: "easeOut",        stagger: 0.10, engine: "css",  scrollReveal: true  },
  luxury:        { entry: "cinematic", hover: "lift",      duration: 1.0, easing: "power2.out",     stagger: 0.12, engine: "css",  scrollReveal: true  },
  // —— 新增 16 风格的 motion profile（S3）——
  bento:        { entry: "scaleIn",   hover: "lift",      duration: 0.4, easing: "power2.out",     stagger: 0.06, engine: "css",  scrollReveal: true  },
  material:     { entry: "fadeUp",    hover: "ripple",    duration: 0.3, easing: "easeOut",        stagger: 0.05, engine: "css",  scrollReveal: true  },
  shadcn:       { entry: "fadeIn",     hover: "lift",      duration: 0.2, easing: "easeOut",        stagger: 0.04, engine: "css",  scrollReveal: false },
  neobrutalism: { entry: "scaleIn",   hover: "scaleUp",   duration: 0.15,easing: "steps(2)",       stagger: 0.02, engine: "css",  scrollReveal: false },
  mono:         { entry: "fadeIn",     hover: "lift",      duration: 0.3, easing: "easeOut",        stagger: 0.05, engine: "css",  scrollReveal: true  },
  neon:         { entry: "glow",      hover: "glow",      duration: 0.6, easing: "power2.out",     stagger: 0.04, engine: "gsap", scrollReveal: true  },
  gradient:     { entry: "fadeUp",     hover: "scaleUp",   duration: 0.6, easing: "power2.out",     stagger: 0.07, engine: "gsap", scrollReveal: true  },
  vibrant:      { entry: "spring",    hover: "scaleUp",   duration: 0.5, easing: "back.out(1.7)",  stagger: 0.08, engine: "css",  scrollReveal: true  },
  doodle:       { entry: "fadeIn",    hover: "scaleUp",   duration: 0.5, easing: "easeOut",        stagger: 0.06, engine: "css",  scrollReveal: true  },
  paper:        { entry: "fadeUp",    hover: "lift",      duration: 0.4, easing: "easeOut",        stagger: 0.05, engine: "css",  scrollReveal: true  },
  cosmic:       { entry: "cinematic", hover: "glow",      duration: 1.0, easing: "power2.out",     stagger: 0.10, engine: "gsap", scrollReveal: true  },
  immersive:    { entry: "cinematic", hover: "glow",      duration: 1.2, easing: "power3.out",     stagger: 0.12, engine: "gsap", scrollReveal: true  },
  retro:        { entry: "fadeIn",    hover: "ripple",    duration: 0.2, easing: "steps(3)",       stagger: 0.03, engine: "css",  scrollReveal: false },
  vintage:      { entry: "fadeUp",    hover: "lift",      duration: 0.3, easing: "steps(2)",       stagger: 0.04, engine: "css",  scrollReveal: false },
  spacious:     { entry: "fadeUp",    hover: "lift",      duration: 0.7, easing: "power2.out",     stagger: 0.10, engine: "css",  scrollReveal: true  },
  storytelling: { entry: "cinematic", hover: "lift",     duration: 0.9, easing: "power2.out",     stagger: 0.09, engine: "gsap", scrollReveal: true  },
};

/** Resolve a motion profile for a style key (falls back to "minimal"). */
export function getMotionProfile(style: string): MotionProfile {
  return STYLE_MOTION_PROFILES[style] || STYLE_MOTION_PROFILES.minimal;
}

// ===== Motion Token Set (S4: 动效 token 化，差异化优势) =====
// awesome-design-skills 与 awesome-design-md 均未定义动效 token 层；
// Prism 将动效 token 化作为差异化护城河。

export interface MotionTokenSet {
  duration: {
    instant: number;
    fast: number;
    normal: number;
    slow: number;
    cinematic: number;
  };
  easing: {
    standard: string;
    emphasized: string;
    exit: string;
    spring: string;
    steps: string;
  };
  stagger: {
    tight: number;
    normal: number;
    relaxed: number;
  };
  scrollTrigger?: {
    start: string;
    end: string;
    scrub: boolean;
  };
}

export const MOTION_TOKENS: MotionTokenSet = {
  duration: { instant: 0.1, fast: 0.2, normal: 0.4, slow: 0.7, cinematic: 1.2 },
  easing: {
    standard: "cubic-bezier(0.4,0,0.2,1)",
    emphasized: "cubic-bezier(0.2,0,0,1)",
    exit: "cubic-bezier(0,0,0.2,1)",
    spring: "back.out(1.7)",
    steps: "steps(2)",
  },
  stagger: { tight: 0.03, normal: 0.06, relaxed: 0.1 },
  scrollTrigger: { start: "top 80%", end: "bottom 20%", scrub: false },
};

// ===== Font Pairing Database =====

export interface FontPairingData {
  style: string;
  display: {
    name: string;
    family: string;
    category: string;
    weights: number[];
    fallback: string;
  };
  body: {
    name: string;
    family: string;
    category: string;
    weights: number[];
    fallback: string;
  };
  notes: string[];
}

export const FONT_PAIRINGS: FontPairingData[] = [
  // Minimal / Clean
  {
    style: "minimal",
    display: {
      name: "Inter",
      family: "Inter, system-ui, sans-serif",
      category: "sans-serif",
      weights: [400, 500, 600, 700],
      fallback: "system-ui, sans-serif",
    },
    body: {
      name: "Inter",
      family: "Inter, system-ui, sans-serif",
      category: "sans-serif",
      weights: [400, 500, 600],
      fallback: "system-ui, sans-serif",
    },
    notes: [
      "Inter provides a neutral, highly legible system across headings and body",
      "Inter provides neutral, highly legible body text",
      "Works well with generous whitespace and a restrained color palette",
    ],
  },
  {
    style: "minimal",
    display: {
      name: "Space Grotesk",
      family: "'Space Grotesk', sans-serif",
      category: "sans-serif",
      weights: [400, 500, 600, 700],
      fallback: "sans-serif",
    },
    body: {
      name: "Inter",
      family: "Inter, system-ui, sans-serif",
      category: "sans-serif",
      weights: [400, 500],
      fallback: "system-ui, sans-serif",
    },
    notes: [
      "Space Grotesk gives headings a modern, geometric feel",
      "Inter keeps body text clean and readable",
      "Great for SaaS and tech products with a minimalist edge",
    ],
  },
  // Bold / Modern
  {
    style: "bold",
    display: {
      name: "Clash Display",
      family: "'Clash Display', sans-serif",
      category: "sans-serif",
      weights: [500, 600, 700],
      fallback: "sans-serif",
    },
    body: {
      name: "Satoshi",
      family: "Satoshi, sans-serif",
      category: "sans-serif",
      weights: [400, 500, 700],
      fallback: "sans-serif",
    },
    notes: [
      "Clash Display creates striking, confident headlines",
      "Satoshi pairs beautifully for a cohesive modern look",
      "Best for bold branding and landing pages",
    ],
  },
  {
    style: "bold",
    display: {
      name: "Archivo",
      family: "Archivo, sans-serif",
      category: "sans-serif",
      weights: [600, 700, 800, 900],
      fallback: "sans-serif",
    },
    body: {
      name: "Inter",
      family: "Inter, system-ui, sans-serif",
      category: "sans-serif",
      weights: [400, 500, 600],
      fallback: "system-ui, sans-serif",
    },
    notes: [
      "Archivo's heavy weights create impactful headlines",
      "Inter balances with clean body text",
      "Ideal for news sites, dashboards, and data-heavy interfaces",
    ],
  },
  // Editorial / Elegant
  {
    style: "editorial",
    display: {
      name: "Playfair Display",
      family: "'Playfair Display', Georgia, serif",
      category: "serif",
      weights: [400, 500, 600, 700, 800, 900],
      fallback: "Georgia, serif",
    },
    body: {
      name: "Source Sans 3",
      family: "'Source Sans 3', system-ui, sans-serif",
      category: "sans-serif",
      weights: [300, 400, 600],
      fallback: "system-ui, sans-serif",
    },
    notes: [
      "Playfair Display brings editorial elegance with high-contrast strokes",
      "Source Sans 3 provides a clean, neutral counterpart",
      "Perfect for magazines, portfolios, and luxury brands",
    ],
  },
  {
    style: "editorial",
    display: {
      name: "Cormorant Garamond",
      family: "'Cormorant Garamond', Georgia, serif",
      category: "serif",
      weights: [400, 500, 600, 700],
      fallback: "Georgia, serif",
    },
    body: {
      name: "Lora",
      family: "Lora, Georgia, serif",
      category: "serif",
      weights: [400, 500, 600],
      fallback: "Georgia, serif",
    },
    notes: [
      "Cormorant Garamond creates a refined, classical display",
      "Lora offers a readable serif body with subtle calligraphic warmth",
      "All-serif pairing ideal for literary and luxury contexts",
    ],
  },
  // Playful / Friendly
  {
    style: "playful",
    display: {
      name: "Poppins",
      family: "Poppins, sans-serif",
      category: "sans-serif",
      weights: [400, 500, 600, 700, 800],
      fallback: "sans-serif",
    },
    body: {
      name: "Nunito",
      family: "Nunito, sans-serif",
      category: "sans-serif",
      weights: [400, 500, 600, 700],
      fallback: "sans-serif",
    },
    notes: [
      "Poppins brings geometric friendliness to headings",
      "Nunito's rounded terminals complement with warmth",
      "Great for consumer apps, education, and health products",
    ],
  },
  {
    style: "playful",
    display: {
      name: "DM Serif Display",
      family: "'DM Serif Display', Georgia, serif",
      category: "serif",
      weights: [400],
      fallback: "Georgia, serif",
    },
    body: {
      name: "DM Sans",
      family: "'DM Sans', sans-serif",
      category: "sans-serif",
      weights: [400, 500, 700],
      fallback: "sans-serif",
    },
    notes: [
      "DM Serif Display adds a touch of personality to headlines",
      "DM Sans keeps body text clean and approachable",
      "Balances playfulness with professionalism",
    ],
  },
  // Tech / Futuristic
  {
    style: "tech",
    display: {
      name: "JetBrains Mono",
      family: "'JetBrains Mono', monospace",
      category: "monospace",
      weights: [400, 500, 700],
      fallback: "monospace",
    },
    body: {
      name: "Inter",
      family: "Inter, system-ui, sans-serif",
      category: "sans-serif",
      weights: [400, 500, 600],
      fallback: "system-ui, sans-serif",
    },
    notes: [
      "JetBrains Mono brings a developer-centric, technical feel to headings",
      "Inter provides clean readability for body text",
      "Perfect for developer tools, dashboards, and API docs",
    ],
  },
  {
    style: "tech",
    display: {
      name: "Orbitron",
      family: "Orbitron, sans-serif",
      category: "sans-serif",
      weights: [400, 500, 700, 900],
      fallback: "sans-serif",
    },
    body: {
      name: "Rajdhani",
      family: "Rajdhani, sans-serif",
      category: "sans-serif",
      weights: [300, 400, 500, 600, 700],
      fallback: "sans-serif",
    },
    notes: [
      "Orbitron creates a futuristic, sci-fi display aesthetic",
      "Rajdhani pairs with a tech-forward, condensed body style",
      "Best for gaming, crypto, and futuristic product interfaces",
    ],
  },
  // Glassmorphism
  {
    style: "glassmorphism",
    display: {
      name: "Outfit",
      family: "Outfit, sans-serif",
      category: "sans-serif",
      weights: [400, 500, 600, 700],
      fallback: "sans-serif",
    },
    body: {
      name: "Inter",
      family: "Inter, system-ui, sans-serif",
      category: "sans-serif",
      weights: [400, 500],
      fallback: "system-ui, sans-serif",
    },
    notes: [
      "Outfit's modern geometric forms suit translucent glass surfaces",
      "Inter keeps body text neutral and legible",
    ],
  },
  // Neumorphism
  {
    style: "neumorphism",
    display: {
      name: "Nunito Sans",
      family: "'Nunito Sans', sans-serif",
      category: "sans-serif",
      weights: [400, 600, 700, 800],
      fallback: "sans-serif",
    },
    body: {
      name: "Nunito Sans",
      family: "'Nunito Sans', sans-serif",
      category: "sans-serif",
      weights: [400, 600, 700],
      fallback: "sans-serif",
    },
    notes: ["Nunito Sans' soft rounded shapes match soft-UI surfaces"],
  },
  // Claymorphism
  {
    style: "claymorphism",
    display: {
      name: "Quicksand",
      family: "Quicksand, sans-serif",
      category: "sans-serif",
      weights: [500, 600, 700],
      fallback: "sans-serif",
    },
    body: {
      name: "Nunito",
      family: "Nunito, sans-serif",
      category: "sans-serif",
      weights: [400, 500, 600],
      fallback: "sans-serif",
    },
    notes: ["Quicksand's rounded geometry echoes 3D clay forms"],
  },
  // Aurora
  {
    style: "aurora",
    display: {
      name: "Space Grotesk",
      family: "'Space Grotesk', sans-serif",
      category: "sans-serif",
      weights: [400, 500, 600, 700],
      fallback: "sans-serif",
    },
    body: {
      name: "Inter",
      family: "Inter, system-ui, sans-serif",
      category: "sans-serif",
      weights: [400, 500],
      fallback: "system-ui, sans-serif",
    },
    notes: ["Space Grotesk pairs with vivid aurora gradients"],
  },
  // Brutalism
  {
    style: "brutalism",
    display: {
      name: "Archivo Black",
      family: "'Archivo Black', sans-serif",
      category: "sans-serif",
      weights: [400],
      fallback: "sans-serif",
    },
    body: {
      name: "Space Mono",
      family: "'Space Mono', monospace",
      category: "monospace",
      weights: [400, 700],
      fallback: "monospace",
    },
    notes: ["Archivo Black delivers raw, heavy headlines; Space Mono adds technical body"],
  },
  // Cyberpunk
  {
    style: "cyberpunk",
    display: {
      name: "Orbitron",
      family: "Orbitron, sans-serif",
      category: "sans-serif",
      weights: [500, 700, 900],
      fallback: "sans-serif",
    },
    body: {
      name: "Share Tech Mono",
      family: "'Share Tech Mono', monospace",
      category: "monospace",
      weights: [400],
      fallback: "monospace",
    },
    notes: ["Orbitron + Share Tech Mono create a neon HUD aesthetic"],
  },
  // Organic
  {
    style: "organic",
    display: {
      name: "Fraunces",
      family: "Fraunces, Georgia, serif",
      category: "serif",
      weights: [400, 500, 600, 700],
      fallback: "Georgia, serif",
    },
    body: {
      name: "DM Sans",
      family: "'DM Sans', sans-serif",
      category: "sans-serif",
      weights: [400, 500],
      fallback: "sans-serif",
    },
    notes: ["Fraunces' organic curves echo biomorphic shapes"],
  },
  // Luxury
  {
    style: "luxury",
    display: {
      name: "Cormorant Garamond",
      family: "'Cormorant Garamond', Georgia, serif",
      category: "serif",
      weights: [400, 500, 600, 700],
      fallback: "Georgia, serif",
    },
    body: {
      name: "Jost",
      family: "Jost, sans-serif",
      category: "sans-serif",
      weights: [300, 400, 500],
      fallback: "sans-serif",
    },
    notes: ["Cormorant Garamond + Jost convey understated luxury"],
  },
];

// ===== Typography Scale Ratios =====

export const TYPE_SCALE_RATIOS: Record<string, number> = {
  minor_second: 1.067,
  major_second: 1.125,
  minor_third: 1.2,
  major_third: 1.25,
  perfect_fourth: 1.333,
  augmented_fourth: 1.414,
  perfect_fifth: 1.5,
  golden_ratio: 1.618,
};

// ===== Responsive Breakpoints =====

export const BREAKPOINT_PRESETS: Record<string, BreakpointPreset[]> = {
  tailwind: [
    { name: "sm", px: 640, container_max: 640, usage: "Large phones in landscape, small tablets" },
    { name: "md", px: 768, container_max: 768, usage: "Tablets in portrait" },
    { name: "lg", px: 1024, container_max: 1024, usage: "Tablets in landscape, small laptops" },
    { name: "xl", px: 1280, container_max: 1280, usage: "Desktops, large laptops" },
    { name: "2xl", px: 1536, container_max: 1536, usage: "Large desktops" },
  ],
  bootstrap: [
    { name: "sm", px: 576, container_max: 540, usage: "Small phones landscape" },
    { name: "md", px: 768, container_max: 720, usage: "Tablets in portrait" },
    { name: "lg", px: 992, container_max: 960, usage: "Tablets landscape, small laptops" },
    { name: "xl", px: 1200, container_max: 1140, usage: "Desktops" },
    { name: "xxl", px: 1400, container_max: 1320, usage: "Large desktops" },
  ],
  material: [
    { name: "xs", px: 0, container_max: 100, usage: "Extra small phones" },
    { name: "sm", px: 600, container_max: 100, usage: "Small phones to tablets" },
    { name: "md", px: 960, container_max: 900, usage: "Tablets to desktops" },
    { name: "lg", px: 1280, container_max: 1200, usage: "Desktops" },
    { name: "xl", px: 1920, container_max: 1800, usage: "Large desktops and 4K" },
  ],
  custom: [
    { name: "mobile", px: 480, container_max: 420, usage: "Mobile devices" },
    { name: "tablet", px: 768, container_max: 720, usage: "Tablet devices" },
    { name: "desktop", px: 1024, container_max: 960, usage: "Desktop computers" },
    { name: "wide", px: 1440, container_max: 1320, usage: "Wide desktop screens" },
  ],
};

export interface BreakpointPreset {
  name: string;
  px: number;
  container_max: number;
  usage: string;
}
