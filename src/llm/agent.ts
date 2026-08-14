/**
 * Built-in LLM generation agent (product definition v2).
 *
 * Turns a natural-language prompt into a structured page spec, then applies
 * it through the SAME service/state layer the MCP tools use — one code path,
 * fully undoable, broadcast to every client over the existing WS pipeline.
 *
 * The agent is deliberately non-destructive: "new page" requests open a fresh
 * page, "edit current page" requests replace the current page's component
 * tree (undoable via the normal history).
 */

import { stateStore, type ComponentNode } from "../state.js";
import { applyStyleTokenSet } from "../tokens.js";
import { COMPONENT_TYPES } from "../service/design-service.js";
import { chatCompletion, LlmError, type ChatMessage } from "./providers.js";
import type { LlmConfig } from "./config.js";

export interface SpecComponent {
  type: string;
  variant?: string;
  props?: Record<string, unknown>;
}

export interface PageSpec {
  page: "current" | "new";
  template?: string | null;
  style?: string | null;
  base_color?: string | null;
  components: SpecComponent[];
}

export interface LlmGenerateResult {
  ok: boolean;
  component_count: number;
  page_count: number;
  page_id: string | null;
  summary: string;
  error?: string;
}

const TEMPLATE_NAMES = ["saas_landing", "ecommerce_home", "blog_post", "portfolio", "dashboard"];
const STYLE_NAMES = [
  "minimal", "bold", "playful", "dark", "editorial", "tech",
  "glassmorphism", "neumorphism", "claymorphism", "aurora",
  "brutalism", "cyberpunk", "organic", "luxury",
];

const COMPONENT_HINTS: Record<string, string> = {
  hero: "{title, subtitle, cta_text}",
  navbar: "{brand, links: string[]}",
  card_grid: "{title, items: [{title, description}]}",
  feature_list: "{title, items: [{title, description}]}",
  pricing: "{title, plans: [{name, price, features: string[]}]}",
  stats: "{title, items: [{label, value}]}",
  testimonial: "{title, items: [{name, role, quote}]}",
  cta: "{title, subtitle, button_text}",
  footer: "{copyright, links: string[]}",
  banner: "{text}",
  button: "{text}",
  form: "{title, fields: [{label, type}], button_text}",
  faq: "{title, items: [{question, answer}]}",
  image: "{src, alt}",
  text_section: "{title, body}",
};

export function buildSystemPrompt(): string {
  const componentLines = Object.entries(COMPONENT_HINTS)
    .map(([type, props]) => `- ${type}: ${props}`)
    .join("\n");
  return `你是 Prism 的 UI 生成引擎。根据用户需求，输出一个完整页面的结构化 JSON。

可用组件类型（type 必须是其中之一，全部用中文文案）：
${componentLines}

可选风格（style，选一个或 null）：${STYLE_NAMES.join(", ")}

可选模板（template，或 null）：${TEMPLATE_NAMES.join(", ")}

输出必须是最严格的 JSON（不要 markdown 代码块、不要注释、不要额外文字）：
{
  "page": "current" | "new",
  "template": "模板名或 null",
  "style": "风格名或 null",
  "base_color": "#hex 或 null",
  "components": [ { "type": "...", "variant": "可选", "props": { ... } } ]
}

规则：
- 用户要求"做一个新的…/生成一个…"时 page 用 "new"，否则用 "current"（修改当前页）。
- 内容要完整、真实感（品牌名、价格、功能列表都写具体内容），不要占位符 lorem。
- props 字段名必须与上面组件定义一致。`;
}

/** Summarize the current page so the LLM can make targeted edits. */
function buildUserPrompt(prompt: string): string {
  const state = stateStore.getState();
  const current = state.pages.find((p) => p.id === state.currentPageId);
  const summary = (current?.components || [])
    .slice(0, 12)
    .map((c) => {
      const p = c.props || {};
      const first = Object.values(p).find((v) => typeof v === "string" && v.trim());
      return `${c.type}${first ? `: ${String(first).slice(0, 40)}` : ""}`;
    })
    .join("；");
  return `当前页面组件：${summary || "（空页面）"}\n当前风格：${state.style}\n\n用户需求：${prompt}`;
}

/** Extract the first JSON object from a raw LLM reply (tolerates fences). */
export function parseSpec(raw: string): PageSpec | null {
  if (!raw) return null;
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const tryParse = (s: string): PageSpec | null => {
    try {
      const obj = JSON.parse(s) as Partial<PageSpec>;
      if (!obj || typeof obj !== "object") return null;
      return {
        page: obj.page === "new" ? "new" : "current",
        style: typeof obj.style === "string" ? obj.style : null,
        base_color: typeof obj.base_color === "string" ? obj.base_color : null,
        template: typeof obj.template === "string" ? obj.template : null,
        components: Array.isArray(obj.components) ? obj.components : [],
      };
    } catch {
      return null;
    }
  };
  const direct = tryParse(text);
  if (direct) return direct;
  const m = text.match(/\{[\s\S]*\}/);
  return m ? tryParse(m[0]) : null;
}

function makeNode(spec: SpecComponent): ComponentNode | null {
  if (!COMPONENT_TYPES.has(spec.type)) return null;
  return {
    id: `comp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: spec.type,
    variant: typeof spec.variant === "string" && spec.variant ? spec.variant : undefined,
    props: spec.props && typeof spec.props === "object" ? spec.props : {},
    children: [],
  };
}

function countNodes(nodes: ComponentNode[]): number {
  let n = 0;
  const walk = (list: ComponentNode[]): void => {
    for (const c of list) {
      n += 1;
      walk(c.children);
    }
  };
  walk(nodes);
  return n;
}

/** Apply a parsed spec through the shared state layer. Returns component count. */
export function applySpec(spec: PageSpec): { nodes: ComponentNode[]; targetPageId: string | null } {
  const nodes = (spec.components || []).map(makeNode).filter((n): n is ComponentNode => !!n);

  if (spec.style) {
    stateStore.setStyle(spec.style, "ai");
    applyStyleTokenSet(stateStore, spec.style, spec.base_color || undefined, "ai");
  }

  let targetPageId: string | null = stateStore.getState().currentPageId;
  if (spec.page === "new") {
    const page = stateStore.addPage("AI 页面", "ai");
    stateStore.switchPage(page.id, "ai");
    targetPageId = page.id;
  }

  if (nodes.length > 0 && targetPageId) {
    stateStore.replacePageComponents(targetPageId, nodes, "ai");
  }
  return { nodes, targetPageId };
}

/**
 * Generate a page from a natural-language prompt using the configured LLM.
 * Always resolves (never throws): errors are reported in the result so the
 * caller can route them into the prompt feedback loop.
 */
export async function generatePageFromPrompt(
  prompt: string,
  cfg: LlmConfig
): Promise<LlmGenerateResult> {
  try {
    const messages: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPrompt(prompt) },
    ];
    const raw = await chatCompletion(messages, cfg);
    const spec = parseSpec(raw);
    if (!spec) {
      throw new LlmError("AI 输出无法解析为页面 JSON");
    }
    const { nodes, targetPageId } = applySpec(spec);
    const count = countNodes(nodes);
    return {
      ok: true,
      component_count: count,
      page_count: stateStore.getState().pages.length,
      page_id: targetPageId,
      summary: `AI 已生成${spec.page === "new" ? "新页面" : "页面"}（${count} 个组件${spec.style ? "，风格 " + spec.style : ""}）`,
    };
  } catch (err) {
    return {
      ok: false,
      component_count: 0,
      page_count: stateStore.getState().pages.length,
      page_id: null,
      summary: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
