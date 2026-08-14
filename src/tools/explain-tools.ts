/**
 * Plain-language design explanation (non-professional focus).
 *
 * `design_semantic_style` maps adjectives → tokens. This module does the
 * reverse: it reads the current tokens and explains the design the way a
 * friend would — what style it is, what color it is, what personality it
 * projects — and lists concrete instructions the user can say next. It
 * teaches design vocabulary by example instead of requiring it up front.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { stateStore } from "../state.js";
import { hexToHsl } from "../utils/color.js";

export interface ExplainSuggestion {
  phrase: string;
  effect: string;
}

export interface ExplainResult {
  style: string;
  style_label: string;
  theme: string;
  primary_color: string;
  color_name: string;
  personality: string[];
  summary: string;
  facts: string[];
  suggestions: ExplainSuggestion[];
  conflicts: string[];
}

const STYLE_LABELS: Record<string, string> = {
  minimal: "简约",
  bold: "大胆",
  playful: "活泼",
  dark: "深色",
  editorial: "编辑杂志风",
  tech: "科技",
  glassmorphism: "玻璃拟态",
  neumorphism: "新拟物",
  claymorphism: "黏土拟物",
  aurora: "极光",
  brutalism: "粗野主义",
  cyberpunk: "赛博朋克",
  organic: "有机自然",
  luxury: "奢华",
};

const STYLE_LABELS_EN: Record<string, string> = {
  minimal: "minimal",
  bold: "bold",
  playful: "playful",
  dark: "dark",
  editorial: "editorial",
  tech: "tech",
  glassmorphism: "glassmorphism",
  neumorphism: "neumorphism",
  claymorphism: "claymorphism",
  aurora: "aurora",
  brutalism: "brutalist",
  cyberpunk: "cyberpunk",
  organic: "organic",
  luxury: "luxury",
};

/** Name a color the way non-designers do: 深蓝 / 浅绿 / 灰调紫 … */
export function nameColor(hex: string | undefined): string {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return "未知";
  const { h, s, l } = hexToHsl(hex);
  let name: string;
  if (h < 15 || h >= 345) name = "红";
  else if (h < 45) name = "橙";
  else if (h < 70) name = "黄";
  else if (h < 165) name = "绿";
  else if (h < 200) name = "青";
  else if (h < 250) name = "蓝";
  else if (h < 285) name = "紫";
  else name = "粉";
  if (s < 15) return `灰调${name}`;
  if (l < 35) return `深${name}`;
  if (l > 82) return `浅${name}`;
  if (s > 75) return `鲜艳的${name}`;
  return name;
}

function fontCategory(family: string | undefined): "serif" | "sans" | "mono" {
  const f = (family || "").toLowerCase();
  if (f.includes("sans-serif")) return "sans";
  if (f.includes("serif")) return "serif";
  if (f.includes("mono")) return "mono";
  return "sans";
}

/** Heuristic reverse-mapping: tokens → personality adjectives. */
function derivePersonality(hex: string | undefined, radiusMd: number, fontCat: string, bgL: number): string[] {
  const out: string[] = [];
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return out;
  const { s, l } = hexToHsl(hex);
  if (s >= 60 && l <= 45) out.push("大胆");
  else if (s >= 55) out.push("活泼");
  else if (s <= 20) out.push(l >= 70 ? "简约" : "沉稳");
  else if (l <= 30) out.push("高级");
  if (radiusMd >= 20) out.push("圆润友好");
  else if (radiusMd <= 4) out.push("锐利精确");
  if (fontCat === "serif") out.push("优雅复古");
  else if (fontCat === "mono") out.push("未来科技");
  if (bgL < 30) out.push("深邃");
  else if (bgL > 90) out.push("明亮通透");
  return out.slice(0, 4);
}

/**
 * Explain the current design in plain language. Read-only — never mutates
 * the state store.
 */
export function explainDesign(lang: "zh" | "en" = "zh"): ExplainResult {
  const state = stateStore.getState();
  const tokens = state.tokens;
  const primary = tokens.colors["color-primary"]?.value;
  const bg = tokens.colors["color-bg"]?.value;
  const bgL = bg && /^#[0-9A-Fa-f]{6}$/.test(bg) ? hexToHsl(bg).l : 98;
  const radiusMd = parseFloat(String(tokens.radii["radius-md"]?.value || "8")) || 8;
  const fontCat = fontCategory(tokens.typography["font-display"]?.value);
  const styleLabel = STYLE_LABELS[state.style] || state.style;
  const colorName = nameColor(primary);
  const personality = derivePersonality(primary, radiusMd, fontCat, bgL);
  const conflicts = stateStore.getTokenConflicts().map((c) => c.message);

  const facts: string[] = [];
  const summaryParts: string[] = [];

  if (lang === "en") {
    const styleLabelEn = STYLE_LABELS_EN[state.style] || state.style;
    facts.push(`Style: ${styleLabelEn}`);
    facts.push(`Theme: ${state.themeMode === "dark" ? "dark" : "light"}`);
    facts.push(`Primary color: ${primary || "not set"} (${colorName})`);
    facts.push(
      `Type: ${tokens.typography["font-display"]?.value || "default"} headings, ${tokens.typography["font-body"]?.value || "default"} body`
    );
    facts.push(
      `${state.pages.length} page(s), ${state.components.length} component(s) on the current page`
    );
    summaryParts.push(
      `Your design uses the ${styleLabelEn} style with a ${colorName.toLowerCase()} primary color.`
    );
    if (personality.length > 0) {
      summaryParts.push(`It reads as ${personality.join(", ").toLowerCase()}.`);
    }
    summaryParts.push(
      state.themeMode === "dark"
        ? "It is a dark theme, which suits evening reading and high-contrast demos."
        : "It is a light theme, which suits daytime use and print."
    );
    if (conflicts.length > 0) {
      summaryParts.push(`Heads-up: ${conflicts.length} contrast issue(s) found.`);
    }
    return {
      style: state.style,
      style_label: styleLabelEn,
      theme: state.themeMode,
      primary_color: primary || "",
      color_name: colorName,
      personality,
      summary: summaryParts.join(" "),
      facts,
      suggestions: [
        { phrase: "make the primary color blue", effect: "Change the brand color" },
        { phrase: 'change the title to "Hello world"', effect: "Rewrite visible copy" },
        { phrase: "make the text bigger", effect: "Increase font size" },
        { phrase: "switch to the glassmorphism style", effect: "Try another style" },
        { phrase: "brighten the page a bit", effect: "Adjust overall lightness" },
        { phrase: "check the contrast", effect: "Run an accessibility check" },
        { phrase: "generate an e-commerce template", effect: "Build a page from a template" },
      ],
      conflicts,
    };
  }

  facts.push(`风格：${styleLabel}`);
  facts.push(`主题：${state.themeMode === "dark" ? "深色" : "浅色"}模式`);
  facts.push(`主色：${primary || "未设置"}（${colorName}）`);
  facts.push(
    `字体：标题 ${tokens.typography["font-display"]?.value || "默认"}，正文 ${tokens.typography["font-body"]?.value || "默认"}`
  );
  facts.push(`共 ${state.pages.length} 个页面，当前页 ${state.components.length} 个组件`);
  summaryParts.push(`你的设计是「${styleLabel}」风格，主色是${colorName}（${primary || ""}）。`);
  if (personality.length > 0) {
    summaryParts.push(`整体给人的感觉：${personality.join("、")}。`);
  }
  summaryParts.push(
    state.themeMode === "dark" ? "当前是深色模式，适合夜间浏览和高对比展示。" : "当前是浅色模式，适合白天浏览与打印。"
  );
  if (conflicts.length > 0) {
    summaryParts.push(`注意：发现 ${conflicts.length} 个对比度问题，可以输入「检查对比度」查看。`);
  }
  return {
    style: state.style,
    style_label: styleLabel,
    theme: state.themeMode,
    primary_color: primary || "",
    color_name: colorName,
    personality,
    summary: summaryParts.join(""),
    facts,
    suggestions: [
      { phrase: "把主色改成蓝色", effect: "换一个品牌色" },
      { phrase: "把标题改成「你好，世界」", effect: "直接修改页面文字" },
      { phrase: "字太小了，大一点", effect: "调大字号" },
      { phrase: "换成玻璃拟态风格", effect: "换一种整体风格" },
      { phrase: "整体调亮一点", effect: "调整明暗" },
      { phrase: "检查一下对比度", effect: "检查无障碍问题" },
      { phrase: "生成一个电商模板", effect: "从模板生成页面" },
    ],
    conflicts,
  };
}

export function registerExplainTool(server: McpServer): void {
  server.registerTool(
    "design_explain_design",
    {
      title: "Explain Design",
      description: `Explain the current design in plain language (read-only).

Reads the current tokens/components and describes the design the way a
non-designer would understand it: style, dominant color, personality
adjectives, fonts, theme, and any contrast conflicts. Also returns
"suggestions" — concrete natural-language instructions the user can say
next (they are understood by the built-in prompt engine or by you).

Use this when the user asks questions like "我的设计现在长什么样?" or
when you need to translate design jargon back to the user.

Args:
  - lang (string, optional): "zh" (default) or "en"`,
      inputSchema: {
        lang: z.enum(["zh", "en"]).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const result = explainDesign(params.lang || "zh");
      const suggestions = result.suggestions.map((s) => `- ${s.phrase}（${s.effect}）`).join("\n");
      return {
        content: [
          {
            type: "text" as const,
            text: `# 设计解读\n\n${result.summary}\n\n${result.facts.join("\n")}\n\n你可以这样说：\n${suggestions}`,
          },
        ],
        structuredContent: { success: true, ...result },
      };
    }
  );
}
