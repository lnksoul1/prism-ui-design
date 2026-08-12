/**
 * Built-in prompt executor (指令引擎).
 *
 * Makes the dashboard react to common natural-language instructions even
 * when no external AI agent is attached: color/theme/style changes, page
 * templates, adding components, undo, and clear are executed directly
 * against the state store. Unmatched prompts stay queued for an external
 * agent via `design_check_prompts`.
 */

import { stateStore } from "./state.js";
import { applyStyleTokenSet } from "./tokens.js";
import { applyPageTemplate } from "./tools/design-tools.js";

export interface PromptExecutionResult {
  executed: boolean;
  summary: string;
  action?: string;
}

const COLOR_NAMES: Record<string, string> = {
  红: "#EF4444",
  red: "#EF4444",
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
  黑: "#0F172A",
  black: "#0F172A",
  白: "#FFFFFF",
  white: "#FFFFFF",
};

const STYLE_NAMES: Record<string, string> = {
  minimal: "minimal",
  简约: "minimal",
  bold: "bold",
  大胆: "bold",
  playful: "playful",
  活泼: "playful",
  editorial: "editorial",
  编辑: "editorial",
  tech: "tech",
  科技: "tech",
  glassmorphism: "glassmorphism",
  玻璃: "glassmorphism",
  neumorphism: "neumorphism",
  拟物: "neumorphism",
  claymorphism: "claymorphism",
  黏土: "claymorphism",
  aurora: "aurora",
  极光: "aurora",
  brutalism: "brutalism",
  粗野: "brutalism",
  cyberpunk: "cyberpunk",
  赛博: "cyberpunk",
  organic: "organic",
  有机: "organic",
  luxury: "luxury",
  奢华: "luxury",
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
  sidebar: "sidebar",
  侧边栏: "sidebar",
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

/**
 * Attempt to execute a user instruction locally. Returns executed=false when
 * the instruction should be handed to an external agent instead.
 */
export function executeUserPrompt(prompt: string): PromptExecutionResult {
  const text = prompt.trim();
  if (!text) return { executed: false, summary: "" };
  const lower = text.toLowerCase();
  const state = stateStore.getState();

  // 1) Color change (primary / background)
  if (hasAny(lower, ["主色", "primary", "主题色", "颜色", "背景色", "background"])) {
    const color = findColor(lower);
    if (color) {
      if (hasAny(lower, ["背景", "background"])) {
        stateStore.setToken("colors", "color-bg", color, "user");
        return { executed: true, summary: `背景色已改为 ${color}`, action: "set_bg_color" };
      }
      stateStore.setToken("colors", "color-primary", color, "user");
      return { executed: true, summary: `主色已改为 ${color}`, action: "set_primary_color" };
    }
  }

  // 2) Theme mode
  if (hasAny(lower, ["深色模式", "暗色", "深色", "dark mode", "dark theme", "dark"])) {
    stateStore.setThemeMode("dark", "user");
    return { executed: true, summary: "已切换为深色模式", action: "set_dark_theme" };
  }
  if (hasAny(lower, ["浅色模式", "亮色", "浅色", "light mode", "light theme", "light"])) {
    stateStore.setThemeMode("light", "user");
    return { executed: true, summary: "已切换为浅色模式", action: "set_light_theme" };
  }

  // 3) Style preset
  if (hasAny(lower, ["风格", "style"])) {
    const style = findFirst(lower, STYLE_NAMES);
    if (style) {
      const primary = state.tokens.colors["color-primary"]?.value;
      applyStyleTokenSet(stateStore, style, primary || "#7C3AED", "user");
      return { executed: true, summary: `已应用 ${style} 风格`, action: "apply_style" };
    }
  }

  // 4) Page template
  if (hasAny(lower, ["模板", "template", "生成一个", "生成页面"])) {
    const template = findFirst(lower, TEMPLATE_NAMES);
    if (template) {
      if (state.components.length > 0) {
        return {
          executed: false,
          summary: "当前页面已有内容，请先清空后再套用模板",
        };
      }
      const ids = applyPageTemplate(template);
      return {
        executed: true,
        summary: `已生成 ${template} 模板（${ids.length} 个组件）`,
        action: "apply_template",
      };
    }
  }

  // 5) Add a component
  if (hasAny(lower, ["添加", "增加", "加一个", "加个", "插入", "加上", "创建一个", "create a"])) {
    const type = findFirst(lower, COMPONENT_NAMES);
    if (type) {
      const node = stateStore.addComponent(type, undefined, {}, null, "user");
      return { executed: true, summary: `已添加 ${type} 组件`, action: "add_component" };
    }
  }

  // 6) Undo
  if (hasAny(lower, ["撤销", "undo", "回退", "上一步"])) {
    if (stateStore.undo()) {
      return { executed: true, summary: "已撤销上一步操作", action: "undo" };
    }
    return { executed: false, summary: "没有可撤销的操作" };
  }

  // 7) Clear
  if (hasAny(lower, ["清空", "清除全部", "清空设计", "clear all", "clear the design"])) {
    stateStore.clearAll("user");
    return { executed: true, summary: "已清空设计", action: "clear_all" };
  }

  return { executed: false, summary: "" };
}
