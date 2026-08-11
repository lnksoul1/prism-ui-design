export const CHARACTER_LIMIT = 30000;

export const SERVER_NAME = "ui-design-mcp-server";
export const SERVER_VERSION = "1.0.0";

// ===== Style Presets =====

export interface StylePreset {
  name: string;
  description: string;
  base_hue: number;
  saturation: number;
  lightness: number;
  shadow_style: "subtle" | "medium" | "sharp";
  radius_style: "sharp" | "subtle" | "rounded" | "pill";
  spacing_base: number;
  bg_light: string;
  bg_dark: string;
  text_light: string;
  text_dark: string;
}

export const STYLE_PRESETS: Record<string, StylePreset> = {
  minimal: {
    name: "Minimal",
    description: "Clean, airy, lots of whitespace. Neutral palette with one accent.",
    base_hue: 220,
    saturation: 15,
    lightness: 55,
    shadow_style: "subtle",
    radius_style: "subtle",
    spacing_base: 8,
    bg_light: "#ffffff",
    bg_dark: "#0f1115",
    text_light: "#1a1a2e",
    text_dark: "#e8e8ec",
  },
  bold: {
    name: "Bold",
    description: "High contrast, vibrant accents, strong visual hierarchy.",
    base_hue: 260,
    saturation: 75,
    lightness: 50,
    shadow_style: "medium",
    radius_style: "rounded",
    spacing_base: 8,
    bg_light: "#fafafa",
    bg_dark: "#12101f",
    text_light: "#0d0d0d",
    text_dark: "#f0f0f5",
  },
  playful: {
    name: "Playful",
    description: "Warm, friendly, rounded shapes, cheerful colors.",
    base_hue: 340,
    saturation: 65,
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
    description: "Dark-first design, deep backgrounds with luminous accents.",
    base_hue: 210,
    saturation: 60,
    lightness: 55,
    shadow_style: "sharp",
    radius_style: "subtle",
    spacing_base: 8,
    bg_light: "#f5f7fa",
    bg_dark: "#0a0e14",
    text_light: "#0a0e14",
    text_dark: "#c9d1d9",
  },
  editorial: {
    name: "Editorial",
    description: "Magazine-like, elegant serif headings, refined spacing.",
    base_hue: 30,
    saturation: 25,
    lightness: 45,
    shadow_style: "subtle",
    radius_style: "sharp",
    spacing_base: 8,
    bg_light: "#fdfcfa",
    bg_dark: "#161310",
    text_light: "#1c1917",
    text_dark: "#e7e5e4",
  },
  tech: {
    name: "Tech",
    description: "Futuristic, precise, cyan/blue accents, sharp geometry.",
    base_hue: 190,
    saturation: 70,
    lightness: 50,
    shadow_style: "sharp",
    radius_style: "sharp",
    spacing_base: 4,
    bg_light: "#f8fafc",
    bg_dark: "#080d14",
    text_light: "#0f172a",
    text_dark: "#cbd5e1",
  },
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
      name: "Fraunces",
      family: "Fraunces, Georgia, serif",
      category: "serif",
      weights: [400, 500, 600, 700],
      fallback: "Georgia, serif",
    },
    body: {
      name: "Inter",
      family: "Inter, system-ui, sans-serif",
      category: "sans-serif",
      weights: [400, 500, 600],
      fallback: "system-ui, sans-serif",
    },
    notes: [
      "Fraunces brings warmth and character to headings without being traditional",
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
