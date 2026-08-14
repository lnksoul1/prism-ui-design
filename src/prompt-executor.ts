/**
 * Built-in prompt executor v2 (指令引擎).
 *
 * Makes the dashboard react to common natural-language instructions even
 * when no external AI agent is attached: color/theme/style changes, page
 * templates, adding components, undo, and clear are executed directly
 * against the state store. Unmatched prompts stay queued for an external
 * agent via `design_check_prompts`.
 *
 * v2 (non-professional focus) adds everyday vocabulary that people actually
 * use when they talk about UI without design training:
 *   - text edits ("把标题改成「…」")
 *   - relative sizing ("字太小了" / "间距更大一点")
 *   - brightness ("整体调亮一点")
 *   - radius ("改成直角" / "圆角大一点")
 *   - font swaps ("换成衬线字体")
 *   - contrast checks ("检查对比度")
 *   - non-destructive templates (applied on a new page instead of erroring)
 *   - redo ("重做")
 * and, when nothing matches, returns concrete example instructions so the
 * user is never left with a dead-end queue.
 */

import { stateStore, type ComponentNode, type DesignState } from "./state.js";
import { applyStyleTokenSet } from "./tokens.js";
import { applyPageTemplate } from "./tools/design-tools.js";
import { applyStyleGuide, matchStyleGuide } from "./style-guides.js";
import { FONT_PAIRINGS } from "./constants.js";
import { adjustLightness, hexToHsl, hslToHex } from "./utils/color.js";

export interface PromptExecutionResult {
  executed: boolean;
  summary: string;
  action?: string;
  /** Example instructions shown when the prompt could not be understood. */
  suggestions?: string[];
}

const COLOR_NAMES: Record<string, string> = {
  红: "#EF4444",
  red: "#EF4444",
  深蓝: "#1E3A8A",
  "deep blue": "#1E3A8A",
  蓝: "#3B82F6",
  blue: "#3B82F6",
  紫: "#7C3AED",
  violet: "#7C3AED",
  purple: "#7C3AED",
  绿: "#22C55E",
  green: "#22C55E",
  青: "#06B6D4",
  cyan: "#06B6D4",
  橙: "#F97316",
  orange: "#F97316",
  粉: "#EC4899",
  pink: "#EC4899",
  黄: "#EAB308",
  yellow: "#EAB308",
  金: "#D4A017",
  gold: "#D4A017",
  黑: "#0F172A",
  black: "#0F172A",
  深灰: "#374151",
  "dark gray": "#374151",
  浅灰: "#F3F4F6",
  "light gray": "#F3F4F6",
  灰: "#9CA3AF",
  gray: "#9CA3AF",
  grey: "#9CA3AF",
  白: "#FFFFFF",
  white: "#FFFFFF",
  米: "#FAF7F2",
  beige: "#FAF7F2",
};

const COMPONENT_NAMES: Record<string, string> = {
  hero: "hero",
  首屏: "hero",
  横幅: "banner",
  banner: "banner",
  navbar: "navbar",
  导航: "navbar",
  card: "card",
  卡片: "card",
  button: "button",
  按钮: "button",
  form: "form",
  表单: "form",
  footer: "footer",
  页脚: "footer",
  pricing: "pricing",
  定价: "pricing",
  价格: "pricing",
  stats: "stats",
  统计: "stats",
  image: "image",
  图片: "image",
  feature: "feature_list",
  功能: "feature_list",
  carousel: "carousel",
  轮播: "carousel",
  timeline: "timeline",
  时间线: "timeline",
  faq: "faq",
  问答: "faq",
  sidebar: "sidebar",
  侧边栏: "sidebar",
  table: "table",
  表格: "table",
};

const TEMPLATE_NAMES: Record<string, string> = {
  saas: "saas_landing",
  落地页: "saas_landing",
  ecommerce: "ecommerce_home",
  电商: "ecommerce_home",
  blog: "blog_post",
  博客: "blog_post",
  portfolio: "portfolio",
  作品集: "portfolio",
  dashboard: "dashboard",
  看板: "dashboard",
};

const TEMPLATE_LABELS: Record<string, string> = {
  saas_landing: "SaaS 落地页",
  ecommerce_home: "电商首页",
  blog_post: "博客文章",
  portfolio: "作品集",
  dashboard: "数据看板",
};

function isChinese(text: string): boolean {
  return /[\u4e00-\u9fa5]/.test(text);
}

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

function findHex(text: string): string | null {
  const m = text.match(/#([0-9a-f]{6})/i);
  return m ? `#${m[1].toUpperCase()}` : null;
}

function findColor(text: string): string | null {
  const hex = findHex(text);
  if (hex) return hex;
  for (const [name, color] of Object.entries(COLOR_NAMES)) {
    if (text.includes(name.toLowerCase())) return color;
  }
  return null;
}

function findFirst(text: string, map: Record<string, string>): string | null {
  const lower = text.toLowerCase();
  for (const [name, value] of Object.entries(map)) {
    if (lower.includes(name.toLowerCase())) return value;
  }
  return null;
}

/** Extract the first number following any of the given keywords (e.g. "圆角 8"). */
function extractSize(text: string, keywords: string[]): number | null {
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    const idx = lower.indexOf(kw.toLowerCase());
    if (idx === -1) continue;
    const tail = text.slice(idx + kw.length);
    const m = tail.match(/(\d+(?:\.\d+)?)/);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

/** All components of the given type in the current page (including nested). */
function findComponentTargets(state: DesignState, type: string): ComponentNode[] {
  const out: ComponentNode[] = [];
  const walk = (list: ComponentNode[]): void => {
    for (const c of list) {
      if (c.type === type) out.push(c);
      if (c.children && c.children.length > 0) walk(c.children);
    }
  };
  walk(state.components);
  return out;
}

/** Every component on the current page (including nested). */
function findAllComponents(state: DesignState): ComponentNode[] {
  const out: ComponentNode[] = [];
  const walk = (list: ComponentNode[]): void => {
    for (const c of list) {
      out.push(c);
      if (c.children && c.children.length > 0) walk(c.children);
    }
  };
  walk(state.components);
  return out;
}

const STYLE_PROP_LABELS: Record<string, string> = {
  color: "文字颜色",
  bg: "背景色",
  radius: "圆角",
  fontSize: "字号",
  spacing: "间距",
};

// ===== Token scaling helpers =====

function remValue(value: string | undefined): number | null {
  if (!value) return null;
  const m = String(value).match(/^([\d.]+)rem$/);
  return m ? parseFloat(m[1]) : null;
}

function pxValue(value: string | undefined): number | null {
  if (!value) return null;
  const m = String(value).match(/^([\d.]+)px$/);
  return m ? parseFloat(m[1]) : null;
}

/** Multiply every `text-*` token by a factor (clamped to a readable range). */
function scaleTypeTokens(factor: number): void {
  const typography = stateStore.getState().tokens.typography;
  for (const [key, entry] of Object.entries(typography)) {
    if (!key.startsWith("text-")) continue;
    const base = remValue(entry.value);
    if (base === null) continue;
    const next = Math.min(4, Math.max(0.625, base * factor));
    stateStore.setToken("typography", key, `${next.toFixed(3)}rem`, "user");
  }
}

/** Multiply every `space-*` token by a factor. */
function scaleSpacingTokens(factor: number): void {
  const spacing = stateStore.getState().tokens.spacing;
  for (const [key, entry] of Object.entries(spacing)) {
    if (!key.startsWith("space-")) continue;
    const base = remValue(entry.value);
    if (base === null) continue;
    const next = Math.min(6, Math.max(0.125, base * factor));
    stateStore.setToken("spacing", key, `${next.toFixed(3)}rem`, "user");
  }
}

/** Multiply every `radius-*` token by a factor (clamped 0–64px). */
function scaleRadiusTokens(factor: number): void {
  const radii = stateStore.getState().tokens.radii;
  for (const [key, entry] of Object.entries(radii)) {
    if (!key.startsWith("radius-") || key === "radius-full") continue;
    const base = pxValue(entry.value);
    if (base === null) continue;
    const next = Math.min(64, Math.max(0, Math.round(base * factor)));
    stateStore.setToken("radii", key, `${next}px`, "user");
  }
}

/** Shift the page background (and surface) lighter or darker. */
function adjustPageBrightness(delta: number): void {
  const tokens = stateStore.getState().tokens.colors;
  const bg = tokens["color-bg"]?.value;
  if (bg && /^#[0-9A-Fa-f]{6}$/.test(bg)) {
    stateStore.setToken("colors", "color-bg", hslToHex(adjustLightness(hexToHsl(bg), delta)), "user");
  }
  const surface = tokens["color-surface"]?.value;
  if (surface && /^#[0-9A-Fa-f]{6}$/.test(surface)) {
    stateStore.setToken("colors", "color-surface", hslToHex(adjustLightness(hexToHsl(surface), delta)), "user");
  }
}

/** Switch the display/body font pairing (mood filter or next-in-cycle). */
function switchFontPairing(mood?: "serif" | "sans" | null): { changed: boolean; label: string } {
  const typography = stateStore.getState().tokens.typography;
  const currentDisplay = typography["font-display"]?.value;
  let pool = FONT_PAIRINGS;
  if (mood) {
    const filtered = FONT_PAIRINGS.filter((p) =>
      mood === "serif" ? p.display.category === "serif" : p.display.category === "sans-serif"
    );
    if (filtered.length > 0) pool = filtered;
  }
  let index = pool.findIndex((p) => p.display.family === currentDisplay);
  index = (index + 1) % pool.length;
  const next = pool[index];
  stateStore.setToken("typography", "font-display", next.display.family, "user");
  stateStore.setToken("typography", "font-body", next.body.family, "user");
  return { changed: true, label: `${next.display.name} + ${next.body.name}` };
}

// ===== Text edit =====

const TITLE_KEYWORDS = ["标题", "headline", "title"];
const SUBTITLE_KEYWORDS = ["副标题", "subtitle", "subheading"];
const BODY_KEYWORDS = ["正文", "文字", "文案", "body", "copy"];
const TITLE_FIELDS = ["title", "headline", "heading"];
const SUBTITLE_FIELDS = ["subtitle", "subheading"];
const BODY_FIELDS = ["body", "text", "content", "description", "paragraph"];

interface TextEditTarget {
  text: string;
  fields: string[];
}

/** Parse "把标题改成「…」" style instructions. */
function parseTextEdit(text: string): TextEditTarget | null {
  const lt = text.toLowerCase();
  const fields: string[] = [];
  if (hasAny(lt, TITLE_KEYWORDS)) fields.push(...TITLE_FIELDS);
  if (hasAny(lt, SUBTITLE_KEYWORDS)) fields.push(...SUBTITLE_FIELDS);
  if (hasAny(lt, BODY_KEYWORDS)) fields.push(...BODY_FIELDS);
  if (fields.length === 0) return null;

  // Quoted or 「」 content wins.
  const quoted = text.match(/["'“”‘’]([^"'“”‘’]{1,120})["'“”‘’]/);
  if (quoted) return { text: quoted[1].trim(), fields };
  const bracketed = text.match(/[「『]([^」』]{1,120})[」』]/);
  if (bracketed) return { text: bracketed[1].trim(), fields };

  // "标题改成 X" — rest of the sentence after the change verb.
  const verbs = /(?:改成|换成|改为|变成|更新为|设为|设置为|change[\s\S]{0,30}?to|set\s*(?:it\s*)?to)\s*/i;
  const match = text.match(verbs);
  if (match && match.index !== undefined) {
    const rest = text
      .slice(match.index + match[0].length)
      .replace(/^[\s:：,，]+/, "")
      .replace(/[\s。！!？?，,]+$/g, "")
      .trim();
    if (rest && rest.length <= 120) return { text: rest, fields };
  }
  return null;
}

// ===== Fallback suggestions =====

function fallbackSuggestions(prompt: string): string[] {
  if (isChinese(prompt)) {
    return [
      "把主色改成蓝色",
      "把标题改成「我们的新产品来了」",
      "生成一个 SaaS 落地页模板",
      "添加一个定价表",
      "字太小了，大一点",
      "换成玻璃拟态风格",
      "整体调亮一点",
      "检查一下对比度",
    ];
  }
  return [
    "make the primary color blue",
    'change the title to "Our new product is here"',
    "generate a SaaS landing page template",
    "add a pricing table",
    "make the text bigger",
    "switch to the glassmorphism style",
    "brighten the page a bit",
    "check the contrast",
  ];
}

/**
 * Attempt to execute a user instruction locally. Returns executed=false when
 * the instruction should be handed to an external agent instead (with
 * concrete example instructions in `suggestions`).
 */
export function executeUserPrompt(prompt: string): PromptExecutionResult {
  const text = prompt.trim();
  if (!text) return { executed: false, summary: "" };
  const lower = text.toLowerCase();
  const state = stateStore.getState();

  // 1) Component-level styling: "把按钮改成蓝色圆角" targets the button's
  // props instead of the global primary color. Runs before the global color
  // rules so component mentions never leak into design tokens.
  const targetType = findFirst(lower, COMPONENT_NAMES);
  const hasGlobalHint = hasAny(lower, ["主色", "primary", "主题色", "全局"]);
  const color = findColor(lower);
  const background = hasAny(lower, ["背景", "background"]) ? findColor(lower) : null;
  const radius = extractSize(lower, ["圆角", "radius"]);
  const fontSize = extractSize(lower, ["字号", "字体大小", "font size", "font-size", "fontsize"]);
  const spacing = extractSize(lower, ["间距", "padding", "内边距", "spacing"]);
  const stylePatch: Record<string, unknown> = {};
  if (color) stylePatch.color = color;
  if (background) stylePatch.bg = background;
  if (radius !== null) stylePatch.radius = `${radius}px`;
  if (fontSize !== null) stylePatch.fontSize = `${fontSize}px`;
  if (spacing !== null) stylePatch.spacing = `${spacing}px`;

  if (targetType && !hasGlobalHint && Object.keys(stylePatch).length > 0) {
    const targets = findComponentTargets(state, targetType);
    if (targets.length === 0) {
      return { executed: false, summary: `当前页面没有「${targetType}」组件` };
    }
    targets.forEach((c) => stateStore.updateComponent(c.id, stylePatch, "user"));
    const parts = Object.keys(stylePatch)
      .map((k) => STYLE_PROP_LABELS[k] || k)
      .join("、");
    return {
      executed: true,
      summary: `已调整 ${targets.length} 个 ${targetType} 组件：${parts}`,
      action: "style_component",
    };
  }

  // 2) Text color ("把文字改成蓝色" / "文字颜色改成蓝色" → color-text token).
  // Quoted/bracketed content always wins as a literal text edit below.
  const hasQuotedText = /["'“”‘’]|[「『]/.test(text);
  const textColorRequest =
    hasAny(lower, ["文字颜色", "字体颜色", "字的颜色", "text color"]) ||
    (!hasQuotedText && /(文字|正文|文案|字体|copy)\s*(改成|换成|变成|设为|颜色)/.test(text));
  if (textColorRequest && color) {
    stateStore.setToken("colors", "color-text", color, "user");
    return { executed: true, summary: `文字颜色已改为 ${color}`, action: "set_text_color" };
  }

  // 3) Text edits: "把标题改成「…」" updates real copy, not design tokens.
  const textEdit = parseTextEdit(text);
  if (textEdit) {
    const candidates = targetType ? findComponentTargets(state, targetType) : findAllComponents(state);
    let updated = 0;
    for (const c of candidates) {
      const field = textEdit.fields.find((f) => f in (c.props || {}));
      if (!field) continue;
      stateStore.updateComponent(c.id, { [field]: textEdit.text }, "user");
      updated += 1;
    }
    if (updated > 0) {
      const label = hasAny(lower, TITLE_KEYWORDS) ? "标题" : hasAny(lower, SUBTITLE_KEYWORDS) ? "副标题" : "文字";
      return {
        executed: true,
        summary: `已更新 ${updated} 个组件的${label}为「${textEdit.text}」`,
        action: "edit_text",
      };
    }
    return { executed: false, summary: "当前页面没有可修改的文字字段" };
  }

  // 4) Global color change (primary / background)
  if (hasAny(lower, ["主色", "primary", "主题色", "颜色", "背景色", "background"])) {
    const globalColor = findColor(lower);
    if (globalColor) {
      if (hasAny(lower, ["背景", "background"])) {
        stateStore.setToken("colors", "color-bg", globalColor, "user");
        return { executed: true, summary: `背景色已改为 ${globalColor}`, action: "set_bg_color" };
      }
      stateStore.setToken("colors", "color-primary", globalColor, "user");
      return { executed: true, summary: `主色已改为 ${globalColor}`, action: "set_primary_color" };
    }
  }

  // 5) Brightness ("整体调亮/调暗/页面太亮了")
  if (hasAny(lower, ["调亮", "调暗", "亮一点", "暗一点", "太亮", "太暗", "更亮", "更暗", "brighten", "darken", "brighter", "darker", "too bright", "too dark"])) {
    const wantLighter =
      hasAny(lower, ["调亮", "亮一点", "更亮", "太暗", "brighten", "brighter", "too dark"]) &&
      !hasAny(lower, ["调暗", "暗一点", "更暗", "太亮", "darken", "darker", "too bright"]);
    adjustPageBrightness(wantLighter ? 6 : -6);
    return {
      executed: true,
      summary: wantLighter ? "整体已调亮" : "整体已调暗",
      action: "brightness",
    };
  }

  // 6) Theme mode
  if (hasAny(lower, ["深色模式", "暗色", "深色", "dark mode", "dark theme", "dark"])) {
    stateStore.setThemeMode("dark", "user");
    return { executed: true, summary: "已切换为深色模式", action: "set_dark_theme" };
  }
  if (hasAny(lower, ["浅色模式", "亮色", "浅色", "light mode", "light theme", "light"])) {
    stateStore.setThemeMode("light", "user");
    return { executed: true, summary: "已切换为浅色模式", action: "set_light_theme" };
  }

  // 7) Design system (风格预设已移除；自然语言"应用 XX 设计系统/风格"走品牌设计系统)
  if (hasAny(lower, ["设计系统", "品牌风格", "风格", "style", "换肤", "换主题", "design system"])) {
    const system = matchStyleGuide(lower.trim());
    if (system) {
      applyStyleGuide(system.id);
      return { executed: true, summary: `已应用设计系统「${system.name}」`, action: "apply_style_guide" };
    }
  }

  // 8) Font pairing ("换个字体" / "换成衬线字体")
  if (hasAny(lower, ["换个字体", "换字体", "换一个字体", "换成字体", "衬线字体", "无衬线", "衬线", "serif", "sans-serif", "change font", "different font", "换标题字体"])) {
    let mood: "serif" | "sans" | null = null;
    if (hasAny(lower, ["衬线", "serif"])) mood = "serif";
    else if (hasAny(lower, ["无衬线", "sans"])) mood = "sans";
    const result = switchFontPairing(mood);
    return { executed: true, summary: `已更换字体：${result.label}`, action: "switch_font" };
  }

  // 9) Global radius without a named component ("圆角改成 16" / "改成直角" / "更圆一点")
  if (hasAny(lower, ["直角", "更圆", "圆角大", "圆角小", "圆润"])) {
    if (hasAny(lower, ["直角", "更方"])) {
      scaleRadiusTokens(0.4);
      return { executed: true, summary: "圆角已改为更方正的样式", action: "set_radius_sharp" };
    }
    scaleRadiusTokens(1.4);
    return { executed: true, summary: "圆角已调大", action: "set_radius_round" };
  }
  const globalRadius = extractSize(lower, ["圆角", "radius"]);
  if (globalRadius !== null && !targetType) {
    const current = pxValue(state.tokens.radii["radius-md"]?.value);
    const factor = current && current > 0 ? globalRadius / current : globalRadius / 12;
    scaleRadiusTokens(Math.max(0.25, Math.min(2.5, factor)));
    return { executed: true, summary: `圆角已调整为 ${globalRadius}px 左右`, action: "set_radius" };
  }

  // 10) Typography scale ("字太小了" / "字号大一点" / "字号改成 18")
  const isFontUp = hasAny(lower, ["字太小", "字号大", "字大一点", "字大些", "文字更大", "大一点的字", "bigger text", "font too small", "larger font", "increase font", "bump the font"]);
  const isFontDown = hasAny(lower, ["字太大", "字号小", "字小一点", "文字更小", "smaller text", "font too big", "smaller font", "decrease font"]);
  const absoluteFontSize = extractSize(lower, ["字号", "字体大小", "font size", "font-size", "fontsize"]);
  if (isFontUp || isFontDown || (absoluteFontSize !== null && !targetType)) {
    if (absoluteFontSize !== null) {
      const currentBase = remValue(state.tokens.typography["text-base"]?.value) || 1;
      const factor = Math.max(0.6, Math.min(2.2, absoluteFontSize / 16 / currentBase));
      scaleTypeTokens(factor);
      return { executed: true, summary: `字号已调整为 ${absoluteFontSize}px 左右`, action: "set_font_size" };
    }
    scaleTypeTokens(isFontUp ? 1.25 : 0.8);
    return { executed: true, summary: isFontUp ? "字号已调大" : "字号已调小", action: "set_font_size" };
  }

  // 11) Spacing scale ("间距更大一点" / "更紧凑" / "留白更多")
  const isSpaceUp = hasAny(lower, ["间距大", "间距更大", "留白多", "留白更多", "更宽松", "宽松一点", "space out", "more spacing", "more whitespace", "airier"]);
  const isSpaceDown = hasAny(lower, ["间距小", "间距更小", "更紧凑", "紧凑一点", "留白少", "tighter", "less spacing", "more compact"]);
  if (isSpaceUp || isSpaceDown) {
    scaleSpacingTokens(isSpaceUp ? 1.25 : 0.8);
    return { executed: true, summary: isSpaceUp ? "间距与留白已加大" : "间距已收紧", action: "set_spacing" };
  }

  // 12) Generic "bigger/smaller" → type + spacing together
  const genericUp = hasAny(lower, ["大一点", "更大", "放大一点", "bigger", "larger"]);
  const genericDown = hasAny(lower, ["小一点", "更小", "缩小一点", "smaller"]);
  if ((genericUp || genericDown) && !targetType) {
    const factor = genericUp ? 1.15 : 0.85;
    scaleTypeTokens(factor);
    scaleSpacingTokens(factor);
    return { executed: true, summary: genericUp ? "整体已调大" : "整体已调小", action: "scale_overall" };
  }

  // 13) Contrast report ("检查一下对比度")
  if (hasAny(lower, ["对比度", "contrast"])) {
    const conflicts = stateStore.getTokenConflicts();
    if (conflicts.length === 0) {
      return {
        executed: true,
        summary: "对比度检查通过：文字/背景与主色对比符合 WCAG AA 标准 ✓",
        action: "check_contrast",
      };
    }
    return {
      executed: true,
      summary: `发现 ${conflicts.length} 个对比度问题：${conflicts[0].message}`,
      action: "check_contrast",
    };
  }

  // 14) Page template — on a non-empty page, open a fresh page instead of
  // blocking the user with an error (templates are never destructive).
  if (hasAny(lower, ["模板", "template", "生成一个", "生成页面"])) {
    const template = findFirst(lower, TEMPLATE_NAMES);
    if (template) {
      if (state.components.length > 0) {
        const page = stateStore.addPage(TEMPLATE_LABELS[template] || template, "user");
        stateStore.switchPage(page.id, "user");
      }
      const ids = applyPageTemplate(template);
      return {
        executed: true,
        summary: `已生成 ${TEMPLATE_LABELS[template] || template} 模板（${ids.length} 个组件）`,
        action: "apply_template",
      };
    }
  }

  // 15) Add a component
  if (hasAny(lower, ["添加", "增加", "加一个", "加个", "插入", "加上", "创建一个", "生成一个", "做一个", "来一个", "弄一个", "create a", "add a", "make a"])) {
    const type = findFirst(lower, COMPONENT_NAMES);
    if (type) {
      const node = stateStore.addComponent(type, undefined, {}, null, "user");
      return { executed: true, summary: `已添加 ${type} 组件`, action: "add_component" };
    }
  }

  // 16) Undo / redo
  if (hasAny(lower, ["撤销", "undo", "回退", "上一步"])) {
    if (stateStore.undo()) {
      return { executed: true, summary: "已撤销上一步操作", action: "undo" };
    }
    return { executed: false, summary: "没有可撤销的操作" };
  }
  if (hasAny(lower, ["重做", "redo", "恢复上一步"])) {
    if (stateStore.redo()) {
      return { executed: true, summary: "已重做", action: "redo" };
    }
    return { executed: false, summary: "没有可重做的操作" };
  }

  // 17) Clear
  if (hasAny(lower, ["清空", "清除全部", "清空设计", "clear all", "clear the design"])) {
    stateStore.clearAll("user");
    return { executed: true, summary: "已清空设计", action: "clear_all" };
  }

  // 18) Fallback: still queue for the agent, but never leave the user with a
  // dead end — hand back example instructions they can try right now.
  return {
    executed: false,
    summary: "",
    suggestions: fallbackSuggestions(text),
  };
}
