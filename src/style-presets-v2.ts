/**
 * Style Presets V2 (upgrade plan S2 + S3)
 *
 * 数据化设计系统，对齐 VoltAgent/awesome-design-md 的 DESIGN.md token 粒度
 * 与 bergside/awesome-design-skills 的 SKILL.md 治理体系。
 *
 * 设计：用 derive 工厂从风格基础参数（hue/sat/light/bg/text/字体/圆角/治理）
 * 自动派生完整语义色板与 surface 阶梯，每个风格定义保持紧凑但完整。
 */

import type {
  StylePreset,
  StyleCategory,
  SemanticColor,
  SurfaceScale,
  TextScale,
  BorderScale,
  StyleColorSystem,
  FontSystem,
  FontDef,
  TypeToken,
  RadiusScale,
  ElevationScale,
  SpacingScale,
  BreakpointSet,
  A11ySpec,
} from "./constants.js";
import { STYLE_PRESETS, STYLE_MOTION_PROFILES } from "./constants.js";

// ===== HSL → Hex 工具 =====

function hslToHex(h: number, s: number, l: number): string {
  const sh = s / 100;
  const ll = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = sh * Math.min(ll, 1 - ll);
  const f = (n: number): number =>
    ll - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number): string => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function adjust(hex: string, dl: number): string {
  // 简化：解析 hex → HSL，调整 lightness，再转回 hex
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return hslToHex(h, s * 100, Math.max(0, Math.min(100, (l + dl) * 100)));
}

// ===== 派生工厂 =====

function deriveSemantic(hue: number, sat: number, light: number, dark: boolean): SemanticColor {
  const L = dark ? Math.min(light + 12, 70) : light;
  const primary = hslToHex(hue, sat, L);
  const onLight = L > 55;
  return {
    primary,
    onPrimary: onLight ? hslToHex(hue, Math.max(sat - 40, 10), 12) : hslToHex(hue, Math.max(sat - 30, 10), 98),
    primaryHover: adjust(primary, dark ? 0.06 : -0.05),
    primaryFocus: adjust(primary, dark ? 0.1 : -0.09),
    primaryPressed: adjust(primary, dark ? 0.02 : -0.1),
    secondary: hslToHex((hue + 30) % 360, Math.max(sat - 15, 10), dark ? L + 5 : L),
    accent: hslToHex((hue + 180) % 360, sat, dark ? L + 8 : L),
    success: hslToHex(140, 55, dark ? 55 : 40),
    warning: hslToHex(38, 80, dark ? 60 : 45),
    danger: hslToHex(0, 70, dark ? 60 : 45),
    info: hslToHex(200, 65, dark ? 55 : 45),
  };
}

function deriveSurface(bg: string, dark: boolean): SurfaceScale {
  return {
    canvas: bg,
    surface1: adjust(bg, dark ? 0.04 : -0.02),
    surface2: adjust(bg, dark ? 0.08 : -0.04),
    surface3: adjust(bg, dark ? 0.12 : -0.06),
    surface4: adjust(bg, dark ? 0.16 : -0.08),
  };
}

function deriveText(text: string): TextScale {
  return {
    ink: text,
    inkMuted: adjust(text, 0.12),
    inkSubtle: adjust(text, 0.24),
    inkTertiary: adjust(text, 0.36),
  };
}

function deriveBorder(bg: string, dark: boolean): BorderScale {
  return {
    hairline: adjust(bg, dark ? 0.18 : -0.1),
    hairlineStrong: adjust(bg, dark ? 0.28 : -0.18),
    hairlineTertiary: adjust(bg, dark ? 0.1 : -0.05),
  };
}

// ===== 默认 token 模板 =====

const DEFAULT_BREAKPOINTS: BreakpointSet = {
  mobile: 480, mobileLg: 768, tablet: 1024, desktop: 1280, desktopXL: 1440,
};

const DEFAULT_A11Y: A11ySpec = {
  wcagLevel: "AA",
  keyboardFirst: true,
  minTouchTarget: 44,
  focusRingSpec: "2px primaryFocus @50% opacity",
};

const DEFAULT_TYPE_SCALE: TypeToken[] = [
  { name: "display-xl", fontSize: 64, fontWeight: 700, lineHeight: 1.1, letterSpacing: -0.02 },
  { name: "display-lg", fontSize: 48, fontWeight: 700, lineHeight: 1.15, letterSpacing: -0.02 },
  { name: "display-md", fontSize: 36, fontWeight: 600, lineHeight: 1.2, letterSpacing: -0.01 },
  { name: "headline", fontSize: 28, fontWeight: 600, lineHeight: 1.3, letterSpacing: -0.01 },
  { name: "body-lg", fontSize: 18, fontWeight: 400, lineHeight: 1.6, letterSpacing: 0 },
  { name: "body", fontSize: 16, fontWeight: 400, lineHeight: 1.6, letterSpacing: 0 },
  { name: "body-sm", fontSize: 14, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0 },
  { name: "caption", fontSize: 12, fontWeight: 500, lineHeight: 1.4, letterSpacing: 0.02 },
  { name: "button", fontSize: 15, fontWeight: 600, lineHeight: 1, letterSpacing: 0.01 },
  { name: "eyebrow", fontSize: 12, fontWeight: 700, lineHeight: 1, letterSpacing: 0.08 },
];

function makeSpacing(base: number): SpacingScale {
  return {
    xxs: Math.round(base * 0.5), xs: base, sm: Math.round(base * 1.5), md: Math.round(base * 2),
    lg: Math.round(base * 3), xl: Math.round(base * 4), xxl: Math.round(base * 6), section: Math.round(base * 12),
  };
}

// ===== 风格定义工厂 =====

interface PresetInput {
  slug: string;
  name: string;
  category: StyleCategory;
  description: string;
  inspiration?: string;
  hue: number;
  sat: number;
  light: number;
  bgLight: string;
  bgDark: string;
  textLight: string;
  textDark: string;
  shadowStyle: StylePreset["shadow_style"];
  radiusStyle: StylePreset["radius_style"];
  spacingBase: number;
  radius: RadiusScale;
  elevation: ElevationScale;
  fonts: { display: FontDef; body: FontDef; mono: FontDef };
  typeScale?: TypeToken[];
  doRules: string[];
  dontRules: string[];
  writingTone: string[];
  qualityGates: string[];
  recommendedReactBits: string[];
}

function makePreset(input: PresetInput): StylePreset {
  const colors: StyleColorSystem = {
    light: deriveSemantic(input.hue, input.sat, input.light, false),
    dark: deriveSemantic(input.hue, input.sat, input.light, true),
    surfaceLight: deriveSurface(input.bgLight, false),
    surfaceDark: deriveSurface(input.bgDark, true),
    textLight: deriveText(input.textLight),
    textDark: deriveText(input.textDark),
    borderLight: deriveBorder(input.bgLight, false),
    borderDark: deriveBorder(input.bgDark, true),
  };
  const font: FontSystem = {
    display: input.fonts.display,
    body: input.fonts.body,
    mono: input.fonts.mono,
    typeScale: input.typeScale || DEFAULT_TYPE_SCALE,
  };
  return {
    name: input.name,
    slug: input.slug,
    description: input.description,
    category: input.category,
    inspiration: input.inspiration,
    base_hue: input.hue,
    saturation: input.sat,
    lightness: input.light,
    shadow_style: input.shadowStyle,
    radius_style: input.radiusStyle,
    spacing_base: input.spacingBase,
    bg_light: input.bgLight,
    bg_dark: input.bgDark,
    text_light: input.textLight,
    text_dark: input.textDark,
    colors,
    font,
    spacingScale: makeSpacing(input.spacingBase),
    radiusScale: input.radius,
    elevation: input.elevation,
    breakpoints: DEFAULT_BREAKPOINTS,
    maxContentWidth: 1280,
    gridColumns: 12,
    a11y: DEFAULT_A11Y,
    doRules: input.doRules,
    dontRules: input.dontRules,
    writingTone: input.writingTone,
    qualityGates: input.qualityGates,
    recommendedReactBits: input.recommendedReactBits,
  };
}

// ===== 通用圆角/阴影模板 =====

const R_SHARP: RadiusScale = { xs: 0, sm: 0, md: 0, lg: 0, xl: 0, xxl: 0, pill: 0, full: 9999 };
const R_MINIMAL: RadiusScale = { xs: 2, sm: 4, md: 6, lg: 8, xl: 12, xxl: 16, pill: 9999, full: 9999 };
const R_ROUNDED: RadiusScale = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, pill: 9999, full: 9999 };
const R_PILL: RadiusScale = { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, pill: 9999, full: 9999 };

const E_SUBTLE: ElevationScale = { e0: "none", e1: "0 1px 2px rgba(0,0,0,0.04)", e2: "0 2px 8px rgba(0,0,0,0.06)", e3: "0 8px 24px rgba(0,0,0,0.08)", e4: "0 0 0 2px var(--primary-focus)" };
const E_MEDIUM: ElevationScale = { e0: "none", e1: "0 2px 4px rgba(0,0,0,0.08)", e2: "0 4px 12px rgba(0,0,0,0.1)", e3: "0 12px 32px rgba(0,0,0,0.12)", e4: "0 0 0 2px var(--primary-focus)" };
const E_SHARP: ElevationScale = { e0: "none", e1: "0 4px 0 rgba(0,0,0,0.2)", e2: "0 8px 0 rgba(0,0,0,0.25)", e3: "0 12px 0 rgba(0,0,0,0.3)", e4: "0 0 0 3px var(--primary-focus)" };

const FONT_INTER = { name: "Inter", family: "Inter, system-ui, sans-serif", weights: [400, 500, 600, 700] };
const FONT_INTER_BODY = { name: "Inter", family: "Inter, system-ui, sans-serif", weights: [400, 500, 600] };
const FONT_JETBRAINS = { name: "JetBrains Mono", family: "'JetBrains Mono', monospace", weights: [400, 500, 700] };

export const STYLE_PRESETS_V2: Record<string, StylePreset> = {
  // ============ 现有 14 风格（补全 V2 字段）============

  minimal: makePreset({
    slug: "minimal", name: "Minimal", category: "foundational",
    description: "中性灰、留白、无衬线 Inter 字体、4px 小圆角",
    inspiration: "Linear / Vercel",
    hue: 220, sat: 10, light: 50,
    bgLight: "#ffffff", bgDark: "#0f1115", textLight: "#1a1a2e", textDark: "#e8e8ec",
    shadowStyle: "subtle", radiusStyle: "sharp", spacingBase: 8,
    radius: R_MINIMAL, elevation: E_SUBTLE,
    fonts: { display: { ...FONT_INTER, weights: [400, 500, 600, 700] }, body: FONT_INTER_BODY, mono: FONT_JETBRAINS },
    doRules: ["保持大量留白，元素间距 ≥ spacing.md(16px)", "CTA 使用 primaryFocus 描边表达焦点", "图标统一 1.5px 线宽"],
    dontRules: ["禁止 #000000 纯黑作为 canvas", "禁止 pill 圆角的 CTA", "禁止超过 2 个强调色同时出现"],
    writingTone: ["concise", "confident", "helpful"],
    qualityGates: ["对比度 ≥ 4.5:1 (WCAG AA)", "focus 可见 ≥ 2px", "触屏 ≥ 44px", "480/768/1024/1280 无横向滚动"],
    recommendedReactBits: ["BlurText", "FadeContent", "SpotlightCard"],
  }),

  bold: makePreset({
    slug: "bold", name: "Bold", category: "expressive",
    description: "210° 蓝、高饱和、无圆角、强视觉层级",
    inspiration: "Stripe",
    hue: 210, sat: 80, light: 50,
    bgLight: "#fafafa", bgDark: "#12101f", textLight: "#0d0d0d", textDark: "#f0f0f5",
    shadowStyle: "medium", radiusStyle: "none", spacingBase: 8,
    radius: R_SHARP, elevation: E_MEDIUM,
    fonts: { display: { name: "Clash Display", family: "'Clash Display', sans-serif", weights: [500, 600, 700] }, body: { name: "Satoshi", family: "Satoshi, sans-serif", weights: [400, 500, 700] }, mono: FONT_JETBRAINS },
    doRules: ["使用大字号标题建立视觉层级", "CTA 用高饱和 primary 填充", "色块对比要强烈"],
    dontRules: ["禁止低对比度文字", "禁止过多圆角削弱力度", "禁止灰色调主导"],
    writingTone: ["direct", "confident", "energetic"],
    qualityGates: ["对比度 ≥ 4.5:1", "CTA 面积 ≥ 48px 高", "主色覆盖 ≤ 30% 视区"],
    recommendedReactBits: ["AnimatedGradientText", "ScrollVelocity", "MagneticButton"],
  }),

  playful: makePreset({
    slug: "playful", name: "Playful", category: "playful",
    description: "330° 粉、Poppins/Nunito、黄金比例、16px 大圆角",
    inspiration: "Notion / Linear",
    hue: 330, sat: 70, light: 60,
    bgLight: "#fff8f6", bgDark: "#1a1015", textLight: "#2d1b2e", textDark: "#fce8e4",
    shadowStyle: "medium", radiusStyle: "pill", spacingBase: 8,
    radius: R_PILL, elevation: E_MEDIUM,
    fonts: { display: { name: "Poppins", family: "Poppins, sans-serif", weights: [400, 500, 600, 700, 800] }, body: { name: "Nunito", family: "Nunito, sans-serif", weights: [400, 500, 600, 700] }, mono: FONT_JETBRAINS },
    doRules: ["使用圆角与柔和色彩", "图标用填充式而非线性", "留白要充裕"],
    dontRules: ["禁止尖锐直角", "禁止高饱和红/橙作主色", "禁止冷硬的几何形状"],
    writingTone: ["friendly", "warm", "approachable"],
    qualityGates: ["对比度 ≥ 4.5:1", "圆角 ≥ 12px", "色彩饱和度 ≤ 75%"],
    recommendedReactBits: ["SpringyText", "BouncyCards", "FloatingElements"],
  }),

  dark: makePreset({
    slug: "dark", name: "Dark", category: "technical",
    description: "260° 紫、深色优先、JetBrains Mono 点缀",
    inspiration: "ElevenLabs / Runway",
    hue: 260, sat: 60, light: 40,
    bgLight: "#f5f7fa", bgDark: "#0a0e14", textLight: "#0a0e14", textDark: "#c9d1d9",
    shadowStyle: "sharp", radiusStyle: "rounded", spacingBase: 8,
    radius: R_ROUNDED, elevation: E_MEDIUM,
    fonts: { display: { ...FONT_INTER, weights: [500, 600, 700] }, body: FONT_INTER_BODY, mono: FONT_JETBRAINS },
    doRules: ["深色优先设计", "使用 surface 阶梯表达层级", "强调色用于关键 CTA"],
    dontRules: ["禁止纯白背景", "禁止超过 3 级灰度", "禁止低对比度深灰文字"],
    writingTone: ["technical", "precise", "calm"],
    qualityGates: ["深色背景对比度 ≥ 4.5:1", "surface 层级 ≥ 3 级", "强调色仅用于 CTA"],
    recommendedReactBits: ["GlowingText", "ParticleField", "NeonButton"],
  }),

  editorial: makePreset({
    slug: "editorial", name: "Editorial", category: "editorial",
    description: "30° 棕、Playfair Display 衬线、无圆角",
    inspiration: "The Verge / WIRED",
    hue: 30, sat: 30, light: 40,
    bgLight: "#fdfcfa", bgDark: "#161310", textLight: "#1c1917", textDark: "#e7e5e4",
    shadowStyle: "subtle", radiusStyle: "none", spacingBase: 8,
    radius: R_SHARP, elevation: E_SUBTLE,
    fonts: { display: { name: "Playfair Display", family: "'Playfair Display', Georgia, serif", weights: [400, 500, 600, 700, 800, 900] }, body: { name: "Source Sans 3", family: "'Source Sans 3', system-ui, sans-serif", weights: [300, 400, 600] }, mono: FONT_JETBRAINS },
    doRules: ["使用衬线标题 + 无衬线正文", "行高放宽至 1.6+", "图文混排要有呼吸感"],
    dontRules: ["禁止圆角卡片", "禁止高饱和色", "禁止过紧字距"],
    writingTone: ["literary", "thoughtful", "narrative"],
    qualityGates: ["衬线/无衬线配对", "行高 ≥ 1.5", "图文比 40:60"],
    recommendedReactBits: ["TypewriterText", "ScrollReveal", "ParallaxImage"],
  }),

  tech: makePreset({
    slug: "tech", name: "Tech", category: "technical",
    description: "190° 青、Space Grotesk/JetBrains Mono、6px 小圆角",
    inspiration: "Vercel / Warp",
    hue: 190, sat: 70, light: 50,
    bgLight: "#f8fafc", bgDark: "#080d14", textLight: "#0f172a", textDark: "#cbd5e1",
    shadowStyle: "sharp", radiusStyle: "subtle", spacingBase: 4,
    radius: R_MINIMAL, elevation: E_SHARP,
    fonts: { display: { name: "Space Grotesk", family: "'Space Grotesk', sans-serif", weights: [400, 500, 600, 700] }, body: FONT_INTER_BODY, mono: FONT_JETBRAINS },
    doRules: ["使用 mono 字体强调技术感", "数据展示用表格/网格", "色彩冷调"],
    dontRules: ["禁止暖色调主导", "禁止圆角过大", "禁止装饰性插画"],
    writingTone: ["technical", "precise", "concise"],
    qualityGates: ["mono 字体用于数据", "冷色相主导", "圆角 ≤ 8px"],
    recommendedReactBits: ["TerminalText", "CodeTyping", "DataGrid"],
  }),

  glassmorphism: makePreset({
    slug: "glassmorphism", name: "Glassmorphism", category: "textured",
    description: "240° 蓝、Outfit/Inter、12px 圆角、毛玻璃质感",
    inspiration: "Apple / Framer",
    hue: 240, sat: 40, light: 55,
    bgLight: "#EEF2FF", bgDark: "#111631", textLight: "#312E81", textDark: "#E0E7FF",
    shadowStyle: "subtle", radiusStyle: "rounded", spacingBase: 8,
    radius: R_ROUNDED, elevation: E_SUBTLE,
    fonts: { display: { name: "Outfit", family: "Outfit, sans-serif", weights: [400, 500, 600, 700] }, body: FONT_INTER_BODY, mono: FONT_JETBRAINS },
    doRules: ["使用 backdrop-filter: blur 表达毛玻璃", "半透明叠加 surface", "边框用 1px 白色半透明"],
    dontRules: ["禁止纯色不透明卡片", "禁止锐利阴影", "禁止低对比度模糊背景"],
    writingTone: ["modern", "clean", "sophisticated"],
    qualityGates: ["backdrop-blur ≥ 12px", "卡片透明度 60-80%", "边框 1px rgba(255,255,255,0.2)"],
    recommendedReactBits: ["GlassCard", "BlurBackdrop", "FloatingGlass"],
  }),

  neumorphism: makePreset({
    slug: "neumorphism", name: "Neumorphism", category: "textured",
    description: "220° 灰、Nunito Sans、12px 圆角、软 UI 双阴影",
    inspiration: "软 UI 趋势",
    hue: 220, sat: 8, light: 65,
    bgLight: "#E0E5EC", bgDark: "#23272E", textLight: "#4B5563", textDark: "#D1D5DB",
    shadowStyle: "medium", radiusStyle: "rounded", spacingBase: 8,
    radius: R_ROUNDED, elevation: E_MEDIUM,
    fonts: { display: { name: "Nunito Sans", family: "'Nunito Sans', sans-serif", weights: [400, 600, 700, 800] }, body: { name: "Nunito Sans", family: "'Nunito Sans', sans-serif", weights: [400, 600, 700] }, mono: FONT_JETBRAINS },
    doRules: ["使用双向柔和阴影（亮+暗）", "元素与背景同色", "内凹/外凸用阴影方向区分"],
    dontRules: ["禁止强对比色", "禁止锐利阴影", "禁止高饱和强调色"],
    writingTone: ["soft", "calm", "minimal"],
    qualityGates: ["双阴影（亮+暗）", "元素与背景色差 ≤ 5%", "圆角 ≥ 12px"],
    recommendedReactBits: ["SoftCard", "PulseButton", "InsetText"],
  }),

  claymorphism: makePreset({
    slug: "claymorphism", name: "Claymorphism", category: "textured",
    description: "320° 粉、Quicksand/Nunito、药丸圆角、3D 粘土质感",
    inspiration: "Claymorphism 趋势",
    hue: 320, sat: 50, light: 70,
    bgLight: "#FFF1F5", bgDark: "#2A1520", textLight: "#4C1D2B", textDark: "#FCE7F0",
    shadowStyle: "medium", radiusStyle: "pill", spacingBase: 8,
    radius: R_PILL, elevation: E_MEDIUM,
    fonts: { display: { name: "Quicksand", family: "Quicksand, sans-serif", weights: [500, 600, 700] }, body: { name: "Nunito", family: "Nunito, sans-serif", weights: [400, 500, 600] }, mono: FONT_JETBRAINS },
    doRules: ["使用 3D 凸起阴影表达粘土感", "圆角药丸形", "色彩柔和粉嫩"],
    dontRules: ["禁止锐利直角", "禁止深色硬阴影", "禁止冷硬几何"],
    writingTone: ["playful", "soft", "friendly"],
    qualityGates: ["3D 凸起阴影（多层）", "圆角 ≥ 16px", "饱和度 40-60%"],
    recommendedReactBits: ["ClayCard", "BouncyButton", "3DIcon"],
  }),

  aurora: makePreset({
    slug: "aurora", name: "Aurora", category: "immersive",
    description: "270° 紫、Space Grotesk/Inter、12px 圆角、极光渐变",
    inspiration: "Vercel / Linear",
    hue: 270, sat: 70, light: 50,
    bgLight: "#F5F0FF", bgDark: "#0F0A1E", textLight: "#2E1065", textDark: "#EDE9FE",
    shadowStyle: "medium", radiusStyle: "rounded", spacingBase: 8,
    radius: R_ROUNDED, elevation: E_MEDIUM,
    fonts: { display: { name: "Space Grotesk", family: "'Space Grotesk', sans-serif", weights: [400, 500, 600, 700] }, body: FONT_INTER_BODY, mono: FONT_JETBRAINS },
    doRules: ["使用极光渐变背景", "强调色用紫蓝渐变", "动效要流畅舒缓"],
    dontRules: ["禁止纯色平铺背景", "禁止锐利直角", "禁止高对比强阴影"],
    writingTone: ["dreamy", "modern", "elegant"],
    qualityGates: ["渐变 ≥ 3 色过渡", "圆角 ≥ 12px", "动效时长 ≥ 0.6s"],
    recommendedReactBits: ["AuroraText", "GradientMesh", "FlowingBackground"],
  }),

  brutalism: makePreset({
    slug: "brutalism", name: "Brutalism", category: "retro",
    description: "50° 黄、Archivo Black/Space Mono、无圆角、硬阴影",
    inspiration: "Gumroad / Brutalism 趋势",
    hue: 50, sat: 90, light: 50,
    bgLight: "#FFFFFF", bgDark: "#111111", textLight: "#111111", textDark: "#F5F5F5",
    shadowStyle: "sharp", radiusStyle: "none", spacingBase: 4,
    radius: R_SHARP, elevation: E_SHARP,
    fonts: { display: { name: "Archivo Black", family: "'Archivo Black', sans-serif", weights: [400] }, body: { name: "Space Mono", family: "'Space Mono', monospace", weights: [400, 700] }, mono: { name: "Space Mono", family: "'Space Mono', monospace", weights: [400, 700] } },
    doRules: ["使用硬偏移阴影（非模糊）", "粗黑边框 2-4px", "高对比黑白黄"],
    dontRules: ["禁止圆角", "禁止柔和阴影", "禁止渐变"],
    writingTone: ["raw", "bold", "direct"],
    qualityGates: ["硬阴影偏移 ≥ 4px", "边框 ≥ 2px", "圆角 = 0"],
    recommendedReactBits: ["BrutalistCard", "HardShadowButton", "PixelText"],
  }),

  cyberpunk: makePreset({
    slug: "cyberpunk", name: "Cyberpunk", category: "technical",
    description: "180° 青、Orbitron/Share Tech Mono、无圆角、霓虹 HUD",
    inspiration: "Cyberpunk 2077 / 小米",
    hue: 180, sat: 100, light: 50,
    bgLight: "#EAF6F8", bgDark: "#0D0221", textLight: "#083344", textDark: "#E0E7FF",
    shadowStyle: "sharp", radiusStyle: "none", spacingBase: 4,
    radius: R_SHARP, elevation: E_SHARP,
    fonts: { display: { name: "Orbitron", family: "Orbitron, sans-serif", weights: [500, 700, 900] }, body: { name: "Share Tech Mono", family: "'Share Tech Mono', monospace", weights: [400] }, mono: { name: "Share Tech Mono", family: "'Share Tech Mono', monospace", weights: [400] } },
    doRules: ["使用霓虹发光效果", "深色背景 + 高饱和青/品红", "HUD 风格边框与角标"],
    dontRules: ["禁止柔和圆角", "禁止低饱和度", "禁止柔和阴影"],
    writingTone: ["futuristic", "intense", "technical"],
    qualityGates: ["霓虹发光 ≥ 2 层", "饱和度 ≥ 90%", "圆角 = 0"],
    recommendedReactBits: ["GlitchText", "NeonGlow", "HudFrame"],
  }),

  organic: makePreset({
    slug: "organic", name: "Organic", category: "editorial",
    description: "90° 绿、Fraunces/DM Sans、药丸圆角、仿生形态",
    inspiration: "Starbucks / 有机品牌",
    hue: 90, sat: 30, light: 50,
    bgLight: "#F6FBF2", bgDark: "#10160E", textLight: "#1C2B1A", textDark: "#E7F0E2",
    shadowStyle: "medium", radiusStyle: "pill", spacingBase: 8,
    radius: R_PILL, elevation: E_MEDIUM,
    fonts: { display: { name: "Fraunces", family: "Fraunces, Georgia, serif", weights: [400, 500, 600, 700] }, body: { name: "DM Sans", family: "'DM Sans', sans-serif", weights: [400, 500] }, mono: FONT_JETBRAINS },
    doRules: ["使用有机曲线与药丸圆角", "自然色相（绿/棕/米）", "留白充裕"],
    dontRules: ["禁止锐利直角", "禁止高饱和荧光色", "禁止工业感几何"],
    writingTone: ["natural", "warm", "calm"],
    qualityGates: ["圆角 ≥ 16px", "自然色相", "饱和度 ≤ 50%"],
    recommendedReactBits: ["OrganicCard", "LeafDecoration", "FlowingText"],
  }),

  luxury: makePreset({
    slug: "luxury", name: "Luxury", category: "editorial",
    description: "45° 金、Cormorant Garamond/Jost、4px 圆角、黑金 OLED",
    inspiration: "Lamborghini / Bugatti",
    hue: 45, sat: 35, light: 50,
    bgLight: "#FDFBF5", bgDark: "#0B0A08", textLight: "#1C1917", textDark: "#F5EFE0",
    shadowStyle: "subtle", radiusStyle: "sharp", spacingBase: 8,
    radius: R_MINIMAL, elevation: E_SUBTLE,
    fonts: { display: { name: "Cormorant Garamond", family: "'Cormorant Garamond', Georgia, serif", weights: [400, 500, 600, 700] }, body: { name: "Jost", family: "Jost, sans-serif", weights: [300, 400, 500] }, mono: FONT_JETBRAINS },
    doRules: ["使用金色作为强调", "OLED 深黑背景", "衬线标题 + 极细正文"],
    dontRules: ["禁止高饱和荧光色", "禁止大圆角", "禁止多彩渐变"],
    writingTone: ["elegant", "refined", "exclusive"],
    qualityGates: ["金色仅用于强调", "背景 ≥ #0B0A08 深度", "字重 ≤ 500（正文）"],
    recommendedReactBits: ["GoldText", "CinematicReveal", "ElegantCard"],
  }),

  // ============ 新增 16 风格（S3）============

  bento: makePreset({
    slug: "bento", name: "Bento", category: "playful",
    description: "便当盒网格布局、大圆角卡片、明快配色",
    inspiration: "Apple 产品页",
    hue: 230, sat: 70, light: 55,
    bgLight: "#f5f5f7", bgDark: "#1d1d1f", textLight: "#1d1d1f", textDark: "#f5f5f7",
    shadowStyle: "subtle", radiusStyle: "rounded", spacingBase: 8,
    radius: R_ROUNDED, elevation: E_SUBTLE,
    fonts: { display: { ...FONT_INTER, weights: [600, 700, 800] }, body: FONT_INTER_BODY, mono: FONT_JETBRAINS },
    doRules: ["卡片用 12-24px 大圆角", "网格大小不一形成节奏", "卡片间留白 8-16px"],
    dontRules: ["禁止卡片大小完全统一", "禁止锐利直角", "禁止信息过密"],
    writingTone: ["clean", "modern", "product-focused"],
    qualityGates: ["圆角 ≥ 16px", "卡片尺寸 ≥ 3 种", "网格 gap ≥ 8px"],
    recommendedReactBits: ["BentoGrid", "SpotlightCard", "AnimatedCounter"],
  }),

  material: makePreset({
    slug: "material", name: "Material", category: "foundational",
    description: "Google Material 3、动态色、海拔层级、Roboto",
    inspiration: "Google Material 3",
    hue: 250, sat: 50, light: 50,
    bgLight: "#fef7ff", bgDark: "#141218", textLight: "#1c1b1f", textDark: "#e6e1e5",
    shadowStyle: "medium", radiusStyle: "rounded", spacingBase: 4,
    radius: R_ROUNDED, elevation: E_MEDIUM,
    fonts: { display: { name: "Roboto", family: "Roboto, system-ui, sans-serif", weights: [400, 500, 700, 900] }, body: { name: "Roboto", family: "Roboto, system-ui, sans-serif", weights: [400, 500] }, mono: FONT_JETBRAINS },
    doRules: ["使用 Material 海拔系统表达层级", "强调色从主色派生", "圆角遵循 Material token"],
    dontRules: ["禁止非 Material 圆角", "禁止超出 5 级海拔", "禁止自定义阴影"],
    writingTone: ["functional", "clear", "inclusive"],
    qualityGates: ["海拔 ≤ 5 级", "圆角遵循 Material scale", "触控 ≥ 48px"],
    recommendedReactBits: ["MaterialCard", "RippleButton", "FabMenu"],
  }),

  shadcn: makePreset({
    slug: "shadcn", name: "Shadcn", category: "technical",
    description: "shadcn/ui 风格、中性灰、极简圆角、Geist 字体",
    inspiration: "shadcn/ui",
    hue: 0, sat: 0, light: 50,
    bgLight: "#ffffff", bgDark: "#09090b", textLight: "#09090b", textDark: "#fafafa",
    shadowStyle: "subtle", radiusStyle: "subtle", spacingBase: 4,
    radius: R_MINIMAL, elevation: E_SUBTLE,
    fonts: { display: { name: "Geist", family: "Geist, sans-serif", weights: [400, 500, 600, 700] }, body: { name: "Geist", family: "Geist, sans-serif", weights: [400, 500] }, mono: { name: "Geist Mono", family: "'Geist Mono', monospace", weights: [400, 500] } },
    doRules: ["使用中性灰阶（zinc/neutral）", "极简圆角 6-8px", "组件可复制可定制"],
    dontRules: ["禁止高饱和强调色", "禁止大圆角", "禁止装饰性阴影"],
    writingTone: ["clean", "minimal", "developer-friendly"],
    qualityGates: ["中性灰阶", "圆角 ≤ 8px", "组件可复制粘贴"],
    recommendedReactBits: ["ShadcnCard", "CommandMenu", "DataTableView"],
  }),

  neobrutalism: makePreset({
    slug: "neobrutalism", name: "Neobrutalism", category: "retro",
    description: "新粗野主义、粗黑边框、硬偏移阴影、高饱和色块",
    inspiration: "Gumroad 复古",
    hue: 280, sat: 80, light: 55,
    bgLight: "#fef9c3", bgDark: "#1a1a2e", textLight: "#1a1a2e", textDark: "#fef9c3",
    shadowStyle: "sharp", radiusStyle: "none", spacingBase: 4,
    radius: R_SHARP, elevation: E_SHARP,
    fonts: { display: { name: "Archivo Black", family: "'Archivo Black', sans-serif", weights: [400] }, body: { name: "Space Grotesk", family: "'Space Grotesk', sans-serif", weights: [400, 500, 700] }, mono: FONT_JETBRAINS },
    doRules: ["粗黑边框 2-3px", "硬偏移阴影 4-6px", "高饱和色块对比"],
    dontRules: ["禁止圆角", "禁止柔和阴影", "禁止低饱和度"],
    writingTone: ["bold", "playful", "confident"],
    qualityGates: ["边框 ≥ 2px", "硬阴影偏移 ≥ 4px", "圆角 = 0"],
    recommendedReactBits: ["NeoCard", "HardShadowButton", "BoldBadge"],
  }),

  mono: makePreset({
    slug: "mono", name: "Mono", category: "technical",
    description: "单色黑白、极简、等宽字体点缀、Vercel 文档风",
    inspiration: "Vercel 文档",
    hue: 0, sat: 0, light: 0,
    bgLight: "#ffffff", bgDark: "#000000", textLight: "#000000", textDark: "#ffffff",
    shadowStyle: "subtle", radiusStyle: "sharp", spacingBase: 8,
    radius: R_MINIMAL, elevation: E_SUBTLE,
    fonts: { display: { name: "Geist", family: "Geist, sans-serif", weights: [400, 500, 600, 700] }, body: { name: "Geist", family: "Geist, sans-serif", weights: [400, 500] }, mono: { name: "Geist Mono", family: "'Geist Mono', monospace", weights: [400, 500] } },
    doRules: ["纯黑白灰阶", "等宽字体用于代码/数据", "极致留白"],
    dontRules: ["禁止任何彩色", "禁止大圆角", "禁止装饰性阴影"],
    writingTone: ["minimal", "precise", "technical"],
    qualityGates: ["纯灰阶（无色相）", "圆角 ≤ 4px", "对比度 ≥ 7:1 (AAA)"],
    recommendedReactBits: ["MonoText", "CodeBlock", "CommandLine"],
  }),

  neon: makePreset({
    slug: "neon", name: "Neon", category: "technical",
    description: "霓虹发光、深色背景、高饱和荧光色、ElevenLabs 风",
    inspiration: "ElevenLabs",
    hue: 180, sat: 100, light: 55,
    bgLight: "#0a0a14", bgDark: "#0a0a14", textLight: "#e0e7ff", textDark: "#e0e7ff",
    shadowStyle: "sharp", radiusStyle: "rounded", spacingBase: 8,
    radius: R_ROUNDED, elevation: E_SHARP,
    fonts: { display: { name: "Space Grotesk", family: "'Space Grotesk', sans-serif", weights: [500, 700] }, body: FONT_INTER_BODY, mono: FONT_JETBRAINS },
    doRules: ["使用霓虹发光效果", "深色背景 + 荧光强调色", "边框用发光描边"],
    dontRules: ["禁止浅色背景", "禁止低饱和度", "禁止柔和阴影"],
    writingTone: ["vibrant", "energetic", "modern"],
    qualityGates: ["发光层 ≥ 2", "饱和度 ≥ 90%", "深色背景"],
    recommendedReactBits: ["NeonGlow", "GlowingText", "PulseButton"],
  }),

  gradient: makePreset({
    slug: "gradient", name: "Gradient", category: "expressive",
    description: "渐变主导、Stripe 风格、紫蓝渐变、动态过渡",
    inspiration: "Stripe",
    hue: 250, sat: 80, light: 55,
    bgLight: "#ffffff", bgDark: "#0a0a14", textLight: "#0a0a14", textDark: "#ffffff",
    shadowStyle: "medium", radiusStyle: "rounded", spacingBase: 8,
    radius: R_ROUNDED, elevation: E_MEDIUM,
    fonts: { display: { name: "Clash Display", family: "'Clash Display', sans-serif", weights: [500, 600, 700] }, body: FONT_INTER_BODY, mono: FONT_JETBRAINS },
    doRules: ["使用多色渐变背景", "CTA 用渐变填充", "动效要流畅"],
    dontRules: ["禁止纯色平铺", "禁止渐变 < 2 色", "禁止锐利直角"],
    writingTone: ["modern", "dynamic", "premium"],
    qualityGates: ["渐变 ≥ 2 色", "圆角 ≥ 12px", "动效时长 ≥ 0.5s"],
    recommendedReactBits: ["AnimatedGradient", "GradientText", "FlowingBackground"],
  }),

  vibrant: makePreset({
    slug: "vibrant", name: "Vibrant", category: "expressive",
    description: "高饱和多彩、Figma 风、活泼明快",
    inspiration: "Figma",
    hue: 260, sat: 85, light: 60,
    bgLight: "#fef3c7", bgDark: "#1e1b4b", textLight: "#1e1b4b", textDark: "#fef3c7",
    shadowStyle: "medium", radiusStyle: "rounded", spacingBase: 8,
    radius: R_ROUNDED, elevation: E_MEDIUM,
    fonts: { display: { name: "Poppins", family: "Poppins, sans-serif", weights: [600, 700, 800] }, body: FONT_INTER_BODY, mono: FONT_JETBRAINS },
    doRules: ["使用多彩搭配", "饱和度高但不刺眼", "圆角友好"],
    dontRules: ["禁止低饱和度", "禁止纯灰背景", "禁止锐利直角"],
    writingTone: ["energetic", "friendly", "colorful"],
    qualityGates: ["饱和度 ≥ 70%", "色彩 ≥ 3 种", "圆角 ≥ 12px"],
    recommendedReactBits: ["ColorfulCards", "AnimatedIcons", "VibrantButton"],
  }),

  doodle: makePreset({
    slug: "doodle", name: "Doodle", category: "playful",
    description: "手绘涂鸦风、Excalidraw 风、手写字体、草图感",
    inspiration: "Excalidraw",
    hue: 40, sat: 40, light: 50,
    bgLight: "#fffbeb", bgDark: "#1c1917", textLight: "#1c1917", textDark: "#fef3c7",
    shadowStyle: "subtle", radiusStyle: "none", spacingBase: 8,
    radius: R_SHARP, elevation: E_SUBTLE,
    fonts: { display: { name: "Caveat", family: "Caveat, cursive", weights: [400, 700] }, body: { name: "Kalam", family: "Kalam, cursive", weights: [300, 400, 700] }, mono: FONT_JETBRAINS },
    doRules: ["使用手写字体", "边框用手绘抖动效果", "插画用草图风"],
    dontRules: ["禁止完美几何直线", "禁止高饱和荧光色", "禁止现代无衬线"],
    writingTone: ["casual", "handcrafted", "friendly"],
    qualityGates: ["手写字体", "边框抖动 ≥ 1px", "草图感插画"],
    recommendedReactBits: ["DoodleCard", "HandDrawnText", "SketchIcon"],
  }),

  paper: makePreset({
    slug: "paper", name: "Paper", category: "textured",
    description: "纸张质感、Notion 风、米色背景、柔和阴影",
    inspiration: "Notion",
    hue: 40, sat: 20, light: 95,
    bgLight: "#fffef0", bgDark: "#1c1917", textLight: "#1c1917", textDark: "#fef3c7",
    shadowStyle: "subtle", radiusStyle: "subtle", spacingBase: 8,
    radius: R_MINIMAL, elevation: E_SUBTLE,
    fonts: { display: { name: "Lyon", family: "Georgia, serif", weights: [400, 700] }, body: { name: "Inter", family: "Inter, system-ui, sans-serif", weights: [400, 500] }, mono: FONT_JETBRAINS },
    doRules: ["使用米色/纸张背景", "柔和阴影表达纸张层叠", "衬线标题"],
    dontRules: ["禁止纯白背景", "禁止高饱和色", "禁止锐利阴影"],
    writingTone: ["calm", "reading-focused", "warm"],
    qualityGates: ["背景非纯白", "阴影柔和", "圆角 ≤ 8px"],
    recommendedReactBits: ["PaperCard", "FoldedNote", "SoftShadow"],
  }),

  cosmic: makePreset({
    slug: "cosmic", name: "Cosmic", category: "immersive",
    description: "宇宙星空、SpaceX 风、深黑背景、星点装饰",
    inspiration: "SpaceX",
    hue: 230, sat: 60, light: 30,
    bgLight: "#0a0e27", bgDark: "#050714", textLight: "#e0e7ff", textDark: "#e0e7ff",
    shadowStyle: "medium", radiusStyle: "rounded", spacingBase: 8,
    radius: R_ROUNDED, elevation: E_MEDIUM,
    fonts: { display: { name: "Space Grotesk", family: "'Space Grotesk', sans-serif", weights: [500, 700] }, body: FONT_INTER_BODY, mono: FONT_JETBRAINS },
    doRules: ["使用深黑星空背景", "星点/粒子装饰", "强调色用蓝紫"],
    dontRules: ["禁止浅色背景", "禁止高饱和暖色", "禁止锐利直角"],
    writingTone: ["vast", "mysterious", "inspiring"],
    qualityGates: ["深黑背景 ≥ #050714", "星点装饰", "圆角 ≥ 12px"],
    recommendedReactBits: ["Starfield", "ParticleGalaxy", "CosmicText"],
  }),

  immersive: makePreset({
    slug: "immersive", name: "Immersive", category: "immersive",
    description: "沉浸式全屏、Runway 风、电影感、大图大字",
    inspiration: "Runway",
    hue: 280, sat: 50, light: 40,
    bgLight: "#0f0a1e", bgDark: "#050310", textLight: "#f5f0ff", textDark: "#f5f0ff",
    shadowStyle: "medium", radiusStyle: "rounded", spacingBase: 8,
    radius: R_ROUNDED, elevation: E_MEDIUM,
    fonts: { display: { name: "Space Grotesk", family: "'Space Grotesk', sans-serif", weights: [400, 500, 700] }, body: FONT_INTER_BODY, mono: FONT_JETBRAINS },
    doRules: ["全屏沉浸式背景", "大字号标题", "电影感留白"],
    dontRules: ["禁止信息密集", "禁止小圆角", "禁止低对比度"],
    writingTone: ["cinematic", "immersive", "dramatic"],
    qualityGates: ["全屏背景", "标题 ≥ 48px", "留白 ≥ 30%"],
    recommendedReactBits: ["FullBleedVideo", "CinematicText", "ParallaxScroll"],
  }),

  retro: makePreset({
    slug: "retro", name: "Retro", category: "retro",
    description: "复古印刷风、80s 配色、复古字体、像素感",
    inspiration: "复古印刷",
    hue: 20, sat: 70, light: 50,
    bgLight: "#fef3c7", bgDark: "#1c1917", textLight: "#7c2d12", textDark: "#fde68a",
    shadowStyle: "sharp", radiusStyle: "none", spacingBase: 4,
    radius: R_SHARP, elevation: E_SHARP,
    fonts: { display: { name: "Bebas Neue", family: "'Bebas Neue', sans-serif", weights: [400] }, body: { name: "IBM Plex Mono", family: "'IBM Plex Mono', monospace", weights: [400, 500] }, mono: { name: "IBM Plex Mono", family: "'IBM Plex Mono', monospace", weights: [400, 500] } },
    doRules: ["使用复古暖色调", "等宽/复古字体", "硬边框无圆角"],
    dontRules: ["禁止现代无衬线", "禁止大圆角", "禁止柔和渐变"],
    writingTone: ["nostalgic", "warm", "playful"],
    qualityGates: ["复古色相", "等宽/复古字体", "圆角 = 0"],
    recommendedReactBits: ["RetroCard", "PixelText", "ScanlineEffect"],
  }),

  vintage: makePreset({
    slug: "vintage", name: "Vintage", category: "retro",
    description: "90 年代网页、Dell(1996) 风、Helvetica + Times、GIF 贴纸",
    inspiration: "Dell(1996)",
    hue: 0, sat: 0, light: 100,
    bgLight: "#c0c0c0", bgDark: "#000000", textLight: "#000000", textDark: "#c0c0c0",
    shadowStyle: "sharp", radiusStyle: "none", spacingBase: 4,
    radius: R_SHARP, elevation: E_SHARP,
    fonts: { display: { name: "Arial Black", family: "'Arial Black', sans-serif", weights: [400] }, body: { name: "Times New Roman", family: "'Times New Roman', serif", weights: [400] }, mono: { name: "Courier New", family: "'Courier New', monospace", weights: [400] } },
    doRules: ["使用系统字体", "灰色背景 + 黑色边框", "表格布局"],
    dontRules: ["禁止现代圆角", "禁止渐变", "禁止大留白"],
    writingTone: ["period-accurate", "functional", "catalog"],
    qualityGates: ["系统字体", "灰色背景", "表格布局"],
    recommendedReactBits: ["GifSticker", "MarqueeText", "BeveledButton"],
  }),

  spacious: makePreset({
    slug: "spacious", name: "Spacious", category: "editorial",
    description: "宽敞留白、Linear 风、极简、大行距",
    inspiration: "Linear",
    hue: 250, sat: 30, light: 55,
    bgLight: "#ffffff", bgDark: "#0a0a0a", textLight: "#0a0a0a", textDark: "#fafafa",
    shadowStyle: "subtle", radiusStyle: "rounded", spacingBase: 8,
    radius: R_ROUNDED, elevation: E_SUBTLE,
    fonts: { display: { name: "Inter", family: "Inter, system-ui, sans-serif", weights: [500, 600, 700] }, body: FONT_INTER_BODY, mono: FONT_JETBRAINS },
    doRules: ["大量留白，元素间距 ≥ 32px", "行高 1.7+", "极简色板"],
    dontRules: ["禁止信息密集", "禁止高饱和色", "禁止装饰性元素"],
    writingTone: ["calm", "spacious", "premium"],
    qualityGates: ["留白 ≥ 30%", "行高 ≥ 1.6", "色板 ≤ 4 色"],
    recommendedReactBits: ["FadeInUp", "ScrollReveal", "MinimalCard"],
  }),

  storytelling: makePreset({
    slug: "storytelling", name: "Storytelling", category: "editorial",
    description: "叙事滚动、The Verge 风、图文交替、滚动驱动动画",
    inspiration: "The Verge",
    hue: 160, sat: 40, light: 50,
    bgLight: "#fafaf7", bgDark: "#0a0f0d", textLight: "#0a0f0d", textDark: "#e7f0e2",
    shadowStyle: "subtle", radiusStyle: "subtle", spacingBase: 8,
    radius: R_MINIMAL, elevation: E_SUBTLE,
    fonts: { display: { name: "Manuka", family: "Georgia, serif", weights: [400, 700] }, body: { name: "Source Serif", family: "'Source Serif', Georgia, serif", weights: [400, 600] }, mono: FONT_JETBRAINS },
    doRules: ["使用滚动驱动叙事", "图文交替段落", "长文阅读优化"],
    dontRules: ["禁止短促段落", "禁止高饱和色", "禁止大圆角卡片"],
    writingTone: ["narrative", "engaging", "editorial"],
    qualityGates: ["滚动动画 ≥ 3 处", "图文交替", "段落 ≥ 3 行"],
    recommendedReactBits: ["ScrollNarrative", "ParallaxImage", "TextReveal"],
  }),
};

// ===== 迁移函数（零破坏）=====

/**
 * 获取当前生效的风格预设。优先返回 V2 完整数据，回退到 LEGACY。
 * 对外接口不变，applyStyleTokenSet 内部改读此函数。
 */
export function getActiveStylePreset(slug: string): StylePreset {
  const v2 = STYLE_PRESETS_V2[slug];
  if (v2) return v2;
  const legacy = STYLE_PRESETS[slug];
  if (legacy) return legacy;
  // 最终回退到 minimal
  return STYLE_PRESETS_V2.minimal || STYLE_PRESETS.minimal;
}

/** 列出所有可用风格 slug（V2 优先，合并 LEGACY） */
export function listAllStyleSlugs(): string[] {
  const slugs = new Set<string>(Object.keys(STYLE_PRESETS_V2));
  Object.keys(STYLE_PRESETS).forEach((s) => slugs.add(s));
  return Array.from(slugs).sort();
}

/** V2 风格数量 */
export const V2_STYLE_COUNT = Object.keys(STYLE_PRESETS_V2).length;

/** 检查 slug 是否为 V2（完整数据化）风格 */
export function isV2Style(slug: string): boolean {
  return slug in STYLE_PRESETS_V2;
}
