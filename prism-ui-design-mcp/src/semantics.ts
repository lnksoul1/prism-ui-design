/**
 * Semantic style mapping (improvement plan C1).
 *
 * Bridges natural-language adjectives to concrete design tokens, the core
 * differentiator identified in `ui-intent-expression-analysis.html`. Each
 * adjective contributes measurable deltas (hue / saturation / lightness /
 * radius / shadow / font mood), and every applied token records a human-
 * readable reason so decisions stay traceable.
 */

import { stateStore } from "./state.js";
import {
  FONT_PAIRINGS,
  STYLE_PRESETS,
  type FontPairingData,
} from "./constants.js";
import { hslToHex, hexToHsl, adjustLightness } from "./utils/color.js";
import { applyStyleTokenSet } from "./tokens.js";
import { radiusSetFor, shadowSetFor } from "./style-guides.js";

export interface AdjectiveDef {
  hueShift: number;
  saturationDelta: number;
  lightnessDelta: number;
  radiusBias: "sharp" | "subtle" | "rounded" | "pill";
  shadowBias: "subtle" | "medium" | "sharp";
  fontMood: "serif" | "sans" | "geometric" | "mono";
  explanation: string;
}

/**
 * Adjective lexicon. Keys are lowercase; both English and Chinese terms are
 * accepted (aliases are normalized in `resolveAdjective`).
 */
export const ADJECTIVE_LEXICON: Record<string, AdjectiveDef> = {
  modern: { hueShift: 0, saturationDelta: 5, lightnessDelta: 0, radiusBias: "subtle", shadowBias: "subtle", fontMood: "sans", explanation: "现代：干净、留白、克制的装饰" },
  现代: { hueShift: 0, saturationDelta: 5, lightnessDelta: 0, radiusBias: "subtle", shadowBias: "subtle", fontMood: "sans", explanation: "现代：干净、留白、克制的装饰" },
  warm: { hueShift: 12, saturationDelta: 8, lightnessDelta: 4, radiusBias: "rounded", shadowBias: "medium", fontMood: "serif", explanation: "温暖：色相偏暖、圆角更柔和" },
  温暖: { hueShift: 12, saturationDelta: 8, lightnessDelta: 4, radiusBias: "rounded", shadowBias: "medium", fontMood: "serif", explanation: "温暖：色相偏暖、圆角更柔和" },
  professional: { hueShift: -5, saturationDelta: -12, lightnessDelta: 2, radiusBias: "subtle", shadowBias: "subtle", fontMood: "sans", explanation: "专业：降低饱和度、中性偏冷、克制的阴影" },
  专业: { hueShift: -5, saturationDelta: -12, lightnessDelta: 2, radiusBias: "subtle", shadowBias: "subtle", fontMood: "sans", explanation: "专业：降低饱和度、中性偏冷、克制的阴影" },
  playful: { hueShift: 18, saturationDelta: 18, lightnessDelta: 6, radiusBias: "pill", shadowBias: "medium", fontMood: "geometric", explanation: "活泼：高饱和、大圆角、明快" },
  活泼: { hueShift: 18, saturationDelta: 18, lightnessDelta: 6, radiusBias: "pill", shadowBias: "medium", fontMood: "geometric", explanation: "活泼：高饱和、大圆角、明快" },
  tech: { hueShift: -15, saturationDelta: 10, lightnessDelta: -2, radiusBias: "sharp", shadowBias: "sharp", fontMood: "mono", explanation: "科技：冷色相、锐利几何、清晰投影" },
  科技: { hueShift: -15, saturationDelta: 10, lightnessDelta: -2, radiusBias: "sharp", shadowBias: "sharp", fontMood: "mono", explanation: "科技：冷色相、锐利几何、清晰投影" },
  premium: { hueShift: -8, saturationDelta: -10, lightnessDelta: -6, radiusBias: "rounded", shadowBias: "subtle", fontMood: "serif", explanation: "高级：低饱和、深色、衬线标题" },
  高级: { hueShift: -8, saturationDelta: -10, lightnessDelta: -6, radiusBias: "rounded", shadowBias: "subtle", fontMood: "serif", explanation: "高级：低饱和、深色、衬线标题" },
  minimal: { hueShift: 0, saturationDelta: -20, lightnessDelta: 8, radiusBias: "subtle", shadowBias: "subtle", fontMood: "sans", explanation: "简约：去饱和、提亮、克制" },
  简约: { hueShift: 0, saturationDelta: -20, lightnessDelta: 8, radiusBias: "subtle", shadowBias: "subtle", fontMood: "sans", explanation: "简约：去饱和、提亮、克制" },
  retro: { hueShift: 20, saturationDelta: -8, lightnessDelta: 6, radiusBias: "rounded", shadowBias: "subtle", fontMood: "serif", explanation: "复古：暖色调、衬线、柔和的做旧感" },
  复古: { hueShift: 20, saturationDelta: -8, lightnessDelta: 6, radiusBias: "rounded", shadowBias: "subtle", fontMood: "serif", explanation: "复古：暖色调、衬线、柔和的做旧感" },
  bold: { hueShift: 5, saturationDelta: 25, lightnessDelta: -4, radiusBias: "rounded", shadowBias: "medium", fontMood: "geometric", explanation: "大胆：高饱和、强对比、醒目" },
  大胆: { hueShift: 5, saturationDelta: 25, lightnessDelta: -4, radiusBias: "rounded", shadowBias: "medium", fontMood: "geometric", explanation: "大胆：高饱和、强对比、醒目" },
  elegant: { hueShift: -12, saturationDelta: -14, lightnessDelta: 0, radiusBias: "sharp", shadowBias: "subtle", fontMood: "serif", explanation: "优雅：冷调低饱和、锐利圆角、衬线" },
  优雅: { hueShift: -12, saturationDelta: -14, lightnessDelta: 0, radiusBias: "sharp", shadowBias: "subtle", fontMood: "serif", explanation: "优雅：冷调低饱和、锐利圆角、衬线" },
  futuristic: { hueShift: 10, saturationDelta: 15, lightnessDelta: -6, radiusBias: "sharp", shadowBias: "sharp", fontMood: "mono", explanation: "未来感：霓虹冷色、锐利、发光" },
  未来: { hueShift: 10, saturationDelta: 15, lightnessDelta: -6, radiusBias: "sharp", shadowBias: "sharp", fontMood: "mono", explanation: "未来感：霓虹冷色、锐利、发光" },
  calm: { hueShift: -6, saturationDelta: -16, lightnessDelta: 10, radiusBias: "rounded", shadowBias: "subtle", fontMood: "sans", explanation: "沉稳：低饱和、明亮、柔和" },
  沉稳: { hueShift: -6, saturationDelta: -16, lightnessDelta: 10, radiusBias: "rounded", shadowBias: "subtle", fontMood: "sans", explanation: "沉稳：低饱和、明亮、柔和" },
  energetic: { hueShift: 25, saturationDelta: 22, lightnessDelta: 4, radiusBias: "pill", shadowBias: "medium", fontMood: "geometric", explanation: "活力：高饱和暖色、大圆角" },
  活力: { hueShift: 25, saturationDelta: 22, lightnessDelta: 4, radiusBias: "pill", shadowBias: "medium", fontMood: "geometric", explanation: "活力：高饱和暖色、大圆角" },
  comfortable: { hueShift: 8, saturationDelta: -6, lightnessDelta: 8, radiusBias: "rounded", shadowBias: "subtle", fontMood: "sans", explanation: "舒适：柔和的暖色、宽松明亮" },
  舒适: { hueShift: 8, saturationDelta: -6, lightnessDelta: 8, radiusBias: "rounded", shadowBias: "subtle", fontMood: "sans", explanation: "舒适：柔和的暖色、宽松明亮" },
  luxury: { hueShift: 10, saturationDelta: -14, lightnessDelta: -10, radiusBias: "subtle", shadowBias: "subtle", fontMood: "serif", explanation: "奢侈：金调低饱和、衬线、深邃" },
  奢侈: { hueShift: 10, saturationDelta: -14, lightnessDelta: -10, radiusBias: "subtle", shadowBias: "subtle", fontMood: "serif", explanation: "奢侈：金调低饱和、衬线、深邃" },
  高端: { hueShift: -8, saturationDelta: -10, lightnessDelta: -6, radiusBias: "rounded", shadowBias: "subtle", fontMood: "serif", explanation: "高级：低饱和、深色、衬线标题" },
  readable: { hueShift: 0, saturationDelta: -18, lightnessDelta: 12, radiusBias: "subtle", shadowBias: "subtle", fontMood: "sans", explanation: "易读：高对比、明亮、标准圆角" },
  易读: { hueShift: 0, saturationDelta: -18, lightnessDelta: 12, radiusBias: "subtle", shadowBias: "subtle", fontMood: "sans", explanation: "易读：高对比、明亮、标准圆角" },
  大字号: { hueShift: 0, saturationDelta: -10, lightnessDelta: 10, radiusBias: "subtle", shadowBias: "subtle", fontMood: "sans", explanation: "大字号：宽行高、强可读性" },
  fun: { hueShift: 20, saturationDelta: 20, lightnessDelta: 6, radiusBias: "pill", shadowBias: "medium", fontMood: "geometric", explanation: "有趣：多色、圆角、弹性动画" },
  有趣: { hueShift: 20, saturationDelta: 20, lightnessDelta: 6, radiusBias: "pill", shadowBias: "medium", fontMood: "geometric", explanation: "有趣：多色、圆角、弹性动画" },
  clean: { hueShift: -4, saturationDelta: -22, lightnessDelta: 8, radiusBias: "subtle", shadowBias: "subtle", fontMood: "sans", explanation: "简洁：去饱和、留白、克制" },
  简洁: { hueShift: -4, saturationDelta: -22, lightnessDelta: 8, radiusBias: "subtle", shadowBias: "subtle", fontMood: "sans", explanation: "简洁：去饱和、留白、克制" },
  未来感: { hueShift: 10, saturationDelta: 15, lightnessDelta: -6, radiusBias: "sharp", shadowBias: "sharp", fontMood: "mono", explanation: "未来感：霓虹冷色、锐利、发光" },
};

export function resolveAdjective(term: string): AdjectiveDef | undefined {
  return ADJECTIVE_LEXICON[term.trim().toLowerCase()];
}

export function normalizeAdjectives(adjectives: string[]): Array<{ term: string; def: AdjectiveDef }> {
  const seenTerms = new Set<string>();
  const seenEffects = new Set<string>();
  const out: Array<{ term: string; def: AdjectiveDef }> = [];
  for (const raw of adjectives) {
    const term = raw.trim();
    if (!term) continue;
    const def = resolveAdjective(term);
    if (!def) continue;
    const key = term.toLowerCase();
    if (seenTerms.has(key) || seenEffects.has(def.explanation)) continue;
    seenTerms.add(key);
    seenEffects.add(def.explanation);
    out.push({ term, def });
  }
  return out;
}

function fontForMood(mood: AdjectiveDef["fontMood"]): FontPairingData["display"] | null {
  const match = FONT_PAIRINGS.find((p) => {
    const cat = p.display.category;
    if (mood === "serif") return cat === "serif";
    if (mood === "sans") return cat === "sans-serif" && p.display.family.includes("Inter");
    if (mood === "geometric") return p.display.family.toLowerCase().includes("space") || cat === "sans-serif";
    return cat === "monospace" || p.display.family.toLowerCase().includes("mono");
  });
  return match ? match.display : null;
}

export interface SemanticDecision {
  category: string;
  key: string;
  value: string;
  reason: string;
}

export interface SemanticStyleResult {
  base_style: string;
  base_color: string;
  adjectives: string[];
  decisions: SemanticDecision[];
  summary: string;
}

/**
 * Translate a description + adjective list into an applied token set.
 * The base preset tokens are generated first, then adjusted by the summed
 * adjective deltas; every override carries a reason string.
 */
export function applySemanticStyle(
  description: string,
  adjectives: string[],
  baseStyle?: string,
  baseColor?: string
): SemanticStyleResult {
  const resolved = normalizeAdjectives(adjectives);
  if (resolved.length === 0) {
    throw new Error(
      `No recognized adjectives in [${adjectives.join(", ")}]. Known: ${Object.keys(ADJECTIVE_LEXICON).slice(0, 20).join(", ")}...`
    );
  }

  const style = baseStyle || stateStore.getState().style || "minimal";
  const preset = STYLE_PRESETS[style];
  if (!preset) throw new Error(`Unknown base style: ${style}`);

  // Aggregate adjective deltas
  let hueShift = 0;
  let saturationDelta = 0;
  let lightnessDelta = 0;
  const radiusVotes: Record<string, number> = { sharp: 0, subtle: 0, rounded: 0, pill: 0 };
  const shadowVotes: Record<string, number> = { subtle: 0, medium: 0, sharp: 0 };
  const fontVotes: Record<string, number> = { serif: 0, sans: 0, geometric: 0, mono: 0 };
  const reasons: string[] = [];

  for (const { term, def } of resolved) {
    hueShift += def.hueShift;
    saturationDelta += def.saturationDelta;
    lightnessDelta += def.lightnessDelta;
    radiusVotes[def.radiusBias]++;
    shadowVotes[def.shadowBias]++;
    fontVotes[def.fontMood]++;
    reasons.push(`「${term}」→ ${def.explanation}`);
  }

  const radiusBias = Object.entries(radiusVotes).sort((a, b) => b[1] - a[1])[0][0] as
    | "sharp"
    | "subtle"
    | "rounded"
    | "pill";
  const shadowBias = Object.entries(shadowVotes).sort((a, b) => b[1] - a[1])[0][0] as
    | "subtle"
    | "medium"
    | "sharp";
  const fontMood = Object.entries(fontVotes).sort((a, b) => b[1] - a[1])[0][0] as
    "serif" | "sans" | "geometric" | "mono";

  // Compute a new base color from the preset hue + adjective hue shifts
  const startHsl = hexToHsl(baseColor && /^#[0-9A-Fa-f]{6}$/.test(baseColor) ? baseColor : hslToHex({
    h: preset.base_hue,
    s: preset.saturation,
    l: preset.lightness,
  }));
  const adjustedHsl = {
    h: (startHsl.h + hueShift + 360) % 360,
    s: Math.max(0, Math.min(100, startHsl.s + saturationDelta)),
    l: Math.max(0, Math.min(100, startHsl.l + lightnessDelta)),
  };
  const newBaseHex = hslToHex(adjustedHsl);

  // Generate the base preset token set with the adjusted base color
  applyStyleTokenSet(stateStore, style, newBaseHex, "preset");

  const decisions: SemanticDecision[] = [];
  const note = (category: string, key: string, value: string, reason: string) => {
    stateStore.setToken(category as never, key, value, "user", reason);
    decisions.push({ category, key, value, reason });
  };

  // Color adjustments
  note("colors", "color-primary", newBaseHex, `形容词综合 → 色相偏移 ${hueShift}°、饱和度 ${saturationDelta >= 0 ? "+" : ""}${saturationDelta}、明度 ${lightnessDelta >= 0 ? "+" : ""}${lightnessDelta}`);
  const primaryHsl = hexToHsl(newBaseHex);
  note("colors", "color-primary-dark", hslToHex(adjustLightness(primaryHsl, -8)), "主色加深，保证按钮/链接对比度");
  note("colors", "color-primary-light", hslToHex(adjustLightness(primaryHsl, 8)), "主色提亮，用于浅色强调背景");

  // Radius / shadow / font
  const radii = radiusSetFor(radiusBias);
  Object.entries(radii).forEach(([key, value]) => {
    note("radii", key, value, `形容词综合 → 圆角风格 ${radiusBias}`);
  });
  const shadows = shadowSetFor(shadowBias);
  Object.entries(shadows).forEach(([key, value]) => {
    note("shadows", key, value, `形容词综合 → 阴影风格 ${shadowBias}`);
  });
  const font = fontForMood(fontMood);
  if (font) {
    note("typography", "font-display", font.family, `形容词综合 → 标题字体 ${font.name} (${fontMood})`);
  }

  const summary = `${description ? `描述：${description}\n` : ""}识别形容词：${resolved.map((r) => r.term).join("、")}\n${reasons.join("\n")}`;
  return {
    base_style: style,
    base_color: newBaseHex,
    adjectives: resolved.map((r) => r.term),
    decisions,
    summary,
  };
}
