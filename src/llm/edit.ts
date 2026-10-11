/**
 * R2 对话式精准修改: 选中组件 → 自然语言局部修改 → diff 预览 → 确认应用。
 *
 * 与整页生成（agent.ts）不同，编辑只针对用户选中的组件：LLM 输出 operations
 * （update 部分字段 / delete / add），服务端对照当前 state 计算字段级 diff，
 * 暂存为 PendingEdit（不落地）；客户端确认后经 /api/llm/edit/apply 用
 * runBatch 单 undo 步应用，走 stateStore 常规提交 → WS 广播 → 可撤销。
 * 布局不由 LLM 输出：新增组件放在锚点组件（首个仍存在的选中项）下方，
 * 约束（locked）与修正记忆不受影响（编辑不动既有布局）。
 */
import { stateStore, type ComponentNode } from "../state.js";
import { runBatch } from "../commands/batch.js";
import { COMPONENT_TYPES } from "../service/design-service.js";
import { chatCompletion, type ChatMessage } from "./providers.js";
import type { LlmConfig } from "./config.js";

export type EditOpKind = "update" | "delete" | "add";

export interface EditOperation {
  op: EditOpKind;
  /** update/delete 必需，且必须来自用户选中的组件集合。 */
  component_id?: string;
  /** add 必需，必须是白名单组件类型。 */
  component_type?: string;
  props?: Record<string, unknown>;
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
    { "op": "add", "component_type": "button", "props": { 全量字段 }, "reason": "一句话理由" }
  ]
}

可用组件类型（add 时 component_type 必须是其中之一，全部用中文文案）：
${types}

规则：
- update 的 props 只写需要变化的字段，不要重复未变化的字段；component_id 必须来自提供的选中组件列表。
- add 的新组件会放在选中组件下方；props 字段名必须与组件定义一致（hero: {title, subtitle, cta_text}，button: {text} 等按名示意）。
- 不要输出坐标/尺寸/样式字段——布局与样式由系统管理。
- 指令未涉及任何修改时输出 { "operations": [] }。
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

/** 对照当前组件计算字段级 diff（纯展示，不改状态）。 */
export function computeEditDiffs(
  operations: EditOperation[],
  byId: ReadonlyMap<string, ComponentNode>
): EditOpDiff[] {
  return operations.map((op): EditOpDiff => {
    if (op.op === "add") {
      const props = op.props || {};
      return {
        op: "add",
        component_type: op.component_type || "",
        title: titleOf(props),
        reason: op.reason,
        changes: Object.entries(props).map(([field, v]) => ({
          field,
          before: "（无）",
          after: diffValue(v),
        })),
      };
    }
    const node = op.component_id ? byId.get(op.component_id) : undefined;
    const componentType = node?.type || "unknown";
    if (op.op === "delete") {
      return {
        op: "delete",
        component_id: op.component_id,
        component_type: componentType,
        title: titleOf(node?.props),
        reason: op.reason,
        changes: [],
      };
    }
    // update: 只列真正变化的字段（LLM 可能重复未变字段）
    const changes: EditFieldChange[] = [];
    for (const [field, v] of Object.entries(op.props || {})) {
      if (sameJson(node?.props?.[field], v)) continue;
      changes.push({ field, before: diffValue(node?.props?.[field]), after: diffValue(v) });
    }
    return {
      op: "update",
      component_id: op.component_id,
      component_type: componentType,
      title: titleOf(node?.props),
      reason: op.reason,
      changes,
    };
  });
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
 * @throws Error 当选中组件不存在或 LLM/解析失败
 */
export async function requestPageEdit(
  prompt: string,
  componentIds: string[],
  cfg: LlmConfig
): Promise<EditPreview> {
  const state = stateStore.getState();
  const page = state.pages.find((p) => p.id === state.currentPageId);
  const targets = collectPageComponents(page?.components || [], componentIds);
  if (targets.length === 0) throw new Error("选中的组件不存在或已被删除");

  const messages: ChatMessage[] = [
    { role: "system", content: buildEditSystemPrompt() },
    {
      role: "user",
      content: buildEditUserPrompt(
        prompt,
        targets.map((t) => ({ id: t.id, type: t.type, props: t.props || {} }))
      ),
    },
  ];
  const reply = await chatCompletion(messages, cfg);
  const targetIds = new Set(targets.map((t) => t.id));
  const { operations, dropped } = parseEditOperations(reply, targetIds);
  const byId = new Map(targets.map((t) => [t.id, t]));
  const diffs = computeEditDiffs(operations, byId);
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
  };
}

// ===== apply =====

/**
 * 将暂存的 operations 经 runBatch 单 undo 步应用到 stateStore（常规提交 →
 * WS 广播）。应用时逐条重新校验：组件已不存在的 update/delete 记为 skipped。
 * add 追加到页面根部，若锚点（首个仍存在的选中项）有布局则放在其下方。
 */
export function applyEditOperations(pending: PendingEdit): EditApplyResult {
  const result: EditApplyResult = { applied: 0, skipped: 0, added: 0 };
  runBatch("ai-edit", () => {
    const st = stateStore.getState();
    const page = st.pages.find((p) => p.id === st.currentPageId);
    const anchor = collectPageComponents(page?.components || [], pending.target_ids)[0];
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
      }
    }
  });
  return result;
}
