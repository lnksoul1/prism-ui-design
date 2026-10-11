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

import { stateStore, type ComponentLayout, type ComponentNode, type PageDef } from "../state.js";
import { applyStyleTokenSet } from "../tokens.js";
import { COMPONENT_TYPES } from "../service/design-service.js";
import { containerWidthForPlatform, ensureTopLevelLayouts } from "../layout-engine.js";
import {
  tidyPageLayout,
  verifyLayout,
  isLayoutIntent,
  type LayoutIntentKind,
  type LayoutReport,
} from "../layout/tidy.js";
import { chatCompletion, streamChatCompletion, LlmError, type ChatMessage } from "./providers.js";
import { createCandidateBatch } from "./candidates.js";
import { recordAiApplyForUndo } from "./edit.js";
import { compilePageBrief } from "../prompt-brief.js";
import { runBatch } from "../commands/batch.js";
import type { LlmConfig } from "./config.js";

export interface SpecComponent {
  type: string;
  variant?: string;
  props?: Record<string, unknown>;
  /** R1 M1: 可选布局意图（row/stack/grid/sidebar/overlay），服务端统一落位。 */
  layout_intent?: LayoutIntentKind;
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
  /** R1 M1: 生成后布局体检（重叠对数/超界数）。 */
  layout_report?: LayoutReport;
  /** R9: 扁平体检字段（与编辑管线同款，客户端体检卡直接消费）。 */
  layout_issues?: number;
  layout_overlaps?: number;
  layout_out_of_bounds?: number;
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
  // 盒子模式富类型：创建后画布渲染占位盒，内部配置（ECharts option 等）经 box-mode 端点注入
  chart: "{title, chart_type: bar|line|pie}",
  echarts: "{title, option}",
  rich_text: "{html: 富文本 HTML 字符串}",
  editor: "{content: 初始文档文本}",
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
  "components": [ { "type": "...", "variant": "可选", "layout_intent": "可选", "props": { ... } } ]
}

规则：
- 用户要求"做一个新的…/生成一个…"时 page 用 "new"，否则用 "current"（修改当前页）。
- 不要输出任何坐标/尺寸——布局由系统按 layout_intent 统一落位。每个组件可选 layout_intent：
  "stack" 纵向依次排列（默认）；"row" 与相邻同意图组件横向并排（如一组按钮/卡片）；
  "grid" 与相邻同意图组件组成网格（每行最多 3 个）；"sidebar" 窄侧栏（约 30% 宽，靠左）；
  "overlay" 浮层/悬浮元素（保持覆盖语义，不参与重排）。
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
      const rawComponents: unknown[] = Array.isArray(obj.components) ? obj.components : [];
      const components: SpecComponent[] = [];
      for (const raw of rawComponents) {
        if (!raw || typeof raw !== "object") continue;
        const rc = raw as Record<string, unknown>;
        const comp: SpecComponent = {
          type: typeof rc.type === "string" ? rc.type : "",
          variant: typeof rc.variant === "string" && rc.variant ? rc.variant : undefined,
          props: rc.props && typeof rc.props === "object" ? (rc.props as Record<string, unknown>) : {},
        };
        comp.layout_intent = isLayoutIntent(rc.layout_intent) ? rc.layout_intent : undefined;
        components.push(comp);
      }
      return {
        page: obj.page === "new" ? "new" : "current",
        style: typeof obj.style === "string" ? obj.style : null,
        base_color: typeof obj.base_color === "string" ? obj.base_color : null,
        template: typeof obj.template === "string" ? obj.template : null,
        components,
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

interface NodeEntry {
  node: ComponentNode;
  intent?: LayoutIntentKind;
}

function makeNodeEntry(spec: SpecComponent): NodeEntry | null {
  if (!COMPONENT_TYPES.has(spec.type)) return null;
  return {
    node: {
      id: `comp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: spec.type,
      variant: typeof spec.variant === "string" && spec.variant ? spec.variant : undefined,
      props: spec.props && typeof spec.props === "object" ? spec.props : {},
      children: [],
    },
    intent: spec.layout_intent,
  };
}

/** 统计组件树节点总数（生成结果 component_count / /api/llm/apply 复用）。 */
export function countNodes(nodes: ComponentNode[]): number {
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

/**
 * R1 M2 修正记忆: 页面约束 → locked 矩形。按 component_type 匹配新生成的
 * 顶层组件（首个未消费匹配），锁定其矩形——人工调准的位置在 AI 重生成后
 * 得以保留。约束是页面级的：新页面（page:"new"）不继承。
 */
function lockedFromPage(page: PageDef, nodes: ComponentNode[]): Map<string, ComponentLayout> {
  const constraints = page.constraints || [];
  if (constraints.length === 0) return new Map();
  const locked = new Map<string, ComponentLayout>();
  const used = new Set<number>();
  for (const n of nodes) {
    const idx = constraints.findIndex((c, i) => !used.has(i) && c.component_type === n.type);
    if (idx !== -1) {
      used.add(idx);
      locked.set(n.id, { ...constraints[idx].layout });
    }
  }
  return locked;
}

/**
 * R1 M1 落位管线: 节点创建后由服务端统一布局——AI 不再输出坐标。
 * 流式列初始 layout → tidy 同源规则（锚定/聚簇/语义间距 + 意图/约束）→ 体检。
 * @returns 体检报告（重叠对数/越界数），进生成 summary
 */
function placeNodes(page: PageDef, entries: NodeEntry[]): LayoutReport {
  const state = stateStore.getState();
  const pageWidth = containerWidthForPlatform(state.activePlatform);
  const nodes = entries.map((e) => e.node);
  const intents = new Map<string, LayoutIntentKind>();
  for (const e of entries) {
    if (e.intent) intents.set(e.node.id, e.intent);
  }
  const locked = lockedFromPage(page, nodes);
  ensureTopLevelLayouts(nodes, pageWidth);
  const probe: PageDef = { id: page.id, name: page.name, components: nodes };
  const updates = tidyPageLayout(probe, pageWidth, { intents, locked });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const u of updates) {
    const n = byId.get(u.id);
    if (n) n.layout = u.layout;
  }
  // 约束矩形强制写回（tidy 跳过 locked 组件不产生 update，而
  // ensureTopLevelLayouts 可能已给它们设过初始布局）
  for (const [id, rect] of locked) {
    const n = byId.get(id);
    if (n) n.layout = { ...rect };
  }
  return verifyLayout(probe, pageWidth, { intents, locked });
}

/** Apply a parsed spec through the shared state layer. Returns component count. */
export function applySpec(spec: PageSpec): {
  nodes: ComponentNode[];
  targetPageId: string | null;
  report: LayoutReport | null;
} {
  // R6: 整页生成折叠为单 undo 步（此前 setStyle/addPage/replace 各自成步，
  // 「撤销刚才那步」会碎成多步）；落地后记录内容指纹供对话撤销护栏使用。
  // 注意指纹必须在 runBatch 结束（endBatch commit bump revision）之后记录。
  const result = runBatch("ai-generate", () => {
    const entries = (spec.components || [])
      .map(makeNodeEntry)
      .filter((e): e is NodeEntry => !!e);
    const nodes = entries.map((e) => e.node);
    let report: LayoutReport | null = null;

    if (spec.style) {
      // 风格预设体系已移除：style 仅作记录（设计系统换肤走 design_apply_style_guide）。
      stateStore.setStyle("minimal", "ai");
      applyStyleTokenSet(stateStore, spec.base_color || undefined, "ai");
    }

    let targetPageId: string | null = stateStore.getState().currentPageId;
    if (spec.page === "new") {
      const page = stateStore.addPage("AI 页面", "ai");
      stateStore.switchPage(page.id, "ai");
      targetPageId = page.id;
    }

    if (nodes.length > 0 && targetPageId) {
      const page = stateStore.getState().pages.find((p) => p.id === targetPageId);
      if (page) report = placeNodes(page, entries);
      stateStore.replacePageComponents(targetPageId, nodes, "ai");
    }
    return { nodes, targetPageId, report };
  });
  recordAiApplyForUndo();
  return result;
}

/** R1 M1: summary 布局体检尾巴（0 问题 → 已自动对齐；有问题 → 如实报数）。 */
function layoutSummaryPart(report: LayoutReport | null): string {
  if (!report) return "";
  const issues = report.overlaps + report.out_of_bounds;
  return issues > 0 ? `，${issues} 处布局重叠/越界待处理` : "，布局已自动对齐";
}

/** R9: 体检报告 → 扁平字段（与编辑管线同款；无报告则全 0）。 */
export function layoutFlatFields(report: LayoutReport | null): {
  layout_issues: number;
  layout_overlaps: number;
  layout_out_of_bounds: number;
} {
  const overlaps = report?.overlaps ?? 0;
  const outOfBounds = report?.out_of_bounds ?? 0;
  return {
    layout_issues: overlaps + outOfBounds,
    layout_overlaps: overlaps,
    layout_out_of_bounds: outOfBounds,
  };
}

/**
 * R1 M2 修正记忆: 页面约束 → 系统提示词附加段。让 AI 知道当前页哪些区块
 * 位置已被人工锁定（落位时系统会按 component_type 强制对齐）。
 */
export function buildConstraintsExtra(pageId: string | null): string {
  if (!pageId) return "";
  const state = stateStore.getState();
  const page = state.pages.find((p) => p.id === pageId);
  const constraints = page?.constraints || [];
  if (constraints.length === 0) return "";
  const lines = constraints.map(
    (c) =>
      `- ${c.component_type}：固定在 x=${c.layout.x}，y=${c.layout.y}，${c.layout.w}×${c.layout.h}`
  );
  const parts = [
    "当前页面存在人工锁定的布局约束（仅当输出 page:\"current\" 修改本页时需遵守；",
    `输出 page:\"new\" 生成新页面时可忽略）。共 ${constraints.length} 条，同类组件会由系统强制对齐到这些位置：`,
    ...lines,
  ];
  // few-shot: 单页简报帮 AI 理解人工调准后的页面结构（仅在有约束时注入）
  const brief = compilePageBrief(state, pageId);
  if (brief) parts.push("", "当前页面结构简报：", brief);
  return parts.join("\n");
}

/**
 * 流式生成 + 解析 spec（不落地 stateStore）。streamPageGeneration 与
 * 多候选 batch 共用：systemExtra 追加到系统提示词尾部（候选风格倾向 /
 * M2 页面约束都从这里注入）。
 */
async function streamSpecOnly(
  prompt: string,
  cfg: LlmConfig,
  systemExtra: string,
  onDelta: (text: string) => void
): Promise<PageSpec> {
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt() + (systemExtra ? `\n\n${systemExtra}` : "") },
    { role: "user", content: buildUserPrompt(prompt) },
  ];
  const raw = await streamChatCompletion(messages, cfg, onDelta);
  const spec = parseSpec(raw);
  if (!spec) throw new LlmError("AI 输出无法解析为页面 JSON");
  return spec;
}

/**
 * M2 NL2UI 流式: 流式生成页面。onDelta 收到原始 token 流（前端实时展示），
 * 完成后解析并应用（复用 parseSpec/applySpec，与同步路径完全同一语义）。
 */
export async function streamPageGeneration(
  prompt: string,
  cfg: LlmConfig,
  onDelta: (text: string) => void
): Promise<LlmGenerateResult> {
  try {
    const systemExtra = buildConstraintsExtra(stateStore.getState().currentPageId);
    const spec = await streamSpecOnly(prompt, cfg, systemExtra, onDelta);
    const { nodes, targetPageId, report } = applySpec(spec);
    const count = countNodes(nodes);
    return {
      ok: true,
      component_count: count,
      page_count: stateStore.getState().pages.length,
      page_id: targetPageId,
      layout_report: report ?? undefined,
      ...layoutFlatFields(report),
      summary: `AI 已流式生成${spec.page === "new" ? "新页面" : "页面"}（${count} 个组件${layoutSummaryPart(report)}）`,
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
    const systemExtra = buildConstraintsExtra(stateStore.getState().currentPageId);
    const messages: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt() + (systemExtra ? `\n\n${systemExtra}` : "") },
      { role: "user", content: buildUserPrompt(prompt) },
    ];
    const raw = await chatCompletion(messages, cfg);
    const spec = parseSpec(raw);
    if (!spec) {
      throw new LlmError("AI 输出无法解析为页面 JSON");
    }
    const { nodes, targetPageId, report } = applySpec(spec);
    const count = countNodes(nodes);
    return {
      ok: true,
      component_count: count,
      page_count: stateStore.getState().pages.length,
      page_id: targetPageId,
      layout_report: report ?? undefined,
      ...layoutFlatFields(report),
      summary: `AI 已生成${spec.page === "new" ? "新页面" : "页面"}（${count} 个组件${spec.style ? "，风格 " + spec.style : ""}${layoutSummaryPart(report)}）`,
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

// ===== R1 多候选 =====

/** 候选卡片预览项: 组件类型 + 首个文本 prop（截断）。 */
export interface SpecPreviewItem {
  type: string;
  title: string;
}

/** 单个候选的结果（candidate_done / done.candidates 事件体）。 */
export interface CandidateResult {
  index: number;
  /** 短标签: 均衡版 / 大胆版 / 紧凑版。 */
  label: string;
  /** 完整风格倾向描述（注入 systemExtra 的原文）。 */
  angle: string;
  ok: boolean;
  component_count: number;
  summary: string;
  preview: SpecPreviewItem[];
  error?: string;
}

export interface CandidateBatchHandlers {
  onStart?: (index: number, total: number, label: string, angle: string) => void;
  onDelta?: (index: number, text: string) => void;
  onCandidateDone?: (result: CandidateResult) => void;
}

/** 候选风格倾向: 同一需求用三种结构/视觉策略各生成一版。 */
const CANDIDATE_ANGLES: Array<{ label: string; hint: string }> = [
  { label: "均衡版", hint: "本轮生成倾向：结构稳妥常规，信息密度均衡，配色中性。" },
  { label: "大胆版", hint: "本轮生成倾向：视觉更大胆——对比更强、配色更鲜明、留白更慷慨、标题更有张力。" },
  { label: "紧凑版", hint: "本轮生成倾向：信息密度更高——内容区块更多、结构更紧凑、细节更丰富。" },
];

/** 从 spec 提取候选卡片预览（最多 8 项）。 */
export function specPreview(spec: PageSpec): SpecPreviewItem[] {
  return spec.components.slice(0, 8).map((c) => {
    const first = Object.values(c.props || {}).find(
      (v) => typeof v === "string" && v.trim()
    );
    return { type: c.type, title: first ? String(first).slice(0, 30) : "" };
  });
}

/**
 * R1 多候选: 顺序生成 count（1-3）个候选 spec（不同风格倾向，不落地
 * stateStore），暂存为候选批次；返回 batch_id + 候选结果列表。
 * 单个候选失败不中断整批（ok:false 标记，客户端不可应用该候选）。
 */
export async function streamCandidateBatch(
  prompt: string,
  cfg: LlmConfig,
  count: number,
  handlers: CandidateBatchHandlers
): Promise<{ batch_id: string; candidates: CandidateResult[] }> {
  const total = Math.min(Math.max(Math.floor(count) || 1, 1), CANDIDATE_ANGLES.length);
  const candidates: CandidateResult[] = [];
  const specs: Array<PageSpec | null> = [];
  for (let i = 0; i < total; i++) {
    const { label, hint } = CANDIDATE_ANGLES[i];
    handlers.onStart?.(i, total, label, hint);
    try {
      const spec = await streamSpecOnly(prompt, cfg, hint, (t) => handlers.onDelta?.(i, t));
      specs.push(spec);
      const result: CandidateResult = {
        index: i,
        label,
        angle: hint,
        ok: true,
        component_count: spec.components.length,
        summary: `${label}：${spec.components.length} 个组件`,
        preview: specPreview(spec),
      };
      candidates.push(result);
      handlers.onCandidateDone?.(result);
    } catch (err) {
      specs.push(null);
      const result: CandidateResult = {
        index: i,
        label,
        angle: hint,
        ok: false,
        component_count: 0,
        summary: "",
        preview: [],
        error: err instanceof Error ? err.message : String(err),
      };
      candidates.push(result);
      handlers.onCandidateDone?.(result);
    }
  }
  const batch = createCandidateBatch(prompt, specs);
  return { batch_id: batch.id, candidates };
}
