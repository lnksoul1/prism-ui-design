/**
 * Shared design-token generation.
 *
 * This logic used to exist in three places — the `design_init` MCP tool,
 * the `/api/init` REST endpoint, and the `apply_style` WebSocket handler —
 * and the copies had already drifted apart (e.g. radius token naming).
 * Keep generation here so every entry point produces an identical token set.
 */

import {
  STYLE_PRESETS,
  FONT_PAIRINGS,
  TYPE_SCALE_RATIOS,
  type FontPairingData,
} from "./constants.js";
import {
  hexToHsl,
  hslToHex,
  generateHarmony,
  generateNeutralGrays,
  normalizeHex,
  isValidHex,
  adjustLightness,
} from "./utils/color.js";

export type TokenCategory =
  | "colors"
  | "typography"
  | "spacing"
  | "shadows"
  | "radii"
  | "transitions";

export type TokenSource = "ai" | "user" | "preset";

/** Minimal structural view of the state store needed to apply a token set. */
export interface TokenBatchStore {
  setTokenBatch(
    category: TokenCategory,
    tokens: Record<string, string>,
    source: TokenSource
  ): void;
}

export interface StyleTokenSet {
  baseHex: string;
  colors: Record<string, string>;
  typography: Record<string, string>;
  spacing: Record<string, string>;
  shadows: Record<string, string>;
  radii: Record<string, string>;
  transitions: Record<string, string>;
  font: FontPairingData;
}

const TYPE_NAMES = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"];
const TYPE_STEPS = [-2, -1, 0, 1, 2, 3, 4, 5];

const SPACING_NAMES = ["0", "xs", "sm", "md", "lg", "xl", "2xl", "3xl"];

const SHADOW_NAMES = ["sm", "md", "lg", "xl", "2xl"];

export const RADIUS_PRESETS: Record<string, number[]> = {
  none: [0, 0, 0, 0, 0],
  sharp: [0, 2, 4, 6, 8],
  subtle: [0, 4, 6, 8, 12],
  rounded: [0, 8, 12, 16, 24],
  pill: [0, 12, 16, 24, 32],
};

const RADIUS_NAMES = ["none", "sm", "md", "lg", "xl"];

const TRANSITION_TOKENS: Record<string, string> = {
  "transition-fast": "150ms ease",
  "transition-normal": "250ms ease",
  "transition-slow": "400ms ease",
  "transition-spring": "500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
};

/**
 * Elevation shadow presets shared by the shadow-system tool and the
 * style-preset token generator, so the two can never drift apart.
 */
export const SHADOW_SYSTEM_PRESETS: Record<
  string,
  Array<{ shadow: string; usage: string }>
> = {
  subtle: [
    { shadow: "0 1px 2px 0 rgba(0,0,0,0.05)", usage: "Buttons, inputs, small cards" },
    { shadow: "0 2px 4px 0 rgba(0,0,0,0.06)", usage: "Cards, dropdowns, popovers" },
    { shadow: "0 4px 8px -1px rgba(0,0,0,0.08)", usage: "Hovered cards, sticky headers" },
    { shadow: "0 8px 16px -2px rgba(0,0,0,0.10)", usage: "Modals, floating panels" },
    { shadow: "0 16px 32px -4px rgba(0,0,0,0.12)", usage: "Full-screen overlays, dialogs" },
  ],
  medium: [
    { shadow: "0 1px 3px 0 rgba(0,0,0,0.12), 0 1px 2px 0 rgba(0,0,0,0.06)", usage: "Buttons, inputs, small cards" },
    { shadow: "0 4px 6px -1px rgba(0,0,0,0.12), 0 2px 4px 0 rgba(0,0,0,0.06)", usage: "Cards, dropdowns, popovers" },
    { shadow: "0 10px 15px -3px rgba(0,0,0,0.12), 0 4px 6px 0 rgba(0,0,0,0.06)", usage: "Hovered cards, sticky headers" },
    { shadow: "0 20px 25px -5px rgba(0,0,0,0.15), 0 8px 10px 0 rgba(0,0,0,0.06)", usage: "Modals, floating panels" },
    { shadow: "0 25px 50px -12px rgba(0,0,0,0.25)", usage: "Full-screen overlays, dialogs" },
  ],
  sharp: [
    { shadow: "0 0 0 1px rgba(0,0,0,0.05)", usage: "Borders, outlined elements" },
    { shadow: "0 1px 3px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)", usage: "Cards, dropdowns, popovers" },
    { shadow: "0 4px 6px rgba(0,0,0,0.20), 0 0 0 1px rgba(0,0,0,0.05)", usage: "Hovered cards, sticky headers" },
    { shadow: "0 10px 15px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05)", usage: "Modals, floating panels" },
    { shadow: "0 20px 30px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.05)", usage: "Full-screen overlays, dialogs" },
  ],
};

/**
 * Generate the complete token set for a style preset.
 * Falls back to the preset's own base color when `baseColor` is missing
 * or not a valid hex value.
 */
export function generateStyleTokens(
  style: string,
  baseColor?: string
): StyleTokenSet {
  const preset = STYLE_PRESETS[style];
  if (!preset) {
    throw new Error(`Unknown style preset: ${style}`);
  }

  let baseHex: string;
  if (baseColor && isValidHex(baseColor)) {
    baseHex = normalizeHex(baseColor);
  } else {
    baseHex = hslToHex({
      h: preset.base_hue,
      s: preset.saturation,
      l: preset.lightness,
    });
  }

  const baseHsl = hexToHsl(baseHex);
  const harmonyColors = generateHarmony(baseHsl, "monochromatic");
  const neutralHsls = generateNeutralGrays(baseHsl, 11);

  // Colors
  const colors: Record<string, string> = {
    "color-primary": hslToHex(harmonyColors[1]),
    "color-primary-dark": hslToHex(harmonyColors[0]),
    "color-primary-light": hslToHex(harmonyColors[2]),
    "color-accent": hslToHex(harmonyColors[3]),
    "color-bg": preset.bg_light,
    "color-surface": hslToHex(adjustLightness({ h: baseHsl.h, s: 10, l: 98 }, 0)),
    "color-text": preset.text_light,
    "color-text-muted": hslToHex(neutralHsls[5]),
    "color-border": hslToHex(adjustLightness(neutralHsls[8], -5)),
    "color-success": "#22C55E",
    "color-warning": "#F59E0B",
    "color-error": "#EF4444",
  };

  // Typography
  const font =
    FONT_PAIRINGS.find((p) => p.style === style) || FONT_PAIRINGS[0];
  const ratio = TYPE_SCALE_RATIOS.perfect_fourth;
  const baseSize = 16;

  const typography: Record<string, string> = {
    "font-display": font.display.family,
    "font-body": font.body.family,
    "font-mono": "'JetBrains Mono', monospace",
    "font-weight-normal": "400",
    "font-weight-medium": "500",
    "font-weight-semibold": "600",
    "font-weight-bold": "700",
    "line-height-tight": "1.2",
    "line-height-normal": "1.5",
    "line-height-relaxed": "1.75",
  };
  TYPE_NAMES.forEach((name, i) => {
    const size = baseSize * Math.pow(ratio, TYPE_STEPS[i]);
    typography[`text-${name}`] = `${(size / 16).toFixed(3)}rem`;
  });

  // Spacing
  const spacingBase = preset.spacing_base;
  const spacingValues = [
    0,
    spacingBase,
    spacingBase * 1.5,
    spacingBase * 2,
    spacingBase * 3,
    spacingBase * 4,
    spacingBase * 6,
    spacingBase * 8,
  ];
  const spacing: Record<string, string> = {};
  SPACING_NAMES.forEach((name, i) => {
    const px = Math.round(spacingValues[i]);
    spacing[`space-${name}`] = `${(px / 16).toFixed(px % 16 === 0 ? 0 : 3)}rem`;
  });

  // Shadows (5 elevation levels, sourced from the shared shadow presets)
  const shadowPreset = SHADOW_SYSTEM_PRESETS[preset.shadow_style];
  const shadows: Record<string, string> = {};
  SHADOW_NAMES.forEach((name, i) => {
    shadows[`shadow-${name}`] = shadowPreset[i].shadow;
  });

  // Radii
  const radiusVals = RADIUS_PRESETS[preset.radius_style];
  const radii: Record<string, string> = {};
  RADIUS_NAMES.forEach((name, i) => {
    radii[`radius-${name}`] = `${radiusVals[i]}px`;
  });
  radii["radius-full"] = "9999px";

  return {
    baseHex,
    colors,
    typography,
    spacing,
    shadows,
    radii,
    transitions: TRANSITION_TOKENS,
    font,
  };
}

/** Generate the token set and write every category into the state store. */
export function applyStyleTokenSet(
  store: TokenBatchStore,
  style: string,
  baseColor: string | undefined,
  source: TokenSource
): StyleTokenSet {
  const tokens = generateStyleTokens(style, baseColor);
  store.setTokenBatch("colors", tokens.colors, source);
  store.setTokenBatch("typography", tokens.typography, source);
  store.setTokenBatch("spacing", tokens.spacing, source);
  store.setTokenBatch("shadows", tokens.shadows, source);
  store.setTokenBatch("radii", tokens.radii, source);
  store.setTokenBatch("transitions", tokens.transitions, source);
  return tokens;
}
