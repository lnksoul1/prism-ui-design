/**
 * Style-guide library (functional plan F7).
 *
 * Named visual styles ("glassmorphism", "brutalist", ...) that can be applied
 * on top of the base style presets. Each guide carries token overrides plus
 * component variant hints, so agents can switch the whole visual language
 * with one tool call.
 */

import { stateStore } from "./state.js";
import { applyStyleTokenSet, SHADOW_SYSTEM_PRESETS, RADIUS_PRESETS } from "./tokens.js";

export interface StyleGuide {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  tokens: {
    colors?: Record<string, string>;
    radii?: Record<string, string>;
    shadows?: Record<string, string>;
    typography?: Record<string, string>;
  };
  variantHints: Record<string, string>;
}

const RADIUS_NAMES = ["none", "sm", "md", "lg", "xl"];
const SHADOW_NAMES = ["sm", "md", "lg", "xl", "2xl"];

export const STYLE_GUIDES: StyleGuide[] = [
  {
    id: "glassmorphism",
    name: "玻璃拟态",
    description: "半透明毛玻璃卡片、柔和阴影、高光边框。",
    keywords: ["glass", "glassmorphism", "毛玻璃", "玻璃", "frosted", "translucent"],
    tokens: {
      colors: {
        "color-surface": "rgba(255, 255, 255, 0.55)",
        "color-bg": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        "color-border": "rgba(255, 255, 255, 0.35)",
      },
      radii: {
        "radius-sm": "10px",
        "radius-md": "16px",
        "radius-lg": "24px",
        "radius-xl": "32px",
      },
      shadows: {
        "shadow-sm": "0 4px 16px rgba(31, 38, 135, 0.18)",
        "shadow-md": "0 8px 32px rgba(31, 38, 135, 0.22)",
        "shadow-lg": "0 16px 48px rgba(31, 38, 135, 0.28)",
        "shadow-xl": "0 24px 64px rgba(31, 38, 135, 0.32)",
        "shadow-2xl": "0 32px 80px rgba(31, 38, 135, 0.36)",
      },
    },
    variantHints: { card: "elevated", cta: "banner" },
  },
  {
    id: "brutalist",
    name: "粗野主义",
    description: "硬阴影、粗边框、直角、高对比色块。",
    keywords: ["brutalist", "brutalism", "粗野", "硬边", "raw", "neo-brutalist"],
    tokens: {
      colors: {
        "color-border": "#000000",
        "color-surface": "#FFFFFF",
        "color-accent": "#FFDE00",
      },
      radii: {
        "radius-sm": "0px",
        "radius-md": "0px",
        "radius-lg": "0px",
        "radius-xl": "0px",
      },
      shadows: {
        "shadow-sm": "4px 4px 0 #000000",
        "shadow-md": "6px 6px 0 #000000",
        "shadow-lg": "8px 8px 0 #000000",
        "shadow-xl": "10px 10px 0 #000000",
        "shadow-2xl": "12px 12px 0 #000000",
      },
    },
    variantHints: { button: "primary", card: "flat" },
  },
  {
    id: "retro",
    name: "复古",
    description: "暖色系、衬线标题、圆角、柔和纸张质感。",
    keywords: ["retro", "vintage", "复古", "怀旧", "70s", "warm"],
    tokens: {
      colors: {
        "color-bg": "#F7F1E3",
        "color-surface": "#FDF8EC",
        "color-text": "#4A3728",
        "color-primary": "#C1440E",
        "color-accent": "#D4A017",
      },
      typography: {
        "font-display": "'Fraunces', Georgia, serif",
        "font-body": "'Karla', 'Helvetica Neue', sans-serif",
      },
    },
    variantHints: { hero: "centered", card: "article" },
  },
  {
    id: "neumorphism",
    name: "新拟态",
    description: "同色系双阴影、低对比、圆润柔和。",
    keywords: ["neumorphism", "soft ui", "新拟态", "neumorphic", "soft"],
    tokens: {
      colors: {
        "color-bg": "#E0E5EC",
        "color-surface": "#E0E5EC",
        "color-text": "#4B5563",
        "color-border": "rgba(255,255,255,0.5)",
      },
      radii: {
        "radius-sm": "12px",
        "radius-md": "18px",
        "radius-lg": "26px",
        "radius-xl": "34px",
      },
      shadows: {
        "shadow-sm": "4px 4px 8px #B8C0CC, -4px -4px 8px #FFFFFF",
        "shadow-md": "8px 8px 16px #B8C0CC, -8px -8px 16px #FFFFFF",
        "shadow-lg": "12px 12px 24px #B8C0CC, -12px -12px 24px #FFFFFF",
        "shadow-xl": "16px 16px 32px #B8C0CC, -16px -16px 32px #FFFFFF",
        "shadow-2xl": "20px 20px 40px #B8C0CC, -20px -20px 40px #FFFFFF",
      },
    },
    variantHints: { button: "ghost", card: "elevated" },
  },
  {
    id: "cyberpunk",
    name: "赛博朋克",
    description: "霓虹点缀、深色底、发光阴影、锐利几何。",
    keywords: ["cyberpunk", "neon", "赛博", "霓虹", "synthwave", "futuristic"],
    tokens: {
      colors: {
        "color-bg": "#0D0221",
        "color-surface": "#150A33",
        "color-text": "#E0E7FF",
        "color-primary": "#00F0FF",
        "color-accent": "#FF00C8",
      },
      shadows: {
        "shadow-sm": "0 0 8px rgba(0, 240, 255, 0.45)",
        "shadow-md": "0 0 16px rgba(0, 240, 255, 0.55)",
        "shadow-lg": "0 0 24px rgba(255, 0, 200, 0.55)",
        "shadow-xl": "0 0 36px rgba(255, 0, 200, 0.6)",
        "shadow-2xl": "0 0 48px rgba(0, 240, 255, 0.7)",
      },
    },
    variantHints: { button: "primary", card: "flat" },
  },
  {
    id: "editorial",
    name: "杂志编辑",
    description: "衬线大标题、克制用色、锐利圆角、大量留白。",
    keywords: ["editorial", "magazine", "杂志", "优雅", "serif", "minimal"],
    tokens: {
      colors: {
        "color-bg": "#FDFCFA",
        "color-surface": "#FFFFFF",
        "color-text": "#1C1917",
        "color-text-muted": "#78716C",
        "color-primary": "#B45309",
      },
      typography: {
        "font-display": "'Playfair Display', Georgia, serif",
        "font-body": "'Source Sans 3', system-ui, sans-serif",
      },
      radii: {
        "radius-sm": "2px",
        "radius-md": "4px",
        "radius-lg": "6px",
        "radius-xl": "8px",
      },
    },
    variantHints: { hero: "split", text_section: "standard" },
  },
];

/** Fuzzy-match a style guide by id or keywords. */
export function matchStyleGuide(tag: string): StyleGuide | undefined {
  const t = tag.trim().toLowerCase();
  return STYLE_GUIDES.find(
    (g) =>
      g.id === t ||
      g.name === tag.trim() ||
      g.keywords.some((k) => k.toLowerCase() === t || k.toLowerCase().includes(t) || t.includes(k.toLowerCase()))
  );
}

export interface AppliedGuide {
  guide_id: string;
  guide_name: string;
  base_style: string;
  overrides: Array<{ category: string; key: string; value: string; reason: string }>;
}

/**
 * Apply a style guide on top of a base style preset. The guide's token
 * overrides win over the preset tokens; sources are marked "user" so the
 * change is visible to the AI in the activity log.
 */
export function applyStyleGuide(tag: string, baseStyle?: string): AppliedGuide {
  const guide = matchStyleGuide(tag);
  if (!guide) {
    throw new Error(
      `Unknown style guide "${tag}". Available: ${STYLE_GUIDES.map((g) => g.id).join(", ")}`
    );
  }
  const style = baseStyle || stateStore.getState().style || "minimal";
  applyStyleTokenSet(stateStore, style, undefined, "preset");

  const overrides: AppliedGuide["overrides"] = [];
  const applyGroup = (
    category: "colors" | "radii" | "shadows" | "typography",
    entries: Record<string, string> | undefined,
    reason: string
  ) => {
    if (!entries) return;
    Object.entries(entries).forEach(([key, value]) => {
      stateStore.setToken(category, key, value, "user", reason);
      overrides.push({ category, key, value, reason });
    });
  };

  applyGroup("colors", guide.tokens.colors, `风格指南「${guide.name}」色彩覆盖`);
  applyGroup("radii", guide.tokens.radii, `风格指南「${guide.name}」圆角覆盖`);
  applyGroup("shadows", guide.tokens.shadows, `风格指南「${guide.name}」阴影覆盖`);
  applyGroup("typography", guide.tokens.typography, `风格指南「${guide.name}」字体覆盖`);

  return { guide_id: guide.id, guide_name: guide.name, base_style: style, overrides };
}

/** Radius set for a named style (used by semantic styling). */
export function radiusSetFor(style: "sharp" | "subtle" | "rounded" | "pill"): Record<string, string> {
  const values = RADIUS_PRESETS[style];
  const radii: Record<string, string> = {};
  RADIUS_NAMES.forEach((name, i) => {
    radii[`radius-${name}`] = `${values[i]}px`;
  });
  radii["radius-full"] = "9999px";
  return radii;
}

/** Shadow set for a named style (used by semantic styling). */
export function shadowSetFor(style: "subtle" | "medium" | "sharp"): Record<string, string> {
  const preset = SHADOW_SYSTEM_PRESETS[style];
  const shadows: Record<string, string> = {};
  SHADOW_NAMES.forEach((name, i) => {
    shadows[`shadow-${name}`] = preset[i].shadow;
  });
  return shadows;
}
