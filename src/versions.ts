/**
 * Design version storage (V2.0 JSON Patch model).
 *
 * Session-scoped version store with a bounded history. Instead of keeping a
 * deep-copied snapshot per version, the first version stores a full baseline
 * snapshot and every subsequent version stores only the RFC 6902 JSON Patch
 * delta from the previous entry. A fresh baseline is taken every 20 versions
 * so reconstruction never walks long patch chains, and when the 50-entry
 * bound evicts a baseline the next entry is promoted to keep the chain
 * rebuildable.
 */

import fastJsonPatch, { type Operation } from "fast-json-patch";
import { stateStore, type DesignState } from "./state.js";

// fast-json-patch 是 CJS 包且导出为动态赋值，Node ESM 命名导入无法静态
// 识别，须走默认导入（与 express 的导入惯例一致）。
const { applyPatch, compare } = fastJsonPatch;

export interface DesignVersionMeta {
  id: string;
  name: string;
  createdAt: string;
  projectName: string;
  componentCount: number;
}

interface VersionEntry {
  meta: DesignVersionMeta;
  /** 基线版本存全量快照；否则为 null。每 20 个版本一个基线。 */
  baseline: DesignState | null;
  /** 相对上一个条目的 JSON Patch（RFC 6902）；基线版本为 null。 */
  patchFromPrev: Operation[] | null;
}

const MAX_VERSIONS = 50;
const BASELINE_EVERY = 20;
const entries: VersionEntry[] = [];
/**
 * 链上最后一个条目对应的状态缓存（createVersion 生成 patch 的基准）。
 * 注意 restoreVersion 不更新它：patch 必须始终相对于版本链的前一个
 * 条目，而不是最近一次恢复出来的状态，否则链条无法重建。
 */
let lastEntryState: DesignState | null = null;

/** Test helper: clear the in-memory version store. */
export function resetVersionsForTests(): void {
  entries.length = 0;
  lastEntryState = null;
}

/** Legacy alias of resetVersionsForTests (kept for existing callers). */
export function clearVersionsForTests(): void {
  resetVersionsForTests();
}

export function createVersion(name?: string): DesignVersionMeta {
  // getState() already returns a deep copy, safe to retain directly.
  const state = stateStore.getState();
  const isBaseline = entries.length === 0 || entries.length % BASELINE_EVERY === 0;
  const patchFromPrev = isBaseline || !lastEntryState ? null : compare(lastEntryState, state);
  const entry: VersionEntry = {
    meta: {
      id: `ver_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name || `Version ${entries.length + 1}`,
      createdAt: new Date().toISOString(),
      projectName: state.projectName,
      componentCount: state.components.length,
    },
    baseline: isBaseline ? state : null,
    patchFromPrev,
  };
  entries.push(entry);
  lastEntryState = state;
  if (entries.length > MAX_VERSIONS) {
    evictOldest();
  }
  return entry.meta;
}

/** MAX_VERSIONS 溢出：移除最旧条目；若移除的是基线，把下一个条目升级为基线。 */
function evictOldest(): void {
  const removed = entries.shift();
  if (removed?.baseline && entries.length > 0 && !entries[0].baseline) {
    // 用被移除的基线 + 新头部的 patch 重建其状态（此时被移除基线不可再引用）。
    let promoted: DesignState = removed.baseline;
    const patch = entries[0].patchFromPrev;
    if (patch && patch.length) {
      promoted = JSON.parse(JSON.stringify(promoted)) as DesignState;
      applyPatch(promoted, patch);
    }
    entries[0] = { ...entries[0], baseline: promoted, patchFromPrev: null };
  }
}

export function listVersions(): DesignVersionMeta[] {
  return [...entries].reverse().map((e) => e.meta);
}

export function getVersion(id: string): DesignVersionMeta | undefined {
  return entries.find((e) => e.meta.id === id)?.meta;
}

/** 从最近的基线向前应用 patch，重建某个版本的状态。 */
function reconstructStateAt(index: number): DesignState {
  let i = index;
  while (i > 0 && !entries[i].baseline) i--;
  const state = JSON.parse(JSON.stringify(entries[i].baseline)) as DesignState;
  for (let j = i + 1; j <= index; j++) {
    const patch = entries[j].patchFromPrev;
    if (patch && patch.length) applyPatch(state, patch);
  }
  return state;
}

export function restoreVersion(id: string): DesignVersionMeta {
  const index = entries.findIndex((e) => e.meta.id === id);
  if (index < 0) {
    throw new Error(`Version not found: ${id}`);
  }
  stateStore.restoreSnapshot(reconstructStateAt(index));
  return entries[index].meta;
}

export function versionCount(): number {
  return entries.length;
}

/** 测试辅助：暴露内部存储形态（不进对外 API 文档）。 */
export function getInternalStorageStats(): {
  entries: Array<{ id: string; isBaseline: boolean; patchLength: number }>;
} {
  return {
    entries: entries.map((e) => ({
      id: e.meta.id,
      isBaseline: !!e.baseline,
      patchLength: e.patchFromPrev ? e.patchFromPrev.length : 0,
    })),
  };
}

export interface VersionDiff {
  from_id: string;
  to_id: string;
  components_added: number;
  components_removed: number;
  components_modified: number;
  token_changes: number;
  summary: string[];
}

interface FlatNode {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: FlatNode[];
}

export function diffVersions(fromId: string, toId: string): VersionDiff {
  const fromIndex = entries.findIndex((e) => e.meta.id === fromId);
  const toIndex = entries.findIndex((e) => e.meta.id === toId);
  if (fromIndex < 0 || toIndex < 0) {
    throw new Error(`Cannot diff: version ${fromIndex < 0 ? fromId : toId} not found`);
  }
  const fromState = reconstructStateAt(fromIndex);
  const toState = reconstructStateAt(toIndex);

  const fromComps = new Map<string, { type: string; props: Record<string, unknown> }>();
  const toComps = new Map<string, { type: string; props: Record<string, unknown> }>();
  const collect = (nodes: FlatNode[], map: typeof fromComps) => {
    for (const node of nodes) {
      map.set(node.id, { type: node.type, props: node.props || {} });
      if (Array.isArray(node.children)) collect(node.children as FlatNode[], map);
    }
  };
  collect(fromState.components as unknown as FlatNode[], fromComps);
  collect(toState.components as unknown as FlatNode[], toComps);

  let added = 0;
  let removed = 0;
  let modified = 0;
  for (const [id, comp] of toComps) {
    const prev = fromComps.get(id);
    if (!prev) added++;
    else if (prev.type !== comp.type || JSON.stringify(prev.props) !== JSON.stringify(comp.props)) modified++;
  }
  for (const id of fromComps.keys()) {
    if (!toComps.has(id)) removed++;
  }

  const fromTokens = fromState.tokens;
  const toTokens = toState.tokens;
  let tokenChanges = 0;
  (Object.keys(toTokens) as Array<keyof typeof toTokens>).forEach((cat) => {
    const a = fromTokens[cat] || {};
    const b = toTokens[cat] || {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if ((a[key]?.value || "") !== (b[key]?.value || "")) tokenChanges++;
    }
  });

  const summary = [
    `Components: ${fromComps.size} → ${toComps.size} (+${added} / -${removed} / modified ${modified})`,
    `Token changes: ${tokenChanges}`,
    added > 0 ? `Added: ${[...toComps.entries()].filter(([id]) => !fromComps.has(id)).map(([, c]) => c.type).join(", ")}` : "",
    removed > 0 ? `Removed: ${[...fromComps.entries()].filter(([id]) => !toComps.has(id)).map(([, c]) => c.type).join(", ")}` : "",
  ].filter(Boolean);

  return {
    from_id: fromId,
    to_id: toId,
    components_added: added,
    components_removed: removed,
    components_modified: modified,
    token_changes: tokenChanges,
    summary,
  };
}
