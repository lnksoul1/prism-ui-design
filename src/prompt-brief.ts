/**
 * 设计 → 提示词简报: 把 DesignState 编译成给 AI 编码工具（Cursor / Copilot / Claude 等）
 * 的自然语言实现简报。与 JSX 导出（code-sync）互补：JSX 是精确代码，本简报是结构化描述，
 * 让生成的代码保持布局意图（层级 / 相对位置 / 分组 / 交互行为）。
 *
 * 纯函数 + 确定性：同一输入永远得到同一字符串（无时间戳、无随机 id）。
 */
import type { ComponentLayout, ComponentNode, DesignState, DesignTokens, PageDef } from "./state.js";

export interface PromptBriefOptions {
  /** 目标技术栈（默认 react）。 */
  stack?: "react" | "html";
  /** 只输出这些页面（page id 列表；缺省输出全部页面）。 */
  pages?: string[];
}

const STACK_LINES: Record<"react" | "html", string> = {
  react: "目标技术栈：React 19 + TypeScript。请依据本简报实现完整可交互的应用。",
  html: "目标技术栈：原生 HTML + CSS + JavaScript。请依据本简报实现完整可交互的应用。",
};

/** 文本类 props → 中文标签（按此顺序输出，保证确定性）。 */
const TEXT_PROP_LABELS: Array<[string, string]> = [
  ["title", "标题"],
  ["heading", "标题"],
  ["subtitle", "副标题"],
  ["brand", "品牌"],
  ["button_text", "文案"],
  ["cta_text", "文案"],
  ["text", "文案"],
  ["label", "标签"],
  ["description", "描述"],
  ["placeholder", "占位"],
];

/** baseStyle 中值得写进简报的关键样式（按此顺序输出）。 */
const STYLE_LABELS: Array<[string, string]> = [
  ["fontSize", "字号"],
  ["fontWeight", "字重"],
  ["color", "颜色"],
  ["background", "背景"],
  ["borderRadius", "圆角"],
  ["textAlign", "对齐"],
];

const TOKEN_LIMIT_PER_CATEGORY = 8;
const TEXT_MAX_LEN = 80;

function clipText(value: string): string {
  return value.length > TEXT_MAX_LEN ? `${value.slice(0, TEXT_MAX_LEN - 1)}…` : value;
}

/** 收集组件的文本 props → 「标签「值」」片段（确定性顺序）。 */
function textPartsOf(node: ComponentNode): string {
  const parts: string[] = [];
  for (const [key, label] of TEXT_PROP_LABELS) {
    const v = node.props?.[key];
    if (typeof v === "string" && v.trim()) parts.push(`${label}「${clipText(v.trim())}」`);
  }
  return parts.join("");
}

/** 组件的第一个文本 prop 原始值（供行为/导航描述引用文案）。 */
function firstTextOf(node: ComponentNode): string {
  for (const [key] of TEXT_PROP_LABELS) {
    const v = node.props?.[key];
    if (typeof v === "string" && v.trim()) return clipText(v.trim());
  }
  return "";
}

/** baseStyle 关键样式 → 「样式：字号 18px、颜色 #111」；无关键样式返回空串。 */
function stylePartOf(node: ComponentNode): string {
  const parts: string[] = [];
  for (const [key, label] of STYLE_LABELS) {
    const v = node.baseStyle?.[key];
    if (typeof v === "string" && v.trim()) parts.push(`${label} ${v.trim()}`);
  }
  return parts.length ? `样式：${parts.join("、")}` : "";
}

/** 页面内容包围盒（无任何 layout 时用桌面默认尺寸），供位置定性描述参照。 */
function pageBounds(page: PageDef): { w: number; h: number } {
  let w = 0;
  let h = 0;
  const visit = (nodes: ComponentNode[]): void => {
    for (const n of nodes) {
      if (n.layout) {
        w = Math.max(w, n.layout.x + n.layout.w);
        h = Math.max(h, n.layout.y + n.layout.h);
      }
      visit(n.children || []);
    }
  };
  visit(page.components || []);
  return { w: w > 0 ? w : 1280, h: h > 0 ? h : 800 };
}

/** 由 layout 相对页面尺寸做定性位置描述。 */
function describePlacement(l: ComponentLayout, pw: number, ph: number): string {
  if (l.w >= 0.9 * pw) {
    if (l.y <= 0.2 * ph) return "顶部通栏";
    if (l.y + l.h >= 0.8 * ph) return "底部通栏";
    return "通栏";
  }
  const centeredOffset = Math.abs((pw - l.w) / 2 - l.x);
  if (centeredOffset <= 0.1 * pw) return "居中";
  if (l.x <= 0.2 * pw) return "靠左";
  if (l.x + l.w >= 0.8 * pw) return "靠右";
  return "常规流式";
}

function findComponentInPages(pages: PageDef[], id: string): ComponentNode | null {
  const search = (nodes: ComponentNode[]): ComponentNode | null => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const found = search(n.children || []);
      if (found) return found;
    }
    return null;
  };
  for (const p of pages) {
    const found = search(p.components || []);
    if (found) return found;
  }
  return null;
}

/** 行为模型 → 自然语言描述（navigate/toast/toggle/link/submit/prompt）。 */
function describeBehavior(node: ComponentNode, state: DesignState): string {
  const b = node.behavior;
  if (!b || typeof b.type !== "string") return "";
  const pageName = (id: unknown): string => {
    if (typeof id !== "string") return "";
    const p = state.pages.find((pg) => pg.id === id);
    return p ? p.name : "";
  };
  switch (b.type) {
    case "navigate": {
      const name = pageName(b.page_id);
      return name ? `点击跳转到页面「${name}」` : "点击跳转到另一个页面";
    }
    case "toast":
      return typeof b.message === "string" && b.message
        ? `点击弹出提示「${clipText(b.message)}」`
        : "点击弹出提示";
    case "toggle": {
      const target =
        typeof b.target_component_id === "string"
          ? findComponentInPages(state.pages, b.target_component_id)
          : null;
      const desc = target ? firstTextOf(target) || target.type : "";
      return desc ? `点击切换显示元素「${desc}」` : "点击切换另一个元素的显隐";
    }
    case "link":
      return typeof b.url === "string" && b.url ? `点击打开链接 ${b.url}` : "点击打开外链";
    case "submit":
      return typeof b.form_id === "string" && b.form_id ? `提交表单「${b.form_id}」` : "模拟提交表单";
    case "prompt":
      return typeof b.prompt === "string" && b.prompt ? `触发指令「${clipText(b.prompt)}」` : "触发内置指令";
    default:
      return "";
  }
}

/** 令牌 key → 中文标签（只做前缀映射，未知键保留原名，保证确定性）。 */
function tokenLabel(category: keyof DesignTokens, key: string): string {
  if (category === "colors") {
    const known: Record<string, string> = {
      "color-primary": "主色",
      "color-bg": "背景色",
      "color-text": "文字色",
      "color-accent": "强调色",
    };
    if (known[key]) return known[key];
    if (key.startsWith("color-")) return `${key.slice(6)}色`;
    return key;
  }
  if (category === "typography") {
    if (key.startsWith("font-")) {
      const rest = key.slice(5);
      if (rest === "body") return "正文字体";
      if (rest === "heading") return "标题字体";
      return `${rest}字体`;
    }
    return key;
  }
  if (category === "radii") {
    if (key === "radius-sm") return "小圆角";
    if (key === "radius-lg") return "大圆角";
    if (key.startsWith("radius-")) return "圆角";
    return key;
  }
  if (category === "spacing") {
    if (key.startsWith("space-")) return `间距 ${key.slice(6)}`;
    if (key.startsWith("spacing-")) return `间距 ${key.slice(8)}`;
    return key;
  }
  if (category === "shadows" && key.startsWith("shadow-")) return `阴影 ${key.slice(7)}`;
  if (category === "transitions" && key.startsWith("transition-")) return `过渡 ${key.slice(11)}`;
  return key;
}

function tokenLines(state: DesignState): string[] {
  const lines: string[] = [`- 风格：${state.style || "minimal"}`];
  const categories: Array<keyof DesignTokens> = ["colors", "typography", "radii", "spacing", "shadows", "transitions"];
  for (const cat of categories) {
    const entries = Object.entries(state.tokens?.[cat] || {}).slice(0, TOKEN_LIMIT_PER_CATEGORY);
    for (const [key, token] of entries) {
      if (token && typeof token.value === "string" && token.value) {
        lines.push(`- ${tokenLabel(cat, key)} ${token.value}`);
      }
    }
  }
  return lines;
}

function componentLine(node: ComponentNode, state: DesignState, pw: number, ph: number): string {
  const typeLabel =
    `${node.type}${node.variant ? `（${node.variant}）` : ""}${node.visible === false ? "（默认隐藏）" : ""}`;
  const place = node.layout
    ? `${describePlacement(node.layout, pw, ph)}（约 ${Math.round(node.layout.w)}×${Math.round(node.layout.h)}）`
    : "按内容流式排列";
  const parts = [textPartsOf(node), describeBehavior(node, state), stylePartOf(node)].filter((s) => s !== "");
  return parts.length ? `${typeLabel}，${place}：${parts.join("；")}` : `${typeLabel}，${place}`;
}

function pageSection(page: PageDef, state: DesignState): string[] {
  const lines = [`## 页面：${page.name}`];
  if (!page.components || page.components.length === 0) {
    lines.push("（暂无组件）");
    return lines;
  }
  // R1 M2 修正记忆: 人工锁定的布局约束随简报输出（AI 修改本页时保持位置）
  if (page.constraints && page.constraints.length > 0) {
    lines.push("");
    lines.push("### 布局约束（人工锁定，AI 修改本页时保持这些区块的位置）");
    for (const c of page.constraints) {
      lines.push(
        `- ${c.component_type}：固定在 x=${c.layout.x}，y=${c.layout.y}，${c.layout.w}×${c.layout.h}`
      );
    }
  }
  const { w: pw, h: ph } = pageBounds(page);
  const walk = (nodes: ComponentNode[], depth: number): void => {
    for (const n of nodes) {
      lines.push(`${"  ".repeat(depth)}- ${componentLine(n, state, pw, ph)}`);
      walk(n.children || [], depth + 1);
    }
  };
  walk(page.components, 0);
  return lines;
}

/** 页面链接 → 「导航：页面A 的「按钮文案」→ 页面B（转场：fade）」。 */
function navigationSection(state: DesignState, includedPageIds: Set<string> | null): string[] {
  const links = (state.pageLinks || []).filter((l) => {
    if (!l || typeof l.from_page_id !== "string" || typeof l.to_page_id !== "string") return false;
    if (includedPageIds && (!includedPageIds.has(l.from_page_id) || !includedPageIds.has(l.to_page_id))) return false;
    return state.pages.some((p) => p.id === l.from_page_id) && state.pages.some((p) => p.id === l.to_page_id);
  });
  if (links.length === 0) return [];
  const lines = ["## 页面导航"];
  for (const l of links) {
    const from = state.pages.find((p) => p.id === l.from_page_id)!;
    const to = state.pages.find((p) => p.id === l.to_page_id)!;
    const source = l.source_component_id ? findComponentInPages(state.pages, l.source_component_id) : null;
    const trigger = (source && firstTextOf(source)) || l.label || "入口";
    const transition = l.transition || "fade";
    lines.push(`- 导航：${from.name} 的「${trigger}」→ ${to.name}（转场：${transition}）`);
  }
  return lines;
}

/**
 * 编译设计状态 → 提示词简报（中文、markdown 风格纯文本、确定性输出）。
 */
export function compilePromptBrief(state: DesignState, opts?: PromptBriefOptions): string {
  const stack = opts?.stack === "html" ? "html" : "react";
  const pages = Array.isArray(state.pages) ? state.pages : [];
  const included = Array.isArray(opts?.pages) && opts.pages.length > 0 ? pages.filter((p) => opts!.pages!.includes(p.id)) : pages;
  const includedIds = Array.isArray(opts?.pages) && opts.pages.length > 0 ? new Set(included.map((p) => p.id)) : null;

  const lines: string[] = [];
  lines.push(`# ${state.projectName || "未命名项目"} 设计简报`);
  lines.push("");
  lines.push(STACK_LINES[stack]);
  lines.push("");
  lines.push("## 设计令牌");
  lines.push(...tokenLines(state));
  lines.push("");
  for (const page of included) {
    lines.push(...pageSection(page, state));
    lines.push("");
  }
  const nav = navigationSection(state, includedIds);
  if (nav.length) {
    lines.push(...nav);
    lines.push("");
  }
  lines.push("## 实现要求");
  lines.push("- 响应式：布局需适配桌面与移动端宽度，保持上述层级与相对位置");
  lines.push("- 文案：所有文案原样保留，不要改写或翻译");
  lines.push("- 交互：交互行为按上述描述实现（跳转 / 弹提示 / 切换显隐 / 打开链接）");
  return lines.join("\n");
}

/**
 * R1 M2 修正记忆: 单页简报——作为 AI 修正记忆的 few-shot 上下文注入生成
 * 系统提示词（约束行由 pageSection 输出）。页面不存在返回空串。
 */
export function compilePageBrief(state: DesignState, pageId: string): string {
  const page = (Array.isArray(state.pages) ? state.pages : []).find((p) => p.id === pageId);
  if (!page) return "";
  return pageSection(page, state).join("\n");
}
