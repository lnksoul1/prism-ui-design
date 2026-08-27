/**
 * M3 协同: 组件树 ↔ 平面索引的双向转换。
 *
 * Y.Doc 表示（组件级 CRDT 粒度，V2.0 既定分层）：
 *   components: Y.Map<id, ComponentNode JSON>（children 恒为 []，子组件是独立条目）
 *   index:      Y.Map<id, { parentId, pageId, index }>
 * 同一组件内的并发编辑按 last-write-wins 合并；不同组件间可真正并发。
 */
import type { ComponentNode, PageDef } from "../state.js";

export interface FlatEntry {
  /** 组件自身字段（children 恒为 []）。 */
  node: ComponentNode;
  parentId: string | null;
  pageId: string;
  /** 同级顺序。 */
  index: number;
}

export function flattenPages(pages: PageDef[]): Map<string, FlatEntry> {
  const out = new Map<string, FlatEntry>();
  const walk = (nodes: ComponentNode[], pageId: string, parentId: string | null): void => {
    nodes.forEach((node, index) => {
      out.set(node.id, { node: { ...node, children: [] }, parentId, pageId, index });
      walk(node.children ?? [], pageId, node.id);
    });
  };
  for (const page of pages) walk(page.components ?? [], page.id, null);
  return out;
}

export function buildPageTrees(entries: Map<string, FlatEntry>): Map<string, ComponentNode[]> {
  const byParent = new Map<string, FlatEntry[]>();
  for (const e of entries.values()) {
    const key = e.parentId ?? `__root__:${e.pageId}`;
    const list = byParent.get(key) ?? [];
    list.push(e);
    byParent.set(key, list);
  }
  const attach = (e: FlatEntry): ComponentNode => ({
    ...e.node,
    children: (byParent.get(e.node.id) ?? [])
      .slice()
      .sort((a, b) => a.index - b.index)
      .map(attach),
  });
  const rootsByPage = new Map<string, FlatEntry[]>();
  for (const e of entries.values()) {
    if (e.parentId !== null) continue;
    const roots = rootsByPage.get(e.pageId) ?? [];
    roots.push(e);
    rootsByPage.set(e.pageId, roots);
  }
  const out = new Map<string, ComponentNode[]>();
  for (const [pageId, roots] of rootsByPage) {
    out.set(pageId, roots.slice().sort((a, b) => a.index - b.index).map(attach));
  }
  return out;
}
