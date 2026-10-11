/**
 * R2 对话式精准修改: 选中组件 → 自然语言局部修改 → diff 预览 → 确认应用。
 *
 * 与整页生成（agent.ts）不同，编辑只针对用户选中的组件：LLM 输出 operations
 * （update 部分字段 / delete / add），服务端对照当前 state 计算字段级 diff，
 * 暂存为 PendingEdit（不落地）；客户端确认后经 /api/llm/edit/apply 用
 * runBatch 单 undo 步应用，走 stateStore 常规提交 → WS 广播 → 可撤销。
 * 布局不由 LLM 输出：新增组件放在锚点组件（首个仍存在的选中项）下方；
 * R4 语义布局操作（arrange/align/gap）同样只接收语义参数，坐标由 tidy
 * 管线计算——既有页面约束（locked）在重排时继续生效。
 */
import { stateStore, type ComponentLayout, type ComponentNode, type PageDef } from "../state.js";
import { runBatch } from "../commands/batch.js";
import { COMPONENT_TYPES } from "../service/design-service.js";
import { containerWidthForPlatform } from "../layout-engine.js";
import {
  tidyPageLayout,
  isLayoutIntent,
  TIDY_MARGIN,
  TIDY_PAGE_WIDTH,
  type LayoutIntentKind,
  type TidyUpdate,
} from "../layout/tidy.js";
import { chatCompletion, type ChatMessage } from "./providers.js";
import { appendTurn, createEditSession, getEditSession } from "./session.js";
import type { LlmConfig } from "./config.js";

export type EditOpKind = "update" | "delete" | "add" | "arrange" | "align" | "gap";

export interface EditOperation {
  op: EditOpKind;
  /** update/delete/arrange/align 必需，且必须来自用户选中的组件集合（gap 作用于整个选区）。 */
  component_id?: string;
  /** add 必需，必须是白名单组件类型。 */
  component_type?: string;
  props?: Record<string, unknown>;
  /** R4 arrange: 布局意图（row/stack/grid/sidebar/overlay），服务端经 tidy 重排。 */
  layout_intent?: LayoutIntentKind;
  /** R4 align: 页面级水平对齐（left 边距 / center 居中 / right 边距）。 */
  align?: "left" | "center" | "right";
  /** R4 gap: 选中组件纵向间距调整（px，可负，钳制 ±120）。 */
  delta?: number;
  /** LLM 给出的一句话修改理由（diff 卡展示）。 */
  reason?: string;
}

export interface EditFieldChange {
  field: string;
  before: string;
  after: string;
}

export interface EditOpDiff {
  op: EditOpKind;
  component_id?: string;
  component_type: string;
  /** 展示用标题（首个非空字符串 prop）。 */
  title?: string;
  reason?: string;
  changes: EditFieldChange[];
}

export interface PendingEdit {
  id: string;
  created_at: number;
  target_ids: string[];
  operations: EditOperation[];
  diffs: EditOpDiff[];
}

export interface EditPreview {
  edit_id: string;
  diffs: EditOpDiff[];
  /** 通过校验的操作数。 */
  requested: number;
  /** 被过滤的非法操作数（未知 id / 未知类型）。 */
  dropped: number;
  summary: string;
  /** R3 会话式编辑: 本轮所属会话（复用传入的或新建）。 */
  session_id: string;
}

export interface EditApplyResult {
  applied: number;
  skipped: number;
  added: number;
}

// ===== prompts =====

export function buildEditSystemPrompt(): string {
  const types = [...COMPONENT_TYPES].join(", ");
  return `你是 Prism 的精准修改引擎。用户在画布上选中了若干组件并给出修改指令。你只能针对提供的组件列表做局部修改，输出 operations 数组。

输出必须是最严格的 JSON（不要 markdown 代码块、不要注释、不要额外文字）：
{
  "operations": [
    { "op": "update", "component_id": "comp_xxx", "props": { 仅包含要修改的字段 }, "reason": "一句话理由" },
    { "op": "delete", "component_id": "comp_xxx", "reason": "一句话理由" },
    { "op": "add", "component_type": "button", "props": { 全量字段 }, "reason": "一句话理由" },
    { "op": "arrange", "component_id": "comp_xxx", "layout_intent": "row|stack|grid|sidebar|overlay", "reason": "一句话理由" },
    { "op": "align", "component_id": "comp_xxx", "align": "left|center|right", "reason": "一句话理由" },
    { "op": "gap", "delta": 16, "reason": "一句话理由" }
  ]
}

可用组件类型（add 时 component_type 必须是其中之一，全部用中文文案）：
${types}

规则：
- update 的 props 只写需要变化的字段，不要重复未变化的字段；component_id 必须来自提供的选中组件列表。
- add 的新组件会放在选中组件下方；props 字段名必须与组件定义一致（hero: {title, subtitle, cta_text}，button: {text} 等按名示意）。
- 不要输出坐标/尺寸/样式字段——布局与样式由系统管理。
- 指令未涉及任何修改时输出 { "operations": [] }。
- 可能提供历史对话：结合上文理解指代（如「再大一点」「换回刚才的文案」指向上一轮的字段/组件）；但每轮给出的选中组件 props 才是当前真实值。
- 布局指令用语义操作，不输出坐标数字：
  - arrange：把组件按意图参与重排。要「并排」就给每个参与组件输出 layout_intent:"row"；「网格」用 "grid"（每行最多 3 个）；「侧栏」用 "sidebar"；「悬浮/浮层」用 "overlay"。
  - align：组件相对页面的水平对齐（left 靠左边距 / center 水平居中 / right 靠右边距）。
  - gap：调整选中组件之间的纵向间距，delta 为像素数（正=变大，负=变小）。
- 被用户锁定为约束的组件不会参与重排；除此之外 arrange 可能联动移动页面上的相邻组件（预览会如实列出）。
- 文案用中文，内容要具体真实，不要占位符。`;
}

interface EditTargetView {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

/** 组件 props 摘要（截断，防 prompt 膨胀）。 */
function propsSummary(props: Record<string, unknown>): string {
  const json = JSON.stringify(props) || "{}";
  return json.length > 500 ? json.slice(0, 500) + "…" : json;
}

export function buildEditUserPrompt(prompt: string, targets: EditTargetView[]): string {
  const lines = targets
    .map((t) => `- ${t.id} (${t.type}): ${propsSummary(t.props)}`)
    .join("\n");
  return `选中组件（id / 类型 / 当前 props）：\n${lines}\n\n修改指令：${prompt}`;
}

// ===== parsing =====

/** 从 LLM 原始回复解析 operations（容忍 fences / 嵌入 JSON），过滤非法项。 */
export function parseEditOperations(raw: string, targetIds: ReadonlySet<string>): {
  operations: EditOperation[];
  dropped: number;
} {
  const empty = { operations: [] as EditOperation[], dropped: 0 };
  if (!raw) return empty;
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return empty;
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return empty;
    }
  }
  const obj = parsed as { operations?: unknown };
  if (!obj || !Array.isArray(obj.operations)) return empty;

  const operations: EditOperation[] = [];
  let dropped = 0;
  for (const rawOp of obj.operations) {
    if (!rawOp || typeof rawOp !== "object") continue;
    const r = rawOp as Record<string, unknown>;
    const op = r.op;
    const reason = typeof r.reason === "string" && r.reason.trim() ? r.reason.trim() : undefined;
    const props =
      r.props && typeof r.props === "object" && !Array.isArray(r.props)
        ? (r.props as Record<string, unknown>)
        : {};
    if ((op === "update" || op === "delete") && typeof r.component_id === "string") {
      if (!targetIds.has(r.component_id)) {
        dropped += 1;
        continue;
      }
      operations.push({ op, component_id: r.component_id, props, reason });
    } else if (op === "add" && typeof r.component_type === "string" && COMPONENT_TYPES.has(r.component_type)) {
      operations.push({ op, component_type: r.component_type, props, reason });
    } else if (op === "arrange" && typeof r.component_id === "string" && isLayoutIntent(r.layout_intent)) {
      if (!targetIds.has(r.component_id)) {
        dropped += 1;
        continue;
      }
      operations.push({ op, component_id: r.component_id, layout_intent: r.layout_intent, reason });
    } else if (op === "align" && typeof r.component_id === "string" && targetIds.has(r.component_id) && (r.align === "left" || r.align === "center" || r.align === "right")) {
      operations.push({ op, component_id: r.component_id, align: r.align, reason });
    } else if (op === "gap") {
      const raw = typeof r.delta === "number" && Number.isFinite(r.delta) ? Math.round(r.delta) : 0;
      const delta = Math.max(-120, Math.min(120, raw));
      if (!delta) {
        dropped += 1;
        continue;
      }
      operations.push({ op, delta, reason });
    } else {
      dropped += 1;
    }
  }
  return { operations, dropped };
}

// ===== diff =====

/** 展示值：对象/数组序列化，超长截断。 */
function diffValue(v: unknown): string {
  let s: string;
  if (v === undefined) s = "（无）";
  else if (typeof v === "string") s = v;
  else s = JSON.stringify(v) ?? String(v);
  return s.length > 60 ? s.slice(0, 60) + "…" : s;
}

function titleOf(props: Record<string, unknown> | undefined): string | undefined {
  if (!props) return undefined;
  const first = Object.values(props).find((v) => typeof v === "string" && v.trim());
  return first === undefined ? undefined : (first as string).slice(0, 40);
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

// ===== R4 布局操作: diff 与 apply 共用的纯计算 =====

/** 展平组件树。 */
function flattenNodes(roots: readonly ComponentNode[]): ComponentNode[] {
  const out: ComponentNode[] = [];
  const walk = (nodes: readonly ComponentNode[]): void => {
    for (const n of nodes) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(roots);
  return out;
}

/** 页面约束 → locked 矩形（优先 source_component_id 精确锁定，缺失时按类型首次匹配）。 */
function lockedFromConstraints(
  page: PageDef,
  allNodes: readonly ComponentNode[]
): Map<string, ComponentLayout> {
  const locked = new Map<string, ComponentLayout>();
  for (const c of page.constraints || []) {
    if (c.source_component_id && allNodes.some((n) => n.id === c.source_component_id)) {
      locked.set(c.source_component_id, { ...c.layout });
      continue;
    }
    const node = allNodes.find((n) => !locked.has(n.id) && n.type === c.component_type);
    if (node) locked.set(node.id, { ...c.layout });
  }
  return locked;
}

/** arrange 意图 → 整页 tidy 更新（只含实际变化的组件；约束锁定生效）。 */
function computeArrangeUpdates(
  page: PageDef | undefined,
  intents: Map<string, LayoutIntentKind>,
  pageWidth: number
): TidyUpdate[] {
  if (!page || intents.size === 0) return [];
  const locked = lockedFromConstraints(page, page.components);
  return tidyPageLayout(page, pageWidth, { intents, locked });
}

const fmtPos = (l: ComponentLayout): string => `(${Math.round(l.x)}, ${Math.round(l.y)})`;
const fmtSize = (l: ComponentLayout): string => `${Math.round(l.w)}×${Math.round(l.h)}`;

function layoutChanges(before: ComponentLayout, after: ComponentLayout): EditFieldChange[] {
  const changes: EditFieldChange[] = [];
  if (before.x !== after.x || before.y !== after.y) {
    changes.push({ field: "位置", before: fmtPos(before), after: fmtPos(after) });
  }
  if (before.w !== after.w || before.h !== after.h) {
    changes.push({ field: "尺寸", before: fmtSize(before), after: fmtSize(after) });
  }
  return changes;
}

/** 对照当前状态计算 diff（纯展示，不改状态）。布局操作会展开为每个受影响组件一条。 */
export function computeEditDiffs(
  operations: EditOperation[],
  byId: ReadonlyMap<string, ComponentNode>,
  page?: PageDef,
  pageWidth: number = TIDY_PAGE_WIDTH,
  selectedIds?: ReadonlySet<string>
): EditOpDiff[] {
  const arrangeIntents = new Map<string, LayoutIntentKind>();
  for (const op of operations) {
    if (op.op === "arrange" && op.component_id && op.layout_intent) {
      arrangeIntents.set(op.component_id, op.layout_intent);
    }
  }
  const arrangeUpdates = computeArrangeUpdates(page, arrangeIntents, pageWidth);
  const layoutById = new Map(arrangeUpdates.map((u) => [u.id, u.layout]));
  let bystandersEmitted = false;

  const out: EditOpDiff[] = [];
  const entry = (
    op: EditOperation,
    node: ComponentNode | undefined,
    changes: EditFieldChange[]
  ): EditOpDiff => ({
    op: op.op,
    component_id: op.component_id,
    component_type: node?.type || "unknown",
    title: titleOf(node?.props),
    reason: op.reason,
    changes,
  });

  for (const op of operations) {
    if (op.op === "add") {
      const props = op.props || {};
      out.push({
        op: "add",
        component_type: op.component_type || "",
        title: titleOf(props),
        reason: op.reason,
        changes: Object.entries(props).map(([field, v]) => ({
          field,
          before: "（无）",
          after: diffValue(v),
        })),
      });
      continue;
    }
    if (op.op === "gap") {
      const wanted = selectedIds;
      const sel = [...byId.values()]
        .filter((n) => n.layout && (!wanted || wanted.has(n.id)))
        .sort((a, b) => a.layout!.y - b.layout!.y);
      const delta = op.delta || 0;
      for (let i = 1; i < sel.length; i++) {
        const n = sel[i]!;
        const cur = n.layout!;
        const next: ComponentLayout = { ...cur, y: cur.y + delta * i };
        const changes = layoutChanges(cur, next);
        if (changes.length > 0) out.push(entry(op, n, changes));
      }
      continue;
    }
    const node = op.component_id ? byId.get(op.component_id) : undefined;
    if (op.op === "delete") {
      out.push(entry(op, node, []));
      continue;
    }
    if (op.op === "arrange") {
      const id = op.component_id!;
      const next = layoutById.get(id);
      out.push(entry(op, node, next && node?.layout ? layoutChanges(node.layout, next) : []));
      // 首个 arrange 附带展示联动移动的旁邻组件（整页重排的如实预览）
      if (!bystandersEmitted) {
        bystandersEmitted = true;
        for (const u of arrangeUpdates) {
          if (u.id === id) continue;
          const n = byId.get(u.id);
          const changes = n?.layout ? layoutChanges(n.layout, u.layout) : [];
          if (changes.length === 0) continue;
          out.push({
            op: "arrange",
            component_id: u.id,
            component_type: n?.type || "unknown",
            title: titleOf(n?.props),
            changes,
          });
        }
      }
      continue;
    }
    if (op.op === "align") {
      if (!node?.layout) {
        out.push(entry(op, node, []));
        continue;
      }
      const w = node.layout.w;
      const raw =
        op.align === "left"
          ? TIDY_MARGIN
          : op.align === "center"
            ? (pageWidth - w) / 2
            : pageWidth - w - TIDY_MARGIN;
      const next: ComponentLayout = { ...node.layout, x: Math.max(0, Math.round(raw)) };
      out.push(entry(op, node, layoutChanges(node.layout, next)));
      continue;
    }
    // update: 只列真正变化的字段（LLM 可能重复未变字段）
    const changes: EditFieldChange[] = [];
    for (const [field, v] of Object.entries(op.props || {})) {
      if (sameJson(node?.props?.[field], v)) continue;
      changes.push({ field, before: diffValue(node?.props?.[field]), after: diffValue(v) });
    }
    out.push(entry(op, node, changes));
  }
  return out;
}

// ===== pending store =====

const EDIT_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_EDITS = 50;
const pendingEdits = new Map<string, PendingEdit>();

function prunePending(): void {
  const now = Date.now();
  for (const [id, p] of pendingEdits) {
    if (now - p.created_at > EDIT_TTL_MS) pendingEdits.delete(id);
  }
  while (pendingEdits.size > MAX_PENDING_EDITS) {
    const oldest = pendingEdits.keys().next().value;
    if (oldest === undefined) break;
    pendingEdits.delete(oldest);
  }
}

function createPendingEdit(
  targetIds: string[],
  operations: EditOperation[],
  diffs: EditOpDiff[]
): PendingEdit {
  prunePending();
  const pending: PendingEdit = {
    id: `edit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    created_at: Date.now(),
    target_ids: targetIds,
    operations,
    diffs,
  };
  pendingEdits.set(pending.id, pending);
  return pending;
}

/** 取出（一次性消费）: null = 不存在/过期。 */
export function takePendingEdit(id: string): PendingEdit | null {
  prunePending();
  const p = pendingEdits.get(id) || null;
  if (p) pendingEdits.delete(id);
  return p;
}

/** 测试支持: 清空暂存。 */
export function clearPendingEditsForTests(): void {
  pendingEdits.clear();
}

// ===== orchestration =====

/** 在组件树中按 id 集合收集节点（保持树序）。 */
export function collectPageComponents(
  roots: readonly ComponentNode[],
  ids: readonly string[]
): ComponentNode[] {
  const wanted = new Set(ids);
  const found: ComponentNode[] = [];
  const walk = (nodes: readonly ComponentNode[]): void => {
    for (const n of nodes) {
      if (wanted.has(n.id)) found.push(n);
      walk(n.children);
    }
  };
  walk(roots);
  return found;
}

/**
 * 选中组件 → LLM 局部修改建议 → diff 预览（不落地，暂存 PendingEdit）。
 * R3 会话式编辑: 传 sessionId 时复用同页会话的历史轮次（跨页自动开新会话），
 * 本轮 user/assistant 追加回会话。
 * @throws Error 当选中组件不存在或 LLM/解析失败
 */
export async function requestPageEdit(
  prompt: string,
  componentIds: string[],
  cfg: LlmConfig,
  sessionId?: string | null
): Promise<EditPreview> {
  const state = stateStore.getState();
  const page = state.pages.find((p) => p.id === state.currentPageId);
  const targets = collectPageComponents(page?.components || [], componentIds);
  if (targets.length === 0) throw new Error("选中的组件不存在或已被删除");

  const existing = getEditSession(sessionId);
  const active = existing && existing.page_id === page!.id ? existing : null;
  const userContent = buildEditUserPrompt(
    prompt,
    targets.map((t) => ({ id: t.id, type: t.type, props: t.props || {} }))
  );
  const messages: ChatMessage[] = [
    { role: "system", content: buildEditSystemPrompt() },
    ...(active ? active.messages : []),
    { role: "user", content: userContent },
  ];
  const reply = await chatCompletion(messages, cfg);
  const session = active ?? createEditSession(page!.id);
  // 回复可能是大段 JSON——历史里截断存储，保持后续轮次 prompt 精简
  appendTurn(session, userContent, reply.slice(0, 2000));

  const targetIds = new Set(targets.map((t) => t.id));
  const { operations, dropped } = parseEditOperations(reply, targetIds);
  // 布局 diff 需要整页节点（arrange 联动旁邻 / 约束锁定）
  const byId = new Map(flattenNodes(page!.components).map((n) => [n.id, n]));
  const diffs = computeEditDiffs(
    operations,
    byId,
    page,
    containerWidthForPlatform(state.activePlatform),
    targetIds
  );
  const pending = createPendingEdit(componentIds.slice(), operations, diffs);
  return {
    edit_id: pending.id,
    diffs,
    requested: operations.length,
    dropped,
    summary:
      operations.length === 0
        ? "AI 未提出修改建议（可换一种描述再试）"
        : `已生成 ${operations.length} 处修改建议，请预览后应用`,
    session_id: session.id,
  };
}

// ===== apply =====

/**
 * 将暂存的 operations 经 runBatch 单 undo 步应用到 stateStore（常规提交 →
 * WS 广播）。应用时逐条重新校验：组件已不存在的 update/delete 记为 skipped，
 * arrange/align/gap 基于应用时的最新状态重新计算布局（约束锁定生效）。
 * add 追加到页面根部，若锚点（首个仍存在的选中项）有布局则放在其下方。
 */
export function applyEditOperations(pending: PendingEdit): EditApplyResult {
  const result: EditApplyResult = { applied: 0, skipped: 0, added: 0 };
  runBatch("ai-edit", () => {
    const st = stateStore.getState();
    const page = st.pages.find((p) => p.id === st.currentPageId);
    const anchor = collectPageComponents(page?.components || [], pending.target_ids)[0];

    // R4: arrange 意图 → 整页 tidy 更新（多条 arrange 合并消费一次）
    const arrangeIntents = new Map<string, LayoutIntentKind>();
    for (const op of pending.operations) {
      if (op.op === "arrange" && op.component_id && op.layout_intent) {
        arrangeIntents.set(op.component_id, op.layout_intent);
      }
    }
    const arrangeUpdates = computeArrangeUpdates(
      page,
      arrangeIntents,
      containerWidthForPlatform(st.activePlatform)
    );
    let arrangeConsumed = false;
    const consumeArrange = (): void => {
      if (arrangeConsumed) return;
      arrangeConsumed = true;
      for (const u of arrangeUpdates) {
        if (stateStore.updateComponent(u.id, {}, "ai", u.layout)) result.applied += 1;
      }
    };

    const readPage = (): PageDef | undefined =>
      stateStore.getState().pages.find((p) => p.id === stateStore.getState().currentPageId);

    for (const op of pending.operations) {
      if (op.op === "update") {
        if (stateStore.updateComponent(op.component_id!, op.props || {}, "ai")) result.applied += 1;
        else result.skipped += 1;
      } else if (op.op === "delete") {
        if (stateStore.removeComponent(op.component_id!, "ai")) result.applied += 1;
        else result.skipped += 1;
      } else if (op.op === "add") {
        const node = stateStore.addComponent(
          op.component_type!,
          undefined,
          op.props && typeof op.props === "object" ? op.props : {},
          null,
          "ai"
        );
        if (anchor?.layout) {
          stateStore.updateComponent(
            node.id,
            {},
            "ai",
            { x: anchor.layout.x, y: anchor.layout.y + anchor.layout.h + 16, w: anchor.layout.w, h: anchor.layout.h }
          );
        }
        result.applied += 1;
        result.added += 1;
      } else if (op.op === "arrange") {
        consumeArrange();
      } else if (op.op === "align") {
        const node = collectPageComponents(readPage()?.components || [], [op.component_id!])[0];
        if (!node?.layout) {
          result.skipped += 1;
          continue;
        }
        const pageWidth = containerWidthForPlatform(stateStore.getState().activePlatform);
        const w = node.layout.w;
        const raw =
          op.align === "left"
            ? TIDY_MARGIN
            : op.align === "center"
              ? (pageWidth - w) / 2
              : pageWidth - w - TIDY_MARGIN;
        const nx = Math.max(0, Math.round(raw));
        if (nx !== node.layout.x && stateStore.updateComponent(node.id, {}, "ai", { ...node.layout, x: nx })) {
          result.applied += 1;
        }
      } else if (op.op === "gap") {
        const sel = collectPageComponents(readPage()?.components || [], pending.target_ids)
          .filter((n) => n.layout)
          .sort((a, b) => a.layout!.y - b.layout!.y);
        const delta = op.delta || 0;
        for (let i = 1; i < sel.length; i++) {
          const n = sel[i]!;
          const ny = n.layout!.y + delta * i;
          if (ny !== n.layout!.y && stateStore.updateComponent(n.id, {}, "ai", { ...n.layout!, y: ny })) {
            result.applied += 1;
          }
        }
      }
    }
  });
  return result;
}
