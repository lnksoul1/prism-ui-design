import type * as Y from "yjs";
import type { ComponentNode, DesignStateView } from "../types";

interface IndexEntry {
  parentId: string | null;
  pageId: string;
  index: number;
}

/** 从 ydoc 平面索引重建某页的组件树（含嵌套与排序）。 */
export function buildPageComponents(
  components: Y.Map<unknown>,
  index: Y.Map<unknown>,
  pageId: string
): ComponentNode[] {
  const entries: Array<{ node: ComponentNode; parentId: string | null; index: number }> = [];
  for (const [id, raw] of components.entries()) {
    const idx = index.get(id) as IndexEntry | undefined;
    if (idx && idx.pageId === pageId) {
      entries.push({
        node: JSON.parse(JSON.stringify(raw)) as ComponentNode,
        parentId: idx.parentId,
        index: idx.index,
      });
    }
  }
  const attach = (e: { node: ComponentNode; parentId: string | null; index: number }): ComponentNode => ({
    ...e.node,
    children: entries
      .filter((c) => c.parentId === e.node.id)
      .sort((a, b) => a.index - b.index)
      .map(attach),
  });
  return entries.filter((e) => e.parentId === null).sort((a, b) => a.index - b.index).map(attach);
}

/** 服务端全量 state（REST/WS）+ ydoc 组件投影 → 合成视图。 */
export function mergeCollabIntoState(
  base: DesignStateView | null,
  maps: { components: Y.Map<unknown>; index: Y.Map<unknown> } | null
): DesignStateView | null {
  if (!base) return base;
  if (!maps) return base;
  return {
    ...base,
    pages: base.pages.map((p) => ({ ...p, components: buildPageComponents(maps.components, maps.index, p.id) })),
  };
}
