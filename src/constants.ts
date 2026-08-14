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

// ===== V2 杈呭姪绫诲瀷锛圫1: 鏁版嵁鍖栬璁＄郴缁熷瓧娈碉級 =====

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

// ===== Motion Profiles (upgrade plan U4) =====
// Per-design-system default motion behavior (falls back to "minimal").
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
  // 鈥斺€?鏂板 16 椋庢牸鐨?motion profile锛圫3锛夆€斺€?  bento:        { entry: "scaleIn",   hover: "lift",      duration: 0.4, easing: "power2.out",     stagger: 0.06, engine: "css",  scrollReveal: true  },
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

// ===== Motion Token Set (S4: 鍔ㄦ晥 token 鍖栵紝宸紓鍖栦紭鍔? =====
// awesome-design-skills 涓?awesome-design-md 鍧囨湭瀹氫箟鍔ㄦ晥 token 灞傦紱
// Prism 灏嗗姩鏁?token 鍖栦綔涓哄樊寮傚寲鎶ゅ煄娌炽€?
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
